import React, { useContext, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { AuthContext } from "../../context/AuthContext";
import { getMyAttendance } from "../../api/attendanceApi";
import "./Attendance.css";

const Attendance = () => {
  const { user } = useContext(AuthContext);
  const isStaff = ["teacher", "teacher_admin", "hod", "super_admin"].includes(user?.role);
  const [summary, setSummary] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isStaff) {
      getMyAttendance()
        .then(setSummary)
        .catch(() => setSummary([]))
        .finally(() => setLoading(false));
    }
  }, [isStaff]);

  const overall = useMemo(() => {
    const total = summary.reduce((sum, item) => sum + Number(item.total || 0), 0);
    const present = summary.reduce((sum, item) => sum + Number(item.present || 0), 0);
    return { total, present, percentage: total ? Math.round((present / total) * 100) : 0 };
  }, [summary]);

  if (isStaff) return <Navigate to="/mark-attendance" replace />;

  return (
    <main className="feature-page attendance-student-page">
      <section className="feature-hero compact-hero">
        <span>Attendance</span>
        <h1>My attendance</h1>
        <p>Your attendance loads from your assigned department, programme, year, semester and section. Teachers mark it from the staff attendance workspace.</p>
      </section>

      <section className="attendance-summary-strip">
        <div><b>{overall.percentage}%</b><span>Overall</span></div>
        <div><b>{overall.present}</b><span>Present</span></div>
        <div><b>{overall.total}</b><span>Total lectures</span></div>
        <div><b>{user?.section || "—"}</b><span>Section</span></div>
      </section>

      <section className="feature-grid attendance-subject-grid">
        {loading ? (
          <div className="feature-card">Loading attendance...</div>
        ) : summary.length ? summary.map((item) => (
          <div className="feature-card" key={item.subject}>
            <span className="feature-tag">{item.percentage >= 75 ? "Safe" : "Needs attention"}</span>
            <h3>{item.subject}</h3>
            <p>{item.present}/{item.total} lectures attended</p>
            <h2>{item.percentage}%</h2>
          </div>
        )) : (
          <div className="feature-card empty-state-card">
            <h3>No attendance marked yet.</h3>
            <p>After a teacher marks attendance for your exact class, subject-wise percentages will appear here automatically.</p>
          </div>
        )}
      </section>
    </main>
  );
};

export default Attendance;
