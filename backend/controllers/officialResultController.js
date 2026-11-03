import crypto from "crypto";
import OfficialResult from "../models/OfficialResult.js";
import User from "../models/User.js";

const canManageResults = (req) => ["edp", "super_admin", "institute_admin", "vice_chancellor"].includes(req.user?.role);
const canListAllResults = (req) => ["edp", "hod", "teacher", "teacher_admin", "super_admin", "institute_admin", "vice_chancellor"].includes(req.user?.role);
const userInstitutionId = (user) => user?.institution?._id || user?.institution || user?.institutionId || null;
const tenantFilter = (req) => {
  const institutionId = userInstitutionId(req.user);
  // Platform owners may intentionally work across institutions; every institute-scoped role is pinned to its own institution.
  if (["super_super_admin", "platform_super_admin"].includes(req.user?.role)) return {};
  // A missing tenant must never turn into an unscoped query.
  return institutionId ? { institutionId } : { institutionId: { $exists: false, $eq: null } };
};

const teacherStudentIds = async (user) => {
  const institutionId = userInstitutionId(user);
  if (!institutionId) return [];
  const charges = (user.charges || []).filter((charge) => charge.isActive !== false && ["teaching", "class_incharge"].includes(charge.type));
  if (!charges.length) return [];
  const filters = charges.map((charge) => {
    const filter = { institution: institutionId, role: "student" };
    [["department", "department"], ["programme", "programme"], ["year", "year"], ["semester", "semester"], ["section", "section"]].forEach(([chargeKey, userKey]) => {
      if (charge[chargeKey] && charge[chargeKey] !== "All") filter[userKey] = charge[chargeKey];
    });
    if (charge.groupType && charge.groupType !== "full_section" && charge.groupName && charge.groupName !== "All") {
      const groupKey = { sub_group: "groupName", lab_batch: "labBatch", elective: "electiveGroup", specialization: "specialization" }[charge.groupType];
      if (groupKey) filter[groupKey] = charge.groupName;
    }
    return filter;
  });
  const students = await User.find({ $or: filters }).select("_id").lean();
  return students.map((student) => student._id);
};
const safeSnapshot = (doc) => ({ rollNumber: doc.rollNumber, courseCode: doc.courseCode, courseName: doc.courseName, semester: doc.semester, examSession: doc.examSession, marks: doc.marks, maxMarks: doc.maxMarks, grade: doc.grade, status: doc.status });

export async function listResults(req, res, next) {
  try {
    if (req.user?.role !== "student" && !canListAllResults(req)) {
      return res.status(403).json({ success: false, message: "Not authorized to list official results" });
    }
    if (!["super_admin", "institute_admin", "vice_chancellor"].includes(req.user?.role) && !userInstitutionId(req.user)) {
      return res.status(403).json({ success: false, message: "Your account is not assigned to an institution" });
    }
    const filter = { ...tenantFilter(req) };
    if (req.user.role === "student") filter.student = req.user._id;
    if (req.user.role === "teacher") {
      const ids = await teacherStudentIds(req.user);
      filter.student = { $in: ids };
    }
    if (req.query.semester) filter.semester = req.query.semester;
    if (req.query.examSession) filter.examSession = req.query.examSession;
    const canManage = canManageResults(req);
    const includeDrafts = canManage && String(req.query.includeDrafts || "false") === "true";
    if (!includeDrafts) filter.status = "published";
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const [items, total] = await Promise.all([
      OfficialResult.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      OfficialResult.countDocuments(filter)
    ]);
    res.json({ success: true, items, page, limit, total });
  } catch (e) { next(e); }
}

export async function validateAndCreateBatch(req, res, next) {
  try {
    if (!canManageResults(req)) return res.status(403).json({ success: false, message: "Only EDP or Super Admin can manage official results" });
    if (!["super_admin", "institute_admin", "vice_chancellor"].includes(req.user.role) && !userInstitutionId(req.user)) {
      return res.status(403).json({ success: false, message: "Your account is not assigned to an institution" });
    }
    const records = req.body?.records;
    if (!Array.isArray(records) || !records.length || records.length > 5000)
      return res.status(400).json({ success: false, message: "Provide 1–5000 records in records[]" });
    const errors = [], valid = [], seen = new Set();
    for (let i = 0; i < records.length; i++) {
      const r = records[i] || {}, row = i + 1;
      const required = ["rollNumber", "courseCode", "courseName", "semester", "examSession"];
      const missing = required.filter(k => !String(r[k] ?? "").trim());
      const marks = Number(r.marks), maxMarks = Number(r.maxMarks);
      const key = [r.rollNumber, r.courseCode, r.semester, r.examSession].map(x => String(x ?? "").trim().toLowerCase()).join("|");
      if (missing.length) errors.push({ row, message: `Missing: ${missing.join(", ")}` });
      else if (!Number.isFinite(marks) || !Number.isFinite(maxMarks) || maxMarks <= 0 || marks < 0 || marks > maxMarks)
        errors.push({ row, message: "Marks must be between 0 and a positive maxMarks" });
      else if (seen.has(key)) errors.push({ row, message: "Duplicate record in upload" });
      else {
        seen.add(key);
        const institutionId = userInstitutionId(req.user);
      if (!["super_admin", "institute_admin", "vice_chancellor"].includes(req.user.role) && !institutionId) {
        errors.push({ row, message: "Your account is not assigned to an institution" });
        continue;
      }
      const studentQuery = { rollNumber: String(r.rollNumber).trim() };
      // Super admins must specify the target institution to avoid ambiguous roll numbers.
      const requestedInstitution = ["super_admin", "institute_admin", "vice_chancellor"].includes(req.user.role) ? (r.institutionId || r.institution) : institutionId;
      if (!requestedInstitution) {
        errors.push({ row, message: "institutionId is required for super-admin uploads" });
        continue;
      }
      studentQuery.institution = requestedInstitution;
      const student = await User.findOne(studentQuery).select("_id institution");
        if (!student) errors.push({ row, message: "Unknown roll number in the selected institution" });
        else valid.push({ ...r, student: student._id, institutionId: student.institution,
          rollNumber: String(r.rollNumber).trim(), courseCode: String(r.courseCode).trim(),
          courseName: String(r.courseName).trim(), semester: String(r.semester).trim(),
          examSession: String(r.examSession).trim(), marks, maxMarks, status: "draft",
          history: [{ action: "created", actor: req.user._id, reason: "EDP batch upload" }] });
      }
    }
    if (errors.length) return res.status(422).json({ success: false, total: records.length, valid: valid.length, errors, message: "Correct validation errors and upload the complete batch again." });
    const docs = await OfficialResult.insertMany(valid, { ordered: true });
    res.status(201).json({ success: true, total: docs.length, status: "draft", items: docs });
  } catch (e) { next(e); }
}

export async function publishResult(req, res, next) {
  try {
    if (!canManageResults(req)) return res.status(403).json({ success: false, message: "Only EDP or Super Admin can manage official results" });
    if (!["super_admin", "institute_admin", "vice_chancellor"].includes(req.user.role) && !userInstitutionId(req.user)) {
      return res.status(403).json({ success: false, message: "Your account is not assigned to an institution" });
    }
    const result = await OfficialResult.findOne({ _id: req.params.id, ...tenantFilter(req), status: "draft" });
    if (!result) return res.status(404).json({ success: false, message: "Draft result not found in your institution" });
    result.status = "published";
    result.publishedAt = new Date();
    result.verificationCode = crypto.randomBytes(16).toString("hex");
    result.history.push({ action: "published", actor: req.user._id, reason: String(req.body?.reason || "EDP publication"), snapshot: safeSnapshot(result) });
    await result.save();
    res.json({ success: true, item: result });
  } catch (e) { next(e); }
}

export async function publishBatch(req, res, next) {
  const mongoose = (await import("mongoose")).default;
  const session = await mongoose.startSession();
  try {
    if (!canManageResults(req)) return res.status(403).json({ success: false, message: "Only EDP or Super Admin can manage official results" });
    if (!["super_admin", "institute_admin", "vice_chancellor"].includes(req.user.role) && !userInstitutionId(req.user))
      return res.status(403).json({ success: false, message: "Your account is not assigned to an institution" });
    const ids = req.body?.ids;
    if (!Array.isArray(ids) || !ids.length || ids.length > 5000 || ids.some(id => !mongoose.isValidObjectId(id)))
      return res.status(400).json({ success: false, message: "Provide 1–5000 valid result IDs" });
    if (new Set(ids.map(String)).size !== ids.length)
      return res.status(400).json({ success: false, message: "Duplicate result IDs are not allowed" });
    let published = 0;
    await session.withTransaction(async () => {
      const filter = { _id: { $in: ids }, ...tenantFilter(req), status: "draft" };
      const docs = await OfficialResult.find(filter).session(session);
      if (docs.length !== ids.length) throw Object.assign(new Error("All results must be drafts within your institution"), { status: 409 });
      for (const doc of docs) {
        doc.status = "published";
        doc.publishedAt = new Date();
        doc.verificationCode = crypto.randomBytes(24).toString("hex");
        doc.history.push({ action: "published", actor: req.user._id, reason: String(req.body?.reason || "EDP batch publication"), snapshot: safeSnapshot(doc) });
        await doc.save({ session });
      }
      published = docs.length;
    });
    res.json({ success: true, published });
  } catch (e) { next(e); } finally { await session.endSession(); }
}

export async function verifyResult(req, res, next) {
  try {
    const item = await OfficialResult.findOne({ verificationCode: req.params.code, status: "published" })
      .select("courseCode courseName semester examSession grade publishedAt").lean();
    if (!item) return res.status(404).json({ success: false, message: "No published result matches this verification code" });
    // Public verification deliberately excludes student identifiers and marks.
    res.json({ success: true, item });
  } catch (e) { next(e); }
}
