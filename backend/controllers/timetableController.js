import Timetable from "../models/Timetable.js";
import User from "../models/User.js";
import { validateAcademicScope } from "../utils/academicValidation.js";
import { hasCharge } from "../middleware/authMiddleware.js";

const allowedFilters = ["department", "programme", "year", "semester", "section", "groupType", "groupName"];
const exactText = (value) => new RegExp(`^${String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
const todayName = () => new Date().toLocaleDateString("en-US", { weekday: "long" });

const buildQueryFilters = (source = {}) => {
  const filter = {};
  allowedFilters.forEach((key) => {
    const value = source[key];
    if (value && value !== "all" && value !== "All") filter[key] = exactText(value);
  });
  return filter;
};

const normalizePayload = (body = {}, user = {}) => {
  const payload = { ...body };
  if (payload.teacher && !payload.faculty) payload.faculty = payload.teacher;
  if (payload.teacherName && !payload.facultyName) payload.facultyName = payload.teacherName;
  delete payload.teacher; delete payload.teacherName;
  if (!payload.groupType) payload.groupType = "full_section";
  if (!payload.groupName) payload.groupName = payload.groupType === "full_section" ? "All" : "Group";
  if (!payload.facultyName && ["teacher", "teacher_admin", "hod"].includes(user?.role)) {
    payload.faculty = user._id; payload.facultyName = user.name;
  }
  return payload;
};

const hasDepartmentControl = (user, department) => {
  if (["super_admin", "institute_admin", "vice_chancellor"].includes(user?.role)) return true;
  if (user?.role === "hod" && (!department || String(user.department).toLowerCase() === String(department).toLowerCase())) return true;
  return hasCharge(user, "hod", "manage_timetable") && (!department || String(user.department).toLowerCase() === String(department).toLowerCase());
};

const overlapFilter = (payload, excludeId) => ({
  _id: excludeId ? { $ne: excludeId } : undefined,
  day: payload.day,
  startTime: payload.startTime,
  $or: [
    { department: exactText(payload.department), programme: exactText(payload.programme), year: exactText(payload.year), semester: exactText(payload.semester), section: exactText(payload.section), groupType: exactText(payload.groupType), groupName: exactText(payload.groupName) },
    payload.room ? { room: exactText(payload.room) } : null,
    payload.faculty ? { faculty: payload.faculty } : null,
    payload.facultyName ? { facultyName: exactText(payload.facultyName) } : null,
  ].filter(Boolean),
});

export const createTimetableEntry = async (req, res) => {
  const payload = normalizePayload(req.body, req.user);
  if (payload.faculty) {
    const faculty = await User.findById(payload.faculty).select("_id role");
    if (!faculty || !["teacher", "teacher_admin", "hod", "super_admin", "institute_admin", "vice_chancellor"].includes(faculty.role)) return res.status(400).json({ message: "Select a teaching staff member from your institute." });
  }
  const requiredFields = ["department", "programme", "year", "semester", "section", "day", "startTime", "endTime", "subject"];
  const missing = requiredFields.filter((field) => !payload[field]);
  if (missing.length) return res.status(400).json({ message: `Missing timetable fields: ${missing.join(", ")}` });
  if (!hasDepartmentControl(req.user, payload.department)) return res.status(403).json({ message: "Only the department HOD or Super Admin can create this timetable" });
  const scopeError = await validateAcademicScope(payload);
  if (scopeError) return res.status(400).json({ message: scopeError });
  const query = overlapFilter(payload); delete query._id;
  const overlapping = await Timetable.findOne(query);
  if (overlapping) return res.status(409).json({ message: "Conflict: same section/group, room or faculty already has a class at this time." });
  const entry = await Timetable.create(payload);
  const populated = await Timetable.findById(entry._id).populate("faculty", "name email department");
  res.status(201).json(populated);
};

export const getMyTimetable = async (req, res) => {
  let filter = {};
  if (["teacher", "teacher_admin", "hod"].includes(req.user.role)) {
    filter = { $or: [{ faculty: req.user._id }, { facultyName: req.user.name }] };
  } else if (req.user.role === "student" || req.user.role === "student_admin") {
    const base = buildQueryFilters(req.user);
    const groups = [{ groupType: "full_section" }, { groupName: exactText(req.user.groupName || "All") }];
    if (req.user.labBatch) groups.push({ groupName: exactText(req.user.labBatch) });
    if (req.user.electiveGroup) groups.push({ groupName: exactText(req.user.electiveGroup) });
    if (req.user.specialization) groups.push({ groupName: exactText(req.user.specialization) });
    filter = { ...base, $or: groups };
  } else if (req.user.role === "edp") {
    filter = {};
  }
  const entries = await Timetable.find(filter).populate("faculty", "name email department").sort({ day: 1, startTime: 1 });
  res.json(entries);
};

export const getTodayTimetable = async (req, res) => {
  const day = req.query.day || todayName();
  const oldQuery = req.query;
  req.query = { ...oldQuery, day };
  let filter = { day };
  if (["teacher", "teacher_admin", "hod"].includes(req.user.role)) filter = { day, $or: [{ faculty: req.user._id }, { facultyName: req.user.name }] };
  else if (["student", "student_admin"].includes(req.user.role)) filter = { ...buildQueryFilters(req.user), day, $or: [{ groupType: "full_section" }, { groupName: exactText(req.user.groupName || "All") }, req.user.labBatch ? { groupName: exactText(req.user.labBatch) } : null, req.user.electiveGroup ? { groupName: exactText(req.user.electiveGroup) } : null, req.user.specialization ? { groupName: exactText(req.user.specialization) } : null].filter(Boolean) };
  else if (req.user.role === "hod") filter.department = exactText(req.user.department);
  const entries = await Timetable.find(filter).populate("faculty", "name email department").sort({ startTime: 1 });
  res.json(entries);
};

export const getAllTimetable = async (req, res) => {
  const filter = buildQueryFilters(req.query);
  if (req.query.day) filter.day = req.query.day;
  if (req.user.role === "hod" && req.user.department) filter.department = exactText(req.user.department);
  const entries = await Timetable.find(filter).populate("faculty", "name email department").sort({ day: 1, startTime: 1 });
  res.json(entries);
};

export const updateTimetableEntry = async (req, res) => {
  const old = await Timetable.findById(req.params.id);
  if (!old) return res.status(404).json({ message: "Timetable entry not found" });
  if (!hasDepartmentControl(req.user, old.department)) return res.status(403).json({ message: "Only department HOD or Super Admin can edit this timetable" });
  const payload = normalizePayload(req.body, req.user);
  if (payload.faculty) {
    const faculty = await User.findById(payload.faculty).select("_id role");
    if (!faculty || !["teacher", "teacher_admin", "hod", "super_admin", "institute_admin", "vice_chancellor"].includes(faculty.role)) return res.status(400).json({ message: "Select a teaching staff member from your institute." });
  }
  const merged = { ...old.toObject(), ...payload };
  const scopeError = await validateAcademicScope(merged);
  if (scopeError) return res.status(400).json({ message: scopeError });
  const overlapping = await Timetable.findOne(overlapFilter(merged, old._id));
  if (overlapping) return res.status(409).json({ message: "Conflict: same section/group, room or faculty already has a class at this time." });
  const entry = await Timetable.findByIdAndUpdate(req.params.id, payload, { new: true, runValidators: true }).populate("faculty", "name email department");
  res.json(entry);
};

export const deleteTimetableEntry = async (req, res) => {
  const entry = await Timetable.findById(req.params.id);
  if (!entry) return res.status(404).json({ message: "Timetable entry not found" });
  if (!hasDepartmentControl(req.user, entry.department)) return res.status(403).json({ message: "Only department HOD or Super Admin can delete this timetable" });
  await entry.deleteOne();
  res.json({ message: "Timetable entry deleted" });
};
