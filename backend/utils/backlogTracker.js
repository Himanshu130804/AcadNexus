// Derives backlog / clearance status from the immutable history of published OfficialResult attempts.
// Nothing here writes to the database: original results are never overwritten, a backlog is a *view* of the attempt chain.
// A pass threshold is never assumed; it must be configured on the institution's AcademicRule (passPercentage).

const percentageOf = (row) => (Number.isFinite(row.marks) && Number.isFinite(row.maxMarks) && row.maxMarks > 0 ? (row.marks / row.maxMarks) * 100 : null);
const timeOf = (row) => new Date(row.publishedAt || row.createdAt || 0).getTime() || 0;
const ATTEMPT_ORDER = { regular: 0, supplementary: 1, revaluation: 2, improvement: 3 };

const byAttemptChronology = (a, b) => (timeOf(a) - timeOf(b)) || ((a.attemptNumber || 0) - (b.attemptNumber || 0)) || ((ATTEMPT_ORDER[a.attemptType] ?? 9) - (ATTEMPT_ORDER[b.attemptType] ?? 9));

/**
 * @param {Array} results published OfficialResult records (lean objects) for ONE student
 * @param {(semester: string) => (number|null)} passPercentageFor returns the configured pass percentage or null
 */
export function buildBacklogReport(results = [], passPercentageFor = () => null) {
  const groups = new Map();
  for (const row of results) {
    if (!row || row.status === "draft") continue;
    const key = `${String(row.courseCode).trim().toLowerCase()}|${String(row.semester).trim().toLowerCase()}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const courses = [];
  for (const rows of groups.values()) {
    rows.sort(byAttemptChronology);
    const threshold = passPercentageFor(rows[0].semester);
    const attempts = rows.map((row) => {
      const percentage = percentageOf(row);
      return {
        resultId: row._id, attemptType: row.attemptType || "regular", attemptNumber: row.attemptNumber || 0, examSession: row.examSession,
        marks: row.marks, maxMarks: row.maxMarks, grade: row.grade || "", percentage: percentage === null ? null : Number(percentage.toFixed(2)),
        passed: threshold === null || percentage === null ? null : percentage >= threshold, publishedAt: row.publishedAt || null,
      };
    });
    const base = { courseCode: rows[0].courseCode, courseName: rows[0].courseName, semester: rows[0].semester, passPercentage: threshold, attempts };
    if (threshold === null || attempts.some((attempt) => attempt.passed === null)) { courses.push({ ...base, status: "unclassified", reason: threshold === null ? "No pass percentage is configured for this semester." : "A result has invalid marks." }); continue; }
    // Improvement attempts can only raise an already-passed grade, so they never decide backlog state.
    const deciding = attempts.filter((attempt) => attempt.attemptType !== "improvement");
    const decisive = deciding.length ? deciding : attempts;
    const latest = decisive[decisive.length - 1];
    const failedBefore = decisive.slice(0, -1).some((attempt) => attempt.passed === false);
    const failedCount = decisive.filter((attempt) => attempt.passed === false).length;
    if (!latest.passed) courses.push({ ...base, status: "backlog", failedAttempts: failedCount, since: decisive.find((attempt) => attempt.passed === false)?.examSession || null });
    else if (failedBefore) courses.push({ ...base, status: "cleared", failedAttempts: failedCount, clearedBy: { attemptType: latest.attemptType, attemptNumber: latest.attemptNumber, examSession: latest.examSession } });
    else courses.push({ ...base, status: "passed", failedAttempts: 0 });
  }
  courses.sort((a, b) => String(a.semester).localeCompare(String(b.semester), undefined, { numeric: true }) || String(a.courseCode).localeCompare(String(b.courseCode)));
  const count = (status) => courses.filter((course) => course.status === status).length;
  return { summary: { totalCourses: courses.length, activeBacklogs: count("backlog"), clearedBacklogs: count("cleared"), passed: count("passed"), unclassified: count("unclassified") }, courses };
}
