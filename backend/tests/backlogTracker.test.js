import test from "node:test";
import assert from "node:assert/strict";
import { buildBacklogReport } from "../utils/backlogTracker.js";

const r = (courseCode, marks, extra = {}) => ({ _id: `${courseCode}-${extra.attemptType || "regular"}-${extra.attemptNumber || 0}`, courseCode, courseName: courseCode, semester: "3", examSession: "Dec 2025", marks, maxMarks: 100, status: "published", attemptType: "regular", attemptNumber: 0, publishedAt: "2026-01-10", ...extra });
const pass40 = () => 40;

test("a failed regular attempt is an active backlog; a later passing supplementary clears it and keeps the history", () => {
  const failed = buildBacklogReport([r("CS201", 31)], pass40);
  assert.equal(failed.courses[0].status, "backlog");
  assert.equal(failed.summary.activeBacklogs, 1);
  const cleared = buildBacklogReport([r("CS201", 31), r("CS201", 52, { attemptType: "supplementary", attemptNumber: 1, examSession: "Jun 2026", publishedAt: "2026-07-01" })], pass40);
  assert.equal(cleared.courses[0].status, "cleared");
  assert.equal(cleared.courses[0].attempts.length, 2); // original result is retained, never overwritten
  assert.equal(cleared.courses[0].attempts[0].passed, false);
  assert.deepEqual(cleared.courses[0].clearedBy, { attemptType: "supplementary", attemptNumber: 1, examSession: "Jun 2026" });
  assert.equal(cleared.summary.clearedBacklogs, 1);
  assert.equal(cleared.summary.activeBacklogs, 0);
});

test("a failed supplementary leaves the backlog active and counts both failures", () => {
  const out = buildBacklogReport([r("CS201", 20), r("CS201", 35, { attemptType: "supplementary", attemptNumber: 1, publishedAt: "2026-07-01" })], pass40);
  assert.equal(out.courses[0].status, "backlog");
  assert.equal(out.courses[0].failedAttempts, 2);
});

test("revaluation that lifts marks over the threshold clears the backlog", () => {
  const out = buildBacklogReport([r("MA101", 38), r("MA101", 44, { attemptType: "revaluation", attemptNumber: 1, publishedAt: "2026-02-20" })], pass40);
  assert.equal(out.courses[0].status, "cleared");
});

test("improvement attempts never create or clear a backlog", () => {
  const passedThenImproved = buildBacklogReport([r("PH101", 60), r("PH101", 30, { attemptType: "improvement", attemptNumber: 1, publishedAt: "2026-07-01" })], pass40);
  assert.equal(passedThenImproved.courses[0].status, "passed");
  const stillFailing = buildBacklogReport([r("PH102", 30), r("PH102", 90, { attemptType: "improvement", attemptNumber: 1, publishedAt: "2026-07-01" })], pass40);
  assert.equal(stillFailing.courses[0].status, "backlog");
});

test("without a configured pass percentage nothing is classified and no threshold is invented", () => {
  const out = buildBacklogReport([r("CS101", 10)], () => null);
  assert.equal(out.courses[0].status, "unclassified");
  assert.equal(out.summary.activeBacklogs, 0);
  assert.equal(out.summary.unclassified, 1);
});

test("exactly meeting the threshold passes; drafts and invalid marks are handled", () => {
  assert.equal(buildBacklogReport([r("A", 40)], pass40).courses[0].status, "passed");
  assert.equal(buildBacklogReport([r("A", 39.99)], pass40).courses[0].status, "backlog");
  assert.equal(buildBacklogReport([r("A", 10, { status: "draft" })], pass40).summary.totalCourses, 0);
  assert.equal(buildBacklogReport([r("A", NaN)], pass40).courses[0].status, "unclassified");
});

test("same course code in different semesters stays separate, ordered by semester", () => {
  const out = buildBacklogReport([r("CS1", 10, { semester: "2" }), r("CS1", 80, { semester: "1" })], pass40);
  assert.deepEqual(out.courses.map(c => [c.semester, c.status]), [["1", "passed"], ["2", "backlog"]]);
});
