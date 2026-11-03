import React, { useContext, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { loginUser, getInstitutions } from "../../api/authApi";
import { AuthContext } from "../../context/AuthContext";
import "./Login/Login.css";

const Login = () => {
  useEffect(() => { document.title = "Sign in · AcadNexus"; }, []);
  const [form, setForm] = useState({ institutionId: "", identifier: "", password: "" });
  const [institutions, setInstitutions] = useState([]);
  const [institutionsLoading, setInstitutionsLoading] = useState(true);
  const [institutionError, setInstitutionError] = useState("");
  const loadInstitutions = async () => {
    setInstitutionsLoading(true);
    setInstitutionError("");
    try {
      const items = await getInstitutions();
      setInstitutions(Array.isArray(items) ? items : []);
    } catch {
      setInstitutionError("Institutes could not be loaded. You can still sign in as the platform owner.");
    } finally {
      setInstitutionsLoading(false);
    }
  };
  useEffect(() => { loadInstitutions(); }, []);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { login } = useContext(AuthContext);
  const navigate = useNavigate();

  const isPlatformOwner = form.institutionId === "__platform_owner__";

  const submit = async (event) => {
    event.preventDefault(); setError("");

    if (!isPlatformOwner && !form.institutionId) {
      setError("Please select your institution, or choose Platform Owner.");
      return;
    }

    setLoading(true);
    try {
      const payload = {
        ...form,
        institutionId: isPlatformOwner ? "__platform_owner__" : form.institutionId,
      };
      const data = await loginUser(payload);
      login(data);
      navigate("/");
    } catch (err) {
      setError(err.response?.data?.message || "We couldn't sign you in. Check your details and try again.");
    } finally {
      setLoading(false);
    }
  };

  return <main className="an-auth">
    <section className="an-auth-visual">
      <Link className="an-wordmark" to="/"><span className="an-mark">a.</span><span>Acad<span>Nexus</span></span></Link>
      <div className="an-visual-copy"><span className="an-eyebrow"><i/> ACADNEXUS</span><h1>Your campus<br/>starts<br/><em>here.</em></h1><p>Sign in to access classes, academic records and campus updates.</p>
      <div className="an-orbit" aria-hidden="true"><div className="an-orbit-core">AN</div><span className="an-orbit-chip chip-one">✳ Learn</span><span className="an-orbit-chip chip-two">↗ Grow</span><span className="an-orbit-chip chip-three">◎ Connect</span></div></div>
      <div className="an-visual-foot"><span>ACADEMIC AND CAMPUS TOOLS</span><span>01 — 03</span></div>
    </section>
    <section className="an-auth-form-side"><div className="an-mobile-brand"><span className="an-mark">a.</span> AcadNexus</div><div className="an-login-panel">
      <div className="an-welcome-tag">WELCOME BACK</div><h2>Sign in to<br/>AcadNexus<span>.</span></h2><p className="an-form-intro">Use your institute account to continue.</p>
      {error && <div className="an-error" role="alert">{error}</div>}
      <form onSubmit={submit} className="an-login-form">
      <div className="an-field-group">
        <label htmlFor="institution">{isPlatformOwner ? "Account scope" : "Institute"} <span className="an-field-hint">{isPlatformOwner ? "Platform owner has no institute" : "Required for institute accounts"}</span></label>
        <select id="institution" value={form.institutionId} onChange={e=>setForm({...form,institutionId:e.target.value})}>
          <option value="">Choose your institute</option>
          <option value="__platform_owner__">Platform Owner (no institute)</option>
          {institutions.map(i=><option key={i._id} value={i._id}>{i.name}</option>)}
        </select>
        {institutionsLoading && <p className="an-field-note">Loading institutes…</p>}
        {institutionError && <div className="an-institution-notice" role="status"><span>{institutionError}</span><button type="button" onClick={loadInstitutions}>Retry</button></div>}
      </div>
      <div className="an-field-group"><label htmlFor="identifier">Email, roll number or employee ID</label><input id="identifier" autoComplete="username" placeholder="you@college.edu" value={form.identifier} onChange={e=>setForm({...form,identifier:e.target.value})} required /></div>
      <div className="an-field-group an-password-group"><div className="an-password-label"><label htmlFor="password">Password</label><Link to="/forgot-password" className="an-forgot">Forgot password?</Link></div><div className="an-password-wrap"><input id="password" type={showPassword?"text":"password"} autoComplete="current-password" placeholder="Enter your password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} required/><button type="button" className="an-show-password" onClick={()=>setShowPassword(!showPassword)}>{showPassword?"Hide":"Show"}</button></div></div>
      <button className="an-submit" disabled={loading}>{loading?"Signing you in…":"Sign in"}<span>↗</span></button></form>
      <div className="an-auth-divider"><span>NEW TO ACADNEXUS?</span></div><Link className="an-create-account" to="/register">Create your account <span>→</span></Link>
      <p className="an-secure-note"><span>✳</span> Your institute account keeps your campus tools in one place.</p>
    </div><footer className="an-auth-footer"><span>© {new Date().getFullYear()} AcadNexus</span><span>Academic workspace</span></footer></section>
  </main>;
};
export default Login;
