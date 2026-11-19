import crypto from "crypto";
import nodemailer from "nodemailer";
import mongoose from "mongoose";
import User from "../models/User.js";
import Institution from "../models/Institution.js";
import RecoveryChallenge from "../models/RecoveryChallenge.js";
import AuditLog from "../models/AuditLog.js";

const generic = "If an eligible account matches those details, a verification code will be sent shortly.";
const secret = () => process.env.JWT_SECRET || "";
const digest = (challengeId, value) => crypto.createHmac("sha256", secret()).update(`${challengeId}:${value}`).digest("hex");
const same = (a, b) => typeof a === "string" && typeof b === "string" && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const passwordValid = (password) => password.length >= 12 && password.length <= 128 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /[0-9]/.test(password);

async function sendOtpEmail(user, otp) {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, SMTP_SECURE } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) throw new Error("Email delivery is not configured");
  const transporter = nodemailer.createTransport({ host: SMTP_HOST, port: Number(SMTP_PORT), secure: String(SMTP_SECURE || "").toLowerCase() === "true" || Number(SMTP_PORT) === 465, auth: { user: SMTP_USER, pass: SMTP_PASS } });
  await transporter.sendMail({ from: SMTP_FROM || SMTP_USER, to: user.email, subject: "AcadNexus password recovery code", text: `Hello ${user.name || "there"},\n\nYour AcadNexus password recovery code is ${otp}. It expires in 10 minutes and can be used once. If you did not request this, ignore this message.\n\nDo not share this code.` });
}

async function findRecoveryUser(email, institutionId) {
  let user = null;
  user = await User.findOne({ email, role: { $in: ["super_super_admin", "platform_super_admin"] } }).select("+password");
  if (!user && mongoose.isValidObjectId(institutionId)) {
    const institution = await Institution.findOne({ _id: institutionId, status: "active", deletedAt: null }).select("_id");
    if (institution) user = await User.findOne({ institution: institution._id, email }).select("+password");
  }
  return user;
}

export async function startOtpRecovery(req, res, next) {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const institutionId = String(req.body.institutionId || "").trim();
    const challengeId = new mongoose.Types.ObjectId();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(200).json({ message: generic, challengeId: challengeId.toString() });
    const user = await findRecoveryUser(email, institutionId);
    if (!user || user.isSuspended || !["active", "pending"].includes(user.tenantStatus) || secret().length < 32) return res.status(200).json({ message: generic, challengeId: challengeId.toString() });
    const now = new Date();
    const existing = await RecoveryChallenge.findOne({ user: user._id, consumedAt: null, expiresAt: { $gt: now } }).sort({ createdAt: -1 });
    if (existing && existing.resendAt > now) return res.status(200).json({ message: generic, challengeId: existing._id.toString() });
    await RecoveryChallenge.deleteMany({ user: user._id, consumedAt: null });
    const otp = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
    const challenge = await RecoveryChallenge.create({ _id: challengeId, user: user._id, institutionId: user.institution || null, otpHash: digest(challengeId.toString(), otp), expiresAt: new Date(now.getTime() + 10 * 60_000), resendAt: new Date(now.getTime() + 60_000), attempts: 0 });
    try { await sendOtpEmail(user, otp); }
    catch {
      await RecoveryChallenge.deleteOne({ _id: challenge._id });
      return res.status(200).json({ message: generic, challengeId: challengeId.toString() });
    }
    try { await AuditLog.create({ action: "password_otp_requested", admin: user._id, adminRole: user.role, status: "sent", remarks: "Password recovery OTP email sent", institutionId: user.institution || undefined }); } catch { /* no OTP or address is logged */ }
    return res.status(200).json({ message: generic, challengeId: challenge._id.toString() });
  } catch (error) { next(error); }
}

export async function verifyOtpRecovery(req, res, next) {
  try {
    const challengeId = String(req.body.challengeId || "");
    const otp = String(req.body.otp || "").trim();
    if (!mongoose.isValidObjectId(challengeId) || !/^\d{6}$/.test(otp)) return res.status(400).json({ message: "The verification code is invalid or expired." });
    const challenge = await RecoveryChallenge.findOneAndUpdate({ _id: challengeId, expiresAt: { $gt: new Date() }, consumedAt: null, verifiedAt: null, attempts: { $lt: 5 } }, { $inc: { attempts: 1 } }, { new: true }).select("+otpHash");
    if (!challenge || !same(challenge.otpHash, digest(challengeId, otp))) return res.status(400).json({ message: "The verification code is invalid or expired." });
    const grant = crypto.randomBytes(32).toString("hex");
    const verified = await RecoveryChallenge.findOneAndUpdate({ _id: challengeId, verifiedAt: null, consumedAt: null, otpHash: challenge.otpHash }, { $set: { verifiedAt: new Date(), resetGrantHash: digest(challengeId, grant), otpHash: "consumed" } }, { new: true });
    if (!verified) return res.status(400).json({ message: "The verification code is invalid or expired." });
    return res.json({ success: true, resetGrant: grant, message: "Code verified. You may now choose a new password." });
  } catch (error) { next(error); }
}

export async function completeOtpRecovery(req, res, next) {
  try {
    const challengeId = String(req.body.challengeId || "");
    const resetGrant = String(req.body.resetGrant || "");
    const password = String(req.body.password || "");
    if (!mongoose.isValidObjectId(challengeId) || !/^[a-f0-9]{64}$/i.test(resetGrant)) return res.status(400).json({ message: "Recovery verification is invalid or expired." });
    if (!passwordValid(password)) return res.status(400).json({ message: "Use 12–128 characters with uppercase, lowercase and a number." });
    const candidate = await RecoveryChallenge.findOne({ _id: challengeId, expiresAt: { $gt: new Date() }, consumedAt: null, verifiedAt: { $ne: null } }).select("+resetGrantHash");
    if (!candidate || !same(candidate.resetGrantHash, digest(challengeId, resetGrant))) return res.status(400).json({ message: "Recovery verification is invalid or expired." });
    const challenge = await RecoveryChallenge.findOneAndUpdate({ _id: challengeId, expiresAt: { $gt: new Date() }, consumedAt: null, resetGrantHash: candidate.resetGrantHash }, { $set: { consumedAt: new Date() }, $unset: { resetGrantHash: 1 } }, { new: true });
    if (!challenge) return res.status(400).json({ message: "Recovery verification is invalid or expired." });
    const user = await User.findById(challenge.user);
    if (!user || user.isSuspended || !["active", "pending"].includes(user.tenantStatus)) return res.status(400).json({ message: "Recovery verification is invalid or expired." });
    user.password = password; user.tokenVersion = Number(user.tokenVersion || 0) + 1; user.passwordChangedAt = new Date();
    if (user.tenantStatus === "pending") user.tenantStatus = "active";
    await user.save();
    await RecoveryChallenge.deleteMany({ user: user._id, _id: { $ne: challenge._id } });
    try { await AuditLog.create({ action: "password_reset_completed_otp", admin: user._id, adminRole: user.role, status: "completed", remarks: "Password recovery completed after OTP verification", institutionId: user.institution || undefined }); } catch { /* password change remains complete */ }
    try {
      const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, SMTP_SECURE } = process.env;
      if (SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS) await nodemailer.createTransport({ host: SMTP_HOST, port: Number(SMTP_PORT), secure: String(SMTP_SECURE || "").toLowerCase() === "true" || Number(SMTP_PORT) === 465, auth: { user: SMTP_USER, pass: SMTP_PASS } }).sendMail({ from: SMTP_FROM || SMTP_USER, to: user.email, subject: "Your AcadNexus password was changed", text: "Your AcadNexus password was changed. If you did not make this change, contact your institute administrator." });
    } catch { /* recovery must not be undone if notification email fails */ }
    return res.json({ success: true, message: "Password updated. Please sign in again on all devices." });
  } catch (error) { next(error); }
}
