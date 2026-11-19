import crypto from "crypto";
import RegistrationCode from "../models/RegistrationCode.js";
import Institution from "../models/Institution.js";
import User from "../models/User.js";
import AuditLog from "../models/AuditLog.js";
import { logAudit } from "../utils/auditTrail.js";
import { generateRegistrationCode, hashRegistrationCode, normalizeRegistrationCode } from "../utils/registrationCode.js";

const platformRoles = ["super_super_admin", "platform_super_admin"];
const institutionIssuerRoles = ["super_admin", "institute_admin", "vice_chancellor"];
const roleForType = {
  institution_admin: "institute_admin",
  vice_chancellor: "vice_chancellor",
  teacher: "teacher",
  student: "student",
  staff: "staff",
  edp: "edp",
};

const platformAllowedTypes = ["institution_admin", "vice_chancellor"];
const institutionAllowedTypes = ["teacher", "staff", "edp"];

const cleanType = (value) => String(value || "").trim().toLowerCase();

// Institution Admin codes are issued by the institution's Vice Chancellor (or by the platform).
// Institute Admins and legacy Super Admins keep their existing teacher/EDP/staff codes only.
const canIssue = (user, type) => {
  if (platformRoles.includes(user?.role)) return platformAllowedTypes.includes(type);
  if (user?.role === "vice_chancellor" && type === "institution_admin") return true;
  if (institutionIssuerRoles.includes(user?.role)) return institutionAllowedTypes.includes(type);
  return false;
};
// Authority codes whose inventory/revocation is restricted to the platform and (for IA codes) the VC.
const authorityTypes = ["institution_admin", "vice_chancellor"];
const canManageType = (user, type) => platformRoles.includes(user?.role) || (user?.role === "vice_chancellor" && type === "institution_admin") || (institutionIssuerRoles.includes(user?.role) && !authorityTypes.includes(type));

const resolveInstitution = async (req, type) => {
  if (platformRoles.includes(req.user.role)) {
    const institutionId = String(req.body?.institutionId || "").trim();
    if (!institutionId || !/^[a-f0-9]{24}$/i.test(institutionId)) return null;
    return Institution.findOne({ _id: institutionId, status: "active", deletedAt: null }).select("_id name code status");
  }
  if (req.user.institution) return Institution.findOne({ _id: req.user.institution, status: "active", deletedAt: null }).select("_id name code status");
  return null;
};

export const createRegistrationCode = async (req, res, next) => {
  try {
    const type = cleanType(req.body?.codeType);
    if (!canIssue(req.user, type)) return res.status(403).json({ message: "You cannot issue this registration code type." });

    const institution = await resolveInstitution(req, type);
    if (!institution) return res.status(400).json({ message: "Select an active institution." });

    const expiresInDays = Number(req.body?.expiresInDays || 7);
    const maxUses = Number(req.body?.maxUses || 1);
    if (!Number.isInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > 30) return res.status(400).json({ message: "Expiration must be between 1 and 30 days." });
    if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 1000) return res.status(400).json({ message: "Uses must be between 1 and 1000." });

    // Senior bootstrap codes are one-person credentials. Institution teacher/EDP
    // codes are shared institute credentials: one active code per institution +
    // role, intentionally reusable for many registrations.
    const isSharedInstitutionCode = ["teacher", "edp"].includes(type);
    const effectiveMaxUses = ["institution_admin", "vice_chancellor"].includes(type)
      ? 1
      : isSharedInstitutionCode
        ? 1000
        : maxUses;

    if (isSharedInstitutionCode) {
      // Mark an expired shared code inactive before checking uniqueness so rotation
      // remains possible without weakening the database-level invariant.
      await RegistrationCode.updateMany(
        { institution: institution._id, codeType: type, status: "active", expiresAt: { $lte: new Date() } },
        { $set: { status: "expired" } }
      );
      const existing = await RegistrationCode.findOne({
        institution: institution._id,
        codeType: type,
        status: "active",
        expiresAt: { $gt: new Date() },
      }).select("_id expiresAt maxUses usedCount");
      if (existing) {
        return res.status(409).json({
          message: `An active shared ${type} registration code already exists for this institution. Revoke it before generating a new one.`,
          codeType: type,
          expiresAt: existing.expiresAt,
          maxUses: existing.maxUses,
          usedCount: existing.usedCount,
        });
      }
    }
    let rawCode;
    let codeHash;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      rawCode = generateRegistrationCode(type);
      codeHash = hashRegistrationCode(rawCode);
      const collision = await RegistrationCode.findOne({ codeHash }).select("_id").setOptions({ bypassTenantScope: true });
      if (!collision) break;
      rawCode = null;
    }
    if (!rawCode) return res.status(503).json({ message: "Could not generate a unique registration code. Please try again." });

    const code = await RegistrationCode.create({
      codeHash,
      codePrefix: rawCode.split("-").slice(0, 2).join("-"),
      codeType: type,
      role: roleForType[type],
      institution: institution._id,
      createdBy: req.user._id,
      createdByRole: req.user.role,
      expiresAt: new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000),
      maxUses: effectiveMaxUses,
      usedCount: 0,
      status: "active",
    });

    await logAudit({
      req, action: "registration_code_created", institutionId: institution._id, targetId: code._id, targetType: "RegistrationCode", status: "active",
      remarks: `Created ${type} registration code for ${institution.name}; expires ${code.expiresAt.toISOString()}; max uses ${effectiveMaxUses}`,
      metadata: { codeType: type, role: roleForType[type], expiresAt: code.expiresAt, maxUses: effectiveMaxUses },
    });

    // The plaintext secret is returned only at creation time. It is never persisted.
    res.status(201).json({
      success: true,
      code: rawCode,
      codeType: type,
      role: roleForType[type],
      institution,
      createdAt: code.createdAt,
      createdByRole: req.user.role,
      status: "active",
      expiresAt: code.expiresAt,
      maxUses: effectiveMaxUses,
      warning: isSharedInstitutionCode
        ? `This is the shared ${type} code for the institution. Share it directly with authorized ${type === "teacher" ? "teachers/faculty" : "EDP staff"}; it is not emailed and is shown only at creation.`
        : "Store or share this code securely. It cannot be recovered after this response.",
    });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: "A registration code collision occurred. Please try again." });
    next(error);
  }
};

export const listRegistrationCodes = async (req, res, next) => {
  try {
    // Platform owners have a deliberate cross-institution view. Every other
    // issuer is hard-scoped to their own institution. Never trust a client-
    // supplied institutionId for tenant inventory.
    const isPlatform = platformRoles.includes(req.user.role);
    const query = {};
    if (isPlatform) {
      if (req.query.institutionId) {
        if (!/^[a-f0-9]{24}$/i.test(String(req.query.institutionId))) {
          return res.status(400).json({ message: "Invalid institution filter." });
        }
        query.institution = req.query.institutionId;
      }
    } else {
      if (!req.user.institution) return res.status(403).json({ message: "Your account is not assigned to an institution." });
      query.institution = req.user.institution;
    }
    const hidden = isPlatform ? [] : req.user.role === "vice_chancellor" ? ["vice_chancellor"] : authorityTypes;
    if (hidden.length) query.codeType = { $nin: hidden };
    if (req.query.codeType) {
      const wanted = cleanType(req.query.codeType);
      if (hidden.includes(wanted)) return res.json([]);
      query.codeType = wanted;
    }
    if (req.query.status) query.status = cleanType(req.query.status);

    const codes = await RegistrationCode.find(query)
      .select("-codeHash")
      .populate("institution", "name code")
      .populate("createdBy", "name email role")
      .populate("usedBy.user", "name email role")
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    const now = Date.now();
    const result = codes.map((code) => ({
      ...code,
      status: code.status === "active" && new Date(code.expiresAt).getTime() <= now ? "expired" : code.status,
      remainingUses: Math.max(0, Number(code.maxUses || 0) - Number(code.usedCount || 0)),
    }));
    res.json(result);
  } catch (error) { next(error); }
};

export const revokeRegistrationCode = async (req, res, next) => {
  try {
    if (!/^[a-f0-9]{24}$/i.test(String(req.params.id))) return res.status(400).json({ message: "Invalid registration code id." });
    // Tenant scope already limits non-platform callers to their institution's codes.
    const code = await RegistrationCode.findOne({ _id: req.params.id, status: "active" });
    if (!code) return res.status(404).json({ message: "Active registration code not found." });
    const sameInstitution = String(code.institution) === String(req.user.institution);
    if (!platformRoles.includes(req.user.role) && (!sameInstitution || !canManageType(req.user, code.codeType))) {
      await logAudit({ req, action: "registration_code_revoke_denied", institutionId: code.institution, targetId: code._id, targetType: "RegistrationCode", status: "denied", outcome: "failure", remarks: `Denied revocation of ${code.codeType} code` });
      return res.status(403).json({ message: "You cannot revoke this registration code." });
    }
    const revokedAt = new Date();
    // Atomic: loses cleanly if the code was consumed or revoked concurrently.
    const revoked = await RegistrationCode.findOneAndUpdate({ _id: code._id, status: "active" }, { $set: { status: "revoked", revokedAt, revokedBy: req.user._id } }, { new: true });
    if (!revoked) return res.status(409).json({ message: "The code was already used or revoked." });
    await logAudit({ req, action: "registration_code_revoked", institutionId: code.institution, targetId: code._id, targetType: "RegistrationCode", status: "revoked", remarks: `Revoked ${code.codeType} registration code`, metadata: { codeType: code.codeType, reason: String(req.body?.reason || "").trim().slice(0, 500) } });
    res.json({ success: true, message: "Registration code revoked." });
  } catch (error) { next(error); }
};

export const validateRegistrationCode = async (req, res, next) => {
  try {
    const raw = normalizeRegistrationCode(req.body?.code);
    if (!raw || raw.length < 12 || raw.length > 64) return res.status(400).json({ message: "Enter a valid registration code." });
    const code = await RegistrationCode.findOne({ codeHash: hashRegistrationCode(raw) })
      .select("+codeHash codeType role institution expiresAt maxUses usedCount status")
      .populate("institution", "_id name code status deletedAt");
    if (!code || code.status !== "active") return res.status(400).json({ message: "Registration code is invalid, used, or revoked." });
    if (code.expiresAt <= new Date()) return res.status(400).json({ message: "Registration code has expired." });
    if (code.usedCount >= code.maxUses) return res.status(400).json({ message: "Registration code has no remaining uses." });
    if (!code.institution || code.institution.status !== "active" || code.institution.deletedAt) return res.status(400).json({ message: "The institution attached to this code is unavailable." });
    res.json({ valid: true, codeType: code.codeType, role: code.role, institution: { _id: code.institution._id, name: code.institution.name, code: code.institution.code }, expiresAt: code.expiresAt, remainingUses: code.maxUses - code.usedCount });
  } catch (error) { next(error); }
};

export const consumeRegistrationCode = async ({ codeValue, userId, session = null }) => {
  const hash = hashRegistrationCode(codeValue);
  const now = new Date();
  const options = session ? { new: true, session } : { new: true };
  // Single atomic conditional update: only one concurrent caller can take the last use.
  const updated = await RegistrationCode.findOneAndUpdate(
    { codeHash: hash, status: "active", expiresAt: { $gt: now }, $expr: { $lt: ["$usedCount", "$maxUses"] } },
    { $inc: { usedCount: 1 }, $push: { usedBy: { user: userId, usedAt: now } } },
    options
  );
  if (!updated) return null;
  if (updated.usedCount >= updated.maxUses) {
    await RegistrationCode.updateOne({ _id: updated._id }, { $set: { status: "used" } }, session ? { session } : {});
    updated.status = "used";
  }
  return updated;
};

export const getRegistrationCodeForUse = async (codeValue) => {
  const hash = hashRegistrationCode(codeValue);
  return RegistrationCode.findOne({ codeHash: hash, status: "active", expiresAt: { $gt: new Date() }, $expr: { $lt: ["$usedCount", "$maxUses"] } })
    .select("+codeHash codeType role institution expiresAt maxUses usedCount createdBy")
    .lean();
};
