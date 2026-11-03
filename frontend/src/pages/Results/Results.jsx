import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { FiAward, FiCheckCircle, FiRefreshCw, FiUploadCloud } from "react-icons/fi";
import { AuthContext } from "../../context/AuthContext";
import { getOfficialResults, publishOfficialResult } from "../../api/officialResultApi";
import "./Results.css";

const managerRoles = ["edp", "super_admin", "institute_admin", "vice_chancellor"];
const formatDate = (value) => value ? new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const Results = () => {
  const { user } = useContext(AuthContext);
  const isManager = managerRoles.includes(user?.role);
  const isStudent = user?.role === "student";
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [semester, setSemester] = useState("");
  const [examSession, setExamSession] = useState("");
  const [includeDrafts, setIncludeDrafts] = useState(isManager);
  const [publishing, setPublishing] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await getOfficialResults({ semester: semester || undefined, examSession: examSession || undefined, includeDrafts: isManager ? includeDrafts : false, limit: 100 });
      setItems(response?.items || []);
    } catch (err) {
      setError(err?.response?.data?.message || "Unable to load results.");
    } finally { setLoading(false); }
  }, [semester, examSession, includeDrafts, isManager]);

  useEffect(() => { load(); }, [load]);

  const publish = async (id) => {
    setPublishing(id); setError("");
    try { await publishOfficialResult(id, "Published from Results workspace"); await load(); }
    catch (err) { setError(err?.response?.data?.message || "Unable to publish this result."); }
    finally { setPublishing(""); }
  };

  const title = isStudent ? "My Results" : user?.role === "teacher" ? "Student Results" : "Results Management";
  const subtitle = isStudent ? "View your officially published academic results." : user?.role === "teacher" ? "View published results for students in your assigned teaching classes." : "Review official results for your institute and publish validated drafts.";
  const summary = useMemo(() => ({ total: items.length, published: items.filter((i) => i.status === "published").length, drafts: items.filter((i) => i.status === "draft").length }), [items]);

  return <main className="results-page">
    <section className="results-hero">
      <div><span className="results-eyebrow"><FiAward /> Academic records</span><h1>{title}</h1><p>{subtitle}</p></div>
      <button className="results-refresh" onClick={load} disabled={loading}><FiRefreshCw /> {loading ? "Loading…" : "Refresh"}</button>
    </section>

    <section className="results-toolbar">
      <label>Semester<input value={semester} onChange={(e) => setSemester(e.target.value)} placeholder="e.g. 6" /></label>
      <label>Exam session<input value={examSession} onChange={(e) => setExamSession(e.target.value)} placeholder="e.g. May 2026" /></label>
      {isManager && <label className="results-check"><input type="checkbox" checked={includeDrafts} onChange={(e) => setIncludeDrafts(e.target.checked)} /> Show drafts</label>}
      <div className="results-summary"><span>{summary.total} records</span>{isManager && <><span>{summary.published} published</span><span>{summary.drafts} drafts</span></>}</div>
    </section>

    {error && <div className="results-alert" role="alert">{error}</div>}
    {loading ? <div className="results-empty">Loading results…</div> : !items.length ? <div className="results-empty"><FiAward /><h2>No results found</h2><p>{isStudent ? "Your published results will appear here after the official result workflow is completed." : "No result records match the selected filters."}</p></div> :
      <section className="results-table-wrap"><table className="results-table"><thead><tr><th>Student / Roll No.</th><th>Course</th><th>Semester</th><th>Exam session</th><th>Marks</th><th>Grade</th><th>Status</th>{isManager && <th>Action</th>}</tr></thead><tbody>{items.map((item) => <tr key={item._id}>
        <td><strong>{isStudent ? user?.name : item.rollNumber}</strong><small>{item.rollNumber}</small></td>
        <td><strong>{item.courseCode}</strong><small>{item.courseName}</small></td><td>{item.semester}</td><td>{item.examSession}<small>{formatDate(item.publishedAt)}</small></td>
        <td>{item.marks} / {item.maxMarks}</td><td><span className="grade-pill">{item.grade || "—"}</span></td><td><span className={`status-pill ${item.status}`}>{item.status}</span></td>
        {isManager && <td>{item.status === "draft" ? <button className="publish-btn" onClick={() => publish(item._id)} disabled={publishing === item._id}><FiCheckCircle /> {publishing === item._id ? "Publishing…" : "Publish"}</button> : <span className="published-label"><FiCheckCircle /> Published</span>}</td>}
      </tr>)}</tbody></table></section>}
    {isManager && <div className="results-note"><FiUploadCloud /><span>Official result uploads are validated before they enter this workspace. Use the EDP result ingestion workflow for batch uploads; institute managers and the VC can review and publish drafts within their institute.</span></div>}
  </main>;
};
export default Results;
