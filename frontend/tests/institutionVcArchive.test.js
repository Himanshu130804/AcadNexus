import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "src");
const read = (f) => fs.readFileSync(path.join(src, f), "utf8");

test("new pages are routed behind the right roles", () => {
  const routes = read("routes/AppRoutes.jsx");
  assert.match(routes, /path="\/archived-institutions" element=\{<PlatformOwnerRoute>/);
  assert.match(routes, /path="\/vice-chancellors" element=\{<PlatformOwnerRoute>/);
  assert.match(routes, /path="\/institution-admin-registration" element=\{<RoleRoute allowed=\{\["vice_chancellor"\]\}>/);
});

test("navigation exposes new items only to the intended roles", () => {
  const nav = read("components/PortalLayout/PortalLayout.jsx");
  const vc = nav.slice(nav.indexOf("  vice_chancellor: ["), nav.indexOf("  staff: ["));
  assert.match(vc, /Institution Admin Registration/);
  assert.doesNotMatch(vc, /archived-institutions|\/vice-chancellors/);
  const instituteAdmin = nav.slice(nav.indexOf("  institute_admin: ["), nav.indexOf("  vice_chancellor: ["));
  assert.doesNotMatch(instituteAdmin, /institution-admin-registration|archived-institutions/);
});

test("VC registration page never sends an institution id", () => {
  const page = read("pages/InstitutionAdminRegistration/InstitutionAdminRegistration.jsx");
  assert.match(page, /createRegistrationCode\(\{ codeType: "institution_admin"/);
  assert.doesNotMatch(page, /institutionId/);
});

test("archive requires typed confirmation and restore requires explicit confirm", () => {
  assert.match(read("pages/InstituteManager/InstituteManager.jsx"), /confirmName:confirmText/);
  assert.match(read("pages/ArchivedInstitutions/ArchivedInstitutions.jsx"), /confirm: true/);
});

test("Institute Governance is wired to the real registration-code API", () => {
  const page = read("pages/InstituteGovernance/InstituteGovernance.jsx");
  assert.match(page, /createRegistrationCode/);
  assert.match(page, /revokeRegistrationCode/);
  assert.doesNotMatch(page, /FAC-7KQ-2026|Preview updated/);
});

test("VC form no longer collects a password", () => {
  assert.doesNotMatch(read("pages/ViceChancellorManagement/ViceChancellorManagement.jsx"), /Initial password|type="password"/);
});
