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

export async function verifyResult(req, res, next) {
  try {
    const item = await OfficialResult.findOne({ verificationCode: req.params.code, status: "published" })
      .select("courseCode courseName semester examSession grade attemptType attemptNumber publishedAt").lean();
    if (!item) return res.status(404).json({ success: false, message: "No published result matches this verification code" });
    // Public verification deliberately excludes student identifiers and marks.
    res.json({ success: true, item });
  } catch (e) { next(e); }
}
