import React, { useEffect, useState } from "react";
import { getCohortClusters } from "../../api/analyticsApi";
import { getBenchmarks } from "../../api/platformReportApi";
import "./CohortInsights.css";

/** Anonymized cross-institution benchmark (aggregated; withheld by the server unless enough institutions participate). */
export function BenchmarkPanel() {
  const [data, setData] = useState(null); const [error, setError] = useState(""); const [loading, setLoading] = useState(true);
  useEffect(() => { let active = true; getBenchmarks().then(result => { if (active) setData(result); }).catch(err => { if (active) setError(err.response?.data?.message || "Unable to load benchmarks."); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, []);
  const b = data?.benchmark;
  return <section className="ci-panel" aria-labelledby="ci-benchmark-title">
    <div className="ci-head"><h2 id="ci-benchmark-title">Anonymized benchmarking</h2><small>{data?.metric || "Average percentage across published official results"}</small></div>
    {loading ? <p className="ci-muted">Loading benchmark…</p> : error ? <p className="ci-error" role="alert">{error}</p> : !b?.available ? <p className="ci-muted">{b?.reason || "Benchmark unavailable."}</p> : <>
      <div className="ci-stats">
        {b.yourAveragePercentage !== undefined && <div><strong>{b.yourAveragePercentage}%</strong><span>Your institution</span></div>}
        <div><strong>{b.peerMeanAveragePercentage}%</strong><span>Peer mean ({b.peerInstitutions} institutions)</span></div>
        {b.differenceFromPeerMean !== undefined && <div><strong>{b.differenceFromPeerMean > 0 ? "+" : ""}{b.differenceFromPeerMean}</strong><span>Difference · {b.position}</span></div>}
      </div>
      <ul className="ci-bands">{b.distribution.map(band => <li key={band.from}>{band.from}–{Math.round(band.to)}%: {band.institutions} institution(s)</li>)}</ul>
    </>}
    <p className="ci-muted">Institution identities and student-level data are never shown. Comparisons need at least {b?.privacy?.minimumInstitutions ?? 5} institutions with {b?.privacy?.minimumStudentsPerInstitution ?? 10}+ students each.</p>
  </section>;
}

/** Descriptive cohort clustering for one department (aggregate cluster profiles only). */
export function CohortClusterPanel({ fixedDepartment = "" }) {
  const [department, setDepartment] = useState(fixedDepartment); const [semester, setSemester] = useState("");
  const [data, setData] = useState(null); const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  const run = async event => {
    event?.preventDefault(); if (!department.trim()) { setError("Enter a department to analyse."); return; }
    setLoading(true); setError(""); setData(null);
    try { setData(await getCohortClusters({ department: department.trim(), ...(semester.trim() ? { semester: semester.trim() } : {}) })); }
    catch (err) { setError(err.response?.data?.message || "Unable to analyse this cohort."); }
    finally { setLoading(false); }
  };
  return <section className="ci-panel" aria-labelledby="ci-cluster-title">
    <div className="ci-head"><h2 id="ci-cluster-title">Cohort performance clusters</h2><small>Attendance × performance × assignment completion</small></div>
    <form className="ci-form" onSubmit={run}>
      <label>Department<input value={department} onChange={e => setDepartment(e.target.value)} disabled={Boolean(fixedDepartment)} placeholder="e.g. CSE" /></label>
      <label>Semester (optional)<input value={semester} onChange={e => setSemester(e.target.value)} placeholder="e.g. 3" /></label>
      <button type="submit" disabled={loading}>{loading ? "Analysing…" : "Analyse cohort"}</button>
    </form>
    {error && <p className="ci-error" role="alert">{error}</p>}
    {data && <>
      <p className="ci-muted">{data.cohort.included} of {data.cohort.considered} students had complete data ({data.cohort.excluded} excluded) · model {data.modelVersion}</p>
      <div className="ci-table-wrap"><table><thead><tr><th>Cluster</th><th>Students</th><th>Mean attendance</th><th>Mean performance</th><th>Mean assignment completion</th></tr></thead><tbody>
        {data.clusters.map(c => <tr key={c.cluster}><td>{c.cluster}</td><td>{c.count}</td><td>{c.meanAttendance}%</td><td>{c.meanPerformance}%</td><td>{c.meanAssignmentCompletion}%</td></tr>)}
      </tbody></table></div>
      <p className="ci-muted">{data.note}</p>
    </>}
  </section>;
}
