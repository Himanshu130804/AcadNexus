import React, { useEffect, useState } from "react";
import { getBacklogReport } from "../../api/extendedAcademicApi";
import "./BacklogPanel.css";

const LABELS = { backlog: "Active backlog", cleared: "Cleared", passed: "Passed", unclassified: "Not classified" };
const attemptLabel = attempt => `${attempt.attemptType}${attempt.attemptNumber > 0 ? ` #${attempt.attemptNumber}` : ""}`;

/** Backlog / clearance overview derived from published result attempts. `studentId` is only used by authorized staff. */
export default function BacklogPanel({ studentId }) {
  const [report, setReport] = useState(null); const [error, setError] = useState(""); const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true; setLoading(true); setError("");
    getBacklogReport(studentId ? { studentId } : undefined)
      .then(data => { if (active) setReport(data); })
      .catch(err => { if (active) setError(err.response?.data?.message || "Unable to load backlog status."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [studentId]);
  if (loading) return <section className="backlog-panel" aria-busy="true"><p className="backlog-muted">Loading backlog status…</p></section>;
  if (error) return <section className="backlog-panel"><p className="backlog-error" role="alert">{error}</p></section>;
  if (!report || !report.courses.length) return null;
  const { summary, courses } = report; const flagged = courses.filter(course => course.status !== "passed");
  return <section className="backlog-panel" aria-labelledby="backlog-title">
    <div className="backlog-head"><h2 id="backlog-title">Backlog &amp; clearance status</h2>
      <ul className="backlog-chips"><li className={summary.activeBacklogs ? "bad" : "ok"}>{summary.activeBacklogs} active</li><li>{summary.clearedBacklogs} cleared</li><li>{summary.passed} passed</li>{summary.unclassified > 0 && <li className="warn">{summary.unclassified} not classified</li>}</ul></div>
    {!flagged.length ? <p className="backlog-muted">No backlogs recorded across {summary.totalCourses} course(s).</p> : <div className="backlog-table-wrap"><table className="backlog-table"><thead><tr><th>Course</th><th>Semester</th><th>Status</th><th>Attempt history</th></tr></thead><tbody>
      {flagged.map(course => <tr key={`${course.courseCode}-${course.semester}`}><td><strong>{course.courseCode}</strong><small>{course.courseName}</small></td><td>{course.semester}</td><td><span className={`backlog-status ${course.status}`}>{LABELS[course.status]}</span>{course.reason && <small>{course.reason}</small>}</td>
        <td><ol className="backlog-attempts">{course.attempts.map(attempt => <li key={attempt.resultId} className={attempt.passed === false ? "fail" : attempt.passed ? "pass" : ""}>{attemptLabel(attempt)} · {attempt.examSession}: {attempt.marks}/{attempt.maxMarks}{attempt.passed === null ? "" : attempt.passed ? " (pass)" : " (below pass mark)"}</li>)}</ol></td></tr>)}
    </tbody></table></div>}
    <p className="backlog-muted">Derived from published result attempts. Original results are never overwritten; a pass percentage must be configured by the institution for each semester.</p>
  </section>;
}
