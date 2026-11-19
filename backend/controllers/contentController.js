import Content from "../models/Content.js";
import User from "../models/User.js";
import AuditLog from "../models/AuditLog.js";
import Notification from "../models/Notification.js";
import { searchRegex } from "../utils/search.js";

const populateContent = (query) =>
  query
    .populate("submittedBy", "name role department programme year semester section rollNumber employeeId")
    .populate("reviewedBy", "name role")
    .populate("assignedReviewer", "name role department charges")
    .populate("comments.user", "name role department")
    .sort({ createdAt: -1 });

const splitMulti = (value) => {
  if (!value) return [];

  if (Array.isArray(value)) return value.filter(Boolean);

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.filter(Boolean);
  } catch {}

  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
};

const permissionByContent = (type) => {
  if (type === "event") return "approve_events";
  if (type === "announcement") return "approve_announcements";
  if (type === "assignment") return "approve_assignments";
  if (type === "note") return "approve_notes";
  return "approve_posts";
};

const matchesScope = (charge, content) => {
  const scopeMatches = (chargeValue, contentValue) => {
    if (!chargeValue || chargeValue === "All") return true;
    if (!contentValue) return true;
    return String(chargeValue).toLowerCase() === String(contentValue).toLowerCase();
  };

  return (
    scopeMatches(charge.department, content.department) &&
    scopeMatches(charge.programme, content.programme) &&
    scopeMatches(charge.year, content.year) &&
    scopeMatches(charge.semester, content.semester) &&
    scopeMatches(charge.section, content.section)
  );
};

const findAssignedReviewer = async (content) => {
  const requiredPermission = permissionByContent(content.type);

  const teachers = await User.find({
    role: { $in: ["teacher_admin", "super_admin", "institute_admin", "vice_chancellor"] },
    "charges.isActive": true,
  });

  const matchingTeacher = teachers.find((teacher) =>
    teacher.charges?.some(
      (charge) =>
        charge.isActive &&
        charge.type === content.category &&
        charge.permissions?.includes(requiredPermission) &&
        matchesScope(charge, content)
    )
  );

  if (matchingTeacher) {
    return {
      reviewer: matchingTeacher._id,
      route: `${content.category}_coordinator`,
    };
  }

  const hodTeacher = teachers.find((teacher) =>
    teacher.charges?.some(
      (charge) =>
        charge.isActive &&
        ["hod", "department"].includes(charge.type) &&
        charge.permissions?.includes(requiredPermission) &&
        matchesScope(charge, content)
    )
  );

  if (hodTeacher) {
    return {
      reviewer: hodTeacher._id,
      route: "department_hod",
    };
  }

  return {
    reviewer: null,
    route: "general_admin",
  };
};

const visibleToUserFilter = (user, type) => {
  const or = [
    { visibility: "all" },
    { visibility: { $exists: false } },
  ];

  if (user.department) {
    or.push({ visibility: "department", department: user.department });
    or.push({ visibility: "department", targetDepartments: user.department });
    or.push({ targetDepartments: user.department });
  }

  const classAnd = [];

  if (user.department) {
    classAnd.push({
      $or: [{ targetDepartments: { $size: 0 } }, { targetDepartments: user.department }],
    });
  }

  if (user.programme) {
    classAnd.push({
      $or: [{ targetProgrammes: { $size: 0 } }, { targetProgrammes: user.programme }],
    });
  }

  if (user.year) {
    classAnd.push({
      $or: [{ targetYears: { $size: 0 } }, { targetYears: user.year }],
    });
  }

  if (user.semester) {
    classAnd.push({
      $or: [{ targetSemesters: { $size: 0 } }, { targetSemesters: user.semester }],
    });
  }

  if (user.section) {
    classAnd.push({
      $or: [{ targetSections: { $size: 0 } }, { targetSections: user.section }],
    });
  }

  if (classAnd.length) {
    or.push({ visibility: "class", $and: classAnd });
    or.push({ visibility: "selected", $and: classAnd });
  }

  const filter = { status: "approved", $or: or };

  if (type) filter.type = type;

  return filter;
};

const canReviewContent = (user, content) => {
  if (["super_admin", "institute_admin", "vice_chancellor"].includes(user.role)) return true;

  if (
    String(content.assignedReviewer || "") === String(user._id || user.id)
  ) {
    return true;
  }

  if (user.role === "teacher_admin") {
    const requiredPermission = permissionByContent(content.type);

    return user.charges?.some(
      (charge) =>
        charge.isActive &&
        charge.permissions?.includes(requiredPermission) &&
        (charge.type === content.category || ["hod", "department"].includes(charge.type)) &&
        matchesScope(charge, content)
    );
  }

  if (user.role === "student_admin") {
    return ["post", "note"].includes(content.type);
  }

  return false;
};

export const createContent = async (req, res) => {
  const attachment = req.file
    ? {
        fileUrl: req.file.path,
        fileName: req.file.originalname,
        fileType: req.file.mimetype,
        fileSize: req.file.size,
      }
    : {};

  const targetDepartments = splitMulti(req.body.targetDepartments || req.body.targetDepartment);
  const targetProgrammes = splitMulti(req.body.targetProgrammes || req.body.targetProgramme);
  const targetYears = splitMulti(req.body.targetYears || req.body.targetYear);
  const targetSemesters = splitMulti(req.body.targetSemesters || req.body.targetSemester);
  const targetSections = splitMulti(req.body.targetSections || req.body.targetSection);

  const draft = {
    ...req.body,
    category: req.body.category || "general",
    department: req.body.department || targetDepartments[0] || req.user.department || "",
    programme: req.body.programme || targetProgrammes[0] || req.user.programme || "",
    year: req.body.year || targetYears[0] || req.user.year || "",
    semester: req.body.semester || targetSemesters[0] || req.user.semester || "",
    section: req.body.section || targetSections[0] || req.user.section || "",
    targetDepartments,
    targetProgrammes,
    targetYears,
    targetSemesters,
    targetSections,
    targetCourses: splitMulti(req.body.targetCourses),
    targetSubjects: splitMulti(req.body.targetSubjects),
    targetCommunity: req.body.targetCommunity || req.body.community || "",
    ...attachment,
    submittedBy: req.user._id,
  };

  const assignment = await findAssignedReviewer(draft);

  const officialTeacherContent =
    req.user.role === "teacher_admin" &&
    req.user.charges?.some(
      (charge) =>
        charge.isActive &&
        (charge.type === draft.category || ["hod", "department"].includes(charge.type)) &&
        charge.permissions?.some((permission) =>
          ["create_announcements", "create_events", "manage_notes"].includes(permission)
        ) &&
        matchesScope(charge, draft)
    );

  const content = await Content.create({
    ...draft,
    assignedReviewer: assignment.reviewer,
    approvalRoute: assignment.route,
    status: ["super_admin", "institute_admin", "vice_chancellor", "teacher_admin"].includes(req.user.role) || officialTeacherContent ? "approved" : "pending",
  });

  if (assignment.reviewer && content.status === "pending") {
    await Notification.create({
      user: assignment.reviewer,
      title: "Approval Request Assigned",
      message: `${content.category} ${content.type} "${content.title}" is waiting for your approval.`,
    });
  }

  res.status(201).json(content);
};

export const getApprovedContent = async (req, res) => {
  const { type, department, programme, year, semester, section, subject, search } = req.query;

  const filter = { status: "approved" };

  if (type) filter.type = type;
  if (department) filter.department = department;
  if (programme) filter.programme = programme;
  if (year) filter.year = year;
  if (semester) filter.semester = semester;
  if (section) filter.section = section;
  if (subject) filter.subject = subject;

  if (search) {
    filter.$or = [
      { title: searchRegex(search) },
      { body: searchRegex(search) },
      { subject: searchRegex(search) },
      { department: searchRegex(search) },
      { programme: searchRegex(search) },
    ];
  }

  const content = await populateContent(Content.find(filter));
  res.json(content);
};

export const getVisibleFeed = async (req, res) => {
  const content = await populateContent(Content.find(visibleToUserFilter(req.user, req.query.type)));
  res.json(content);
};

export const getGroupedFeed = async (req, res) => {
  const { type } = req.query;

  const content = await populateContent(
    Content.find(visibleToUserFilter(req.user, type))
  );

  const allUniversity = content.filter((item) => item.visibility === "all");

  const myDepartment = content.filter(
    (item) =>
      item.visibility !== "all" &&
      item.department &&
      req.user.department &&
      item.department === req.user.department
  );

  const allowedOthers = content.filter(
    (item) =>
      item.visibility !== "all" &&
      item.department &&
      req.user.department &&
      item.department !== req.user.department
  );

  res.json({ allUniversity, myDepartment, allowedOthers });
};

export const getMyContent = async (req, res) => {
  const content = await populateContent(Content.find({ submittedBy: req.user._id }));
  res.json(content);
};

export const getSavedContent = async (req, res) => {
  const content = await populateContent(Content.find({ savedBy: req.user._id, status: "approved" }));
  res.json(content);
};

export const getPendingContent = async (req, res) => {
  const { type, department, assignedToMe } = req.query;

  const filter = { status: "pending" };

  if (type) filter.type = type;
  if (department) filter.department = department;

  if (assignedToMe === "true") {
    filter.assignedReviewer = req.user._id;
  } else if (req.user.role === "teacher_admin") {
    const chargeTypes = req.user.charges?.filter((c) => c.isActive).map((c) => c.type) || [];
    filter.$or = [
      { assignedReviewer: req.user._id },
      { category: { $in: chargeTypes } },
    ];
  } else if (req.user.role === "student_admin") {
    filter.type = { $in: ["post", "note"] };
  }

  const content = await populateContent(Content.find(filter));
  res.json(content);
};

export const reviewContent = async (req, res) => {
  const { status, remarks } = req.body;

  if (!["approved", "rejected"].includes(status)) {
    return res.status(400).json({ message: "Invalid status" });
  }

  const content = await Content.findById(req.params.id);

  if (!content) {
    return res.status(404).json({ message: "Content not found" });
  }

  if (!canReviewContent(req.user, content)) {
    return res.status(403).json({
      message: "This approval is not assigned to you",
    });
  }

  content.status = status;
  content.remarks = remarks;
  content.reviewedBy = req.user._id;
  content.reviewedAt = new Date();

  await content.save();

  await AuditLog.create({
    action: `content_${status}`,
    content: content._id,
    student: content.submittedBy,
    admin: req.user._id,
    adminRole: req.user.role,
    status,
    remarks,
  });

  await Notification.create({
    user: content.submittedBy,
    title: `Content ${status}`,
    message: `Your ${content.category} ${content.type} "${content.title}" was ${status}.`,
  });

  res.json(content);
};

export const toggleLike = async (req, res) => {
  const content = await Content.findById(req.params.id);
  if (!content) return res.status(404).json({ message: "Content not found" });

  const index = content.likes.findIndex((id) => String(id) === String(req.user._id));

  if (index >= 0) content.likes.splice(index, 1);
  else content.likes.push(req.user._id);

  await content.save();
  res.json({ likes: content.likes.length, liked: index < 0 });
};

export const toggleSave = async (req, res) => {
  const content = await Content.findById(req.params.id);
  if (!content) return res.status(404).json({ message: "Content not found" });

  const index = content.savedBy.findIndex((id) => String(id) === String(req.user._id));

  if (index >= 0) content.savedBy.splice(index, 1);
  else content.savedBy.push(req.user._id);

  await content.save();
  res.json({ saved: index < 0 });
};

export const addComment = async (req, res) => {
  if (!req.body.text?.trim()) {
    return res.status(400).json({ message: "Comment is required" });
  }

  const content = await Content.findById(req.params.id);

  if (!content) return res.status(404).json({ message: "Content not found" });

  content.comments.push({
    user: req.user._id,
    text: req.body.text.trim(),
  });

  await content.save();

  const updated = await Content.findById(content._id).populate("comments.user", "name role department");
  res.status(201).json(updated.comments[updated.comments.length - 1]);
};
