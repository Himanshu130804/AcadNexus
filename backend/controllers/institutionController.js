import Institution from "../models/Institution.js";
import AuditLog from "../models/AuditLog.js";
import User from "../models/User.js";
import Department from "../models/Department.js";
import RegistrationCode from "../models/RegistrationCode.js";
import Content from "../models/Content.js";
import OfficialResult from "../models/OfficialResult.js";
import AcademicMaster from "../models/AcademicMaster.js";
import Attendance from "../models/Attendance.js";
import Assignment from "../models/Assignment.js";
import { escapeRegex } from "../utils/search.js";
import { logAudit } from "../utils/auditTrail.js";
import { runInTransaction, UnitOfWorkAbort } from "../utils/withTransaction.js";
import { PLATFORM_ROLES, cleanReason, confirmationMatches, isObjectId, resolveRestoreStatus } from "../utils/institutionLifecycle.js";

// Public dropdown: only active, non-deleted institutions.
export const listPublicInstitutions = async (_req, res) => {
  const institutions = await Institution.find({ status: "active", deletedAt: null })
    .select("name slug code type branding.logoUrl").sort({ name: 1 }).lean();
  res.json(institutions);
};


export const listManagedInstitutions = async (_req, res, next) => {
  try {
    const institutions = await Institution.find({ deletedAt: null, status: { $ne: "archived" } })
      .select("name slug code type status branding.logoUrl createdAt updatedAt")
      .sort({ status: 1, name: 1 })
      .lean();
    res.json(institutions);
  } catch (error) { next(error); }
};

export const listInstitutionsAdmin = async (_req, res) => {
  const institutions = await Institution.find({ deletedAt: null, status: { $ne: "archived" } }).select("-archiveHistory").sort({ name: 1 }).lean();
  res.json(institutions);
};

const normalize = (body = {}) => ({
  name: String(body.name || "").trim(),
  slug: String(body.slug || body.name || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
  code: String(body.code || "").trim().toUpperCase(),
  type: ["university", "college", "institute", "school", "other"].includes(body.type) ? body.type : "college",
  status: ["pending", "active", "suspended", "archived"].includes(body.status) ? body.status : "pending",
  contact: { email: body.contact?.email || "", phone: body.contact?.phone || "", website: body.contact?.website || "" },
  address: { line1: body.address?.line1 || "", city: body.address?.city || "", state: body.address?.state || "", country: body.address?.country || "India", postalCode: body.address?.postalCode || "" },
  settings: { academicYear: body.settings?.academicYear || "", timezone: body.settings?.timezone || "Asia/Kolkata", registrationMode: ["invite", "domain", "open"].includes(body.settings?.registrationMode) ? body.settings.registrationMode : "invite" }
});

const ARCHIVE_VIA_WORKFLOW = "Use Delete Institution (archive) to archive an institution; the status cannot be set to archived from the edit form.";

export const createInstitution = async (req, res, next) => {
  try {
    if (req.body?.status === "archived") return res.status(400).json({ message: ARCHIVE_VIA_WORKFLOW });
    const data = normalize(req.body);
    if (!data.name || !data.slug || !/^[A-Z0-9_-]{2,20}$/.test(data.code)) return res.status(400).json({ message: "Name, valid slug, and code (2–20 letters/numbers) are required." });
    const institution = await Institution.create({ ...data, createdBy: req.user._id });
    await AuditLog.create({ action: "institution_created", admin: req.user._id, adminRole: req.user.role, status: institution.status, remarks: `Created institute ${institution.name}`, institutionId: institution._id });
    res.status(201).json(institution);
  } catch (error) { if (error.code === 11000) return res.status(409).json({ message: "An institute with this slug or code already exists." }); next(error); }
};

export const updateInstitution = async (req, res, next) => {
  try {
    if (req.body?.status === "archived") return res.status(400).json({ message: ARCHIVE_VIA_WORKFLOW });
    const data = normalize(req.body);
    if (!data.name || !data.slug || !/^[A-Z0-9_-]{2,20}$/.test(data.code)) return res.status(400).json({ message: "Name, valid slug, and code (2–20 letters/numbers) are required." });
    const institution = await Institution.findOneAndUpdate({ _id: req.params.id, deletedAt: null, status: { $ne: "archived" } }, { $set: data }, { new: true, runValidators: true });
    if (!institution) return res.status(404).json({ message: "Institute not found." });
    await AuditLog.create({ action: "institution_updated", admin: req.user._id, adminRole: req.user.role, status: institution.status, remarks: `Updated institute ${institution.name}`, institutionId: institution._id });
    res.json(institution);
  } catch (error) { if (error.code === 11000) return res.status(409).json({ message: "An institute with this slug or code already exists." }); next(error); }
};


const validId = (res, id) => {
  if (!isObjectId(id)) { res.status(400).json({ message: "Invalid institution id." }); return false; }
  return true;
};

// Archive (soft delete). Nothing is physically removed: users, departments, academic,
// examination and audit records stay in place and are simply unreachable while the
// institution is archived (login, registration and the API all require an active institution).
export const archiveInstitution = async (req, res, next) => {
  try {
    if (!validId(res, req.params.id)) return;
    const reason = cleanReason(req.body?.reason);
    const current = await Institution.findById(req.params.id).select("name code status deletedAt");
    if (!current) return res.status(404).json({ message: "Institute not found." });
    if (current.deletedAt || current.status === "archived") return res.status(409).json({ message: "This institution is already archived." });
    if (!confirmationMatches(current, req.body?.confirmName)) {
      await logAudit({ req, action: "institution_archive_rejected", institutionId: current._id, targetId: current._id, targetType: "Institution", status: "rejected", outcome: "failure", remarks: `Archive of ${current.name} rejected: confirmation text did not match` });
      return res.status(400).json({ message: "Type the institution name or code exactly to confirm archiving." });
    }

    const now = new Date();
    // The archive flag and the revocation of unused codes commit together where transactions
    // are supported; otherwise they run in order (flag first, so the institution is locked
    // out immediately and a failed revocation can only leave codes that are already unusable).
    let institution;
    let revoked;
    try {
      ({ result: { institution, revoked } } = await runInTransaction(async (session) => {
        const opt = session ? { session } : {};
        // Guarded transition: only succeeds if nobody archived or changed the status in the meantime.
        const archived = await Institution.findOneAndUpdate(
          { _id: current._id, deletedAt: null, status: current.status },
          {
            $set: { status: "archived", deletedAt: now, archive: { archivedAt: now, archivedBy: req.user._id, reason, previousStatus: current.status } },
            $push: { archiveHistory: { action: "archived", by: req.user._id, byRole: req.user.role, at: now, reason, fromStatus: current.status, toStatus: "archived" } },
          },
          { new: true, ...opt }
        );
        if (!archived) throw new UnitOfWorkAbort("The institution changed while archiving. Refresh and try again.");
        // Unused codes must not become usable again after a later restore.
        const result = await RegistrationCode.updateMany(
          { institution: archived._id, status: "active" },
          { $set: { status: "revoked", revokedAt: now, revokedBy: req.user._id } },
          opt
        );
        return { institution: archived, revoked: result };
      }));
    } catch (error) {
      if (error instanceof UnitOfWorkAbort) return res.status(409).json({ message: error.message });
      throw error;
    }

    await logAudit({
      req, action: "institution_archived", institutionId: institution._id, targetId: institution._id, targetType: "Institution", status: "archived",
      remarks: `Archived institute ${institution.name}${reason ? ` — ${reason}` : ""}`,
      metadata: { previousStatus: current.status, reason, revokedRegistrationCodes: revoked.modifiedCount ?? 0 },
    });
    res.json({ success: true, message: "Institute archived. Its records were preserved and unused registration codes were revoked.", revokedRegistrationCodes: revoked.modifiedCount ?? 0 });
  } catch (error) { next(error); }
};

const archivedQuery = { $or: [{ deletedAt: { $ne: null } }, { status: "archived" }] };

export const listArchivedInstitutions = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);
    const and = [archivedQuery];
    const q = String(req.query.q || "").trim();
    if (q) {
      const rx = new RegExp(escapeRegex(q), "i");
      const or = [{ name: rx }, { code: rx }];
      if (isObjectId(q)) or.push({ _id: q });
      and.push({ $or: or });
    }
    const prev = String(req.query.previousStatus || "").trim().toLowerCase();
    if (["pending", "active", "suspended"].includes(prev)) and.push({ "archive.previousStatus": prev });
    const dateFilter = {};
    if (req.query.from && !Number.isNaN(Date.parse(req.query.from))) dateFilter.$gte = new Date(req.query.from);
    if (req.query.to && !Number.isNaN(Date.parse(req.query.to))) { const end = new Date(req.query.to); end.setHours(23, 59, 59, 999); dateFilter.$lte = end; }
    if (Object.keys(dateFilter).length) and.push({ "archive.archivedAt": dateFilter });

    const sortKeys = { archivedAt: "archive.archivedAt", name: "name", createdAt: "createdAt" };
    const sortField = sortKeys[req.query.sort] || sortKeys.archivedAt;
    const sortDir = String(req.query.dir).toLowerCase() === "asc" ? 1 : -1;
    const filter = { $and: and };

    const [total, rows] = await Promise.all([
      Institution.countDocuments(filter),
      Institution.find(filter).select("-archiveHistory").populate("archive.archivedBy", "name email role").sort({ [sortField]: sortDir, _id: 1 }).skip((page - 1) * limit).limit(limit).lean(),
    ]);

    const ids = rows.map((r) => r._id);
    const people = ids.length
      ? await User.find({ institution: { $in: ids }, role: { $in: ["vice_chancellor", "institute_admin"] } }).select("name email role institution tenantStatus isSuspended").lean()
      : [];
    const items = rows.map((row) => {
      const mine = people.filter((u) => String(u.institution) === String(row._id));
      const brief = (u) => ({ _id: u._id, name: u.name, email: u.email, status: u.isSuspended || u.tenantStatus !== "active" ? "inactive" : "active" });
      return {
        ...row,
        archivalStatus: "archived",
        viceChancellors: mine.filter((u) => u.role === "vice_chancellor").map(brief),
        institutionAdmins: mine.filter((u) => u.role === "institute_admin").map(brief),
      };
    });
    res.json({ items, page, limit, total, pages: Math.max(Math.ceil(total / limit), 1) });
  } catch (error) { next(error); }
};

export const getInstitutionDetails = async (req, res, next) => {
  try {
    if (!validId(res, req.params.id)) return;
    const institution = await Institution.findById(req.params.id).populate("archive.archivedBy", "name email role").populate("createdBy", "name email").lean();
    if (!institution) return res.status(404).json({ message: "Institute not found." });
    const id = institution._id;
    const [users, departments, academicMasters, results, content, attendance, assignments, codes, people] = await Promise.all([
      User.countDocuments({ institution: id }),
      Department.countDocuments({ institution: id }),
      AcademicMaster.countDocuments({ institutionId: id }),
      OfficialResult.countDocuments({ institutionId: id }),
      Content.countDocuments({ institutionId: id }),
      Attendance.countDocuments({ institutionId: id }),
      Assignment.countDocuments({ institutionId: id }),
      RegistrationCode.countDocuments({ institution: id }),
      User.find({ institution: id, role: { $in: ["vice_chancellor", "institute_admin"] } }).select("name email role tenantStatus isSuspended").lean(),
    ]);
    delete institution.archiveHistory;
    res.json({
      institution,
      archived: Boolean(institution.deletedAt || institution.status === "archived"),
      viceChancellors: people.filter((u) => u.role === "vice_chancellor"),
      institutionAdmins: people.filter((u) => u.role === "institute_admin"),
      records: { users, departments, academicMasters, officialResults: results, content, attendance, assignments, registrationCodes: codes },
    });
  } catch (error) { next(error); }
};

export const getInstitutionHistory = async (req, res, next) => {
  try {
    if (!validId(res, req.params.id)) return;
    const institution = await Institution.findById(req.params.id).select("name code status archiveHistory").populate("archiveHistory.by", "name email role").lean();
    if (!institution) return res.status(404).json({ message: "Institute not found." });
    const audit = await AuditLog.find({ institutionId: institution._id, action: { $regex: "^institution_" } })
      .populate("admin", "name role").sort({ createdAt: -1 }).limit(100).select("action adminRole admin status remarks outcome createdAt").lean();
    res.json({
      institution: { _id: institution._id, name: institution.name, code: institution.code, status: institution.status },
      history: [...(institution.archiveHistory || [])].sort((a, b) => new Date(b.at) - new Date(a.at)),
      audit,
    });
  } catch (error) { next(error); }
};

export const restoreInstitution = async (req, res, next) => {
  try {
    if (!validId(res, req.params.id)) return;
    if (req.body?.confirm !== true) return res.status(400).json({ message: "Explicit confirmation is required to restore an institution." });
    const reason = cleanReason(req.body?.reason);
    const current = await Institution.findOne({ _id: req.params.id, ...archivedQuery }).select("name code status archive");
    if (!current) {
      const exists = await Institution.exists({ _id: req.params.id });
      return res.status(exists ? 409 : 404).json({ message: exists ? "This institution is not archived." : "Institute not found." });
    }
    const target = resolveRestoreStatus(current.archive?.previousStatus, req.body?.status);
    if (!target) return res.status(400).json({ message: "Restore status must be pending, active or suspended." });

    const now = new Date();
    const institution = await Institution.findOneAndUpdate(
      { _id: current._id, ...archivedQuery },
      {
        $set: { status: target, deletedAt: null },
        $unset: { archive: "" },
        $push: { archiveHistory: { action: "restored", by: req.user._id, byRole: req.user.role, at: now, reason, fromStatus: "archived", toStatus: target } },
      },
      { new: true }
    );
    if (!institution) return res.status(409).json({ message: "The institution was already restored. Refresh the list." });

    // Intentionally untouched: user accounts (suspended stay suspended) and revoked registration codes.
    await logAudit({
      req, action: "institution_restored", institutionId: institution._id, targetId: institution._id, targetType: "Institution", status: target,
      remarks: `Restored institute ${institution.name} as ${target}${reason ? ` — ${reason}` : ""}`,
      metadata: { restoredStatus: target, previousStatus: current.archive?.previousStatus || null, reason },
    });
    res.json({ success: true, message: `Institute restored as ${target}.`, status: target });
  } catch (error) { next(error); }
};

// Read-only view of the caller's own institution (never trusts a client-supplied id).
export const getMyInstitution = async (req, res, next) => {
  try {
    if (PLATFORM_ROLES.includes(req.user.role) || !req.user.institution) return res.status(400).json({ message: "No institution is assigned to this account." });
    const institution = await Institution.findOne({ _id: req.user.institution, deletedAt: null, status: { $ne: "archived" } })
      .select("name code slug type status contact address settings.academicYear createdAt").lean();
    if (!institution) return res.status(404).json({ message: "Institute not found." });
    res.json(institution);
  } catch (error) { next(error); }
};
