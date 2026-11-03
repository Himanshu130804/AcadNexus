import React, { useState } from "react";
import "./InstituteGovernance.css";

const initial = [
  { id: "teacher", title: "Teacher registration", code: "FAC-7KQ-2026", audience: "Teachers & faculty", icon: "✦", color: "violet", active: true },
  { id: "edp", title: "EDP registration", code: "EDP-4MX-2026", audience: "EDP office staff", icon: "▦", color: "blue", active: true },
  { id: "student-admin", title: "Student admin", code: "STU-9PD-2026", audience: "Student administrators", icon: "◈", color: "amber", active: false },
];
export default function InstituteGovernance() {
  const [codes, setCodes] = useState(initial);
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState("");
  const begin = (item) => { setEditing(item.id); setDraft(item.code); setNotice(""); };
  const save = (id) => { if (draft.trim().length < 6) { setNotice("Use at least 6 characters for an access code."); return; } setCodes(list => list.map(item => item.id === id ? { ...item, code: draft.trim() } : item)); setEditing(null); setNotice("Preview updated. Connect the institute settings API to persist changes."); };
  const toggle = (id) => setCodes(list => list.map(item => item.id === id ? { ...item, active: !item.active } : item));
  return <main className="ig-page">
    <section className="ig-hero"><div><div className="ig-eyebrow"><span className="ig-dot"/> INSTITUTE GOVERNANCE</div><h1>Your institute.<br/><em>Your access rules.</em></h1><p>As Vice-Chancellor, manage the registration codes used by people joining your institution. Each institute has its own codes and access settings.</p><div className="ig-hero-meta"><span>◈ Institute-level control</span><span>↻ Change codes anytime</span><span>⌁ Separate staff roles</span></div></div><div className="ig-orbit"><div className="ig-orbit-ring"/><div className="ig-orbit-core">AN</div><span className="ig-orbit-tag tag-one">VC CONTROL</span><span className="ig-orbit-tag tag-two">INSTITUTE ONLY</span></div></section>
    <section className="ig-section-head"><div><span className="ig-kicker">ACCESS DIRECTORY</span><h2>Registration codes</h2><p>Different codes for different responsibilities.</p></div><span className="ig-badge">{codes.filter(c=>c.active).length} ACTIVE</span></section>
    <section className="ig-code-grid">{codes.map(item=><article className={`ig-code-card ${item.color}`} key={item.id}><div className="ig-card-top"><span className="ig-icon">{item.icon}</span><button className={`ig-toggle ${item.active ? "on" : ""}`} onClick={()=>toggle(item.id)} aria-label={`${item.active ? "Disable" : "Enable"} ${item.title}`}><span/></button></div><div className="ig-audience">{item.audience}</div><h3>{item.title}</h3><div className="ig-code-label">ACCESS CODE <span className={item.active ? "status-live" : "status-off"}>{item.active ? "● ACTIVE" : "○ DISABLED"}</span></div>{editing===item.id?<div className="ig-edit-row"><input value={draft} onChange={e=>setDraft(e.target.value)} aria-label={`${item.title} code`} autoFocus/><button onClick={()=>save(item.id)}>Save</button><button className="ig-cancel" onClick={()=>setEditing(null)}>Cancel</button></div>:<div className="ig-code-row"><code>{item.code}</code><button onClick={()=>begin(item)} disabled={!item.active}>Change code ↗</button></div>}<p className="ig-card-foot">{item.active ? "Share only with verified members of this institute." : "Registration with this code is paused."}</p></article>)}</section>
    {notice && <div className="ig-notice" role="status">{notice}</div>}
    <section className="ig-bottom-grid"><article className="ig-policy"><div className="ig-policy-icon">⌘</div><div><h3>One institute, its own codes</h3><p>Teacher and EDP codes belong to the selected institute. Another institute’s code should never grant access here.</p></div></article><article className="ig-policy"><div className="ig-policy-icon">⟳</div><div><h3>Rotate when needed</h3><p>Change a code if it is shared too widely. Existing accounts should remain intact; the new code applies to future registrations.</p></div></article></section>
    <div className="ig-prototype-note"><strong>UI preview:</strong> changes currently stay in this page’s state. Persisting codes, enforcing institute boundaries, and recording an audit trail require the corresponding backend/API and database rules.</div>
  </main>;
}
