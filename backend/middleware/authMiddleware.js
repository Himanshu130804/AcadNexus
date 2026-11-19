import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Institution from "../models/Institution.js";
import { runWithTenant } from "../utils/tenantContext.js";

export const protect = async (req, res, next) => {
  let token;
  const authorization = req.headers.authorization;
  if (typeof authorization === "string" && /^Bearer\s+\S+$/i.test(authorization)) {
    token = authorization.split(/\s+/)[1];
  }
  if (!token) return res.status(401).json({ message: "Not authorized, no token" });
  // Never fall back to a known/default secret. Misconfiguration is a server error,
  // not an invalid-token response.
  const secret = process.env.JWT_SECRET;
  if (typeof secret !== "string" || secret.length < 32) {
    return res.status(503).json({ message: "Authentication is not configured securely" });
  }
  let decoded;
  try {
    decoded = jwt.verify(token, secret, { algorithms: ["HS256"] });
  } catch {
    return res.status(401).json({ message: "Not authorized, token failed" });
  }
  if (!decoded?.id) return res.status(401).json({ message: "Not authorized, token failed" });
  try {
    req.user = await User.findById(decoded.id).select("-password");
    if (!req.user) return res.status(401).json({ message: "User not found" });
    if (Number(decoded.tokenVersion || 0) !== Number(req.user.tokenVersion || 0)) return res.status(401).json({ message: "Session expired. Please sign in again." });
    if (req.user.isSuspended || !["active", "pending"].includes(req.user.tenantStatus)) {
      return res.status(403).json({ message: "Account is not active" });
    }
    const isPlatformOwner = ["super_super_admin", "platform_super_admin"].includes(req.user.role);
    if (!isPlatformOwner) {
      if (!req.user.institution) return res.status(403).json({ message: "Your account is not assigned to an institution." });
      const institution = await Institution.findOne({ _id: req.user.institution, status: "active", deletedAt: null }).select("_id");
      if (!institution) return res.status(403).json({ message: "Your institution is inactive. Contact the platform owner." });
    }
    return runWithTenant({ institutionId: req.user.institution || null, bypassTenantScope: isPlatformOwner }, next);
  } catch (error) {
    return next(error);
  }
};

export const hasCharge = (user, type, permission) =>
  Boolean(user?.charges?.some((charge) => charge.isActive !== false && (!type || charge.type === type) && (!permission || charge.permissions?.includes(permission))));

export const isHod = (user) => user?.role === "hod" || hasCharge(user, "hod");
export const isTeacherLike = (user) => ["teacher", "teacher_admin", "hod", "super_admin", "institute_admin", "vice_chancellor"].includes(user?.role);
export const isInstituteManager = (user) => ["super_admin", "institute_admin", "vice_chancellor"].includes(user?.role);
export const isAdminLike = (user) => ["student_admin", "teacher_admin", "hod", "edp", "super_admin", "institute_admin", "vice_chancellor", "super_super_admin"].includes(user?.role);

export const allowRoles = (...roles) => (req, res, next) => {
  const requested = Array.isArray(roles) ? roles : [];
  const manager = ["super_admin", "institute_admin", "vice_chancellor"].includes(req.user?.role);
  if (!req.user || (!requested.includes(req.user.role) && !(manager && requested.includes("super_admin")))) return res.status(403).json({ message: "You do not have permission" });
  next();
};

export const allowAdmins = (req, res, next) => {
  if (req.user && isAdminLike(req.user)) return next();
  return res.status(403).json({ message: "Admin access required" });
};

export const allowAcademicAdmins = (req, res, next) => {
  if (req.user && ["teacher", "teacher_admin", "hod", "super_admin", "institute_admin", "vice_chancellor"].includes(req.user.role)) return next();
  return res.status(403).json({ message: "Academic staff access required" });
};

export const allowTimetableManagers = (req, res, next) => {
  if (["super_admin", "institute_admin", "vice_chancellor"].includes(req.user?.role) || req.user?.role === "hod" || hasCharge(req.user, "hod", "manage_timetable")) return next();
  return res.status(403).json({ message: "Only HOD or Super Admin can manage timetable" });
};

export const allowStudentDataManagers = (req, res, next) => {
  if (["edp", "super_admin", "institute_admin", "vice_chancellor"].includes(req.user?.role)) return next();
  return res.status(403).json({ message: "Only EDP or Super Admin can manage student master data" });
};

export const allowSuperAdmin = (req, res, next) => {
  if (["super_admin", "institute_admin", "vice_chancellor", "super_super_admin"].includes(req.user?.role)) return next();
  return res.status(403).json({ message: "Super admin access required" });
};
