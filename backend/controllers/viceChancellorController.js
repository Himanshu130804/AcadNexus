import crypto from "crypto";
import User from "../models/User.js";
import Institution from "../models/Institution.js";
import AuditLog from "../models/AuditLog.js";
import { escapeRegex } from "../utils/search.js";
import { logAudit } from "../utils/auditTrail.js";
import { cleanReason, emailLooksValid, isObjectId } from "../utils/institutionLifecycle.js";

// All handlers here are mounted behind protect + platform-role authorization.
const ROLE = "vice_chancellor";
// Account states: "pending" = invited, the VC has not set a password yet (activated by the
// existing email-OTP password recovery); "active" = signed-in capable; "inactive" = suspended.
// Pending and active accounts both occupy the institution's single Vice Chancellor seat.
const OCCUPYING = ["active", "pending"];
const isOccupying = (u) => !u.isSuspended && OCCUPYING.includes(u.tenantStatus);
const accountStatus = (u) => (u.isSuspended || !OCCUPYING.includes(u.tenantStatus) ? "inactive" : u.tenantStatus === "pending" ? "pending" : "active");
// Activation target: never-set-a-password accounts go back to "pending", others to "active".
const activationState = (u) => (u.passwordChangedAt ? "active" : "pending");
const publicVc = (u) => ({
  _id: u._id, name: u.name, email: u.email, phone: u.phone || "", employeeId: u.employeeId || "", designation: u.designation || "",
  institution: u.institution, status: accountStatus(u), tenantStatus: u.tenantStatus, createdAt: u.createdAt, updatedAt: u.updatedAt,
});
const dupMessage = (error) => {
  const field = Object.keys(error?.keyPattern || {}).find((k) => k !== "institution") || "";
  return field === "employeeId" ? "Employee ID already exists in this institution." : field === "email" ? "An account with this email already exists." : "A conflicting account already exists.";
};
const loadVc = async (id) => (isObjectId(id) ? User.findOne({ _id: id, role: ROLE }) : null);
const usableInstitution = (id) => (isObjectId(id) ? Institution.findOne({ _id: id, status: "active", deletedAt: null }).select("_id name code status") : null);
const activeVcAt = (institutionId, excludeId) =>
  User.findOne({ institution: institutionId, role: ROLE, isSuspended: false, tenantStatus: { $in: OCCUPYING }, ...(excludeId ? { _id: { $ne: excludeId } } : {}) }).select("name email");
const emailTaken = (email, excludeId) =>
  User.findOne({ email, ...(excludeId ? { _id: { $ne: excludeId } } : {}), $or: [{ role: ROLE }, { role: { $in: ["super_super_admin", "platform_super_admin"] } }, { institution: { $exists: true } }] }).select("_id institution role");

const fields = (body = {}) => ({
  name: String(body.name || "").trim(),
  email: String(body.email || "").trim().toLowerCase(),
  phone: String(body.phone || "").trim().slice(0, 20),
  employeeId: String(body.employeeId || "").trim().slice(0, 40),
  designation: String(body.designation || "Vice Chancellor").trim().slice(0, 80),
});
const validateFields = (d) => {
  if (!d.name || d.name.length > 120) return "Full name is required.";
  if (!emailLooksValid(d.email)) return "A valid email address is required.";
  if (d.phone && !/^[0-9+()\-\s]{7,20}$/.test(d.phone)) return "Mobile number format is invalid.";
  return null;
};

export const listViceChancellors = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);
    const filter = { role: ROLE };
    if (isObjectId(req.query.institutionId)) filter.institution = req.query.institutionId;
    if (req.query.status === "active") Object.assign(filter, { isSuspended: false, tenantStatus: "active" });
    if (req.query.status === "pending") Object.assign(filter, { isSuspended: false, tenantStatus: "pending" });
    if (req.query.status === "inactive") filter.$or = [{ isSuspended: true }, { tenantStatus: { $nin: OCCUPYING } }];
    const q = String(req.query.q || "").trim();
    if (q) { const rx = new RegExp(escapeRegex(q), "i"); filter.$and = [{ $or: [{ name: rx }, { email: rx }, { employeeId: rx }] }]; }
    const [total, rows] = await Promise.all([
      User.countDocuments(filter),
      User.find(filter).select("-password").populate("institution", "name code status deletedAt").sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    ]);
    const items = rows.map((u) => ({ ...publicVc(u), institution: u.institution ? { _id: u.institution._id, name: u.institution.name, code: u.institution.code, status: u.institution.status, archived: Boolean(u.institution.deletedAt || u.institution.status === "archived") } : null }));
    res.json({ items, page, limit, total, pages: Math.max(Math.ceil(total / limit), 1) });
  } catch (error) { next(error); }
};

export const getViceChancellor = async (req, res, next) => {
  try {
    const vc = await loadVc(req.params.id);
    if (!vc) return res.status(404).json({ message: "Vice Chancellor not found." });
    const [institution, activity] = await Promise.all([
      Institution.findById(vc.institution).select("name code status deletedAt").lean(),
      AuditLog.find({ $or: [{ targetId: vc._id }, { admin: vc._id }] }).populate("admin", "name role").sort({ createdAt: -1 }).limit(50).select("action adminRole admin status remarks outcome createdAt").lean(),
    ]);
    res.json({ ...publicVc(vc), institution, activity });
  } catch (error) { next(error); }
};

export const createViceChancellor = async (req, res, next) => {
  try {
    const d = fields(req.body);
    const invalid = validateFields(d);
    if (invalid) return res.status(400).json({ message: invalid });
    const institution = await usableInstitution(req.body?.institutionId);
    if (!institution) return res.status(400).json({ message: "Select an active, non-archived institution." });
    const status = req.body?.status === "inactive" ? "inactive" : "invited";

    if (await emailTaken(d.email)) return res.status(409).json({ message: "An account with this email already exists." });
    if (status !== "inactive") {
      const existing = await activeVcAt(institution._id);
      if (existing) return res.status(409).json({ message: `${institution.name} already has an active Vice Chancellor (${existing.name}). Deactivate or reassign that account first.`, existingId: existing._id });
    }
    let user;
    try {
      user = await User.create({
        // Invitation: nobody (including the Platform Admin) ever knows a password. This random
        // value is hashed by the model and is unusable; the Vice Chancellor chooses a real
        // password through the existing email-OTP recovery, which also activates the account.
        ...d, password: crypto.randomBytes(48).toString("base64url"), role: ROLE, institution: institution._id,
        tenantStatus: status === "invited" ? "pending" : "suspended", isSuspended: status === "inactive",
      });
    } catch (error) {
      if (error?.code === 11000) return res.status(409).json({ message: dupMessage(error) });
      throw error;
    }
    await logAudit({ req, action: "vice_chancellor_created", institutionId: institution._id, targetId: user._id, targetType: "User", status, remarks: `Created Vice Chancellor ${user.email} for ${institution.name}`, metadata: { email: user.email, initialStatus: status } });
    res.status(201).json({
      success: true,
      viceChancellor: publicVc(user),
      invitation: status === "invited" ? { institutionId: institution._id, institutionName: institution.name, email: user.email, instructions: "Ask the Vice Chancellor to open Forgot Password, select this institution, enter this email and complete the emailed verification code to set a password." } : null,
    });
  } catch (error) { next(error); }
};

export const updateViceChancellor = async (req, res, next) => {
  try {
    const vc = await loadVc(req.params.id);
    if (!vc) return res.status(404).json({ message: "Vice Chancellor not found." });
    const d = fields({ ...req.body, designation: req.body?.designation ?? vc.designation });
    const invalid = validateFields(d);
    if (invalid) return res.status(400).json({ message: invalid });
    if (d.email !== vc.email && await emailTaken(d.email, vc._id)) return res.status(409).json({ message: "An account with this email already exists." });
    const changed = Object.keys(d).filter((k) => String(vc[k] || "") !== String(d[k] || ""));
    Object.assign(vc, d);
    try { await vc.save(); } catch (error) { if (error?.code === 11000) return res.status(409).json({ message: dupMessage(error) }); throw error; }
    await logAudit({ req, action: "vice_chancellor_updated", institutionId: vc.institution, targetId: vc._id, targetType: "User", status: "updated", remarks: `Updated Vice Chancellor ${vc.email}`, metadata: { changedFields: changed } });
    res.json({ success: true, viceChancellor: publicVc(vc) });
  } catch (error) { next(error); }
};

export const setViceChancellorStatus = async (req, res, next) => {
  try {
    const vc = await loadVc(req.params.id);
    if (!vc) return res.status(404).json({ message: "Vice Chancellor not found." });
    const status = String(req.body?.status || "").toLowerCase();
    if (!["active", "inactive"].includes(status)) return res.status(400).json({ message: "Status must be active or inactive." });
    const reason = cleanReason(req.body?.reason);
    if (status === "active") {
      const institution = await usableInstitution(vc.institution);
      if (!institution) return res.status(409).json({ message: "The assigned institution is archived or unavailable. Restore it or reassign this Vice Chancellor first." });
      const other = await activeVcAt(vc.institution, vc._id);
      if (other) return res.status(409).json({ message: `${institution.name} already has an active Vice Chancellor (${other.name}).` });
    }
    vc.isSuspended = status === "inactive";
    vc.tenantStatus = status === "active" ? activationState(vc) : "suspended";
    vc.tokenVersion = Number(vc.tokenVersion || 0) + 1; // end existing sessions
    await vc.save();
    await logAudit({ req, action: status === "active" ? "vice_chancellor_activated" : "vice_chancellor_deactivated", institutionId: vc.institution, targetId: vc._id, targetType: "User", status, remarks: `Vice Chancellor ${vc.email} ${status === "active" ? "activated" : "deactivated"}${reason ? ` — ${reason}` : ""}`, metadata: { reason } });
    res.json({ success: true, viceChancellor: publicVc(vc) });
  } catch (error) { next(error); }
};

export const reassignViceChancellor = async (req, res, next) => {
  try {
    const vc = await loadVc(req.params.id);
    if (!vc) return res.status(404).json({ message: "Vice Chancellor not found." });
    if (req.body?.confirm !== true) return res.status(400).json({ message: "Explicit confirmation is required to reassign a Vice Chancellor." });
    const target = await usableInstitution(req.body?.institutionId);
    if (!target) return res.status(400).json({ message: "Select an active, non-archived institution." });
    if (String(target._id) === String(vc.institution)) return res.status(400).json({ message: "Vice Chancellor is already assigned to this institution." });
    if (isOccupying(vc)) {
      const existing = await activeVcAt(target._id);
      if (existing) return res.status(409).json({ message: `${target.name} already has an active Vice Chancellor (${existing.name}). It will not be overwritten.`, existingId: existing._id });
    }
    if (await User.findOne({ institution: target._id, email: vc.email, _id: { $ne: vc._id } }).select("_id")) return res.status(409).json({ message: "An account with this email already exists in the target institution." });
    const from = vc.institution;
    vc.institution = target._id;
    vc.departmentId = undefined;
    vc.tokenVersion = Number(vc.tokenVersion || 0) + 1;
    try { await vc.save(); } catch (error) { if (error?.code === 11000) return res.status(409).json({ message: dupMessage(error) }); throw error; }
    const reason = cleanReason(req.body?.reason);
    await logAudit({ req, action: "vice_chancellor_reassigned", institutionId: target._id, targetId: vc._id, targetType: "User", status: "reassigned", remarks: `Reassigned Vice Chancellor ${vc.email} to ${target.name}${reason ? ` — ${reason}` : ""}`, metadata: { fromInstitution: from, toInstitution: target._id, reason } });
    await logAudit({ req, action: "vice_chancellor_unassigned", institutionId: from, targetId: vc._id, targetType: "User", status: "reassigned", remarks: `Vice Chancellor ${vc.email} moved to another institution`, metadata: { toInstitution: target._id } });
    res.json({ success: true, viceChancellor: publicVc(vc) });
  } catch (error) { next(error); }
};
