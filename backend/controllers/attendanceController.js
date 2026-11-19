import Attendance from "../models/Attendance.js";
import User from "../models/User.js";
import Timetable from "../models/Timetable.js";
import Notification from "../models/Notification.js";
import AcademicMaster from "../models/AcademicMaster.js";
import { validateAcademicScope } from "../utils/academicValidation.js";

const exactText = (value) => new RegExp(`^${String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
const sameText = (a = "", b = "") => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
const idText = (value) => (value ? String(value) : "");

const buildAcademicFilter = (source = {}) => {
  const filter = {};
  ["department", "programme", "year", "semester", "section"].forEach((key) => {
    const value = source[key];
    if (value && value !== "All" && value !== "all") filter[key] = exactText(value);
  });

  const groupType = source.groupType || "full_section";
  const groupName = source.groupName || "All";
  if (groupType !== "full_section" && groupName && groupName !== "All") {
    const group = exactText(groupName);
    if (groupType === "sub_group") filter.groupName = group;
    else if (groupType === "lab_batch") filter.labBatch = group;
    else if (groupType === "elective") filter.electiveGroup = group;
    else if (groupType === "specialization") filter.specialization = group;
    else filter.$or = [{ groupName: group }, { labBatch: group }, { electiveGroup: group }, { specialization: group }];
  }

  return filter;
};

const classFilter = (source = {}) => ({
  department: exactText(source.department),
  programme: exactText(source.programme),
  year: exactText(source.year),
  semester: exactText(source.semester),
  section: exactText(source.section),
});

const subjectMatches = (charge, payload) => {
  if (payload.subjectId && charge.subjectId && idText(charge.subjectId) === idText(payload.subjectId)) return true;
  if (!charge.subject && !payload.subject) return true;
  return sameText(charge.subject, payload.subject);
};

const groupMatches = (charge, payload) => {
  const chargeType = charge.groupType || "full_section";
  const payloadType = payload.groupType || "full_section";
  const chargeName = charge.groupName || "All";
  const payloadName = payload.groupName || "All";
  if (chargeType === "full_section" || chargeName === "All") return true;
  return sameText(chargeType, payloadType) && sameText(chargeName, payloadName);
};

const teacherCanMark = async (user, payload) => {
  if (["super_admin", "institute_admin", "vice_chancellor"].includes(user.role)) return true;
  if (user.role === "hod" && sameText(user.department, payload.department)) return true;
  if (!["teacher", "teacher_admin"].includes(user.role)) return false;

  const chargeMatch = user.charges?.some((charge) => charge.isActive !== false && ["teaching", "class_incharge"].includes(charge.type) &&
    (!charge.department || charge.department === "All" || sameText(charge.department, payload.department)) &&
    (!charge.programme || charge.programme === "All" || sameText(charge.programme, payload.programme)) &&
    (!charge.year || charge.year === "All" || sameText(charge.year, payload.year)) &&
    (!charge.semester || charge.semester === "All" || sameText(charge.semester, payload.semester)) &&
    (!charge.section || charge.section === "All" || sameText(charge.section, payload.section)) &&
    subjectMatches(charge, payload) && groupMatches(charge, payload)
  );
  if (chargeMatch) return true;

  const timetableQuery = {
    ...classFilter(payload),
    $or: [{ faculty: user._id }, { facultyName: user.name }],
  };
  if (payload.subject) timetableQuery.subject = exactText(payload.subject);
  const timetableMatch = await Timetable.findOne(timetableQuery);
  return Boolean(timetableMatch);
};

const resolveSubject = async ({ subjectId, subject, department, programme, year, semester }) => {
  if (subjectId) {
    const doc = await AcademicMaster.findOne({ _id: subjectId, type: "subject", isActive: { $ne: false } });
    if (!doc) return { error: "Selected subject was not found or is inactive. Refresh Subject Master data." };
    return { subjectId: doc._id, subject: doc.name };
  }
  if (subject) {
    const doc = await AcademicMaster.findOne({
      type: "subject",
      name: exactText(subject),
      department: exactText(department),
      programme: exactText(programme),
      year: exactText(year),
      semester: exactText(semester),
      isActive: { $ne: false },
    });
    return { subjectId: doc?._id, subject };
  }
  return { error: "Subject is required." };
};

export const getAttendanceGroups = async (req, res) => {
  const scopeError = await validateAcademicScope(req.query);
  if (scopeError) return res.status(400).json({ message: scopeError });
  if (!(await teacherCanMark(req.user, { ...req.query, subject: req.query.subject || "", subjectId: req.query.subjectId || "" })) && !["hod", "super_admin", "institute_admin", "vice_chancellor"].includes(req.user.role)) {
    return res.status(403).json({ message: "You can view groups only for assigned classes." });
  }
  const baseFilter = { role: { $in: ["student", "student_admin"] }, ...buildAcademicFilter({ ...req.query, groupType: "full_section", groupName: "All" }) };
  const students = await User.find(baseFilter).select("groupName labBatch electiveGroup specialization");
  const unique = (values) => [...new Set(values.map((v) => String(v || "").trim()).filter(Boolean))].sort();
  const defaultSubGroups = ["G1", "G2", "G3", "G4", "G5"];
  res.json({
    full_section: ["All"],
    sub_group: unique([...defaultSubGroups, ...students.map((s) => s.groupName).filter((v) => v && v !== "All")]),
    lab_batch: unique([...defaultSubGroups, ...students.map((s) => s.labBatch)]),
    elective: unique(students.map((s) => s.electiveGroup)),
    specialization: unique(students.map((s) => s.specialization)),
  });
};

export const getStudentsForAttendance = async (req, res) => {
  const scopeError = await validateAcademicScope(req.query);
  if (scopeError) return res.status(400).json({ message: scopeError });
  if (!(await teacherCanMark(req.user, { ...req.query, subject: req.query.subject || "", subjectId: req.query.subjectId || "" })) && !["hod", "super_admin", "institute_admin", "vice_chancellor"].includes(req.user.role)) {
    return res.status(403).json({ message: "You can load only students from classes assigned to you." });
  }
  const filter = { role: { $in: ["student", "student_admin"] }, ...buildAcademicFilter(req.query) };
  const students = await User.find(filter).select("name email rollNumber department programme year semester section groupType groupName labBatch electiveGroup specialization").sort({ rollNumber: 1, name: 1 });
  res.json(students);
};

export const updateStudentGroupForAttendance = async (req, res) => {
  const student = await User.findById(req.params.id).select("name role department programme year semester section groupName labBatch electiveGroup specialization");
  if (!student || !["student", "student_admin"].includes(student.role)) return res.status(404).json({ message: "Student not found" });

  const scope = { department: student.department, programme: student.programme, year: student.year, semester: student.semester, section: student.section, subject: req.body.subject || "", subjectId: req.body.subjectId || "" };
  const isAllowed = ["super_admin", "institute_admin", "vice_chancellor"].includes(req.user.role) || req.user.role === "edp" || (req.user.role === "hod" && sameText(req.user.department, student.department)) || await teacherCanMark(req.user, scope);
  if (!isAllowed) return res.status(403).json({ message: "You cannot edit group allocation for this student." });

  const allowed = ["groupName", "labBatch", "electiveGroup", "specialization"];
  const updates = {};
  allowed.forEach((field) => {
    if (req.body[field] !== undefined) updates[field] = String(req.body[field] || "").trim();
  });
  if (updates.groupName === "") updates.groupName = "All";

  const updated = await User.findByIdAndUpdate(student._id, updates, { new: true }).select("name email rollNumber department programme year semester section groupName labBatch electiveGroup specialization");
  res.json(updated);
};

export const markAttendance = async (req, res) => {
  const { department, programme, year, semester, section, groupType = "full_section", groupName = "All", subjectId, subject, date, records } = req.body;
  if (!department || !programme || !year || !semester || !section || !date || !Array.isArray(records) || !records.length) return res.status(400).json({ message: "Select class, group, subject, date and at least one student." });
  const scopeError = await validateAcademicScope({ department, programme, year, semester });
  if (scopeError) return res.status(400).json({ message: scopeError });
  const resolved = await resolveSubject({ subjectId, subject, department, programme, year, semester });
  if (resolved.error) return res.status(400).json({ message: resolved.error });

  const payload = { department, programme, year, semester, section, groupType, groupName, subject: resolved.subject, subjectId: resolved.subjectId };
  if (!(await teacherCanMark(req.user, payload))) return res.status(403).json({ message: "You can mark attendance only for assigned classes/subjects." });

  const cleanRecords = records.filter((record) => record.student).map((record) => ({ student: record.student, status: record.status === "absent" ? "absent" : "present" }));
  const uniqueStudentIds = [...new Set(cleanRecords.map((record) => String(record.student)))];
  const eligibleStudents = await User.find({ _id: { $in: uniqueStudentIds }, role: { $in: ["student", "student_admin"] } }).select("_id");
  if (eligibleStudents.length !== uniqueStudentIds.length) return res.status(400).json({ message: "Attendance includes a student outside this institute or an invalid student." });
  const query = { department, programme, year, semester, section, groupType, groupName, subject: resolved.subject, date };
  if (resolved.subjectId) query.subjectId = resolved.subjectId;
  const attendance = await Attendance.findOneAndUpdate(
    query,
    { department, programme, year, semester, section, groupType, groupName, subjectId: resolved.subjectId, subject: resolved.subject, date, records: cleanRecords, markedBy: req.user._id },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  ).populate("records.student", "name rollNumber email");
  const absentRecords = cleanRecords.filter((r) => r.status === "absent");
  if (absentRecords.length) await Notification.insertMany(absentRecords.map((record) => ({ user: record.student, title: "Attendance Marked", message: `You were marked absent in ${resolved.subject} on ${date}.` })));
  res.json(attendance);
};

export const getMyAttendance = async (req, res) => {
  const records = await Attendance.find({ "records.student": req.user._id }).sort({ date: -1 });
  const subjects = {};
  records.forEach((entry) => {
    const record = entry.records.find((item) => String(item.student) === String(req.user._id));
    const key = `${entry.subject} (${entry.groupName || "All"})`;
    if (!subjects[key]) subjects[key] = { subject: entry.subject, subjectId: entry.subjectId, groupName: entry.groupName || "All", total: 0, present: 0 };
    subjects[key].total += 1;
    if (record?.status === "present") subjects[key].present += 1;
  });
  res.json(Object.values(subjects).map((item) => ({ ...item, percentage: item.total ? Math.round((item.present / item.total) * 100) : 0 })));
};

export const getAttendanceRecords = async (req, res) => {
  const filter = { ...buildAcademicFilter(req.query) };
  if (req.query.subjectId) filter.subjectId = req.query.subjectId;
  else if (req.query.subject) filter.subject = exactText(req.query.subject);
  if (req.query.date) filter.date = req.query.date;
  if (req.user.role === "hod" && req.user.department) filter.department = exactText(req.user.department);
  const records = await Attendance.find(filter).populate("records.student", "name rollNumber email department programme year semester section groupName labBatch electiveGroup specialization").populate("markedBy", "name role").sort({ date: -1, subject: 1 });
  res.json(records);
};
