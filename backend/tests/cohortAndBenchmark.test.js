import test from "node:test";
import assert from "node:assert/strict";
import { averagePercentage, attendanceRate, assignmentCompletionFor, buildCohortRows } from "../utils/cohortMetrics.js";
import { buildBenchmark } from "../utils/benchmarking.js";

test("average percentage ignores invalid rows and returns null without valid data", () => {
  assert.equal(averagePercentage([{ marks: 50, maxMarks: 100 }, { marks: 30, maxMarks: 50 }]), 55);
  assert.equal(averagePercentage([{ marks: 120, maxMarks: 100 }, { marks: -1, maxMarks: 10 }, { marks: 5, maxMarks: 0 }]), null);
  assert.equal(attendanceRate(0, 0), null);
  assert.equal(attendanceRate(3, 4), 75);
});

test("assignment completion counts only assignments addressed to the student's section and group", () => {
  const student = { _id: "s1", department: "CSE", programme: "BTech", year: "2", semester: "3", section: "A", labBatch: "L1" };
  const assignments = [
    { department: "CSE", programme: "BTech", year: "2", semester: "3", section: "A", groupType: "full_section", submissions: [{ student: "s1" }] },
    { department: "CSE", programme: "BTech", year: "2", semester: "3", section: "A", groupType: "lab_batch", groupName: "L1", submissions: [] },
    { department: "CSE", programme: "BTech", year: "2", semester: "3", section: "A", groupType: "lab_batch", groupName: "L2", submissions: [{ student: "s1" }] },
    { department: "CSE", programme: "BTech", year: "2", semester: "3", section: "B", groupType: "full_section", submissions: [] },
  ];
  assert.equal(assignmentCompletionFor(student, assignments), 50);
  assert.equal(assignmentCompletionFor(student, []), null);
});

test("cohort rows exclude students lacking any signal instead of imputing values", () => {
  const students = [{ _id: "a", department: "CSE" }, { _id: "b", department: "CSE" }, { _id: "c", department: "CSE" }];
  const results = new Map([["a", [{ marks: 80, maxMarks: 100 }]], ["b", [{ marks: 60, maxMarks: 100 }]]]);
  const attendance = new Map([["a", { present: 9, total: 10 }], ["c", { present: 5, total: 10 }]]);
  const assignments = [{ department: "CSE", groupType: "full_section", submissions: [{ student: "a" }] }];
  const out = buildCohortRows(students, results, attendance, assignments);
  assert.deepEqual(out.rows, [{ attendanceRate: 90, averagePercentage: 80, assignmentCompletionRate: 100 }]);
  assert.equal(out.considered, 3); assert.equal(out.excluded, 2);
});

const inst = (id, students, avg) => ({ institutionId: id, students, averagePercentage: avg });
test("benchmark is withheld when too few institutions participate", () => {
  const out = buildBenchmark([inst("a", 50, 70), inst("b", 40, 65), inst("c", 30, 60)], { institutionId: "a" });
  assert.equal(out.available, false);
});

test("benchmark never exposes institution identifiers and compares an institution to peers only", () => {
  const rows = [inst("a", 50, 72), inst("b", 40, 65), inst("c", 30, 60), inst("d", 25, 55), inst("e", 80, 80), inst("tiny", 3, 99)];
  const out = buildBenchmark(rows, { institutionId: "a" });
  assert.equal(out.available, true);
  assert.equal(out.peerInstitutions, 4);               // "tiny" is below the student threshold and excluded
  assert.equal(out.peerMeanAveragePercentage, 65);      // mean of 65, 60, 55, 80
  assert.equal(out.differenceFromPeerMean, 7);
  assert.equal(out.position, "top quartile"); // 3 of 4 peers score below 72
  assert.ok(!/"[a-e]"|tiny/.test(JSON.stringify(out)), "response must not contain institution ids");
  assert.equal(out.yourAveragePercentage, 72);
});

test("an institution below the student threshold cannot benchmark and platform view is distribution-only", () => {
  const rows = [inst("a", 5, 70), inst("b", 40, 65), inst("c", 30, 60), inst("d", 25, 55), inst("e", 80, 80), inst("f", 20, 62)];
  assert.equal(buildBenchmark(rows, { institutionId: "a" }).available, false);
  const platform = buildBenchmark(rows);
  assert.equal(platform.available, true);
  assert.equal(platform.yourAveragePercentage, undefined);
  assert.equal(platform.participatingInstitutions, 5);
  assert.equal(platform.distribution.reduce((s, b) => s + b.institutions, 0), 5);
});
