import User from "../models/User.js";
import Institution from "../models/Institution.js";
import mongoose from "mongoose";
import crypto from "crypto";
import nodemailer from "nodemailer";
import AuditLog from "../models/AuditLog.js";
import { generateToken } from "../utils/jwt.js";
import { getRegistrationCodeForUse, consumeRegistrationCode } from "./registrationCodeController.js";

const normalizeText = (value = "") =>
  String(value)
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const departmentAliases = {
  cse: "Computer Science and Engineering",
  "computer science": "Computer Science and Engineering",
  "computer science engineering": "Computer Science and Engineering",
  "computer science and engineering": "Computer Science and Engineering",
  it: "Information Technology",
  "information technology": "Information Technology",
  ece: "Electronics and Communication Engineering",
  "electronics and communication": "Electronics and Communication Engineering",
  "electronics and communication engineering": "Electronics and Communication Engineering",
  ee: "Electrical Engineering",
  "electrical engineering": "Electrical Engineering",
  mech: "Mechanical Engineering",
  mechanical: "Mechanical Engineering",
  "mechanical engineering": "Mechanical Engineering",
  civil: "Civil Engineering",
  "civil engineering": "Civil Engineering",
  bca: "Computer Applications",
  mca: "Computer Applications",
  "computer applications": "Computer Applications",
  management: "Management Studies",
  "management studies": "Management Studies",
  commerce: "Commerce",
  arts: "Arts and Humanities",
  "arts and humanities": "Arts and Humanities",
  science: "Basic Sciences",
  "basic sciences": "Basic Sciences",
};

const canonicalDepartment = (value = "") => {
  const normalized = normalizeText(value);
  return departmentAliases[normalized] || String(value).trim();
};

const buildUserResponse = (user) => ({
  _id: user._id,
  id: user._id,
  name: user.name,
  email: user.email,
  // Normalize the legacy platform-owner role for the frontend.
  role: ["super_super_admin", "platform_super_admin"].includes(user.role) ? "super_super_admin" : user.role,
  rollNumber: user.rollNumber,
  employeeId: user.employeeId,
  department: user.department,
  programme: user.programme,
  year: user.year,
  semester: user.semester,
  section: user.section,
  groupType: user.groupType,
  groupName: user.groupName,
  labBatch: user.labBatch,
  electiveGroup: user.electiveGroup,
  specialization: user.specialization,
  profilePhoto: user.profilePhoto,
  charges: user.charges || [],
  token: generateToken(user._id, user.tokenVersion),
});

export const register = async (req, res) => {
  const {
    name,
    email,
    password,
    registrationCode,
    institutionId,
    accountType,
    rollNumber,
    employeeId,
    department,
    programme,
    year,
    semester,
    section,
    admissionYear,
    designation,
  } = req.body;

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedCode = String(registrationCode || "").trim();
  const requestedAccountType = String(accountType || "student").trim().toLowerCase();

  // Students self-register without a registration code. The server still
  // requires an active institution and always assigns the student role;
  // client input can never select a privileged role.
  const isDirectStudentRegistration = !normalizedCode && requestedAccountType === "student";
  if (!isDirectStudentRegistration && !normalizedCode) {
    return res.status(400).json({ message: "A registration code is required for this account type." });
  }
  if (!name || !normalizedEmail || !password) return res.status(400).json({ message: "Name, email and password are required." });
  if (!emailRegex.test(normalizedEmail)) return res.status(400).json({ message: "Please enter a valid email address" });
  if (String(password).length < 12 || String(password).length > 128 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    return res.status(400).json({ message: "Password must be 12–128 characters and include uppercase, lowercase, and a number." });
  }

  let registration = null;
  let institution = null;

  if (isDirectStudentRegistration) {
    const selectedInstitutionId = String(institutionId || "").trim();
    if (!mongoose.isValidObjectId(selectedInstitutionId)) {
      return res.status(400).json({ message: "Please select your institution for student registration." });
    }
    institution = await Institution.findOne({ _id: selectedInstitutionId, status: "active", deletedAt: null });
    if (!institution) return res.status(400).json({ message: "Selected institution is unavailable." });
  } else {
    registration = await getRegistrationCodeForUse(normalizedCode);
    if (!registration) return res.status(403).json({ message: "Registration code is invalid, expired, revoked, or already fully used." });

    // Keep the selected account type aligned with the authorized code.
    // Students are the only direct-registration role; every other role is
    // derived from the server-side registration code.
    if (requestedAccountType !== "student" && requestedAccountType !== registration.role) {
      return res.status(400).json({
        message: `This registration code is for ${registration.role}, not ${requestedAccountType}.`,
      });
    }

    institution = await Institution.findOne({ _id: registration.institution, status: "active", deletedAt: null });
    if (!institution) return res.status(400).json({ message: "The institution attached to this registration code is unavailable." });
  }

  const exists = await User.findOne({ institution: institution._id, email: normalizedEmail });
  if (exists) return res.status(400).json({ message: "Email already registered" });

  // Role is derived server-side: direct registration can only create students.
  const role = isDirectStudentRegistration ? "student" : registration.role;
  const finalDepartment = canonicalDepartment(department);
  const requiresDepartment = ["student", "teacher", "staff", "edp"].includes(role);
  if (requiresDepartment && !finalDepartment) return res.status(400).json({ message: "Department is required for this registration type." });

  if (role === "student" && (!rollNumber || !programme || !year || !semester || !section)) {
    return res.status(400).json({ message: "Student registration requires roll number, programme, year, semester and section." });
  }

  if (["teacher", "staff", "edp"].includes(role) && (!employeeId || !designation)) {
    return res.status(400).json({ message: "Employee ID and designation are required for this registration type." });
  }

  let user;
  try {
    user = await User.create({
      name: String(name).trim(),
      email: normalizedEmail,
      password,
      role,
      institution: institution._id,
      rollNumber: String(rollNumber || "").trim(),
      employeeId: String(employeeId || "").trim(),
      department: finalDepartment,
      programme,
      year,
      semester,
      section,
      admissionYear,
      designation: String(designation || (role === "institute_admin" || role === "super_admin" ? "Institution Administrator" : role === "vice_chancellor" ? "Vice Chancellor" : "")).trim(),
    });
  } catch (error) {
    // The pre-check above improves UX, while the unique indexes remain the
    // final protection against concurrent registrations using the same
    // email/roll number/employee ID. Never let E11000 crash the process.
    if (error?.code === 11000) {
      const field = Object.keys(error.keyPattern || {})[1] || Object.keys(error.keyPattern || {})[0] || "field";
      const messages = {
        email: "Email already registered for this institution",
        rollNumber: "Roll number already registered for this institution",
        employeeId: "Employee ID already registered for this institution",
      };
      return res.status(409).json({ message: messages[field] || "An account with these details already exists in this institution." });
    }
    return next(error);
  }

  if (isDirectStudentRegistration) {
    await AuditLog.create({
      action: "student_self_registered",
      admin: user._id,
      adminRole: user.role,
      student: user._id,
      status: "created",
      remarks: `Student ${user.email} self-registered at ${institution.name} without a registration code`,
      institutionId: institution._id,
    });
  } else {
    const consumed = await consumeRegistrationCode({ codeValue: normalizedCode, userId: user._id });
    if (!consumed) {
      await User.deleteOne({ _id: user._id });
      return res.status(409).json({ message: "Registration code was consumed by another registration. Please use a new code." });
    }

    await AuditLog.create({
      action: "registration_code_redeemed",
      admin: user._id,
      adminRole: user.role,
      student: user._id,
      status: "used",
      remarks: `Registered ${user.email} using a ${registration.codeType} code for ${institution.name}`,
      institutionId: institution._id,
    });
  }

  res.status(201).json(buildUserResponse(user));
};

export const login = async (req, res) => {
  const { email, identifier, password, institutionId } = req.body;
  const loginId = String(identifier || email || "").trim();
  const selectedInstitutionId = String(institutionId || "").trim();
  const isPlatformOwnerLogin = selectedInstitutionId === "__platform_owner__";
  const noInstitutionProvided = selectedInstitutionId === "";

  if (!loginId || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }

  // Platform Owner is a platform-root account and deliberately has no institution.
  // It must never be forced through the tenant/institution validation path.
  if ((isPlatformOwnerLogin || noInstitutionProvided) && loginId.includes("@")) {
    const rootUser = await User.findOne({
      email: loginId.toLowerCase(),
      role: { $in: ["super_super_admin", "platform_super_admin"] },
    });

    if (rootUser) {
      if (!(await rootUser.matchPassword(password))) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      if (rootUser.isSuspended || !["active", "pending"].includes(rootUser.tenantStatus)) {
        return res.status(403).json({ message: "Account is not active" });
      }
      return res.json(buildUserResponse(rootUser));
    }

    if (isPlatformOwnerLogin) {
      // An explicit platform-owner selection must never fall through to
      // institute validation and produce a misleading tenant error.
      return res.status(401).json({ message: "Invalid platform owner credentials" });
    }
  }

  if (!mongoose.isValidObjectId(selectedInstitutionId)) {
    return res.status(400).json({ message: "Please select your institution" });
  }

  const institution = await Institution.findOne({ _id: selectedInstitutionId, status: "active", deletedAt: null });
  if (!institution) return res.status(400).json({ message: "Selected institution is unavailable" });

  if (!loginId || !password) {
    return res.status(400).json({
      message: "Email/Roll No/Employee ID and password are required",
    });
  }

  const user = await User.findOne({
    institution: institution._id,
    $or: [
      { email: loginId.toLowerCase() },
      { rollNumber: loginId },
      { employeeId: loginId },
    ],
  });

  if (!user || !(await user.matchPassword(password))) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  if (user.isSuspended || !["active", "pending"].includes(user.tenantStatus)) {
    return res.status(403).json({ message: "Account is not active" });
  }

  const fixedDepartment = canonicalDepartment(user.department);
  if (fixedDepartment && fixedDepartment !== user.department) {
    user.department = fixedDepartment;
    await user.save();
  }

  res.json(buildUserResponse(user));
};

export const profile = async (req, res) => {
  res.json(req.user);
};


const genericRecoveryMessage = "If an account matches those details, a password reset link will be sent shortly.";
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const getResetBaseUrl = () => String(process.env.FRONTEND_URL || process.env.CLIENT_URL || "http://localhost:5173").split(",")[0].trim().replace(/\/$/, "");

const sendPasswordResetEmail = async ({ to, name, resetUrl }) => {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, SMTP_SECURE } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    if (process.env.NODE_ENV === "development" && process.env.ALLOW_DEV_PASSWORD_RESET_LINK === "true") return { sent: false, devResetUrl: resetUrl };
    console.error("Password reset email is not configured (SMTP settings are missing).");
    return { sent: false };
  }
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: String(SMTP_SECURE || "").toLowerCase() === "true" || Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  await transporter.sendMail({
    from: SMTP_FROM || SMTP_USER,
    to,
    subject: "Reset your AcadNexus password",
    text: `Hello ${name || "there"},\n\nUse this link to reset your AcadNexus password. It expires in 15 minutes and can only be used once:\n${resetUrl}\n\nIf you did not request this, you can ignore this email.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#24213f"><h2>Reset your AcadNexus password</h2><p>Hello ${String(name || "there").replace(/[&<>"']/g, "")},</p><p>Use the button below to choose a new password. This link expires in 15 minutes and can only be used once.</p><p><a href="${resetUrl}" style="display:inline-block;background:#5b4be0;color:#fff;padding:13px 20px;border-radius:9px;text-decoration:none;font-weight:bold">Reset password</a></p><p>If you did not request this, you can safely ignore this email.</p></div>`,
  });
  return { sent: true };
};

export const forgotPassword = async (req, res, next) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const institutionId = String(req.body.institutionId || "").trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return res.status(400).json({ message: "Enter a valid email address." });

    let user = null;
    user = await User.findOne({ email, role: { $in: ["super_super_admin", "platform_super_admin"] } }).select("+passwordResetTokenHash +passwordResetExpiresAt");
    if (!user && mongoose.isValidObjectId(institutionId)) {
      const institution = await Institution.findOne({ _id: institutionId, status: "active", deletedAt: null }).select("_id");
      if (institution) user = await User.findOne({ institution: institution._id, email }).select("+passwordResetTokenHash +passwordResetExpiresAt");
    }

    // Always return the same public response to prevent account enumeration.
    if (!user || user.isSuspended || !["active", "pending"].includes(user.tenantStatus)) return res.json({ message: genericRecoveryMessage });

    // Preserve an existing unexpired link; repeated requests must not invalidate a link already emailed.
    if (user.passwordResetTokenHash && user.passwordResetExpiresAt && user.passwordResetExpiresAt > new Date()) {
      return res.json({ message: genericRecoveryMessage });
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    user.passwordResetTokenHash = sha256(rawToken);
    user.passwordResetExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await user.save();

    const resetUrl = `${getResetBaseUrl()}/reset-password?token=${encodeURIComponent(rawToken)}`;
    let mailResult;
    try {
      mailResult = await sendPasswordResetEmail({ to: user.email, name: user.name, resetUrl });
    } catch {
      // Remove the token if delivery fails, so an undelivered link cannot be used.
      user.passwordResetTokenHash = undefined;
      user.passwordResetExpiresAt = undefined;
      await user.save();
      console.error("Password reset email delivery failed.");
      return res.json({ message: genericRecoveryMessage });
    }
    if (!mailResult.sent && !mailResult.devResetUrl) {
      user.passwordResetTokenHash = undefined;
      user.passwordResetExpiresAt = undefined;
      await user.save();
    }
    try {
      await AuditLog.create({ action: "password_reset_requested", admin: user._id, adminRole: user.role, status: mailResult.sent || mailResult.devResetUrl ? "requested" : "delivery_unavailable", remarks: "Password reset request processed", institutionId: user.institution || undefined });
    } catch { console.error("Could not write password reset audit event."); }
    const response = { message: genericRecoveryMessage };
    if (mailResult.devResetUrl) response.devResetUrl = mailResult.devResetUrl;
    return res.json(response);
  } catch (error) {
    return next(error);
  }
};

export const resetPassword = async (req, res, next) => {
  try {
    const token = String(req.body.token || "").trim();
    const password = String(req.body.password || "");
    if (!/^[a-f0-9]{64}$/i.test(token)) return res.status(400).json({ message: "This reset link is invalid or has expired. Request a new one." });
    if (password.length < 12 || password.length > 128) return res.status(400).json({ message: "Password must be between 12 and 128 characters." });
    if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) return res.status(400).json({ message: "Use at least one uppercase letter, one lowercase letter, and one number." });

    const user = await User.findOne({
      passwordResetTokenHash: sha256(token),
      passwordResetExpiresAt: { $gt: new Date() },
    }).select("+passwordResetTokenHash +passwordResetExpiresAt");
    if (!user || user.isSuspended || !["active", "pending"].includes(user.tenantStatus)) {
      return res.status(400).json({ message: "This reset link is invalid or has expired. Request a new one." });
    }

    user.password = password;
    user.tokenVersion = Number(user.tokenVersion || 0) + 1;
    user.passwordChangedAt = new Date();
    if (user.tenantStatus === "pending") user.tenantStatus = "active";
    user.passwordResetTokenHash = undefined;
    user.passwordResetExpiresAt = undefined;
    await user.save();
    await AuditLog.create({ action: "password_reset_completed", admin: user._id, adminRole: user.role, status: "completed", remarks: "Password reset completed", institutionId: user.institution || undefined });
    try { await nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT), secure: String(process.env.SMTP_SECURE || "").toLowerCase() === "true" || Number(process.env.SMTP_PORT) === 465, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } }).sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to: user.email, subject: "Your AcadNexus password was changed", text: "Your AcadNexus password was changed. If you did not make this change, contact your institute administrator immediately." }); } catch { /* Password reset must succeed even if notification delivery fails. */ }
    return res.json({ message: "Your password has been reset. Please sign in again on all devices." });
  } catch (error) {
    return next(error);
  }
};


export const logout = async (req, res, next) => {
  try {
    await User.updateOne({ _id: req.user._id }, { $inc: { tokenVersion: 1 } });
    try {
      await AuditLog.create({ action: "logout", admin: req.user._id, adminRole: req.user.role, status: "completed", remarks: "User signed out", institutionId: req.user.institution || undefined });
    } catch { /* logout remains successful if audit persistence fails */ }
    res.json({ success: true, message: "Signed out successfully." });
  } catch (error) { next(error); }
};
