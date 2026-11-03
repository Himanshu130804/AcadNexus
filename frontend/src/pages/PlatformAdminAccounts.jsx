import React, { useEffect, useState } from "react";
import { getInstitutions } from "../api/authApi";
import api from "../api/api";
import "./PlatformAdminAccounts.css";

const emptyForm = { name: "", email: "", institutionId: "" };

export default function PlatformAdminAccounts() {
  const [admins, setAdmins] = useState([]);
  const [institutions, setInstitutions] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [adminResponse, institutionItems] = await Promise.all([
        api.get("/admin/platform-admins"),
        getInstitutions(),
      ]);
      setAdmins(Array.isArray(adminResponse.data) ? adminResponse.data : []);
      setInstitutions(Array.isArray(institutionItems) ? institutionItems : []);
    } catch (err) {
      setError(err.response?.data?.message || "Platform administrator accounts could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true); setMessage(""); setError("");
    try {
      const { data } = await api.post("/admin/platform-admins", form);
      setMessage(data.message || "Invitation sent.");
      setForm(emptyForm);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || "The invitation could not be sent.");
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (admin, status) => {
    setMessage(""); setError("");
    try {
      const { data } = await api.patch(`/admin/platform-admins/${admin._id}/status`, { status });
      setMessage(data.message || "Account status updated.");
      await load();
    } catch (err) {
      setError(err.response?.data?.message || "Account status could not be updated.");
    }
  };

  const resend = async (admin) => {
    setMessage(""); setError("");
    try {
      const { data } = await api.post(`/admin/platform-admins/${admin._id}/resend-invitation`);
      setMessage(data.message || "Invitation resent.");
      await load();
    } catch (err) {
      setError(err.response?.data?.message || "The invitation could not be resent.");
    }
  };

  return (
    <main className="pa-page">
      <section className="pa-hero">
        <span>PLATFORM COMMAND · SUPER ADMIN ACCOUNTS</span>
        <h1>Appoint the people who operate each institution.</h1>
        <p>Platform Owners invite institution-level Super Admins. Passwords are never displayed or generated in the browser; the invited administrator receives a time-limited setup link by email.</p>
      </section>

      {message && <div className="pa-message" role="status">{message}</div>}
      {error && <div className="pa-error" role="alert">{error}</div>}

      <section className="pa-grid">
        <form className="pa-card" onSubmit={submit}>
          <div className="pa-kicker">NEW APPOINTMENT</div>
          <h2>Invite a Super Admin</h2>
          <p className="pa-muted">The administrator must belong to an active institution. SMTP email must be configured before an invitation can be issued.</p>
          <label>Full name<input required minLength={2} maxLength={120} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label>Email<input required type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
          <label>Institution<select required value={form.institutionId} onChange={(e) => setForm({ ...form, institutionId: e.target.value })}><option value="">Select active institution</option>{institutions.map((item) => <option key={item._id} value={item._id}>{item.name} · {item.code}</option>)}</select></label>
          <button className="pa-primary" disabled={busy}>{busy ? "Sending invitation…" : "Send secure invitation"}</button>
        </form>

        <section className="pa-card">
          <div className="pa-list-head"><div><div className="pa-kicker">CURRENT APPOINTMENTS</div><h2>Super Admins</h2></div><span>{admins.length}</span></div>
          {loading ? <p className="pa-muted">Loading accounts…</p> : admins.length === 0 ? <div className="pa-empty"><strong>No Super Admins yet.</strong><span>Invite the first institution administrator from the form.</span></div> : <div className="pa-list">{admins.map((admin) => (
            <article className="pa-item" key={admin._id}>
              <div className="pa-avatar">{admin.name?.slice(0, 2).toUpperCase()}</div>
              <div className="pa-info"><h3>{admin.name}</h3><p>{admin.email}</p><small>{admin.institution?.name || "Institution unavailable"} · {admin.institution?.code || "—"}</small><span className={`pa-status ${admin.status}`}>{admin.status}</span></div>
              <div className="pa-actions">
                {admin.status === "invited" && <button onClick={() => resend(admin)}>Resend invite</button>}
                {admin.status === "active" && <button className="pa-danger" onClick={() => changeStatus(admin, "suspended")}>Suspend</button>}
                {admin.status === "suspended" && <button onClick={() => changeStatus(admin, "active")}>Reactivate</button>}
              </div>
            </article>
          ))}</div>}
        </section>
      </section>

      <section className="pa-note"><strong>Operational rule:</strong> suspension revokes existing sessions by incrementing the account token version. The account and its audit history are retained rather than deleted.</section>
    </main>
  );
}
