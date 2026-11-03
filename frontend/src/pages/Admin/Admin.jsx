import React, { useEffect, useState } from "react";
import { getAuditLogs, getStats, getUsers, updateUserRole } from "../../api/adminApi";
import { getPendingContent, reviewContent } from "../../api/contentApi";
import { getReports, updateReport } from "../../api/reportApi";
import "./Admin.css";

const Admin = () => {
  const [stats, setStats] = useState({});
  const [pending, setPending] = useState([]);
  const [users, setUsers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [reports, setReports] = useState([]);

  const load = async () => {
    setStats(await getStats());
    setPending(await getPendingContent());

    try { setUsers(await getUsers()); } catch { setUsers([]); }
    try { setLogs(await getAuditLogs()); } catch { setLogs([]); }
    try { setReports(await getReports()); } catch { setReports([]); }
  };

  useEffect(() => { load(); }, []);

  const handleReview = async (id, status) => {
    const remarks = prompt("Add remarks") || "";
    await reviewContent(id, { status, remarks });
    load();
  };

  const handleRole = async (id, role) => {
    await updateUserRole(id, role);
    load();
  };

  const handleReport = async (id, status) => {
    const adminRemarks = prompt("Admin remarks") || "";
    await updateReport(id, { status, adminRemarks });
    load();
  };

  return (
    <main className="admin-page">
      <section className="admin-hero">
        <span>Admin Dashboard</span>
        <h1>Campus moderation center</h1>
        <p>Approve content, manage users, review reports and monitor platform activity.</p>
      </section>

      <section className="admin-stats">
        {Object.entries(stats).map(([key, value]) => (
          <div key={key} className="admin-stat-card">
            <h2>{value}</h2>
            <p>{key}</p>
          </div>
        ))}
      </section>

      <section className="admin-section">
        <h2>Approval Center</h2>
        <div className="admin-list">
          {pending.length ? pending.map((item) => (
            <div key={item._id} className="admin-item">
              <div>
                <span>{item.type}</span>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
                <small>{item.department} • {item.submittedBy?.name}</small>
              </div>
              <div className="admin-actions">
                <button onClick={() => handleReview(item._id, "approved")}>Approve</button>
                <button className="danger" onClick={() => handleReview(item._id, "rejected")}>Reject</button>
              </div>
            </div>
          )) : <p>No pending content.</p>}
        </div>
      </section>

      <section className="admin-section">
        <h2>Reports Management</h2>
        <div className="admin-list">
          {reports.length ? reports.map((report) => (
            <div key={report._id} className="admin-item">
              <div>
                <span>{report.status}</span>
                <h3>{report.reason}</h3>
                <p>{report.details || "No extra details"}</p>
                <small>Content: {report.content?.title} • By {report.reportedBy?.name}</small>
              </div>
              <div className="admin-actions">
                <button onClick={() => handleReport(report._id, "resolved")}>Resolve</button>
                <button className="danger" onClick={() => handleReport(report._id, "dismissed")}>Dismiss</button>
              </div>
            </div>
          )) : <p>No reports.</p>}
        </div>
      </section>

      <section className="admin-section">
        <h2>User Management</h2>
        <div className="admin-grid">
          {users.map((user) => (
            <div key={user._id} className="user-card">
              <h3>{user.name}</h3>
              <p>{user.email}</p>
              <p>{user.department} • {user.role}</p>
              <select value={user.role} onChange={(e) => handleRole(user._id, e.target.value)}>
                <option value="student">Student</option>
                <option value="student_admin">Student Admin</option>
                <option value="teacher_admin">Teacher Admin</option>
                <option value="super_admin">Super Admin</option>
              </select>
            </div>
          ))}
        </div>
      </section>

      <section className="admin-section">
        <h2>Audit Logs</h2>
        <div className="admin-list">
          {logs.length ? logs.map((log) => (
            <div key={log._id} className="admin-item">
              <div>
                <span>{log.status}</span>
                <h3>{log.action}</h3>
                <p>{log.content?.title}</p>
                <small>{log.admin?.name} ({log.adminRole}) • {new Date(log.createdAt).toLocaleString()}</small>
              </div>
            </div>
          )) : <p>Audit logs are visible to Super Admin only.</p>}
        </div>
      </section>
    </main>
  );
};

export default Admin;
