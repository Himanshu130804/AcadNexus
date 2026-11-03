import React, { useContext, useEffect, useMemo, useState } from "react";
import { AuthContext } from "../../context/AuthContext";
import { getPlatformReports } from "../../api/platformReportApi";
import "./Reports.css";

const initialRange = () => {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 30);
  const iso = (date) => date.toISOString().slice(0, 10);
  return { from: iso(from), to: iso(to) };
};

const formatNumber = (value) => new Intl.NumberFormat("en-IN").format(Number(value || 0));
const formatDate = (value) => new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

const statusLabel = (status) => String(status || "unknown").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const StatusList = ({ data = {} }) => {
  const entries = Object.entries(data);
  if (!entries.length) return <span className="empty-state">No records in this period.</span>;
  return (
    <div className="status-list">
      {entries.map(([key, value]) => (
        <div className="status-row" key={key}><span>{statusLabel(key)}</span><strong>{formatNumber(value)}</strong></div>
      ))}
    </div>
  );
};

const MetricCard = ({ label, value, helper }) => (
  <article className="metric-card">
    <span>{label}</span>
    <strong>{value}</strong>
    <small>{helper}</small>
  </article>
);

const Reports = () => {
  const { user } = useContext(AuthContext);
  const isPlatformOwner = ["super_super_admin", "platform_super_admin"].includes(user?.role);
  const isPersonal = ["student", "teacher"].includes(user?.role);
  const [range, setRange] = useState(initialRange);
  const [institutionId, setInstitutionId] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadReports = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await getPlatformReports({ ...range, ...(institutionId ? { institutionId } : {}) });
      setData(result);
    } catch (err) {
      setError(err?.response?.data?.message || "Unable to load platform reports. Check the API and try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadReports(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedLabel = useMemo(() => {
    if (!institutionId) return "All institutions";
    return data?.institutions?.find((item) => String(item._id) === institutionId)?.name || "Selected institution";
  }, [data, institutionId]);

  const metrics = data?.metrics || {};
  const comparison = data?.institutionComparison || [];
  const maxAttendance = Math.max(...comparison.map((item) => item.attendanceRate || 0), 1);

  const handleSubmit = (event) => {
    event.preventDefault();
    loadReports();
  };

  const exportCsv = () => {
    const rows = [
      ["Institution", "Code", "Students", "Teachers", "Attendance %", "Assignments", "Events", "Published Results"],
      ...comparison.map((item) => [item.name, item.code, item.students, item.teachers, item.attendanceRate, item.assignments, item.events, item.publishedResults]),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `acadnexus-platform-report-${range.from}-to-${range.to}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (data?.mode === "personal") {
    const isStudentReport = data.audience === "student";
    return (
      <main className="reports-page">
        <section className="reports-hero">
          <div><span className="reports-eyebrow">Personal academic intelligence</span><h1>{isStudentReport ? "My Report" : "My Teaching Report"}</h1><p>{isStudentReport ? "A private view of your attendance, assignments and officially published results." : "A private view of your teaching activity, attendance sessions and assigned student activity."}</p></div>
          <div className="report-period">{data?.range ? `${formatDate(data.range.from)} — ${formatDate(data.range.to)}` : "Last 30 days"}</div>
        </section>
        <form className="report-filters" onSubmit={handleSubmit}>
          <label>From<input type="date" value={range.from} onChange={(e) => setRange((current) => ({ ...current, from: e.target.value }))} /></label>
          <label>To<input type="date" value={range.to} onChange={(e) => setRange((current) => ({ ...current, to: e.target.value }))} /></label>
          <div className="filter-actions"><button type="submit">{loading ? "Loading…" : "Apply filters"}</button></div>
        </form>
        {error && <div className="report-alert" role="alert">{error}</div>}
        <section className="metrics-grid">
          <MetricCard label="Attendance" value={`${metrics.attendanceRate || 0}%`} helper={`${formatNumber(metrics.attendanceSessions)} sessions`} />
          <MetricCard label="Assignments" value={formatNumber(metrics.assignments)} helper={`${formatNumber(metrics.submissions)} submissions`} />
          <MetricCard label="Graded" value={formatNumber(metrics.gradedSubmissions)} helper="Graded submissions" />
          <MetricCard label="Published results" value={formatNumber(metrics.publishedResults)} helper={isStudentReport ? `${metrics.resultPercentage || 0}% marks across the period` : "Published institute results"} />
        </section>
        <section className="report-two-column">
          <article className="report-panel"><div className="section-heading"><div><span>{isStudentReport ? "My attendance" : "My teaching"}</span><h2>{isStudentReport ? "Attendance snapshot" : "Teaching activity"}</h2></div></div><div className="progress-block"><div><b>Attendance rate</b><strong>{metrics.attendanceRate || 0}%</strong></div><div className="progress-track"><i style={{ width: `${Math.min(metrics.attendanceRate || 0, 100)}%` }} /></div><small>{formatNumber(metrics.attendanceSessions)} sessions in the selected period.</small></div></article>
          <article className="report-panel"><div className="section-heading"><div><span>Results</span><h2>{isStudentReport ? "Official result status" : "Institute result activity"}</h2></div></div><div className="attention-list"><div><span>Published results</span><b>{formatNumber(metrics.publishedResults)}</b></div><div><span>{isStudentReport ? "Overall marks percentage" : "Active students in institute"}</span><b>{isStudentReport ? `${metrics.resultPercentage || 0}%` : formatNumber(metrics.students)}</b></div></div></article>
        </section>
      </main>
    );
  }

  return (
    <main className="reports-page">
      <section className="reports-hero">
        <div>
          <span className="reports-eyebrow">{isPlatformOwner ? "Platform intelligence" : "Institute intelligence"}</span>
          <h1>{isPlatformOwner ? "Platform Reports" : "Institute Reports"}</h1>
          <p>{isPlatformOwner ? "Turn operational data from AcadNexus into useful monitoring, comparison and follow-up." : "View operational data for your institute only. Other institutions are never included in this report."} Every figure below is loaded from the platform database.</p>
        </div>
        <div className="report-period">{data?.range ? `${formatDate(data.range.from)} — ${formatDate(data.range.to)}` : "Last 30 days"}</div>
      </section>

      <form className="report-filters" onSubmit={handleSubmit}>
        <label>From<input type="date" value={range.from} onChange={(e) => setRange((current) => ({ ...current, from: e.target.value }))} /></label>
        <label>To<input type="date" value={range.to} onChange={(e) => setRange((current) => ({ ...current, to: e.target.value }))} /></label>
        {isPlatformOwner ? <label>Institution
          <select value={institutionId} onChange={(e) => setInstitutionId(e.target.value)}>
            <option value="">All institutions</option>
            {(data?.institutions || []).map((institution) => <option key={institution._id} value={institution._id}>{institution.name} ({institution.code})</option>)}
          </select>
        </label> : <div className="report-scope-note">{isPersonal ? "Personal report" : "Your institute only"}</div>}
        <div className="filter-actions"><button type="submit">{loading ? "Loading…" : "Apply filters"}</button><button type="button" className="secondary" onClick={exportCsv} disabled={!comparison.length}>Export CSV</button></div>
      </form>

      {error && <div className="report-alert" role="alert">{error}</div>}

      <section className="report-section">
        <div className="section-heading"><div><span>Snapshot</span><h2>{isPlatformOwner ? "Platform at a glance" : "Institute at a glance"}</h2></div><p>{selectedLabel}</p></div>
        <div className="metrics-grid">
          <MetricCard label="Institutions" value={formatNumber(metrics.institutions)} helper="Active and non-archived scope" />
          <MetricCard label="Students" value={formatNumber(metrics.students)} helper="Active student accounts" />
          <MetricCard label="Teachers" value={formatNumber(metrics.teachers)} helper="Teachers, HODs and teacher admins" />
          <MetricCard label="Staff & admins" value={formatNumber(metrics.staff)} helper="Operational institute roles" />
          <MetricCard label="Attendance" value={`${metrics.attendanceRate || 0}%`} helper={`${formatNumber(metrics.attendanceSessions)} attendance sessions`} />
          <MetricCard label="Published results" value={formatNumber(metrics.publishedResults)} helper={`${formatNumber(metrics.draftResults)} drafts in period`} />
          <MetricCard label="Pending actions" value={formatNumber(metrics.pendingActions)} helper="Items needing follow-up" />
          <MetricCard label="Active events" value={formatNumber(metrics.events)} helper={`${formatNumber(metrics.pendingEvents)} still pending`} />
        </div>
      </section>

      <section className="report-two-column">
        <article className="report-panel">
          <div className="section-heading"><div><span>Academic operations</span><h2>Attendance & assignments</h2></div></div>
          <div className="progress-block"><div><b>Attendance rate</b><strong>{metrics.attendanceRate || 0}%</strong></div><div className="progress-track"><i style={{ width: `${Math.min(metrics.attendanceRate || 0, 100)}%` }} /></div><small>{formatNumber(metrics.attendanceSessions)} sessions were recorded in the selected period.</small></div>
          <div className="mini-stats"><div><span>Assignments</span><b>{formatNumber(metrics.assignments)}</b></div><div><span>Submissions</span><b>{formatNumber(metrics.submissions)}</b></div><div><span>Graded</span><b>{formatNumber(metrics.gradedSubmissions)}</b></div></div>
        </article>

        <article className="report-panel">
          <div className="section-heading"><div><span>Operational queue</span><h2>What needs attention?</h2></div></div>
          <div className="attention-list">
            <div><span>Pending content</span><b>{formatNumber(data?.metrics?.pendingActions || 0)}</b></div>
            <div><span>Pending events</span><b>{formatNumber(metrics.pendingEvents)}</b></div>
            <div><span>Faculty requests</span><b>{formatNumber(metrics.pendingFacultyRequests)}</b></div>
            <div><span>Moderation reports</span><b>{formatNumber(metrics.openModerationReports)}</b></div>
            <div><span>Result drafts</span><b>{formatNumber(metrics.draftResults)}</b></div>
          </div>
        </article>
      </section>

      <section className="report-two-column">
        <article className="report-panel">
          <div className="section-heading"><div><span>Campus activity</span><h2>Activity mix</h2></div></div>
          <div className="activity-grid">
            <div><strong>{formatNumber(metrics.announcements)}</strong><span>Announcements</span></div>
            <div><strong>{formatNumber(metrics.notes)}</strong><span>Notes/resources</span></div>
            <div><strong>{formatNumber(metrics.clubs)}</strong><span>Clubs</span></div>
            <div><strong>{formatNumber(metrics.clubMembers)}</strong><span>Club memberships</span></div>
            <div><strong>{formatNumber(metrics.clubEvents)}</strong><span>Club events</span></div>
            <div><strong>{formatNumber(metrics.communities)}</strong><span>Communities</span></div>
          </div>
        </article>

        <article className="report-panel">
          <div className="section-heading"><div><span>Status breakdown</span><h2>Workflow health</h2></div></div>
          <div className="breakdown-columns"><div><h3>Events</h3><StatusList data={data?.breakdowns?.events} /></div><div><h3>Moderation</h3><StatusList data={data?.breakdowns?.moderation} /></div><div><h3>Results</h3><StatusList data={data?.breakdowns?.results} /></div></div>
        </article>
      </section>

      <section className="report-panel comparison-panel">
        <div className="section-heading"><div><span>{isPlatformOwner ? "Cross-institution view" : "Institute view"}</span><h2>{isPlatformOwner ? "Institution comparison" : "Your institute"}</h2></div><p>{isPlatformOwner ? "Compare the same operational measures without turning the report into a ranking." : "Only your institute is included in this view."}</p></div>
        {loading ? <div className="empty-state">Loading institution data…</div> : comparison.length ? (
          <div className="comparison-table-wrap"><table><thead><tr><th>Institution</th><th>Students</th><th>Teachers</th><th>Attendance</th><th>Assignments</th><th>Events</th><th>Published results</th></tr></thead><tbody>{comparison.map((item) => <tr key={item.id}><td><strong>{item.name}</strong><small>{item.code}</small></td><td>{formatNumber(item.students)}</td><td>{formatNumber(item.teachers)}</td><td><div className="table-progress"><i style={{ width: `${Math.min((item.attendanceRate / maxAttendance) * 100, 100)}%` }} /><span>{item.attendanceRate}%</span></div></td><td>{formatNumber(item.assignments)}</td><td>{formatNumber(item.events)}</td><td>{formatNumber(item.publishedResults)}</td></tr>)}</tbody></table></div>
        ) : <div className="empty-state">No institutions or records match the selected filters.</div>}
      </section>
    </main>
  );
};

export default Reports;
