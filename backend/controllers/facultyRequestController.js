import FacultyRequest from "../models/FacultyRequest.js";
import User from "../models/User.js";
import Notification from "../models/Notification.js";

const sameText = (a = "", b = "") => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
const isHodOrSuper = (user) => ["hod", "super_admin", "institute_admin", "vice_chancellor"].includes(user?.role);

const buildChargeFromRequest = (request, teacherId, approverId) => ({
  name: `Teaching Assignment - ${request.subject}`,
  type: "teaching",
  department: request.requestingDepartment,
  programme: request.programme,
  year: request.year || "All",
  semester: request.semester,
  section: request.section || "All",
  groupType: request.groupType || "full_section",
  groupName: request.groupType === "full_section" ? "All" : (request.groupName || "Group"),
  subject: request.subject,
  permissions: ["mark_attendance", "upload_notes", "create_assignments"],
  assignedBy: approverId,
  assignedAt: new Date(),
  isActive: true,
});

export const createFacultyRequest = async (req, res) => {
  if (!isHodOrSuper(req.user)) return res.status(403).json({ message: "Only HOD or Super Admin can request faculty support" });

  const body = req.body || {};
  const requestingDepartment = req.user.role === "hod" ? req.user.department : body.requestingDepartment;
  const targetDepartment = body.targetDepartment;

  if (!requestingDepartment || !targetDepartment || !body.programme || !body.semester || !body.subject) {
    return res.status(400).json({ message: "Requesting department, target department, programme, semester and subject are required" });
  }
  if (sameText(requestingDepartment, targetDepartment)) {
    return res.status(400).json({ message: "For your own department, assign a teacher charge directly. Faculty requests are for other departments." });
  }

  const request = await FacultyRequest.create({
    requestingDepartment,
    targetDepartment,
    programme: body.programme,
    year: body.year || "All",
    semester: body.semester,
    section: body.section || "All",
    groupType: body.groupType || "full_section",
    groupName: body.groupType === "full_section" ? "All" : (body.groupName || "Group"),
    subject: body.subject,
    lecturesPerWeek: Number(body.lecturesPerWeek || 1),
    expectedHoursPerWeek: Number(body.expectedHoursPerWeek || body.lecturesPerWeek || 1),
    reason: body.reason || "",
    requestedBy: req.user._id,
  });

  const targetHods = await User.find({ role: "hod", department: { $regex: `^${String(targetDepartment).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" } });
  await Promise.all(targetHods.map((hod) => Notification.create({
    user: hod._id,
    title: "Faculty Requirement Request",
    message: `${requestingDepartment} needs faculty for ${body.subject} (${body.programme} ${body.semester})`,
  })));

  res.status(201).json(request);
};

export const listFacultyRequests = async (req, res) => {
  if (!isHodOrSuper(req.user)) return res.status(403).json({ message: "Only HOD or Super Admin can view faculty requests" });

  const { box = "all", status } = req.query;
  const query = {};
  if (status && status !== "all") query.status = status;

  if (req.user.role === "hod") {
    if (box === "incoming") query.targetDepartment = req.user.department;
    else if (box === "outgoing") query.requestingDepartment = req.user.department;
    else query.$or = [{ targetDepartment: req.user.department }, { requestingDepartment: req.user.department }];
  }

  const requests = await FacultyRequest.find(query)
    .populate("requestedBy", "name email department")
    .populate("processedBy", "name email department")
    .populate("assignedTeacher", "name email department employeeId")
    .sort({ createdAt: -1 });
  res.json(requests);
};

export const getCandidateTeachers = async (req, res) => {
  if (!isHodOrSuper(req.user)) return res.status(403).json({ message: "Only HOD or Super Admin can view candidates" });
  const { department } = req.query;
  const teacherQuery = { role: { $in: ["teacher", "teacher_admin", "hod"] } };
  if (department) teacherQuery.department = { $regex: `^${String(department).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" };
  if (req.user.role === "hod" && department && !sameText(department, req.user.department)) {
    return res.status(403).json({ message: "HOD can view candidates only from own home department" });
  }
  const teachers = await User.find(teacherQuery).select("-password").sort({ name: 1 });
  res.json(teachers);
};

export const decideFacultyRequest = async (req, res) => {
  if (!isHodOrSuper(req.user)) return res.status(403).json({ message: "Only HOD or Super Admin can process faculty requests" });
  const request = await FacultyRequest.findById(req.params.id);
  if (!request) return res.status(404).json({ message: "Faculty request not found" });
  if (request.status !== "pending") return res.status(400).json({ message: "This request is already processed" });

  if (req.user.role === "hod" && !sameText(request.targetDepartment, req.user.department)) {
    return res.status(403).json({ message: "Only the requested home department HOD can process this request" });
  }

  const { action, teacherId, decisionNote } = req.body || {};
  if (action === "reject") {
    request.status = "rejected";
    request.processedBy = req.user._id;
    request.decisionNote = decisionNote || "";
    request.processedAt = new Date();
    await request.save();
    await Notification.create({ user: request.requestedBy, title: "Faculty Request Rejected", message: `${request.targetDepartment} rejected ${request.subject} request. ${request.decisionNote || ""}` });
    return res.json(request);
  }

  if (action !== "approve" || !teacherId) return res.status(400).json({ message: "Approve action requires selected teacher" });
  const teacher = await User.findById(teacherId);
  if (!teacher || !["teacher", "teacher_admin", "hod"].includes(teacher.role)) return res.status(400).json({ message: "Select a valid teacher from the home department" });
  if (!sameText(teacher.department, request.targetDepartment)) {
    return res.status(400).json({ message: "Selected teacher must belong to the requested home/expert department" });
  }

  teacher.charges.push(buildChargeFromRequest(request, teacher._id, req.user._id));
  if (request.subject && !teacher.subjects?.some((subject) => sameText(subject, request.subject))) {
    teacher.subjects = [...(teacher.subjects || []), request.subject];
  }
  await teacher.save();

  request.status = "approved";
  request.assignedTeacher = teacher._id;
  request.processedBy = req.user._id;
  request.decisionNote = decisionNote || "";
  request.processedAt = new Date();
  await request.save();

  await Notification.create({ user: teacher._id, title: "Cross-Department Class Assigned", message: `${request.subject} for ${request.requestingDepartment} / ${request.programme} / ${request.semester}` });
  await Notification.create({ user: request.requestedBy, title: "Faculty Request Approved", message: `${teacher.name} assigned for ${request.subject}` });

  res.json(await request.populate([{ path: "assignedTeacher", select: "name email department employeeId" }, { path: "processedBy", select: "name email department" }]));
};

export const cancelFacultyRequest = async (req, res) => {
  const request = await FacultyRequest.findById(req.params.id);
  if (!request) return res.status(404).json({ message: "Faculty request not found" });
  if (request.status !== "pending") return res.status(400).json({ message: "Only pending requests can be cancelled" });
  const ownsRequest = String(request.requestedBy) === String(req.user._id);
  if (!["super_admin", "institute_admin", "vice_chancellor"].includes(req.user.role) && !ownsRequest) return res.status(403).json({ message: "Only requester or Super Admin can cancel" });
  request.status = "cancelled";
  request.processedBy = req.user._id;
  request.processedAt = new Date();
  await request.save();
  res.json(request);
};
