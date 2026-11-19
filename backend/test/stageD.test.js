import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { matchOpportunity } from "../utils/opportunityMatcher.js";
import { sameSemester } from "../utils/academicValues.js";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("opportunity matching is explainable and deterministic", () => {
  const profile = { skills: ["React", "Python"], interests: ["AI"], careerInterests: ["Research"] };
  const opportunity = { requiredSkills: ["React", "SQL"], interestTags: ["AI", "Architecture"] };
  const result = matchOpportunity(profile, opportunity);
  assert.deepEqual(result, matchOpportunity(profile, opportunity));
  assert.equal(result.matchScore, 50); // 35 skill points + 15 interest points
  assert.deepEqual(result.matchedSkills, ["React"]);
  assert.deepEqual(result.missingSkills, ["SQL"]);
});

test("opportunity matcher does not infer a score without matching dimensions", () => {
  assert.equal(matchOpportunity({}, { requiredSkills: [], interestTags: [] }).matchScore, null);
});

test("result imports stage validated rows and publish inside a transaction", () => {
  const controller = read("controllers/resultImportController.js");
  assert.match(controller, /OfficialResult\.insertMany\(docs, \{ session, ordered: true \}\)/);
  assert.match(controller, /session\.withTransaction/);
  assert.match(controller, /fileSha256/);
  assert.match(controller, /corrected_file_reuploaded/);
  assert.match(controller, /Unknown subject\/course code/);
});

test("examination attempt history preserves original records and uses distinct attempt keys", () => {
  const model = read("models/OfficialResult.js");
  const controller = read("controllers/extendedAcademicController.js");
  assert.match(model, /attemptType/);
  assert.match(model, /supersedes/);
  assert.match(controller, /supersedes: original\._id/);
  assert.match(controller, /attemptType/);
});

test("portfolio mutations are owner-scoped and verification is administrator-only", () => {
  const controller = read("controllers/extendedAcademicController.js");
  assert.match(controller, /student: req\.user\._id/);
  assert.match(controller, /portfolio verification requires an academic administrator/i);
  assert.match(read("models/StudentPortfolio.js"), /Links must use HTTPS/);
});

test("topic assessment creation checks the student's teaching scope", () => {
  const controller = read("controllers/extendedAcademicController.js");
  assert.match(controller, /teacherCanAccessStudent/);
  assert.match(controller, /Unknown|Student or subject is outside your authorized teaching scope/);
  assert.match(controller, /TopicAssessment\.create/);
});

test("OTP challenge is hashed, expires and is single-use", () => {
  const controller = read("controllers/recoveryController.js");
  const model = read("models/RecoveryChallenge.js");
  assert.match(controller, /createHmac\("sha256"/);
  assert.match(controller, /randomInt\(0, 1_000_000\)/);
  assert.match(controller, /attempts: \{ \$lt: 5 \}/);
  assert.match(controller, /consumedAt: new Date\(\)/);
  assert.match(model, /expires: 0/);
});

test("semester matching accepts configured labels and numeric semester values", () => { assert.equal(sameSemester("Semester 6", "6"), true); assert.equal(sameSemester("Sem 06", "6"), true); assert.equal(sameSemester("Semester 5", "6"), false); });

test("active examination applications and active academic rules have uniqueness guards", () => {
  const applications = read("models/AcademicApplication.js");
  const rules = read("models/AcademicRule.js");
  assert.match(applications, /academic_application_active_unique/);
  assert.match(applications, /activeKey/);
  assert.match(rules, /academic_rule_active_unique/);
  assert.match(rules, /partialFilterExpression: \{ active: true \}/);
});

test("department administrator paths enforce department-scoped records", () => {
  const controller = read("controllers/extendedAcademicController.js");
  assert.match(controller, /Application is outside your department scope/);
  assert.match(controller, /Portfolio is outside your department scope/);
  assert.match(controller, /departmentScope/);
});

test("public portfolio endpoint requires explicit public profile and item visibility", () => {
  const controller = read("controllers/extendedAcademicController.js");
  assert.match(controller, /profileVisibility: "public"/);
  assert.match(controller, /visibility: "public"/);
  assert.match(controller, /select\("name department programme institution"\)/);
  assert.doesNotMatch(controller.slice(controller.indexOf("export async function getPublicPortfolio")), /select\([^)]*email|select\([^)]*rollNumber/);
});

test("legacy direct result publication endpoints are not mounted", () => {
  const routes = read("routes/officialResultRoutes.js");
  assert.doesNotMatch(routes, /router\.post\("\/batch"/);
  assert.doesNotMatch(routes, /router\.post\("\/:id\/publish"/);
  assert.match(routes, /staged import\/confirmation\/publication workflow/);
});
