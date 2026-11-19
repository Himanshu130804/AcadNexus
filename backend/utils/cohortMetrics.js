// Pure helpers that turn raw academic records into the three-feature rows used for cohort clustering.
// Only aggregated, de-identified feature rows are ever sent to the ML service (no names, ids or emails).

const same = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
const round1 = (value) => Math.round(value * 10) / 10;

/** Mean percentage over valid published result rows, or null when none are valid. */
export function averagePercentage(rows = []) {
  const valid = rows.filter((row) => Number.isFinite(row.marks) && Number.isFinite(row.maxMarks) && row.maxMarks > 0 && row.marks >= 0 && row.marks <= row.maxMarks);
  if (!valid.length) return null;
  return round1(valid.reduce((sum, row) => sum + (row.marks / row.maxMarks) * 100, 0) / valid.length);
}

export const attendanceRate = (present, total) => (total > 0 ? round1((present / total) * 100) : null);

/** Percentage of the assignments addressed to this student that the student has submitted (null if none addressed). */
export function assignmentCompletionFor(student, assignments = []) {
  const addressed = assignments.filter((item) => {
    if (item.department && !same(item.department, student.department)) return false;
    if (item.programme && student.programme && !same(item.programme, student.programme)) return false;
    if (item.year && student.year && !same(item.year, student.year)) return false;
    if (item.semester && student.semester && !same(item.semester, student.semester)) return false;
    if (item.section && student.section && !same(item.section, student.section)) return false;
    if (!item.groupType || item.groupType === "full_section" || !item.groupName || item.groupName === "All") return true;
    return [student.groupName, student.labBatch, student.electiveGroup, student.specialization].some((value) => same(value, item.groupName));
  });
  if (!addressed.length) return null;
  const submitted = addressed.filter((item) => (item.submissions || []).some((entry) => String(entry.student) === String(student._id))).length;
  return round1((submitted / addressed.length) * 100);
}

/**
 * @returns {{ rows: Array<{attendanceRate:number, averagePercentage:number, assignmentCompletionRate:number}>, considered:number, excluded:number }}
 * Students missing any of the three signals are excluded rather than imputed.
 */
export function buildCohortRows(students, resultsByStudent, attendanceByStudent, assignments) {
  const rows = [];
  for (const student of students) {
    const id = String(student._id);
    const average = averagePercentage(resultsByStudent.get(id) || []);
    const attendance = attendanceByStudent.get(id);
    const rate = attendance ? attendanceRate(attendance.present, attendance.total) : null;
    const completion = assignmentCompletionFor(student, assignments);
    if (average === null || rate === null || completion === null) continue;
    rows.push({ attendanceRate: rate, averagePercentage: average, assignmentCompletionRate: completion });
  }
  return { rows, considered: students.length, excluded: students.length - rows.length };
}
