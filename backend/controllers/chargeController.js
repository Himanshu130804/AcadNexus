import User from "../models/User.js";
import AcademicMaster from "../models/AcademicMaster.js";
import Notification from "../models/Notification.js";

const sameText = (a = "", b = "") => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

export const getChargeTypes = async (req, res) => {
  const common = [
    { name: "Teaching Assignment", type: "teaching", permissions: ["mark_attendance", "upload_notes", "create_assignments"] },
    { name: "Class Incharge", type: "class_incharge", permissions: ["approve_posts", "approve_notes", "approve_assignments", "create_announcements", "manage_attendance"] },
    { name: "Cultural Coordinator", type: "cultural", permissions: ["approve_events", "approve_posts", "create_announcements", "manage_club"] },
    { name: "Sports Coordinator", type: "sports", permissions: ["approve_events", "approve_posts", "create_announcements"] },
    { name: "NSS Coordinator", type: "nss", permissions: ["approve_events", "approve_posts", "create_announcements"] },
    { name: "NCC Coordinator", type: "ncc", permissions: ["approve_events", "approve_posts", "create_announcements"] },
    { name: "Exam Coordinator", type: "exam", permissions: ["approve_announcements", "create_announcements"] },
    { name: "Club Coordinator", type: "club", permissions: ["approve_posts", "approve_events", "create_announcements", "manage_club"] },
  ];

  const superAdminOnly = [
    { name: "Department HOD", type: "hod", permissions: ["approve_posts", "approve_notes", "approve_events", "approve_announcements", "approve_assignments", "manage_timetable", "manage_attendance", "assign_teacher_charges"] },
  ];

  res.json(["super_admin", "institute_admin", "vice_chancellor"].includes(req.user?.role) ? [...superAdminOnly, ...common] : common);
};

export const getTeachers = async (req, res) => {
  const teacherQuery = { role: { $in: ["teacher", "teacher_admin", "hod"] } };

  // Normal Teacher Charges are same-department only for HODs.
  // If another department needs a teacher, use Faculty Requirement Request so the teacher's home HOD selects faculty.
  if (req.user?.role === "hod") {
    teacherQuery.department = new RegExp(`^${String(req.user.department || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
  }

  const teachers = await User.find(teacherQuery).select("-password").sort({ name: 1 });
  res.json(teachers);
};

export const assignCharge = async (req, res) => {
  const { teacherId } = req.params;
  const teacher = await User.findById(teacherId);
  if (!teacher) return res.status(404).json({ message: "Teacher not found" });

  if (!["teacher", "teacher_admin", "hod", "super_admin", "institute_admin", "vice_chancellor"].includes(teacher.role)) {
    return res.status(400).json({ message: "Responsibilities can only be assigned to teaching staff/admins" });
  }

  const incoming = req.body || {};

  if (incoming.type === "hod" && !["super_admin", "institute_admin", "vice_chancellor"].includes(req.user.role)) {
    return res.status(403).json({ message: "Only Super Admin can appoint or change a HOD." });
  }

  if (req.user.role === "hod") {
    if (incoming.department && incoming.department !== "All" && !sameText(incoming.department, req.user.department)) {
      return res.status(403).json({ message: "HOD can assign responsibilities only for their own department classes." });
    }
    if (incoming.type === "teaching" && teacher.department && !sameText(teacher.department, req.user.department)) {
      return res.status(403).json({ message: "For another department's teacher, create a Faculty Requirement Request. The teacher's home HOD must assign the faculty." });
    }
  }

  let subjectDoc = null;
  if (incoming.subjectId) {
    subjectDoc = await AcademicMaster.findOne({ _id: incoming.subjectId, type: "subject", isActive: { $ne: false } });
    if (!subjectDoc) return res.status(400).json({ message: "Selected subject was not found or is inactive. Please refresh and select from Subject Master." });
  }

  if (incoming.type === "teaching" && !subjectDoc && !String(incoming.subject || "").trim()) {
    return res.status(400).json({ message: "Teaching responsibility requires a Subject Master selection." });
  }

  if (subjectDoc) {
    incoming.department = subjectDoc.department;
    incoming.programme = subjectDoc.programme;
    incoming.year = subjectDoc.year;
    incoming.semester = subjectDoc.semester;
    incoming.subject = subjectDoc.name;
  }

  const charge = {
    ...incoming,
    department: incoming.department || "All",
    programme: incoming.programme || "All",
    year: incoming.year || "All",
    semester: incoming.semester || "All",
    section: incoming.section || "All",
    groupType: incoming.groupType || "full_section",
    groupName: incoming.groupType === "full_section" ? "All" : (incoming.groupName || "Group"),
    subjectId: subjectDoc?._id || incoming.subjectId || undefined,
    subject: subjectDoc?.name || incoming.subject || "",
    assignedBy: req.user._id,
    assignedAt: new Date(),
    isActive: true,
  };

  teacher.charges.push(charge);

  // HOD is never self-registered. Super Admin promotes a teacher to HOD and binds them to a department.
  if (charge.type === "hod") {
    teacher.role = "hod";
    if (charge.department && charge.department !== "All") teacher.department = charge.department;
  }

  // Keep teacher subject list useful for profile/search, without limiting cross-department teaching.
  if (charge.subject && !teacher.subjects?.some((subject) => sameText(subject, charge.subject))) {
    teacher.subjects = [...(teacher.subjects || []), charge.subject];
  }

  await teacher.save();

  await Notification.create({
    user: teacher._id,
    title: charge.type === "hod" ? "Appointed as HOD" : "New Responsibility Assigned",
    message: `${charge.name}${charge.subject ? `: ${charge.subject}` : ""}${charge.department !== "All" ? ` (${charge.department})` : ""}`,
  });

  res.status(201).json(await User.findById(teacher._id).select("-password"));
};

export const removeCharge = async (req, res) => {
  const { teacherId, chargeId } = req.params;
  const teacher = await User.findById(teacherId);
  if (!teacher) return res.status(404).json({ message: "Teacher not found" });

  const charge = teacher.charges.id(chargeId);
  if (req.user.role === "hod" && charge?.department && charge.department !== "All" && !sameText(charge.department, req.user.department)) {
    return res.status(403).json({ message: "HOD can remove only own-department responsibilities." });
  }

  teacher.charges = teacher.charges.filter((item) => String(item._id) !== String(chargeId));
  await teacher.save();
  res.json(await User.findById(teacher._id).select("-password"));
};

export const getMyCharges = async (req, res) => {
  res.json(req.user.charges || []);
};

export const getMyTeachingAssignments = async (req, res) => {
  const assignments = (req.user.charges || [])
    .filter((charge) => charge.isActive !== false && ["teaching", "class_incharge"].includes(charge.type))
    .map((charge) => ({
      _id: charge._id,
      label: `${charge.subject || "Class"} — ${charge.department}/${charge.programme}/${charge.year}/${charge.semester}/${charge.section}${charge.groupName && charge.groupName !== "All" ? `/${charge.groupName}` : ""}`,
      department: charge.department,
      programme: charge.programme,
      year: charge.year,
      semester: charge.semester,
      section: charge.section,
      groupType: charge.groupType || "full_section",
      groupName: charge.groupName || "All",
      subjectId: charge.subjectId,
      subject: charge.subject,
      permissions: charge.permissions || [],
    }));
  res.json(assignments);
};
