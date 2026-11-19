import Assignment from "../models/Assignment.js";
import Notification from "../models/Notification.js";
import User from "../models/User.js";
import { validateAcademicScope } from "../utils/academicValidation.js";

import { exactText, searchRegex } from "../utils/search.js";
const populate = (query) => query.populate("createdBy", "name role department").populate("submissions.student", "name rollNumber email").sort({ createdAt: -1 });
const sameText = (a = "", b = "") => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

const assignmentScopeFilter = (source = {}) => {
  const filter = {};
  ["department", "programme", "year", "semester", "section"].forEach((key) => {
    if (source[key]) filter[key] = exactText(source[key]);
  });
  return filter;
};

const teacherCanCreateForScope = (user, payload) => {
  if (["super_admin", "institute_admin", "vice_chancellor"].includes(user.role)) return true;
  if (user.role === "hod" && sameText(user.department, payload.department)) return true;
  return Boolean(user.charges?.some((charge) => charge.isActive !== false && ["teaching", "class_incharge"].includes(charge.type) &&
    (!charge.department || charge.department === "All" || sameText(charge.department, payload.department)) &&
    (!charge.programme || charge.programme === "All" || sameText(charge.programme, payload.programme)) &&
    (!charge.year || charge.year === "All" || sameText(charge.year, payload.year)) &&
    (!charge.semester || charge.semester === "All" || sameText(charge.semester, payload.semester)) &&
    (!charge.section || charge.section === "All" || sameText(charge.section, payload.section)) &&
    (!charge.subject || sameText(charge.subject, payload.subject)) &&
    (!charge.groupName || charge.groupName === "All" || sameText(charge.groupName, payload.groupName || "All"))
  ));
};

const studentMatchesAssignment = (student, assignment) => {
  if (!sameText(student.department, assignment.department)) return false;
  if (assignment.programme && !sameText(student.programme, assignment.programme)) return false;
  if (assignment.year && !sameText(student.year, assignment.year)) return false;
  if (assignment.semester && !sameText(student.semester, assignment.semester)) return false;
  if (assignment.section && !sameText(student.section, assignment.section)) return false;
  if (assignment.groupType && assignment.groupType !== "full_section" && assignment.groupName && assignment.groupName !== "All") {
    return [student.groupName, student.labBatch, student.electiveGroup, student.specialization].some((value) => sameText(value, assignment.groupName));
  }
  return true;
};

export const createAssignment = async (req, res) => {
  const payload = {
    ...req.body,
    groupType: req.body.groupType || "full_section",
    groupName: req.body.groupType === "full_section" ? "All" : (req.body.groupName || "Group"),
  };

  const required = ["title", "subject", "department", "programme", "year", "semester", "section"];
  const missing = required.filter((key) => !payload[key]);
  if (missing.length) return res.status(400).json({ message: `Missing assignment fields: ${missing.join(", ")}` });

  const scopeError = await validateAcademicScope(payload);
  if (scopeError) return res.status(400).json({ message: scopeError });
  if (!teacherCanCreateForScope(req.user, payload)) return res.status(403).json({ message: "You can create assignments only for assigned subjects/classes." });

  const attachment = req.file ? { fileUrl: req.file.path, fileName: req.file.originalname, fileType: req.file.mimetype, fileSize: req.file.size } : {};
  const assignment = await Assignment.create({ ...payload, ...attachment, createdBy: req.user._id });

  const students = await User.find({ role: { $in: ["student", "student_admin"] }, ...assignmentScopeFilter(payload) }).select("_id groupName labBatch electiveGroup specialization");
  const targeted = students.filter((student) => studentMatchesAssignment(student, assignment));

  if (targeted.length) {
    await Notification.insertMany(targeted.map((student) => ({ user: student._id, title: "New Assignment", message: `${assignment.subject}: ${assignment.title}` })));
  }

  res.status(201).json(assignment);
};

export const getAssignments = async (req, res) => {
  const { department, programme, year, semester, section, subject, search, mine } = req.query;
  const filter = {};
  const role = req.user?.role;
  const studentRole = ["student", "student_admin"].includes(role);
  const institutionManagers = ["super_admin", "institute_admin", "vice_chancellor"].includes(role);

  if (studentRole) {
    // Student requests are always constrained to the authenticated profile. Query
    // parameters may narrow this scope but can never broaden it.
    Object.assign(filter, assignmentScopeFilter(req.user));
    if (department && !sameText(department, req.user.department)) return res.json([]);
    if (programme && !sameText(programme, req.user.programme)) return res.json([]);
    if (year && !sameText(year, req.user.year)) return res.json([]);
    if (semester && !sameText(semester, req.user.semester)) return res.json([]);
    if (section && !sameText(section, req.user.section)) return res.json([]);
    if (subject) filter.subject = searchRegex(subject);
  } else if (role === "hod") {
    if (!req.user.department) return res.json([]);
    filter.department = exactText(req.user.department);
    if (programme) filter.programme = searchRegex(programme);
    if (year) filter.year = String(year);
    if (semester) filter.semester = String(semester);
    if (section) filter.section = exactText(section);
    if (subject) filter.subject = searchRegex(subject);
  } else if (["teacher", "teacher_admin"].includes(role)) {
    // Teaching staff are limited to active assigned teaching/class-incharge scopes.
    const charges = (req.user.charges || []).filter((charge) => charge.isActive !== false && ["teaching", "class_incharge"].includes(charge.type));
    const assignedScopes = charges.map((charge) => {
      const scope = { department: (!charge.department || charge.department === "All") ? req.user.department : charge.department };
      ["programme", "year", "semester", "section", "subject", "groupName"].forEach((key) => {
        if (charge[key] && charge[key] !== "All") scope[key] = exactText(charge[key]);
      });
      return scope;
    }).filter((scope) => scope.department);
    filter.$or = assignedScopes.length ? assignedScopes : [{ createdBy: req.user._id }];
    if (subject) filter.subject = searchRegex(subject);
  } else if (institutionManagers) {
    if (department) filter.department = searchRegex(department);
    if (programme) filter.programme = searchRegex(programme);
    if (year) filter.year = String(year);
    if (semester) filter.semester = String(semester);
    if (section) filter.section = exactText(section);
    if (subject) filter.subject = searchRegex(subject);
  } else {
    return res.status(403).json({ message: "You do not have permission to view assignment records." });
  }

  if (mine === "created" && req.user?._id) filter.createdBy = req.user._id;
  if (search) { const rx = searchRegex(search); filter.$and = [...(filter.$and || []), { $or: [{ title: rx }, { description: rx }, { subject: rx }] }]; }
  const rows = await populate(Assignment.find(filter).limit(200));
  if (!studentRole) return res.json(rows);
  // Do not disclose peer submissions, names, roll numbers, email addresses or grades.
  return res.json(rows.filter((item) => studentMatchesAssignment(req.user, item)).map((item) => {
    const plain = item.toObject();
    plain.submissions = (plain.submissions || []).filter((entry) => String(entry.student?._id || entry.student) === String(req.user._id));
    return plain;
  }));
};

export const getMyAssignments = async (req, res) => {
  if (["teacher", "teacher_admin", "hod", "super_admin", "institute_admin", "vice_chancellor"].includes(req.user.role)) {
    return res.json(await populate(Assignment.find({ createdBy: req.user._id })));
  }
  const filter = assignmentScopeFilter(req.user);
  const items = await populate(Assignment.find(filter).limit(200));
  res.json(items.filter((item) => studentMatchesAssignment(req.user, item)).map((item) => {
    const plain = item.toObject();
    plain.submissions = (plain.submissions || []).filter((entry) => String(entry.student?._id || entry.student) === String(req.user._id));
    return plain;
  }));
};

export const submitAssignment = async (req, res) => {
  const assignment = await Assignment.findById(req.params.id);
  if (!assignment) return res.status(404).json({ message: "Assignment not found" });
  if (!["student", "student_admin"].includes(req.user.role) || !studentMatchesAssignment(req.user, assignment)) return res.status(403).json({ message: "This assignment is not assigned to you." });
  if (!req.file) return res.status(400).json({ message: "Upload a file to submit." });

  assignment.submissions = assignment.submissions.filter((entry) => String(entry.student) !== String(req.user._id));
  assignment.submissions.push({ student: req.user._id, fileUrl: req.file.path, fileName: req.file.originalname, fileType: req.file.mimetype, fileSize: req.file.size });
  await assignment.save();
  await Notification.create({ user: assignment.createdBy, title: "Assignment Submitted", message: `${req.user.name} submitted ${assignment.title}` });
  const updated = await Assignment.findById(assignment._id).populate("submissions.student", "name rollNumber email");
  const plain = updated.toObject();
  plain.submissions = (plain.submissions || []).filter((entry) => String(entry.student?._id || entry.student) === String(req.user._id));
  res.json(plain);
};

export const gradeSubmission = async (req, res) => {
  const assignment = await Assignment.findById(req.params.id);
  if (!assignment) return res.status(404).json({ message: "Assignment not found" });
  if (String(assignment.createdBy) !== String(req.user._id) && !["super_admin", "institute_admin", "vice_chancellor"].includes(req.user.role)) return res.status(403).json({ message: "Only the assignment creator can grade submissions." });
  const submission = assignment.submissions.id(req.params.submissionId);
  if (!submission) return res.status(404).json({ message: "Submission not found" });
  const marks = Number(req.body.marks);
  if (!Number.isFinite(marks) || marks < 0 || (Number.isFinite(Number(assignment.maxMarks)) && Number(assignment.maxMarks) > 0 && marks > Number(assignment.maxMarks))) {
    return res.status(400).json({ message: "Marks must be a valid non-negative number and cannot exceed the assignment maximum." });
  }
  submission.marks = marks;
  submission.feedback = String(req.body.feedback || "").slice(0, 2000);
  submission.status = "graded";
  await assignment.save();
  await Notification.create({ user: submission.student, title: "Assignment Graded", message: `${assignment.title} has been graded.` });
  res.json(submission);
};

export const toggleSaveAssignment = async (req, res) => {
  const assignment = await Assignment.findById(req.params.id);
  if (!assignment) return res.status(404).json({ message: "Assignment not found" });
  const index = assignment.savedBy.findIndex((id) => String(id) === String(req.user._id));
  if (index >= 0) assignment.savedBy.splice(index, 1);
  else assignment.savedBy.push(req.user._id);
  await assignment.save();
  res.json({ saved: index < 0 });
};
