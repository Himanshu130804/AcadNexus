import React, { useEffect, useMemo, useState } from "react";
import { getAuditLogs } from "../../api/adminApi";
import "./AuditLogs.css";

const AuditLogs = () => {
  const [logs, setLogs] = useState([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setLogs(await getAuditLogs());
      } catch (err) {
        setError(err?.response?.data?.message || "Audit logs are available to the Platform Owner only.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const filteredLogs = useMemo(() => {
    const text = search.trim().toLowerCase();
    return logs.filter((log) => {
      const matchesStatus = status === "all" || log.status === status;
      const searchable = [
        log.action,
        log.status,
        log.remarks,
        log.content?.title,
        log.content?.type,
        log.admin?.name,
        log.adminRole,
        log.student?.name,
        log.student?.department,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return matchesStatus && (!text || searchable.includes(text));
    });
  }, [logs, search, status]);

  return (
    <main className="audit-page">
      <section className="audit-hero">
        <span>Platform Owner Control</span>
        <h1>Audit trail</h1>
        <p>Every approval, rejection and moderation action is visible here for accountability.</p>
      </section>

      <section className="audit-toolbar">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by admin, student, content, department or remarks"
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">All statuses</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="pending">Pending</option>
        </select>
      </section>

      {loading && <section className="audit-empty">Loading audit logs...</section>}
      {error && !loading && <section className="audit-empty">{error}</section>}

      {!loading && !error && (
        <section className="audit-table-card">
          <table>
            <thead>
              <tr>
                <th>Action</th>
                <th>Content</th>
                <th>Student</th>
                <th>Admin</th>
                <th>Status</th>
                <th>Remarks</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map((log) => (
                <tr key={log._id}>
                  <td>{log.action || "Review"}</td>
                  <td>{log.content?.title || "Deleted / unavailable"}</td>
                  <td>{log.student?.name || "-"}</td>
                  <td>{log.admin?.name || "System"} <small>{log.adminRole}</small></td>
                  <td><span className={`audit-status ${log.status || "pending"}`}>{log.status || "pending"}</span></td>
                  <td>{log.remarks || "-"}</td>
                  <td>{log.createdAt ? new Date(log.createdAt).toLocaleString() : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {!filteredLogs.length && <div className="audit-empty inside">No audit logs match your filters.</div>}
        </section>
      )}
    </main>
  );
};

export default AuditLogs;
