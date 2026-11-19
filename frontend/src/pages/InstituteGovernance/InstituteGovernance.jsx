import React, { useCallback, useContext, useEffect, useState } from "react";
import { AuthContext } from "../../context/AuthContext";
import { createRegistrationCode, listRegistrationCodes, revokeRegistrationCode } from "../../api/registrationCodeApi";
import "./InstituteGovernance.css";

// Live registration-code governance for the signed-in institution. Every action calls the real
// registration-codes API; the institution is always derived from the account on the server.
const definitions = [
  { id: "teacher", title: "Teacher registration", audience: "Teachers & faculty", icon: "✦", color: "violet", days: 30, shared: true },
  { id: "edp", title: "EDP registration", audience: "EDP office staff", icon: "▦", color: "blue", days: 30, shared: true },
  { id: "institution_admin", title: "Institution Admin registration", audience: "Your Institution Admin", icon: "◈", color: "amber", days: 7, shared: false, vcOnly: true },
];

const fmt = (d) => (d ? new Date(d).toLocaleString() : "—");

export default function InstituteGovernance() {
  const { user } = useContext(AuthContext);
  const [codes, setCodes] = useState([]);
  const [fresh, setFresh] = useState({}); // plaintext shown once, per code type
  const [busyType, setBusyType] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const visible = definitions.filter((d) => !d.vcOnly || user?.role === "vice_chancellor");

  const load = useCallback(async () => {
    try { const list = await listRegistrationCodes({ status: "active" }); setCodes(Array.isArray(list) ? list : []); }
    catch (e) { setError(e.response?.data?.message || "Registration codes could not be loaded."); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const activeFor = (type) => codes.find((c) => c.codeType === type && c.status === "active");

  const generate = async (def) => {
    if (busyType) return;
    setBusyType(def.id); setError(""); setNotice("");
    try {
      const result = await createRegistrationCode({ codeType: def.id, expiresInDays: def.days });
      setFresh((f) => ({ ...f, [def.id]: result }));
      setNotice(`${def.title} code generated. Copy it now; it is not stored and cannot be shown again.`);
      await load();
    } catch (e) { setError(e.response?.data?.message || "Code could not be generated."); }
    finally { setBusyType(""); }
  };
  const revoke = async (def, code) => {
    if (busyType || !window.confirm(`Revoke the active ${def.title.toLowerCase()} code? It stops working immediately.`)) return;
    setBusyType(def.id); setError(""); setNotice("");
    try {
      await revokeRegistrationCode(code._id);
      setFresh((f) => { const next = { ...f }; delete next[def.id]; return next; });
      setNotice("Registration code revoked.");
      await load();
    } catch (e) { setError(e.response?.data?.message || "Code could not be revoked."); }
    finally { setBusyType(""); }
  };
  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); setNotice("Code copied to clipboard."); }
    catch { setError("Copy failed. Select the code and copy it manually."); }
  };

  return <main className="ig-page">
    <section className="ig-hero"><div><div className="ig-eyebrow"><span className="ig-dot" /> INSTITUTE GOVERNANCE</div><h1>Your institute.<br /><em>Your access rules.</em></h1><p>Manage the registration codes used by people joining your institution. Every code is bound to your institution and to one role, expires automatically, and is revocable.</p><div className="ig-hero-meta"><span>◈ Institute-level control</span><span>↻ Rotate by revoking</span><span>⌁ Separate staff roles</span></div></div><div className="ig-orbit"><div className="ig-orbit-ring" /><div className="ig-orbit-core">AN</div><span className="ig-orbit-tag tag-one">VC CONTROL</span><span className="ig-orbit-tag tag-two">INSTITUTE ONLY</span></div></section>
    <section className="ig-section-head"><div><span className="ig-kicker">ACCESS DIRECTORY</span><h2>Registration codes</h2><p>Different codes for different responsibilities.</p></div><span className="ig-badge">{visible.filter((d) => activeFor(d.id)).length} ACTIVE</span></section>
    <section className="ig-code-grid">{visible.map((def) => {
      const active = activeFor(def.id);
      const shown = fresh[def.id];
      return <article className={`ig-code-card ${def.color}`} key={def.id}>
        <div className="ig-card-top"><span className="ig-icon">{def.icon}</span></div>
        <div className="ig-audience">{def.audience}</div><h3>{def.title}</h3>
        <div className="ig-code-label">ACCESS CODE <span className={active ? "status-live" : "status-off"}>{active ? "● ACTIVE" : "○ NOT ISSUED"}</span></div>
        {shown ? <div className="ig-code-row"><code>{shown.code}</code><button onClick={() => copy(shown.code)}>Copy ↗</button></div>
          : active ? <div className="ig-code-row"><code>{active.codePrefix}-••••</code></div> : null}
        {active && <p className="ig-card-foot">Expires {fmt(active.expiresAt)} · {active.usedCount}/{active.maxUses} used{def.shared ? " · shared with authorized people only" : " · single use"}</p>}
        {!active && <p className="ig-card-foot">No active code. Registration with this role is paused until you generate one.</p>}
        <div className="ig-edit-row" style={{ marginTop: 12 }}>
          {!active && <button onClick={() => generate(def)} disabled={Boolean(busyType)}>{busyType === def.id ? "Generating…" : "Generate code"}</button>}
          {active && def.id === "institution_admin" && <button onClick={() => generate(def)} disabled={Boolean(busyType)}>{busyType === def.id ? "Generating…" : "Generate another"}</button>}
          {active && <button className="ig-cancel" onClick={() => revoke(def, active)} disabled={Boolean(busyType)}>Revoke</button>}
        </div>
      </article>;
    })}</section>
    {notice && <div className="ig-notice" role="status">{notice}</div>}
    {error && <div className="ig-notice" role="alert">{error}</div>}
    <section className="ig-bottom-grid"><article className="ig-policy"><div className="ig-policy-icon">⌘</div><div><h3>One institute, its own codes</h3><p>Codes belong to your institute and are validated on the server. Another institute’s code can never grant access here.</p></div></article><article className="ig-policy"><div className="ig-policy-icon">⟳</div><div><h3>Rotate when needed</h3><p>Revoke a code if it is shared too widely, then generate a new one. Existing accounts stay intact; the new code applies to future registrations. Full history is under Institution Admin Registration and Registration Codes.</p></div></article></section>
  </main>;
}
