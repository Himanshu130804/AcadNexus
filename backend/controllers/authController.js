import User from "../models/User.js";
import Institution from "../models/Institution.js";
import mongoose from "mongoose";
import AuditLog from "../models/AuditLog.js";
import { generateToken } from "../utils/jwt.js";
import { getRegistrationCodeForUse, consumeRegistrationCode } from "./registrationCodeController.js";
import { runInTransaction, UnitOfWorkAbort } from "../utils/withTransaction.js";

const normalizeText = (value = "") =>
  String(value)
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const departmentAliases = {
  cse: "Computer Science and Engineering",
  "computer science": "Computer Science and Engineering",
  "computer science engineering": "Computer Science and Engineering",
  "computer science and engineering": "Computer Science and Engineering",
  it: "Information Technology",
  "information technology": "Information Technology",
  ece: "Electronics and Communication Engineering",
  "electronics and communication": "Electronics and Communication Engineering",
  "electronics and communication engineering": "Electronics and Communication Engineering",
  ee: "Electrical Engineering",
  "electrical engineering": "Electrical Engineering",
  mech: "Mechanical Engineering",
  mechanical: "Mechanical Engineering",
  "mechanical engineering": "Mechanical Engineering",
  civil: "Civil Engineering",
  "civil engineering": "Civil Engineering",
  bca: "Computer Applications",
  mca: "Computer Applications",
  "computer applications": "Computer Applications",
  management: "Management Studies",
  "management studies": "Management Studies",
  commerce: "Commerce",
  arts: "Arts and Humanities",
  "arts and humanities": "Arts and Humanities",
  science: "Basic Sciences",
  "basic sciences": "Basic Sciences",
};

const canonicalDepartment = (value = "") => {
  const normalized = normalizeText(value);
  return departmentAliases[normalized] || String(value).trim();
};

const buildUserResponse = (user) => ({
  _id: user._id,
  id: user._id,
  name: user.name,
  email: user.email,
  // Normalize the legacy platform-owner role for the frontend.
  role: ["super_super_admin", "platform_super_admin"].includes(user.role) ? "super_super_admin" : user.role,
  rollNumber: user.rollNumber,
  employeeId: user.employeeId,
  department: user.department,
  programme: user.programme,
  year: user.year,
  semester: user.semester,
  section: user.section,
  groupType: user.groupType,
  groupName: user.groupName,
  labBatch: user.labBatch,
  electiveGroup: user.electiveGroup,
  specialization: user.specialization,
  profilePhoto: user.profilePhoto,
  charges: user.charges || [],
  token: generateToken(user._id, user.tokenVersion),
});

export const register = async (req, res, next) => {
  const {
    name,
    email,
    password,
    registrationCode,
    institutionId,
    accountType,
    rollNumber,
    employeeId,
    department,
    programme,
    year,
    semester,
    section,
    admissionYear,
    designation,
  } = req.body;

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedCode = String(registrationCode || "").trim();
  const requestedAccountType = String(accountType || "student").trim().toLowerCase();

  // Students self-register without a registration code. The server still
  // requires an active institution and always assigns the student role;
  // client input can never select a privileged role.
  const isDirectStudentRegistration = !normalizedCode && requestedAccountType === "student";
  if (!isDirectStudentRegistration && !normalizedCode) {
    return res.status(400).json({ message: "A registration code is required for this account type." });
  }
  if (!name || !normalizedEmail || !password) return res.status(400).json({ message: "Name, email and password are required." });
  if (!emailRegex.test(normalizedEmail)) return res.status(400).json({ message: "Please enter a valid email address" });
  if (String(password).length < 12 || String(password).length > 128 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    return res.status(400).json({ message: "Password must be 12–128 characters and include uppercase, lowercase, and a number." });
  }

  let registration = null;
  let institution = null;

  if (isDirectStudentRegistration) {
    const selectedInstitutionId = String(institutionId || "").trim();
    if (!mongoose.isValidObjectId(selectedInstitutionId)) {
      return res.status(400).json({ message: "Please select your institution for student registration." });
    }
    institution = await Institution.findOne({ _id: selectedInstitutionId, status: "active", deletedAt: null });
    if (!institution) return res.status(400).json({ message: "Selected institution is unavailable." });
  } else {
    registration = await getRegistrationCodeForUse(normalizedCode);
    if (!registration) return res.status(403).json({ message: "Registration code is invalid, expired, revoked, or already fully used." });

    // Keep the selected account type aligned with the authorized code.
    // Students are the only direct-registration role; every other role is
    // derived from the server-side registration code.
    if (requestedAccountType !== "student" && requestedAccountType !== registration.role) {
      return res.status(400).json({
        message: `This registration code is for ${registration.role}, not ${requestedAccountType}.`,
      });
    }

    institution = await Institution.findOne({ _id: registration.institution, status: "active", deletedAt: null });
    if (!institution) return res.status(400).json({ message: "The institution attached to this registration code is unavailable." });
  }

  if (!isDirectStudentRegistration && registration.role === "vice_chancellor") {
    const activeVc = await User.findOne({ institution: institution._id, role: "vice_chancellor", isSuspended: false, tenantStatus: "active" }).select("_id");
    if (activeVc) return res.status(409).json({ message: "This institution already has an active Vice Chancellor." });
  }

  const exists = await User.findOne({ institution: institution._id, email: normalizedEmail });
  if (exists) return res.status(400).json({ message: "Email already registered" });

  // Role is derived server-side: direct registration can only create students.
  const role = isDirectStudentRegistration ? "student" : registration.role;
  const finalDepartment = canonicalDepartment(department);
  const requiresDepartment = ["student", "teacher", "staff", "edp"].includes(role);
  if (requiresDepartment && !finalDepartment) return res.status(400).json({ message: "Department is required for this registration type." });

  if (role === "student" && (!rollNumber || !programme || !year || !semester || !section)) {
    return res.status(400).json({ message: "Student registration requires roll number, programme, year, semester and section." });
  }

  if (["teacher", "staff", "edp"].includes(role) && (!employeeId || !designation)) {
    return res.status(400).json({ message: "Employee ID and designation are required for this registration type." });
  }

  const userDoc = {
    name: String(name).trim(),
    email: normalizedEmail,
    password,
    role,
    institution: institution._id,
    rollNumber: String(rollNumber || "").trim(),
    employeeId: String(employeeId || "").trim(),
    department: finalDepartment,
    programme,
    year,
    semester,
    section,
    admissionYear,
    designation: String(designation || (role === "institute_admin" || role === "super_admin" ? "Institution Administrator" : role === "vice_chancellor" ? "Vice Chancellor" : "")).trim(),
  };

  // Account creation and code consumption commit together when the database supports
  // transactions. On a standalone MongoDB the same steps run sequentially and a lost
  // race on the code deletes the just-created account (the previous behaviour), so a
  // failed registration never leaves a consumed code or an orphan account behind.
  let user;
  let consumed = null;
  try {
    const { result } = await runInTransaction(async (session) => {
      const options = session ? { session } : {};
      const [created] = await User.create([userDoc], options);
      if (isDirectStudentRegistration) return { created, used: null };
      const used = await consumeRegistrationCode({ codeValue: normalizedCode, userId: created._id, session });
      if (!used) {
        if (!session) await User.deleteOne({ _id: created._id });
        throw new UnitOfWorkAbort("Registration code was consumed by another registration. Please use a new code.");
      }
      return { created, used };
    });
    user = result.created;
    consumed = result.used;
  } catch (error) {
    if (error instanceof UnitOfWorkAbort) return res.status(409).json({ message: error.message });
    // The pre-check above improves UX, while the unique indexes remain the
    // final protection against concurrent registrations using the same
    // email/roll number/employee ID. Never let E11000 crash the process.
    if (error?.code === 11000) {
      const field = Object.keys(error.keyPattern || {})[1] || Object.keys(error.keyPattern || {})[0] || "field";
      const messages = {
        email: "Email already registered for this institution",
        rollNumber: "Roll number already registered for this institution",
        employeeId: "Employee ID already registered for this institution",
      };
      return res.status(409).json({ message: messages[field] || "An account with these details already exists in this institution." });
    }
    return next(error);
  }

  if (isDirectStudentRegistration) {
    await AuditLog.create({
      action: "student_self_registered",
      admin: user._id,
      adminRole: user.role,
      student: user._id,
      status: "created",
      remarks: `Student ${user.email} self-registered at ${institution.name} without a registration code`,
      institutionId: institution._id,
    });
  } else {
    await AuditLog.create({
      action: "registration_code_redeemed",
      admin: user._id,
      adminRole: user.role,
      student: user._id,
      status: "used",
      remarks: `Registered ${user.email} using a ${registration.codeType} code for ${institution.name}`,
      institutionId: institution._id,
      targetId: consumed._id,
      targetType: "RegistrationCode",
      outcome: "success",
      metadata: { codeType: registration.codeType, role: user.role, codePrefix: consumed.codePrefix },
    });
    if (registration.codeType === "institution_admin") {
      await AuditLog.create({
        action: "institution_admin_registered",
        admin: user._id,
        adminRole: user.role,
        status: "created",
        remarks: `Institution Admin ${user.email} registered for ${institution.name} using a Vice Chancellor-issued code`,
        institutionId: institution._id,
        targetId: user._id,
        targetType: "User",
        outcome: "success",
        metadata: { registrationCodeId: consumed._id, issuedBy: registration.createdBy || null },
      });
    }
  }

  res.status(201).json(buildUserResponse(user));
};

export const login = async (req, res) => {
  const { email, identifier, password, institutionId } = req.body;
  const loginId = String(identifier || email || "").trim();
  const selectedInstitutionId = String(institutionId || "").trim();
  const isPlatformOwnerLogin = selectedInstitutionId === "__platform_owner__";
  const noInstitutionProvided = selectedInstitutionId === "";

  if (!loginId || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }

  // Platform Owner is a platform-root account and deliberately has no institution.
  // It must never be forced through the tenant/institution validation path.
  if ((isPlatformOwnerLogin || noInstitutionProvided) && loginId.includes("@")) {
    const rootUser = await User.findOne({
      email: loginId.toLowerCase(),
      role: { $in: ["super_super_admin", "platform_super_admin"] },
    });

    if (rootUser) {
      if (!(await rootUser.matchPassword(password))) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      if (rootUser.isSuspended || !["active", "pending"].includes(rootUser.tenantStatus)) {
        return res.status(403).json({ message: "Account is not active" });
      }
      return res.json(buildUserResponse(rootUser));
    }

    if (isPlatformOwnerLogin) {
      // An explicit platform-owner selection must never fall through to
      // institute validation and produce a misleading tenant error.
      return res.status(401).json({ message: "Invalid platform owner credentials" });
    }
  }

  if (!mongoose.isValidObjectId(selectedInstitutionId)) {
    return res.status(400).json({ message: "Please select your institution" });
  }

  const institution = await Institution.findOne({ _id: selectedInstitutionId, status: "active", deletedAt: null });
  if (!institution) return res.status(400).json({ message: "Selected institution is unavailable" });

  if (!loginId || !password) {
    return res.status(400).json({
      message: "Email/Roll No/Employee ID and password are required",
    });
  }

  const user = await User.findOne({
    institution: institution._id,
    $or: [
      { email: loginId.toLowerCase() },
      { rollNumber: loginId },
      { employeeId: loginId },
    ],
  });

  if (!user || !(await user.matchPassword(password))) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  if (user.isSuspended || !["active", "pending"].includes(user.tenantStatus)) {
    return res.status(403).json({ message: "Account is not active" });
  }

  const fixedDepartment = canonicalDepartment(user.department);
  if (fixedDepartment && fixedDepartment !== user.department) {
    user.department = fixedDepartment;
    await user.save();
  }

  res.json(buildUserResponse(user));
};

export const profile = async (req, res) => {
  res.json(req.user);
};


export const logout = async (req, res, next) => {
  try {
    await User.updateOne({ _id: req.user._id }, { $inc: { tokenVersion: 1 } });
    try {
      await AuditLog.create({ action: "logout", admin: req.user._id, adminRole: req.user.role, status: "completed", remarks: "User signed out", institutionId: req.user.institution || undefined });
    } catch { /* logout remains successful if audit persistence fails */ }
    res.json({ success: true, message: "Signed out successfully." });
  } catch (error) { next(error); }
};
