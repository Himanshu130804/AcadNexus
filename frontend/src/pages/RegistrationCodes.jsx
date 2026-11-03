import React, { useEffect, useState, useContext } from "react";
import { AuthContext } from "../context/AuthContext";
import { getManagedInstitutions } from "../api/authApi";
import { createRegistrationCode, listRegistrationCodes, revokeRegistrationCode } from "../api/registrationCodeApi";
import "./PlatformAdminAccounts.css";

const issuerTypes = (role) => ["super_super_admin", "platform_super_admin"].includes(role) ? [
  ["institution_admin", "Institution Admin"], ["vice_chancellor", "Vice Chancellor"],
] : [["teacher", "Teacher / Faculty (shared institute code)"], ["edp", "EDP (shared institute code)"], ["staff", "Staff"]];

export default function RegistrationCodes() {
  const { user } = useContext(AuthContext);
  const [institutions, setInstitutions] = useState([]);
  const [codes, setCodes] = useState([]);
  const [form, setForm] = useState({ codeType: "", institutionId: "", expiresInDays: 30, maxUses: 1000 });
  const [newCode, setNewCode] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const isPlatform = ["super_super_admin", "platform_super_admin"].includes(user?.role);
  const isInstituteManager = ["super_admin", "institute_admin", "vice_chancellor"].includes(user?.role);

  const load = async () => {
    setLoading(true); setError("");
    try {
      const [items, inst] = await Promise.all([listRegistrationCodes(), isPlatform ? getManagedInstitutions() : Promise.resolve([])]);
      setCodes(Array.isArray(items) ? items : []); setInstitutions(Array.isArray(inst) ? inst : []);
    } catch (e) { setError(e.response?.data?.message || "Registration codes could not be loaded."); }
    finally { setLoading(false); }
  };
  useEffect(() => { const types = issuerTypes(user?.role); setForm((f) => ({ ...f, codeType: f.codeType || types[0]?.[0] || "" })); load(); }, [user?.role]);

  const submit = async (e) => {
    e.preventDefault(); setError(""); setMessage(""); setNewCode(null);
    try {
      const result = await createRegistrationCode(form);
      setNewCode(result);
      setMessage(["teacher", "edp"].includes(form.codeType)
        ? `Shared ${form.codeType === "teacher" ? "teacher/faculty" : "EDP"} institute code generated. Give this same code directly to the authorized people; AcadNexus does not email it.`
        : "Code generated. It is shown once because the plaintext secret is not stored.");
      await load();
    } catch (e) { setError(e.response?.data?.message || "Code could not be generated."); }
  };

  const revoke = async (id) => { if (!window.confirm("Revoke this registration code?")) return; try { await revokeRegistrationCode(id); await load(); } catch (e) { setError(e.response?.data?.message || "Code could not be revoked."); } };

  return <main className="pa-page">
    <section className="pa-hero"><span>IAM · REGISTRATION CODES</span><h1>{isPlatform ? "Platform-wide registration code inventory." : "Your institute's registration code inventory."}</h1><p>{isPlatform ? "Platform owners can review and manage registration codes across all institutions, with an optional institution filter." : "You can only see registration codes belonging to your own institute. Other institutions' codes are never included in this inventory."} Codes are cryptographically random, institution-bound, role-bound, expiring, usage-limited and revocable. The plaintext code is returned only once and is never stored.</p></section>
    {message && <div className="pa-message">{message}</div>}{error && <div className="pa-error">{error}</div>}
    {newCode && <section className="pa-card" style={{ marginBottom: 18 }}><div className="pa-kicker">COPY NOW · SHOWN ONCE</div><h2>{newCode.code}</h2><p>{newCode.institution.name} · {newCode.role} · expires {new Date(newCode.expiresAt).toLocaleString()} · uses {newCode.maxUses}</p><p className="pa-muted">Store this code securely and give it only to the authorized person. It cannot be recovered from AcadNexus later.</p></section>}
    <section className="pa-grid">
      <form className="pa-card" onSubmit={submit}><div className="pa-kicker">GENERATE</div><h2>{isPlatform ? "Platform authority codes" : "Institution user codes"}</h2>
        {isPlatform && <label>Institution<select required value={form.institutionId} onChange={(e) => setForm({ ...form, institutionId: e.target.value })}><option value="">Select active institution</option>{institutions.map((i) => <option key={i._id} value={i._id} disabled={i.status !== "active"}>{i.name} · {i.code} · {i.status}</option>)}</select>{institutions.length === 0 ? <span className="pa-muted">No institutes were returned. Refresh after creating an institute.</span> : institutions.every((i) => i.status !== "active") ? <span className="pa-muted">Institutes exist, but none are active. Activate an institute in Institute Directory before generating a registration code.</span> : null}</label>}
        <label>Account type<select value={form.codeType} onChange={(e) => setForm({ ...form, codeType: e.target.value })}>{issuerTypes(user?.role).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Expires in days<input type="number" min="1" max="30" value={form.expiresInDays} onChange={(e) => setForm({ ...form, expiresInDays: Number(e.target.value) })} /></label>
        <label>Maximum uses<input type="number" min="1" max="1000" disabled={["institution_admin", "vice_chancellor", "teacher", "edp"].includes(form.codeType)} value={["institution_admin", "vice_chancellor"].includes(form.codeType) ? 1 : ["teacher", "edp"].includes(form.codeType) ? 1000 : form.maxUses} onChange={(e) => setForm({ ...form, maxUses: Number(e.target.value) })} /></label>
        <button className="pa-primary">Generate {[
          "teacher", "edp"
        ].includes(form.codeType) ? "shared institute code" : "secure code"}</button>
        {["teacher", "edp"].includes(form.codeType) && <p className="pa-muted">One active code is maintained per institute for this role. Share it directly with the authorized people (for example, in person). No email is sent.</p>}
      </form>
      <section className="pa-card"><div className="pa-list-head"><div><div className="pa-kicker">AUDITABLE INVENTORY</div><h2>{isPlatform ? "All issued codes" : "Issued codes · your institute only"}</h2></div><span>{codes.length}</span></div>
        {loading ? <p className="pa-muted">Loading…</p> : codes.length === 0 ? <div className="pa-empty"><strong>No registration codes yet.</strong><span>Generate one from the form.</span></div> : <div className="pa-list">{codes.map((c) => <article className="pa-item" key={c._id}><div className="pa-avatar">{String(c.codeType).slice(0,2).toUpperCase()}</div><div className="pa-info"><h3>{c.codeType}</h3><p>{c.institution?.name} · {c.role}</p><small>Created by {c.createdBy?.name || "—"} · expires {new Date(c.expiresAt).toLocaleString()} · {c.usedCount}/{c.maxUses} used</small><span className={`pa-status ${c.status}`}>{c.status}</span></div><div className="pa-actions">{c.status === "active" && <button className="pa-danger" onClick={() => revoke(c._id)}>Revoke</button>}</div></article>)}</div>}
      </section>
    </section>
  </main>;
}
