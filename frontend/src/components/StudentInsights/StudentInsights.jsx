import React, { useEffect, useState } from "react";
import { getMyAnalytics } from "../../api/analyticsApi";
import "./StudentInsights.css";

const StudentInsights = () => {
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    getMyAnalytics().then((data) => { if (active) setPayload(data); })
      .catch(() => { if (active) setError("Academic insights are temporarily unavailable."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  if (loading) return <section className="student-insights"><div className="insights-heading"><div><span>ACADEMIC INTELLIGENCE</span><h2>Your academic insights</h2></div></div><p className="insights-muted">Analysing your available academic records…</p></section>;
  if (error) return <section className="student-insights"><div className="insights-heading"><div><span>ACADEMIC INTELLIGENCE</span><h2>Your academic insights</h2></div></div><p className="insights-muted">{error}</p></section>;

  const analysis = payload?.analysis || {};
  const summary = analysis.summary || {};
  const value = (v) => v === null || v === undefined ? "—" : `${v}%`;
  return <section className="student-insights">
    <div className="insights-heading"><div><span>ACADEMIC INTELLIGENCE</span><h2>Your academic insights</h2><p>Evidence-based guidance from your available published results, attendance and assignments.</p></div><small>{analysis.service === "fastapi" ? "ML-assisted analysis" : "Explainable rule-based analysis"}</small></div>
    {analysis.serviceNotice && <p className="insights-muted">{analysis.serviceNotice}</p>}
    <div className="insights-metrics">
      <article><span>Published result average</span><strong>{value(summary.averagePercentage)}</strong></article>
      <article><span>Attendance</span><strong>{value(summary.attendanceRate)}</strong></article>
      <article><span>Assignment completion</span><strong>{value(summary.assignmentCompletionRate)}</strong></article>
    </div>
    <div className="insights-columns">
      <div className="insights-panel"><h3>Performance by subject</h3>{analysis.subjectResults?.length ? analysis.subjectResults.slice(0, 6).map((item, index) => <div className="subject-result" key={`${item.subject}-${index}`}><span>{item.subject}</span><b>{item.percentage}%</b></div>) : <p className="insights-muted">Published result records are not available yet.</p>}</div>
      <div className="insights-panel"><h3>Suggested next steps</h3>{analysis.recommendations?.length ? analysis.recommendations.map((item, index) => <article className="insight-recommendation" key={`${item.type}-${index}`}><b>{item.title}</b><p>{item.reason}</p></article>) : <p className="insights-muted">No specific action is suggested from the records currently available.</p>}</div>
    </div>
    {!!analysis.attentionSignals?.length && <div className="insights-panel attention-panel"><h3>Academic support signals</h3><p className="insights-muted">These indicators are intended to support discussion with faculty, not to judge or penalise students.</p>{analysis.attentionSignals.map((item, index) => <article key={`${item.signal}-${index}`}><b>{item.signal.replace(/_/g, " ")}</b><p>{item.evidence}</p></article>)}</div>}
    <footer className="insights-footnote">{analysis.prediction?.available ? "Prediction available; review its uncertainty before relying on it." : "Semester prediction is not shown because sufficient validated historical training data is not yet available."} Data records: {analysis.dataQuality?.resultRecords ?? 0} published results · {analysis.dataQuality?.attendanceSessions ?? 0} attendance sessions.</footer>
  </section>;
};
export default StudentInsights;
