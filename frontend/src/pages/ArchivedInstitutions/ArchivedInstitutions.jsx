import React, { useCallback, useContext, useEffect, useState } from "react";
import { FiEye, FiClock, FiRotateCcw } from "react-icons/fi";
import { AuthContext } from "../../context/AuthContext";
import { getInstitutionDetails, getInstitutionHistory, listArchivedInstitutions, restoreInstitution } from "../../api/institutionApi";
import ConfirmDialog from "../../components/ConfirmDialog/ConfirmDialog";
import "../PlatformAdminAccounts.css";
import "../InstitutionLifecycle.css";

const fmt = (d) => (d ? new Date(d).toLocaleString() : "—");
const people = (list, empty) => (list?.length ? list.map((p) => `${p.name} (${p.email})`).join(", ") : empty);

export default function ArchivedInstitutions() {
  const { user } = useContext(AuthContext);
  const canRestore = ["super_super_admin", "platform_super_admin"].includes(user?.role); // matches the backend
  const [filters, setFilters] = useState({ q: "", previousStatus: "", from: "", to: "", sort: "archivedAt", dir: "desc" });
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [view, setView] = useState(null);
  const [history, setHistory] = useState(null);
  const [restoring, setRestoring] = useState(null);
  const [restoreStatus, setRestoreStatus] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setData(await listArchivedInstitutions({ ...filters, page, limit: 10 })); }
    catch (e) { setError(e.response?.data?.message || "Archived institutions could not be loaded."); }
    finally { setLoading(false); }
  }, [filters, page]);
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);

  const setFilter = (key, value) => { setPage(1); setFilters((f) => ({ ...f, [key]: value })); };

  const openView = async (item) => {
    setView({ loading: true, institution: item });
    try { setView({ ...(await getInstitutionDetails(item._id)), loading: false }); }
    catch (e) { setView(null); setError(e.response?.data?.message || "Details could not be loaded."); }
  };
  const openHistory = async (item) => {
    setHistory({ loading: true, institution: item, history: [], audit: [] });
    try { setHistory({ ...(await getInstitutionHistory(item._id)), loading: false }); }
    catch (e) { setHistory(null); setError(e.response?.data?.message || "History could not be loaded."); }
  };
  const openRestore = (item) => { setRestoring(item); setRestoreStatus(""); setReason(""); setDialogError(""); };
  const confirmRestore = async () => {
    if (busy || !restoring) return;
    setBusy(true); setDialogError("");
    try {
      const result = await restoreInstitution(restoring._id, { confirm: true, reason, ...(restoreStatus ? { status: restoreStatus } : {}) });
      setRestoring(null); setMessage(`${restoring.name}: ${result.message}`);
      await load();
    } catch (e) { setDialogError(e.response?.data?.message || "Restore failed."); }
    finally { setBusy(false); }
  };

  return <main className="pa-page">
    <section className="pa-hero"><span>PLATFORM CONTROL · ARCHIVE</span><h1>Archived institutions</h1><p>Institutions that were archived (soft-deleted). Their academic and audit records are preserved. They cannot sign in, register people or accept registration codes until restored.</p></section>
    {message && <div className="pa-message" role="status">{message}</div>}{error && <div className="pa-error" role="alert">{error}</div>}
    <section className="pa-card" style={{ marginTop: 18 }}>
      <div className="il-toolbar">
        <input type="search" placeholder="Search by name, code or ID" aria-label="Search archived institutions" value={filters.q} onChange={(e) => setFilter("q", e.target.value)} />
        <select aria-label="Previous status" value={filters.previousStatus} onChange={(e) => setFilter("previousStatus", e.target.value)}><option value="">Any previous status</option><option value="active">Was active</option><option value="pending">Was pending</option><option value="suspended">Was suspended</option></select>
        <label style={{ margin: 0 }}>From <input type="date" value={filters.from} onChange={(e) => setFilter("from", e.target.value)} /></label>
        <label style={{ margin: 0 }}>To <input type="date" value={filters.to} onChange={(e) => setFilter("to", e.target.value)} /></label>
        <select aria-label="Sort by" value={filters.sort} onChange={(e) => setFilter("sort", e.target.value)}><option value="archivedAt">Sort: archived date</option><option value="name">Sort: name</option><option value="createdAt">Sort: created date</option></select>
        <select aria-label="Direction" value={filters.dir} onChange={(e) => setFilter("dir", e.target.value)}><option value="desc">Descending</option><option value="asc">Ascending</option></select>
      </div>
      {loading ? <p className="pa-muted">Loading…</p> : data.items.length === 0 ? <div className="pa-empty"><strong>No archived institutions.</strong><span>Institutions you archive from Institute Directory appear here.</span></div> :
        <div className="il-table-wrap"><table className="il-table"><thead><tr><th>Institution</th><th>Leadership</th><th>Created</th><th>Archived</th><th>Archived by / reason</th><th>Status</th><th>Actions</th></tr></thead><tbody>
          {data.items.map((x) => <tr key={x._id}>
            <td><b>{x.name}</b><br /><small>{x.code} · {x._id}</small></td>
            <td><small>VC: {people(x.viceChancellors, "—")}<br />Admin: {people(x.institutionAdmins, "—")}</small></td>
            <td>{fmt(x.createdAt)}</td><td>{fmt(x.archive?.archivedAt || x.deletedAt)}</td>
            <td>{x.archive?.archivedBy?.name || "—"}<br /><small>{x.archive?.reason || "No reason recorded"}</small></td>
            <td><span className="il-badge archived">Archived</span><br /><small>was {x.archive?.previousStatus || "unknown"}</small></td>
            <td><div className="il-btns">
              <button onClick={() => openView(x)} aria-label={`View ${x.name}`}><FiEye aria-hidden="true" /> View</button>
              <button onClick={() => openHistory(x)} aria-label={`History of ${x.name}`}><FiClock aria-hidden="true" /> History</button>
              {canRestore && <button onClick={() => openRestore(x)} aria-label={`Restore ${x.name}`}><FiRotateCcw aria-hidden="true" /> Restore</button>}
            </div></td></tr>)}
        </tbody></table></div>}
      <div className="il-pager"><span>{data.total} archived</span><button disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>Previous</button><span>Page {page} of {data.pages}</span><button disabled={page >= data.pages || loading} onClick={() => setPage((p) => p + 1)}>Next</button></div>
    </section>

    {view && <ConfirmDialog title="Archived institution details" onClose={() => setView(null)} wide>
      {view.loading ? <p>Loading…</p> : <><dl className="cd-facts"><dt>Name</dt><dd>{view.institution.name}</dd><dt>ID</dt><dd>{view.institution._id}</dd><dt>Code</dt><dd>{view.institution.code}</dd><dt>Previous status</dt><dd>{view.institution.archive?.previousStatus || "unknown"}</dd><dt>Archived</dt><dd>{fmt(view.institution.archive?.archivedAt || view.institution.deletedAt)} by {view.institution.archive?.archivedBy?.name || "—"}</dd><dt>Reason</dt><dd>{view.institution.archive?.reason || "—"}</dd><dt>Vice Chancellor</dt><dd>{people(view.viceChancellors, "Not assigned")}</dd><dt>Institution Admin</dt><dd>{people(view.institutionAdmins, "Not registered")}</dd></dl>
        <p className="pa-muted">Preserved records — {Object.entries(view.records || {}).map(([k, v]) => `${k}: ${v}`).join(" · ")}</p></>}
      <div className="cd-actions"><button className="cd-btn" onClick={() => setView(null)}>Close</button></div>
    </ConfirmDialog>}

    {history && <ConfirmDialog title={`Archival history — ${history.institution.name}`} onClose={() => setHistory(null)} wide>
      {history.loading ? <p>Loading…</p> : <>
        <h3>Archive / restore events</h3>
        {history.history.length === 0 ? <p className="pa-muted">No events recorded.</p> : <ul className="il-timeline">{history.history.map((h, i) => <li key={i}><b>{h.action === "archived" ? "Archived" : "Restored"}</b> by {h.by?.name || "unknown"} ({h.byRole || "—"})<small>{fmt(h.at)} · {h.fromStatus} → {h.toStatus}{h.reason ? ` · ${h.reason}` : ""}</small></li>)}</ul>}
        <h3>Audit trail</h3>
        {history.audit.length === 0 ? <p className="pa-muted">No audit entries.</p> : <ul className="il-timeline">{history.audit.map((a) => <li key={a._id}><b>{a.action}</b> — {a.admin?.name || a.adminRole || "system"}<small>{fmt(a.createdAt)} · {a.remarks}</small></li>)}</ul>}</>}
      <div className="cd-actions"><button className="cd-btn" onClick={() => setHistory(null)}>Close</button></div>
    </ConfirmDialog>}

    {restoring && <ConfirmDialog title="Restore institution" onClose={() => { if (!busy) setRestoring(null); }} busy={busy}>
      <dl className="cd-facts"><dt>Name</dt><dd>{restoring.name}</dd><dt>Institution ID</dt><dd>{restoring._id}</dd></dl>
      <div className="cd-info">Restoring brings this institution back to the active institution list with all its preserved records. By default it returns to its previous status (<b>{restoring.archive?.previousStatus || "pending"}</b>). User accounts are not changed — suspended accounts stay suspended — and registration codes revoked at archival must be generated again.</div>
      <label>Restore as<select value={restoreStatus} onChange={(e) => setRestoreStatus(e.target.value)} disabled={busy}><option value="">Previous status ({restoring.archive?.previousStatus || "pending"})</option><option value="active">Active</option><option value="pending">Pending</option><option value="suspended">Suspended</option></select></label>
      <label>Reason (optional)<textarea rows="2" maxLength="500" value={reason} onChange={(e) => setReason(e.target.value)} disabled={busy} /></label>
      {dialogError && <p className="cd-error" role="alert">{dialogError}</p>}
      <div className="cd-actions"><button className="cd-btn" onClick={() => setRestoring(null)} disabled={busy}>Cancel</button><button className="cd-btn cd-primary" onClick={confirmRestore} disabled={busy}>{busy ? "Restoring…" : "Restore institution"}</button></div>
    </ConfirmDialog>}
  </main>;
}
