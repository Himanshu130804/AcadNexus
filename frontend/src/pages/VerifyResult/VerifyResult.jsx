import React, { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { FiCheckCircle, FiSearch, FiShield } from "react-icons/fi";
import { verifyOfficialResult } from "../../api/officialResultApi";
import "./VerifyResult.css";

const formatDate = (value) => value ? new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" }) : "—";

export default function VerifyResult() {
  const { code: routeCode } = useParams();
  const [code, setCode] = useState(routeCode || "");
  const [item, setItem] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const lookup = useCallback(async (value) => {
    if (!value.trim()) { setError("Enter the verification code printed with the result."); setItem(null); return; }
    setLoading(true); setError(""); setItem(null);
    try {
      const response = await verifyOfficialResult(value.trim());
      setItem(response?.data?.item || null);
      if (!response?.data?.item) setError("No published result matches this verification code.");
    } catch (err) {
      setError(err?.response?.data?.message || "Unable to verify this result. Check the code and try again.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (routeCode) { setCode(routeCode); lookup(routeCode); }
  }, [routeCode, lookup]);

  const submit = (event) => { event.preventDefault(); lookup(code); };

  return <main className="verify-page">
    <section className="verify-card">
      <div className="verify-brand"><span className="verify-mark">AN</span><span>AcadNexus</span></div>
      <span className="verify-kicker"><FiShield aria-hidden="true" /> OFFICIAL ACADEMIC RECORDS</span>
      <h1>Verify a published result</h1>
      <p>Enter the verification code supplied with an official result. This check confirms that a published record exists in AcadNexus.</p>
      <form className="verify-form" onSubmit={submit}>
        <label htmlFor="result-verification-code">Verification code</label>
        <input id="result-verification-code" value={code} onChange={(event) => setCode(event.target.value)} autoComplete="off" spellCheck="false" placeholder="Paste verification code" required />
        <button type="submit" disabled={loading}><FiSearch aria-hidden="true" /> {loading ? "Checking…" : "Verify result"}</button>
      </form>
      {error && <div className="verify-error" role="alert">{error}</div>}
      {item && <section className="verify-success" aria-live="polite">
        <div className="verify-success-title"><FiCheckCircle aria-hidden="true" /><strong>Published record verified</strong></div>
        <dl>
          <div><dt>Course</dt><dd>{item.courseCode} — {item.courseName}</dd></div>
          <div><dt>Semester</dt><dd>{item.semester}</dd></div>
          <div><dt>Exam session</dt><dd>{item.examSession}</dd></div>
          <div><dt>Grade</dt><dd>{item.grade || "—"}</dd></div>
          <div><dt>Published on</dt><dd>{formatDate(item.publishedAt)}</dd></div>
        </dl>
        <p>This verification response intentionally does not disclose student identity or marks.</p>
      </section>}
      <footer className="verify-footer"><Link to="/login">Return to sign in</Link><span>AcadNexus · Secure result verification</span></footer>
    </section>
  </main>;
}
