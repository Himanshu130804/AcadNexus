import User from "../models/User.js";
import Content from "../models/Content.js";
import AuditLog from "../models/AuditLog.js";
import Notification from "../models/Notification.js";
import Report from "../models/Report.js";
import Institution from "../models/Institution.js";
import mongoose from "mongoose";

export const getStats = async (req, res) => {
  const [
    students,
    studentAdmins,
    teacherAdmins,
    hods,
    edpUsers,
    superAdmins,
    pending,
    approved,
    rejected,
    notes,
    posts,
    events,
    announcements,
    assignments,
    reports,
  ] = await Promise.all([
    User.countDocuments({ role: "student" }),
    User.countDocuments({ role: "student_admin" }),
    User.countDocuments({ role: { $in: ["teacher", "teacher_admin"] } }),
    User.countDocuments({ role: "hod" }),
    User.countDocuments({ role: "edp" }),
    User.countDocuments({ role: { $in: ["super_admin", "institute_admin", "vice_chancellor"] } }),
    Content.countDocuments({ status: "pending" }),
    Content.countDocuments({ status: "approved" }),
    Content.countDocuments({ status: "rejected" }),
    Content.countDocuments({ type: "note" }),
    Content.countDocuments({ type: "post" }),
    Content.countDocuments({ type: "event" }),
    Content.countDocuments({ type: "announcement" }),
    Content.countDocuments({ type: "assignment" }),
    Report.countDocuments({ status: "pending" }),
  ]);

  res.json({
    students,
    studentAdmins,
    teacherAdmins,
    hods,
    edpUsers,
    superAdmins,
    pending,
    approved,
    rejected,
    notes,
    posts,
    events,
    announcements,
    assignments,
    reports,
  });
};

const exactText = (value) => new RegExp(`^${String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
const sameText = (a = "", b = "") => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();

const instituteManagerRoles = ["super_admin", "institute_admin", "vice_chancellor"];
const protectedPlatformRoles = ["super_super_admin", "platform_super_admin"];
const manageableRoles = [
  "student",
  "student_admin",
  "teacher",
  "teacher_admin",
  "hod",
  "edp",
  "department_admin",
  "institute_admin",
  "vice_chancellor",
  "staff",
];

const isInstituteManager = (role) => instituteManagerRoles.includes(role);

const getTargetForInstituteManager = async (req, targetId) => {
  if (!mongoose.isValidObjectId(targetId)) return { error: [400, "Invalid user id."] };
  const target = await User.findById(targetId);
  if (!target) return { error: [404, "User not found"] };
  if (!req.user.institution || !target.institution || String(req.user.institution) !== String(target.institution)) {
    return { error: [403, "You can manage users only inside your institution."] };
  }
  if (String(target._id) === String(req.user._id)) return { error: [403, "You cannot suspend, ban, or manage your own account."] };
  if (protectedPlatformRoles.includes(target.role)) return { error: [403, "Platform owner accounts cannot be managed from an institute workspace."] };
  if (req.user.role === "institute_admin" && target.role === "vice_chancellor") {
    return { error: [403, "Institute Admin cannot manage a Vice Chancellor account."] };
  }
  return { target };
};

export const getUsers = async (req, res) => {
  let query = {};
  if (req.user.role === "edp") query = { role: { $in: ["student", "student_admin"] } };
  if (req.user.role === "hod") query = { department: exactText(req.user.department), role: { $in: ["student", "student_admin", "teacher", "teacher_admin", "hod"] } };
  const users = await User.find(query).select("-password").sort({ createdAt: -1 });
  res.json(users);
};

export const getUserById = async (req, res) => {
  const user = await User.findById(req.params.id).select("-password");
  if (req.user.role === "edp" && user && !["student", "student_admin"].includes(user.role)) return res.status(403).json({ message: "EDP can access student records only" });
  if (req.user.role === "hod" && user && (!sameText(user.department, req.user.department) || !["student", "student_admin", "teacher", "teacher_admin", "hod"].includes(user.role))) return res.status(403).json({ message: "HOD can access only own-department people." });
  if (!user) return res.status(404).json({ message: "User not found" });
  res.json(user);
};

export const updateUserAcademic = async (req, res, next) => {
  try {
    const manager = isInstituteManager(req.user.role);
    const { target, error } = manager ? await getTargetForInstituteManager(req, req.params.id) : {};
    if (manager && error) return res.status(error[0]).json({ message: error[1] });

    const allowed = [
      "name", "email", "rollNumber", "employeeId", "phone", "address", "bio", "designation", "qualification", "experience",
      "department", "programme", "year", "semester", "section", "groupType", "groupName", "labBatch", "electiveGroup",
      "specialization", "admissionYear", "officeHours",
    ];
    const updates = {};
    allowed.forEach((field) => {
      if (req.body[field] !== undefined) updates[field] = typeof req.body[field] === "string" ? req.body[field].trim() : req.body[field];
    });

    if (manager) {
      if (req.body.role !== undefined) {
        const requestedRole = String(req.body.role || "").trim();
        if (!manageableRoles.includes(requestedRole)) return res.status(400).json({ message: "That role cannot be assigned here." });
        if (req.user.role === "institute_admin" && target.role === "vice_chancellor") return res.status(403).json({ message: "Institute Admin cannot edit a Vice Chancellor account." });
        if (requestedRole === "vice_chancellor" && req.user.role === "institute_admin") return res.status(403).json({ message: "Institute Admin cannot assign the Vice Chancellor role." });
        if (requestedRole === "institute_admin" && req.user.role === "institute_admin") return res.status(403).json({ message: "Institute Admin cannot assign the Institute Admin role." });
        updates.role = requestedRole;
      }
    } else {
      if (req.user.role === "edp") {
        const targetRole = target?.role || (await User.findById(req.params.id).select("role"))?.role;
        if (!["student", "student_admin"].includes(targetRole)) return res.status(403).json({ message: "EDP can update student master data only" });
      }
      if (req.user.role === "hod") {
        const t = target || await User.findById(req.params.id).select("role department");
        if (!t || !["student", "student_admin"].includes(t.role) || !sameText(t.department, req.user.department)) return res.status(403).json({ message: "HOD can update only student records from their own department." });
        updates.department = t.department;
      }
      if (req.body.role !== undefined || req.body.isSuspended !== undefined || req.body.tenantStatus !== undefined) return res.status(403).json({ message: "Use an authorized institute manager account for account administration." });
    }

    if (!Object.keys(updates).length) return res.status(400).json({ message: "No editable fields were provided." });
    if (updates.email !== undefined) updates.email = updates.email.toLowerCase();
    if (updates.role === "super_super_admin" || updates.role === "platform_super_admin") return res.status(403).json({ message: "Platform-level roles are not editable from an institute workspace." });

    const updateDoc = { $set: updates };
    if (updates.role) updateDoc.$inc = { tokenVersion: 1 };
    const user = await User.findByIdAndUpdate(req.params.id, updateDoc, { new: true, runValidators: true }).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });

    if (updates.role) {
      await AuditLog.create({ action: "user_role_changed", admin: req.user._id, adminRole: req.user.role, student: user._id, status: updates.role, remarks: `Role changed to ${updates.role}`, institutionId: user.institution || undefined });
    } else {
      await AuditLog.create({ action: "user_details_updated", admin: req.user._id, adminRole: req.user.role, student: user._id, status: "updated", remarks: "Institute user details updated", institutionId: user.institution || undefined });
    }
    res.json(user);
  } catch (error) { next(error); }
};

export const setUserStatus = async (req, res, next) => {
  try {
    if (!isInstituteManager(req.user.role)) return res.status(403).json({ message: "Institute manager access required." });
    const { target, error } = await getTargetForInstituteManager(req, req.params.id);
    if (error) return res.status(error[0]).json({ message: error[1] });
    const status = String(req.body?.status || "").trim().toLowerCase();
    if (!["active", "suspended", "banned"].includes(status)) return res.status(400).json({ message: "Status must be active, suspended, or banned." });
    if (target.role === "vice_chancellor" && req.user.role === "institute_admin") return res.status(403).json({ message: "Institute Admin cannot suspend or ban a Vice Chancellor." });

    target.tenantStatus = status;
    target.isSuspended = status === "suspended";
    target.tokenVersion = Number(target.tokenVersion || 0) + 1;
    await target.save();

    const action = status === "banned" ? "user_banned" : status === "suspended" ? "user_suspended" : "user_reactivated";
    await AuditLog.create({ action, admin: req.user._id, adminRole: req.user.role, student: target._id, status, remarks: `Account ${status}`, institutionId: target.institution || undefined });
    if (status !== "active") {
      await Notification.create({ user: target._id, title: `Account ${status === "banned" ? "Banned" : "Suspended"}`, message: `Your account has been ${status}. Contact your institution administration if you believe this is incorrect.` });
    }
    res.json({ success: true, user: target.toObject({ transform: (_doc, ret) => { delete ret.password; return ret; } }) });
  } catch (error) { next(error); }
};

export const updateRole = async (req, res) => {
  req.body = { role: req.body.role };
  return updateUserAcademic(req, res);
};

export const getAuditLogs = async (req, res) => {
  if (!["super_admin", "institute_admin", "vice_chancellor", "super_super_admin"].includes(req.user.role)) {
    return res.status(403).json({ message: "Super Admin only" });
  }

  const logs = await AuditLog.find()
    .populate("student", "name email department")
    .populate("admin", "name role")
    .populate("content", "title type")
    .sort({ createdAt: -1 });

  res.json(logs);
};

const platformAdminRoles = ["super_admin"];
export const listPlatformAdmins = async (req, res) => {
  if (req.user.role !== "super_super_admin") return res.status(403).json({ message: "Platform Owner access required" });
  const admins = await User.find({ role: { $in: platformAdminRoles } })
    .select("name email institution tenantStatus isSuspended passwordChangedAt createdAt updatedAt")
    .populate("institution", "name code status")
    .sort({ createdAt: -1 })
    .lean();
  res.json(admins.map((admin) => ({
    ...admin,
    status: admin.isSuspended ? "suspended" : (admin.passwordChangedAt ? "active" : "invited"),
  })));
};

export const createPlatformAdmin = async (req, res) => {
  return res.status(410).json({ message: "Email-based Super Admin invitations have been retired. Generate an Institution Admin registration code from Registration Codes." });
};

export const resendPlatformAdminInvitation = async (req, res) => {
  return res.status(410).json({ message: "Email-based Super Admin invitations have been retired. Generate a new Institution Admin registration code instead." });
};

export const setPlatformAdminStatus = async (req, res, next) => {
  try {
    if (req.user.role !== "super_super_admin") return res.status(403).json({ message: "Platform Owner access required" });
    const status = String(req.body?.status || "").trim().toLowerCase();
    if (!["active", "suspended"].includes(status)) return res.status(400).json({ message: "Status must be active or suspended." });
    const admin = await User.findOne({ _id: req.params.id, role: "super_admin" }).select("name email institution isSuspended tenantStatus tokenVersion");
    if (!admin) return res.status(404).json({ message: "Super Admin account not found." });
    if (status === "active") {
      const institution = await Institution.findOne({ _id: admin.institution, status: "active", deletedAt: null }).select("_id");
      if (!institution) return res.status(409).json({ message: "The administrator's institution is not active." });
    }
    admin.isSuspended = status === "suspended";
    admin.tenantStatus = status;
    admin.tokenVersion = Number(admin.tokenVersion || 0) + 1;
    await admin.save();
    await AuditLog.create({ action: status === "suspended" ? "platform_super_admin_suspended" : "platform_super_admin_reactivated", admin: req.user._id, adminRole: req.user.role, student: admin._id, status, remarks: `Super Admin ${status}`, institutionId: admin.institution || undefined });
    res.json({ success: true, message: `Super Admin ${status === "suspended" ? "suspended" : "reactivated"}.` });
  } catch (error) { next(error); }
};
