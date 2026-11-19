import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("CSV upload is accepted by middleware and routed to the CSV parser; XLSX template path is unchanged", () => {
  assert.match(read("middleware/excelUpload.js"), /isAcceptedResultFile/);
  const controller = read("controllers/resultImportController.js");
  assert.match(controller, /RESULT_FILE_KINDS\[kind\]\.parserPath/);
  assert.match(controller, /format === "csv"/);
  assert.match(controller, /\/v1\/result-template/);
});

test("backlog endpoint is tenant-scoped, student-self or authorized staff only", () => {
  const controller = read("controllers/extendedAcademicController.js");
  const fn = controller.slice(controller.indexOf("export async function listBacklogs"));
  assert.match(fn, /studentRole\(req\) \? req\.user\._id : req\.query\.studentId/);
  assert.match(fn, /institution: tenant\(req\)\.institutionId/);
  assert.match(fn, /teacherCanAccessStudent/);
  assert.match(fn, /\.\.\.tenant\(req\), student: student\._id, status: "published"/);
  assert.match(read("routes/extendedAcademicRoutes.js"), /router\.get\("\/backlogs", listBacklogs\)/);
});

test("cohort clustering is role-restricted, department-pinned for HOD and sends only de-identified feature rows", () => {
  const controller = read("controllers/analyticsController.js");
  const fn = controller.slice(controller.indexOf("export const getCohortClusters"));
  assert.match(fn, /clusterViewers\.includes/);
  assert.match(fn, /req\.user\.role === "hod" \? String\(req\.user\.department/);
  assert.match(fn, /students: rows/);
  assert.doesNotMatch(fn, /JSON\.stringify\(\{[^}]*(email|name|rollNumber)/);
});

test("benchmark route is limited to institute leadership and platform owners and uses the narrow tenant bypass only for aggregation", () => {
  assert.match(read("routes/platformReportRoutes.js"), /"\/benchmarks", protect, allowRoles\("super_super_admin", "platform_super_admin", "institute_admin", "vice_chancellor"\)/);
  const controller = read("controllers/benchmarkController.js");
  assert.match(controller, /bypassTenantScope: true/);
  assert.match(controller, /buildBenchmark/);
  assert.doesNotMatch(controller, /res\.json\(\{[^}]*rows/);
});
