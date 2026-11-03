import Institution from "../models/Institution.js";
import AuditLog from "../models/AuditLog.js";

// Public dropdown: only active, non-deleted institutions.
export const listPublicInstitutions = async (_req, res) => {
  const institutions = await Institution.find({ status: "active", deletedAt: null })
    .select("name slug code type branding.logoUrl").sort({ name: 1 }).lean();
  res.json(institutions);
};


export const listManagedInstitutions = async (_req, res, next) => {
  try {
    const institutions = await Institution.find({ deletedAt: null })
      .select("name slug code type status branding.logoUrl createdAt updatedAt")
      .sort({ status: 1, name: 1 })
      .lean();
    res.json(institutions);
  } catch (error) { next(error); }
};

export const listInstitutionsAdmin = async (_req, res) => {
  const institutions = await Institution.find({ deletedAt: null }).sort({ name: 1 }).lean();
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

export const createInstitution = async (req, res, next) => {
  try {
    const data = normalize(req.body);
    if (!data.name || !data.slug || !/^[A-Z0-9_-]{2,20}$/.test(data.code)) return res.status(400).json({ message: "Name, valid slug, and code (2–20 letters/numbers) are required." });
    const institution = await Institution.create({ ...data, createdBy: req.user._id });
    await AuditLog.create({ action: "institution_created", admin: req.user._id, adminRole: req.user.role, status: institution.status, remarks: `Created institute ${institution.name}`, institutionId: institution._id });
    res.status(201).json(institution);
  } catch (error) { if (error.code === 11000) return res.status(409).json({ message: "An institute with this slug or code already exists." }); next(error); }
};

export const updateInstitution = async (req, res, next) => {
  try {
    const data = normalize(req.body);
    if (!data.name || !data.slug || !/^[A-Z0-9_-]{2,20}$/.test(data.code)) return res.status(400).json({ message: "Name, valid slug, and code (2–20 letters/numbers) are required." });
    const institution = await Institution.findOneAndUpdate({ _id: req.params.id, deletedAt: null }, { $set: data }, { new: true, runValidators: true });
    if (!institution) return res.status(404).json({ message: "Institute not found." });
    await AuditLog.create({ action: "institution_updated", admin: req.user._id, adminRole: req.user.role, status: institution.status, remarks: `Updated institute ${institution.name}`, institutionId: institution._id });
    res.json(institution);
  } catch (error) { if (error.code === 11000) return res.status(409).json({ message: "An institute with this slug or code already exists." }); next(error); }
};

export const archiveInstitution = async (req, res) => {
  const institution = await Institution.findOneAndUpdate({ _id: req.params.id, deletedAt: null }, { $set: { status: "archived", deletedAt: new Date() } }, { new: true });
  if (!institution) return res.status(404).json({ message: "Institute not found." });
  await AuditLog.create({ action: "institution_archived", admin: req.user._id, adminRole: req.user.role, status: "archived", remarks: `Archived institute ${institution.name}`, institutionId: institution._id });
  res.json({ message: "Institute archived." });
};
