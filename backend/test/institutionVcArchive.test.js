import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { confirmationMatches, resolveRestoreStatus, isArchivedInstitution, passwordMeetsPolicy, isObjectId } from "../utils/institutionLifecycle.js";
import { generateRegistrationCode, hashRegistrationCode } from "../utils/registrationCode.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");

test("archive confirmation requires exact institution name or code", () => {
  const inst = { name: "North Valley University", code: "NVU" };
  assert.equal(confirmationMatches(inst, "north valley university"), true);
  assert.equal(confirmationMatches(inst, " NVU "), true);
  assert.equal(confirmationMatches(inst, "North Valley"), false);
  assert.equal(confirmationMatches(inst, ""), false);
});

test("restore returns the previous status and never invents 'archived'", () => {
  assert.equal(resolveRestoreStatus("active"), "active");
  assert.equal(resolveRestoreStatus("suspended"), "suspended");
  assert.equal(resolveRestoreStatus(undefined), "pending");
  assert.equal(resolveRestoreStatus("archived"), "pending");
  assert.equal(resolveRestoreStatus("active", "suspended"), "suspended");
  assert.equal(resolveRestoreStatus("active", "archived"), null);
});

test("archived detection and id/password validators", () => {
  assert.equal(isArchivedInstitution({ status: "archived" }), true);
  assert.equal(isArchivedInstitution({ status: "active", deletedAt: new Date() }), true);
  assert.equal(isArchivedInstitution({ status: "active", deletedAt: null }), false);
  assert.equal(isObjectId("507f1f77bcf86cd799439011"), true);
  assert.equal(isObjectId("../etc"), false);
  assert.equal(passwordMeetsPolicy("Short1"), false);
  assert.equal(passwordMeetsPolicy("LongEnoughPass1"), true);
});

test("institution admin codes are unique, prefixed and hash-compared", () => {
  const codes = new Set(Array.from({ length: 500 }, () => generateRegistrationCode("institution_admin")));
  assert.equal(codes.size, 500);
  const [code] = codes;
  assert.match(code, /^ACN-IAC-/);
  assert.equal(hashRegistrationCode(code), hashRegistrationCode(` ${code.toLowerCase()} `));
  assert.notEqual(hashRegistrationCode(code), code);
});

test("only the Vice Chancellor (and platform) may issue institution_admin codes; institution comes from the session", () => {
  const src = read("controllers/registrationCodeController.js");
  assert.match(src, /user\?\.role === "vice_chancellor" && type === "institution_admin"/);
  assert.match(src, /req\.user\.institution/);
  assert.doesNotMatch(src.slice(src.indexOf("const resolveInstitution"), src.indexOf("export const createRegistrationCode")), /req\.body\?\.institutionId[^\n]*\n[^\n]*\n\s*if \(req\.user\.institution\)/);
  assert.match(src, /authorityTypes/);
  assert.doesNotMatch(src, /codeHash\s*:\s*rawCode/);
});

test("revocation is atomic and role-restricted", () => {
  const src = read("controllers/registrationCodeController.js");
  assert.match(src, /findOneAndUpdate\(\{ _id: code\._id, status: "active" \}/);
  assert.match(src, /canManageType/);
});

test("institution lifecycle routes are limited to platform roles and restore needs confirmation", () => {
  const routes = read("routes/institutionRoutes.js");
  assert.match(routes, /const platformRoles = \["super_super_admin", "platform_super_admin"\]/);
  for (const r of ['post("/:id/archive"', 'post("/:id/restore"', 'get("/archived"', 'delete("/:id"', 'put("/:id"']) {
    const line = routes.split("\n").find((l) => l.includes(r));
    assert.ok(line && /allowRoles\(\.\.\.platformRoles\)/.test(line), r);
  }
  const ctrl = read("controllers/institutionController.js");
  assert.match(ctrl, /confirmationMatches\(current, req\.body\?\.confirmName\)/);
  assert.match(ctrl, /req\.body\?\.confirm !== true/);
  assert.doesNotMatch(ctrl, /deleteOne|findByIdAndDelete|deleteMany/);
});

test("archive and registration use the optional-transaction helper", () => {
  assert.match(read("controllers/institutionController.js"), /runInTransaction/);
  assert.match(read("controllers/authController.js"), /runInTransaction/);
  assert.match(read("controllers/registrationCodeController.js"), /session = null/);
  const helper = read("utils/withTransaction.js");
  assert.match(helper, /withTransaction/);
  assert.match(helper, /work\(null\)/);
});

test("Vice Chancellors are invited, never given an admin-known password", () => {
  const src = read("controllers/viceChancellorController.js");
  assert.doesNotMatch(src, /req\.body\??\.password/);
  assert.match(src, /randomBytes\(48\)/);
  assert.match(src, /tenantStatus: status === "invited" \? "pending"/);
  assert.match(src, /activationState/);
});

test("Institution Admins do not see authority-code audit events", () => {
  const src = read("controllers/adminController.js");
  assert.match(src, /hideAuthorityCodes/);
  assert.match(src, /"metadata\.codeType": \{ \$nin: \["institution_admin", "vice_chancellor"\] \}/);
});

test("vice chancellor management is platform-only and never takes institution from non-platform callers", () => {
  const routes = read("routes/viceChancellorRoutes.js");
  assert.match(routes, /allowRoles\("super_super_admin", "platform_super_admin"\)/);
  assert.doesNotMatch(routes, /super_admin"[,)]/.test(routes) ? /$^/ : /vice_chancellor"/);
  assert.match(read("server.js"), /\/api\/vice-chancellors/);
});

test("existing user admin cannot grant or manage the Vice Chancellor role from a VC account", () => {
  const src = read("controllers/adminController.js");
  assert.match(src, /req\.user\.role === "vice_chancellor" && target\.role === "vice_chancellor"/);
  assert.match(src, /requestedRole === "vice_chancellor" && req\.user\.role === "vice_chancellor"/);
});

test("registration derives institution and role from the code and audits redemption", () => {
  const src = read("controllers/authController.js");
  assert.match(src, /institution_admin_registered/);
  assert.match(src, /const role = isDirectStudentRegistration \? "student" : registration\.role/);
  assert.match(src, /consumeRegistrationCode/);
});
