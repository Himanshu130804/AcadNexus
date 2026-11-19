import React, { useCallback, useEffect, useState } from "react";
import { FiEye, FiEdit2, FiUserCheck, FiUserX, FiRepeat, FiUserPlus } from "react-icons/fi";
import { getManagedInstitutions } from "../../api/authApi";
import { createViceChancellor, getViceChancellor, listViceChancellors, reassignViceChancellor, setViceChancellorStatus, updateViceChancellor } from "../../api/viceChancellorApi";
import ConfirmDialog from "../../components/ConfirmDialog/ConfirmDialog";
import "../PlatformAdminAccounts.css";
import "../InstitutionLifecycle.css";

const blank = { name: "", email: "", phone: "", employeeId: "", designation: "Vice Chancellor", institutionId: "", status: "invited" };
const fmt = (d) => (d ? new Date(d).toLocaleString() : "—");

export default function ViceChancellorManagement() {
  const [institutions, setInstitutions] = useState([]);
  const [filters, setFilters] = useState({ q: "", status: "", institutionId: "" });
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [dialog, setDialog] = useState(null); // {type:'add'|'edit'|'view'|'status'|'reassign', vc?}
  const [form, setForm] = useState(blank);
  const [reason, setReason] = useState("");
  const [newInstitution, setNewInstitution] = useState("");
  const [busy, setBusy] = useState(false);
  const [invite, setInvite] = useState(null);
  const [dialogError, setDialogError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setData(await listViceChancellors({ ...filters, page, limit: 10 })); }
    catch (e) { setError(e.response?.data?.message || "Vice Chancellors could not be loaded."); }
    finally { setLoading(false); }
  }, [filters, page]);
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);
  useEffect(() => { getManagedInstitutions().then((l) => setInstitutions(Array.isArray(l) ? l : [])).catch(() => {}); }, []);

  const setFilter = (k, v) => { setPage(1); setFilters((f) => ({ ...f, [k]: v })); };
  const close = () => { if (!busy) setDialog(null); };
  const activeInstitutions = institutions.filter((i) => i.status === "active");

  const open = async (type, vc) => {
    setDialogError(""); setReason(""); setNewInstitution("");
    if (type === "add") { setForm(blank); setDialog({ type }); return; }
    if (type === "edit") { setForm({ ...blank, name: vc.name, email: vc.email, phone: vc.phone, employeeId: vc.employeeId, designation: vc.designation }); setDialog({ type, vc }); return; }
    if (type === "view") {
      setDialog({ type, vc, loading: true });
      try { setDialog({ type, vc, detail: await getViceChancellor(vc._id) }); }
      catch (e) { setDialog(null); setError(e.response?.data?.message || "Details could not be loaded."); }
      return;
    }
    setDialog({ type, vc });
  };

  const run = async (fn, success) => {
    if (busy) return;
    setBusy(true); setDialogError("");
    try { await fn(); setDialog(null); setMessage(success); await load(); }
    catch (e) { setDialogError(e.response?.data?.message || "The operation failed."); }
    finally { setBusy(false); }
  };
  const submitForm = (e) => {
    e.preventDefault();
    if (dialog.type === "add") run(async () => { const r = await createViceChancellor(form); setInvite(r.invitation); }, "Vice Chancellor created.");
    else run(() => updateViceChancellor(dialog.vc._id, { name: form.name, email: form.email, phone: form.phone, employeeId: form.employeeId, designation: form.designation }), "Vice Chancellor updated.");
  };
  const f = (k) => ({ value: form[k], onChange: (e) => setForm({ ...form, [k]: e.target.value }), disabled: busy });

  return <main className="pa-page">
    <section className="pa-hero"><span>PLATFORM CONTROL · LEADERSHIP</span><h1>Vice Chancellor management</h1><p>Create Vice Chancellor accounts, assign each to exactly one institution, and control their access. An institution can have only one active Vice Chancellor; existing assignments are never overwritten silently.</p></section>
    {message && <div className="pa-message" role="status">{message}</div>}{invite && <div className="pa-note" role="status"><strong>Invitation:</strong> {invite.instructions} (Institution: {invite.institutionName}; email: {invite.email}) <button className="il-link" onClick={() => setInvite(null)}>Dismiss</button></div>}{error && <div className="pa-error" role="alert">{error}</div>}
    <section className="pa-card" style={{ marginTop: 18 }}>
      <div className="il-toolbar">
        <input type="search" placeholder="Search name, email or employee ID" aria-label="Search Vice Chancellors" value={filters.q} onChange={(e) => setFilter("q", e.target.value)} />
        <select aria-label="Institution" value={filters.institutionId} onChange={(e) => setFilter("institutionId", e.target.value)}><option value="">All institutions</option>{institutions.map((i) => <option key={i._id} value={i._id}>{i.name}</option>)}</select>
        <select aria-label="Status" value={filters.status} onChange={(e) => setFilter("status", e.target.value)}><option value="">Any status</option><option value="active">Active</option><option value="pending">Invited (awaiting password)</option><option value="inactive">Inactive</option></select>
        <button className="pa-primary" style={{ width: "auto", marginTop: 0, padding: "10px 16px" }} onClick={() => open("add")}><FiUserPlus aria-hidden="true" /> Add Vice Chancellor</button>
      </div>
      {loading ? <p className="pa-muted">Loading…</p> : data.items.length === 0 ? <div className="pa-empty"><strong>No Vice Chancellors found.</strong><span>Use “Add Vice Chancellor” to create the first one.</span></div> :
        <div className="il-table-wrap"><table className="il-table"><thead><tr><th>Name</th><th>Institution</th><th>Employee ID</th><th>Status</th><th>Actions</th></tr></thead><tbody>
          {data.items.map((v) => <tr key={v._id}>
            <td><b>{v.name}</b><br /><small>{v.email}{v.phone ? ` · ${v.phone}` : ""}</small></td>
            <td>{v.institution ? <>{v.institution.name}<br /><small>{v.institution.code} · {v.institution.archived ? "archived" : v.institution.status}</small></> : "—"}</td>
            <td>{v.employeeId || "—"}</td>
            <td><span className={`il-badge ${v.status}`}>{v.status}</span></td>
            <td><div className="il-btns">
              <button onClick={() => open("view", v)}><FiEye aria-hidden="true" /> View</button>
              <button onClick={() => open("edit", v)}><FiEdit2 aria-hidden="true" /> Edit</button>
              <button onClick={() => open("reassign", v)}><FiRepeat aria-hidden="true" /> Reassign</button>
              {v.status !== "inactive" ? <button className="il-danger" onClick={() => open("status", v)}><FiUserX aria-hidden="true" /> Deactivate</button> : <button onClick={() => open("status", v)}><FiUserCheck aria-hidden="true" /> Activate</button>}
            </div></td></tr>)}
        </tbody></table></div>}
      <div className="il-pager"><span>{data.total} total</span><button disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>Previous</button><span>Page {page} of {data.pages}</span><button disabled={page >= data.pages || loading} onClick={() => setPage((p) => p + 1)}>Next</button></div>
    </section>

    {dialog && (dialog.type === "add" || dialog.type === "edit") && <ConfirmDialog title={dialog.type === "add" ? "Add Vice Chancellor" : "Edit Vice Chancellor"} onClose={close} busy={busy}>
      <form onSubmit={submitForm}>
        <label>Full name<input required maxLength="120" {...f("name")} /></label>
        <label>Email address<input required type="email" {...f("email")} /></label>
        <div className="il-two"><label>Mobile number<input {...f("phone")} /></label><label>Employee / official ID<input maxLength="40" {...f("employeeId")} /></label></div>
        <label>Designation<input maxLength="80" {...f("designation")} /></label>
        {dialog.type === "add" && <>
          <label>Institution<select required {...f("institutionId")}><option value="">Select active institution</option>{activeInstitutions.map((i) => <option key={i._id} value={i._id}>{i.name} · {i.code}</option>)}</select></label>
          <label>Account status<select {...f("status")}><option value="invited">Invite now (VC sets own password)</option><option value="inactive">Create as inactive</option></select></label>
          <p className="pa-muted">No password is set by the Platform Admin. After creation, the Vice Chancellor opens Forgot Password, selects the institution, enters this email and completes the emailed verification code to choose a password; that also activates the account.</p>
        </>}
        {dialogError && <p className="cd-error" role="alert">{dialogError}</p>}
        <div className="cd-actions"><button type="button" className="cd-btn" onClick={close} disabled={busy}>Cancel</button><button className="cd-btn cd-primary" disabled={busy}>{busy ? "Saving…" : dialog.type === "add" ? "Create Vice Chancellor" : "Save changes"}</button></div>
      </form>
    </ConfirmDialog>}

    {dialog?.type === "view" && <ConfirmDialog title="Vice Chancellor details" onClose={close} wide>
      {dialog.loading ? <p>Loading…</p> : <><dl className="cd-facts"><dt>Name</dt><dd>{dialog.detail.name}</dd><dt>Email</dt><dd>{dialog.detail.email}</dd><dt>Mobile</dt><dd>{dialog.detail.phone || "—"}</dd><dt>Employee ID</dt><dd>{dialog.detail.employeeId || "—"}</dd><dt>Status</dt><dd>{dialog.detail.status}</dd><dt>Institution</dt><dd>{dialog.detail.institution ? `${dialog.detail.institution.name} (${dialog.detail.institution.code}) — ${dialog.detail.institution.deletedAt ? "archived" : dialog.detail.institution.status}` : "—"}</dd></dl>
        <h3>Activity &amp; audit history</h3>
        {dialog.detail.activity.length === 0 ? <p className="pa-muted">No activity recorded.</p> : <ul className="il-timeline">{dialog.detail.activity.map((a) => <li key={a._id}><b>{a.action}</b><small>{fmt(a.createdAt)} · {a.admin?.name || a.adminRole || "system"} · {a.remarks}</small></li>)}</ul>}</>}
      <div className="cd-actions"><button className="cd-btn" onClick={close}>Close</button></div>
    </ConfirmDialog>}

    {dialog?.type === "status" && <ConfirmDialog title={dialog.vc.status !== "inactive" ? "Deactivate Vice Chancellor" : "Activate Vice Chancellor"} onClose={close} busy={busy}>
      <p><b>{dialog.vc.name}</b> ({dialog.vc.email})</p>
      <div className={dialog.vc.status !== "inactive" ? "cd-warn" : "cd-info"}>{dialog.vc.status !== "inactive" ? "Deactivating signs the Vice Chancellor out and blocks access. The institution, its Institution Admin accounts and all academic data are not changed." : "Activation is refused if the institution is archived or already has another Vice Chancellor. An account that has not set a password yet returns to “invited”."}</div>
      <label>Reason (optional)<textarea rows="2" maxLength="500" value={reason} onChange={(e) => setReason(e.target.value)} disabled={busy} /></label>
      {dialogError && <p className="cd-error" role="alert">{dialogError}</p>}
      <div className="cd-actions"><button className="cd-btn" onClick={close} disabled={busy}>Cancel</button><button className={`cd-btn ${dialog.vc.status !== "inactive" ? "cd-danger" : "cd-primary"}`} disabled={busy} onClick={() => run(() => setViceChancellorStatus(dialog.vc._id, { status: dialog.vc.status !== "inactive" ? "inactive" : "active", reason }), dialog.vc.status !== "inactive" ? "Vice Chancellor deactivated." : "Vice Chancellor activated.")}>{busy ? "Working…" : dialog.vc.status !== "inactive" ? "Deactivate" : "Activate"}</button></div>
    </ConfirmDialog>}

    {dialog?.type === "reassign" && <ConfirmDialog title="Reassign Vice Chancellor" onClose={close} busy={busy}>
      <p><b>{dialog.vc.name}</b> — currently at {dialog.vc.institution?.name || "—"}</p>
      <div className="cd-warn">The account moves to the selected institution and is signed out. If that institution already has an active Vice Chancellor the request is refused; nothing is overwritten.</div>
      <label>New institution<select value={newInstitution} onChange={(e) => setNewInstitution(e.target.value)} disabled={busy}><option value="">Select active institution</option>{activeInstitutions.filter((i) => i._id !== dialog.vc.institution?._id).map((i) => <option key={i._id} value={i._id}>{i.name} · {i.code}</option>)}</select></label>
      <label>Reason (optional)<textarea rows="2" maxLength="500" value={reason} onChange={(e) => setReason(e.target.value)} disabled={busy} /></label>
      {dialogError && <p className="cd-error" role="alert">{dialogError}</p>}
      <div className="cd-actions"><button className="cd-btn" onClick={close} disabled={busy}>Cancel</button><button className="cd-btn cd-primary" disabled={busy || !newInstitution} onClick={() => run(() => reassignViceChancellor(dialog.vc._id, { institutionId: newInstitution, reason, confirm: true }), "Vice Chancellor reassigned.")}>{busy ? "Reassigning…" : "Confirm reassignment"}</button></div>
    </ConfirmDialog>}
  </main>;
}
