import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { escapeRegex, searchRegex } from "../utils/search.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

test("user-controlled search text is escaped before regex construction", () => {
  const input = "[a-z]+.*($^\\d)";
  const escaped = escapeRegex(input);
  assert.equal(searchRegex(input).test(input), true);
  assert.equal(searchRegex(input).test("aaaaaa"), false);
  assert.notEqual(escaped, input);
  assert.ok(escaped.length <= 200 + 20);
});

test("tenant-sensitive public data routes require authentication", () => {
  const routes = ["routes/contentRoutes.js", "routes/facultyRoutes.js", "routes/communityRoutes.js"];
  for (const route of routes) {
    const source = read(route);
    assert.match(source, /router\.get\("\/", protect,/i, route);
  }
});

test("startup does not run the legacy default-data seed", () => {
  const server = read("server.js");
  assert.doesNotMatch(server, /seedDefaultData/);
  assert.match(server, /seedPlatformOwner/);
});

test("authenticated user lookup uses a valid MongoDB projection", () => {
  const middleware = read("middleware/authMiddleware.js");
  assert.doesNotMatch(middleware, /select\(\"-password \+tokenVersion\"\)/);
  assert.match(middleware, /select\(\"-password\"\)/);
});

test("platform-owner login accepts the legacy stored role", () => {
  const auth = read("controllers/authController.js");
  assert.match(auth, /role: \{ \$in: \["super_super_admin", "platform_super_admin"\] \}/);
  assert.match(auth, /\["super_super_admin", "platform_super_admin"\]\.includes\(user\.role\)/);
});

test("platform owner uses the registration-code workflow", () => {
  const routes = read("../frontend/src/routes/AppRoutes.jsx");
  assert.match(routes, /user\?\.role === "super_super_admin".*RegistrationCodes/s);
  assert.match(read("routes/registrationCodeRoutes.js"), /router\.post\("\/validate"/);
  assert.match(read("controllers/adminController.js"), /Email-based Super Admin invitations have been retired/);
});

test("password reset links have a frontend route and activate pending invited accounts", () => {
  const routes = read("../frontend/src/routes/AppRoutes.jsx");
  const auth = read("controllers/authController.js");
  assert.match(routes, /path="\/reset-password"/);
  assert.match(auth, /if \(user\.tenantStatus === "pending"\) user\.tenantStatus = "active"/);
});

test("logout revokes the current token version on the server", () => {
  const auth = read("controllers/authController.js");
  const routes = read("routes/authRoutes.js");
  assert.match(auth, /export const logout/);
  assert.match(auth, /\$inc: \{ tokenVersion: 1 \}/);
  assert.match(routes, /router\.post\("\/logout", protect, logout\)/);
});

test("registration codes are random, normalized and hashed without storing plaintext", async () => {
  const { generateRegistrationCode, hashRegistrationCode, normalizeRegistrationCode } = await import("../utils/registrationCode.js");
  const first = generateRegistrationCode("teacher");
  const second = generateRegistrationCode("teacher");
  assert.match(first, /^ACN-TCH-[A-Z0-9-]+$/);
  assert.notEqual(first, second);
  assert.equal(normalizeRegistrationCode(`  ${first.toLowerCase()} `), first);
  assert.equal(hashRegistrationCode(first), hashRegistrationCode(first.toLowerCase()));
  assert.notEqual(hashRegistrationCode(first), first);
});

test("institution admin and vice chancellor share institutional management access", () => {
  const middleware = read("middleware/authMiddleware.js");
  const routes = read("../frontend/src/routes/AppRoutes.jsx");
  const portal = read("../frontend/src/components/PortalLayout/PortalLayout.jsx");
  assert.match(middleware, /\["super_admin", "institute_admin", "vice_chancellor"\]/);
  assert.match(middleware, /requested\.includes\("super_admin"\)/);
  assert.match(routes, /const InstituteAdminRoute = \(\{ children \}\) => <RoleRoute allowed=\{\["institute_admin", "vice_chancellor"\]\}>/);
  assert.match(portal, /vice_chancellor:\s*\[/);
  assert.match(portal, /\["Manage Users", "\/manage-users"\]/);
  assert.match(portal, /\["Registration Codes", "\/registration-codes"\]/);
});

test("institution admin registration codes create the dedicated institute_admin role", () => {
  const controller = read("controllers/registrationCodeController.js");
  const auth = read("controllers/authController.js");
  assert.match(controller, /institution_admin: "institute_admin"/);
  assert.match(controller, /institutionIssuerRoles = \["super_admin", "institute_admin", "vice_chancellor"\]/);
  assert.match(auth, /role === "institute_admin" \|\| role === "super_admin"/);
});

test("student registration bypasses codes while staff registration remains code-protected", () => {
  const auth = read("controllers/authController.js");
  const register = read("../frontend/src/pages/Auth/Register.jsx");
  assert.match(auth, /isDirectStudentRegistration = !normalizedCode && requestedAccountType === "student"/);
  assert.match(auth, /const role = isDirectStudentRegistration \? "student" : registration\.role/);
  assert.match(auth, /Please select your institution for student registration/);
  assert.match(auth, /getRegistrationCodeForUse\(normalizedCode\)/);
  assert.match(register, /\["student", "Student", "Register directly without a code"\]/);
  assert.match(register, /registrationCode: accountType === "student" \? "" : code\.trim\(\)/);
  assert.match(register, /Teacher/);
  assert.match(register, /EDP/);
});

test("registration duplicate-key races return a conflict instead of crashing the server", () => {
  const auth = read("controllers/authController.js");
  assert.match(auth, /error\?\.code === 11000/);
  assert.match(auth, /return res\.status\(409\)\.json/);
  assert.match(auth, /Email already registered for this institution/);
  assert.match(auth, /Roll number already registered for this institution/);
  assert.match(auth, /Employee ID already registered for this institution/);
  assert.match(auth, /return next\(error\)/);
});

test("direct student registration cannot self-select a privileged role", () => {
  const auth = read("controllers/authController.js");
  assert.match(auth, /const role = isDirectStudentRegistration \? "student" : registration\.role/);
  assert.doesNotMatch(auth, /role = requestedAccountType/);
});


test("teacher and EDP codes are shared institute codes while students do not need codes", () => {
  const controller = read("controllers/registrationCodeController.js");
  const page = read("../frontend/src/pages/RegistrationCodes.jsx");
  const register = read("../frontend/src/pages/Auth/Register.jsx");
  assert.match(controller, /const institutionAllowedTypes = \["teacher", "staff", "edp"\]/);
  assert.match(controller, /const isSharedInstitutionCode = \["teacher", "edp"\]/);
  assert.match(controller, /codeType: type,[\s\S]*status: "active"/);
  assert.match(controller, /An active shared \$\{type\} registration code already exists/);
  assert.match(controller, /isSharedInstitutionCode[\s\S]*1000/);
  assert.match(page, /shared institute code/);
  assert.match(page, /EDP/);
  assert.match(page, /does not email/);
  assert.match(register, /shared .*institute code/i);
});

test("public registration academic options are tenant-scoped when an institution is selected", () => {
  const controller = read("controllers/academicController.js");
  assert.match(controller, /const institutionId = String\(req\.query\?\.institutionId \|\| ""\)\.trim\(\)/);
  assert.match(controller, /Institution\.findOne\(\{ _id: institutionId, status: "active", deletedAt: null \}\)/);
  assert.match(controller, /const masterScope = hasInstitution/);
  assert.match(controller, /institutionId/);
  assert.match(controller, /type: "department", isActive: true/);
});

test("institute managers retain faculty and club management through the super-admin manager rule", () => {
  const middleware = read("middleware/authMiddleware.js");
  const faculty = read("routes/facultyRoutes.js");
  const clubs = read("routes/clubRoutes.js");
  assert.match(middleware, /const manager = \["super_admin", "institute_admin", "vice_chancellor"\]/);
  assert.match(faculty, /allowRoles\("teacher_admin", "hod", "super_admin"\)/);
  assert.match(clubs, /allowRoles\("student_admin", "teacher", "teacher_admin", "hod", "super_admin"\)/);
  assert.match(clubs, /allowRoles\("teacher", "teacher_admin", "hod", "super_admin"\)/);
  assert.match(clubs, /allowRoles\("teacher_admin", "super_admin"\)/);
});

test("shared teacher and EDP codes have a database-level active uniqueness invariant", () => {
  const model = read("models/RegistrationCode.js");
  const controller = read("controllers/registrationCodeController.js");
  assert.match(model, /unique: true, partialFilterExpression: \{ status: "active", codeType: \{ \$in: \["teacher", "edp"\] \} \}/);
  assert.match(controller, /updateMany\([\s\S]*expiresAt: \{ \$lte: new Date\(\) \}[\s\S]*\{ \$set: \{ status: "expired" \} \}/);
});

test("institute user management enforces VC/Admin hierarchy and self-protection", () => {
  const controller = read("controllers/adminController.js");
  const routes = read("routes/adminRoutes.js");
  const model = read("models/User.js");
  const page = read("../frontend/src/pages/ManageUsers/ManageUsers.jsx");
  assert.match(model, /tenantStatus: \{ type: String, enum: \["pending", "active", "suspended", "banned"\]/);
  assert.match(controller, /String\(target\._id\) === String\(req\.user\._id\)/);
  assert.match(controller, /req\.user\.role === "institute_admin" && target\.role === "vice_chancellor"/);
  assert.match(controller, /\["active", "suspended", "banned"\]/);
  assert.match(routes, /router\.patch\("\/users\/:id\/status", protect, allowSuperAdmin, setUserStatus\)/);
  assert.match(page, /You cannot suspend or ban your own account/);
  assert.match(page, /setUserStatus/);
});

test("registration code inventory is hard-scoped to the manager's institution", () => {
  const controller = read("controllers/registrationCodeController.js");
  assert.match(controller, /const isPlatform = platformRoles\.includes\(req\.user\.role\)/);
  assert.match(controller, /query\.institution = req\.user\.institution/);
  assert.match(controller, /Never trust a client-[\s\S]*institutionId/);
});

test("only platform owners can apply an institution inventory filter", () => {
  const controller = read("controllers/registrationCodeController.js");
  assert.match(controller, /if \(isPlatform\) \{[\s\S]*req\.query\.institutionId[\s\S]*Invalid institution filter/);
  assert.match(controller, /else \{[\s\S]*req\.user\.institution[\s\S]*query\.institution = req\.user\.institution/);
});
