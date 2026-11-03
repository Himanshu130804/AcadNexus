import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getInstitutions, requestPasswordReset, submitPasswordReset } from "../../api/authApi";
import "./Login/Login.css";

export default function ForgotPassword() {
  useEffect(() => { document.title = "Password recovery · AcadNexus"; }, []);
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const isReset = Boolean(token);
  const [institutions, setInstitutions] = useState([]);
  const [institutionsLoading, setInstitutionsLoading] = useState(true);
  const [form, setForm] = useState({ institutionId: "", email: "", password: "", confirmPassword: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [devResetUrl, setDevResetUrl] = useState("");

  useEffect(() => {
    let active = true;
    getInstitutions().then((items) => { if (active) setInstitutions(Array.isArray(items) ? items : []); })
      .catch(() => { if (active) setError("Institutes could not be loaded. You can still request a platform-owner reset."); })
      .finally(() => { if (active) setInstitutionsLoading(false); });
    return () => { active = false; };
  }, []);

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const requestReset = async (event) => {
    event.preventDefault(); setError(""); setSuccess(""); setDevResetUrl(""); setLoading(true);
    try {
      const result = await requestPasswordReset({ email: form.email, institutionId: form.institutionId === "__platform_owner__" ? "" : form.institutionId });
      setSuccess(result.message || "If an account matches those details, a password reset link will be sent shortly.");
      if (result.devResetUrl) setDevResetUrl(result.devResetUrl);
    } catch (err) { setError(err.response?.data?.message || "We couldn't process that request. Please try again."); }
    finally { setLoading(false); }
  };
  const reset = async (event) => {
    event.preventDefault(); setError(""); setSuccess("");
    if (form.password.length < 12 || form.password.length > 128 || !/[a-z]/.test(form.password) || !/[A-Z]/.test(form.password) || !/[0-9]/.test(form.password)) return setError("Use 12–128 characters, including uppercase, lowercase, and a number.");
    if (form.password !== form.confirmPassword) return setError("The passwords do not match.");
    setLoading(true);
    try {
      const result = await submitPasswordReset({ token, password: form.password });
      setSuccess(result.message || "Password updated successfully.");
    } catch (err) { setError(err.response?.data?.message || "This reset link is invalid or expired. Request a new one."); }
    finally { setLoading(false); }
  };

  return <main className="an-auth an-recovery-auth">
    <section className="an-auth-visual an-recovery-visual">
      <Link className="an-wordmark" to="/login" aria-label="AcadNexus home"><span className="an-mark">a.</span><span>Acad<span>Nexus</span></span></Link>
      <div className="an-visual-copy"><span className="an-eyebrow"><i /> ACCOUNT SUPPORT</span><h1>Get back<br />to your <em>campus.</em></h1><p>Securely recover access to your AcadNexus account and get back to your learning community.</p></div>
      <div className="an-visual-foot"><span>ACADNEXUS ACCOUNT SUPPORT</span><span>02 — 03</span></div>
    </section>
    <section className="an-auth-form-side an-recovery-form-side">
      <div className="an-mobile-brand"><span className="an-mark">a.</span> AcadNexus</div>
      <div className="an-login-panel an-recovery-panel">
        <div className="an-recovery-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M7.5 10V7.5a4.5 4.5 0 0 1 9 0V10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/><rect x="5" y="10" width="14" height="11" rx="2.5" stroke="currentColor" strokeWidth="1.7"/><path d="M12 14v3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg></div>
        <div className="an-welcome-tag">{isReset ? "CHOOSE A NEW PASSWORD" : "PASSWORD RECOVERY"}</div>
        <h2>{isReset ? <>Create a new<br />password<span>.</span></> : <>Forgot your<br />password<span>?</span></>}</h2>
        <p className="an-form-intro">{isReset ? "Choose a strong password you haven't used for AcadNexus before." : "Enter your account email and institute. We'll send you a secure, time-limited reset link."}</p>
        {error && <div className="an-error" role="alert">{error}</div>}
        {success && <div className="an-recovery-success" role="status"><strong>{isReset ? "Password updated" : "Check your inbox"}</strong><p>{success}</p>{devResetUrl && <p className="an-dev-reset"><span>Development reset link:</span> <a href={devResetUrl}>Open reset link</a></p>}</div>}
        {!success ? (isReset ? <form className="an-login-form" onSubmit={reset}>
          <div className="an-field-group"><label htmlFor="new-password">New password</label><input id="new-password" type="password" autoComplete="new-password" minLength={12} maxLength={128} pattern="(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9]).{12,128}" value={form.password} onChange={(e) => update("password", e.target.value)} required /></div>
          <div className="an-field-group"><label htmlFor="confirm-password">Confirm new password</label><input id="confirm-password" type="password" autoComplete="new-password" minLength={12} maxLength={128} pattern="(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9]).{12,128}" value={form.confirmPassword} onChange={(e) => update("confirmPassword", e.target.value)} required /></div>
          <button className="an-submit" disabled={loading}>{loading ? "Updating password…" : "Reset password"}<span>↗</span></button>
        </form> : <form className="an-login-form" onSubmit={requestReset}>
          <div className="an-field-group"><label htmlFor="recovery-institution">Institute <span className="an-field-hint">Choose Platform Owner</span></label><select id="recovery-institution" value={form.institutionId} onChange={(e) => update("institutionId", e.target.value)} required><option value="">Choose your institute</option><option value="__platform_owner__">Platform Owner</option>{institutions.map((i) => <option key={i._id} value={i._id}>{i.name}</option>)}</select>{institutionsLoading && <p className="an-field-note">Loading institutes…</p>}</div>
          <div className="an-field-group"><label htmlFor="recovery-email">Account email</label><input id="recovery-email" type="email" autoComplete="email" placeholder="you@college.edu" value={form.email} onChange={(e) => update("email", e.target.value)} required /></div>
          <button className="an-submit" disabled={loading || institutionsLoading}>{loading ? "Sending reset link…" : "Send reset link"}<span>↗</span></button>
        </form>) : null}
        <Link className="an-recovery-back" to="/login"><span aria-hidden="true">←</span> Back to sign in <span aria-hidden="true">↗</span></Link>
        <p className="an-secure-note"><span>✳</span> Reset links expire after 15 minutes.</p>
      </div>
      <footer className="an-auth-footer"><span>© {new Date().getFullYear()} AcadNexus</span><span>Made for campus life</span></footer>
    </section>
  </main>;
}
