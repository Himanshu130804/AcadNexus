import React, { useContext, useEffect, useMemo, useState } from "react";
import { getFileUrl } from "../../utils/fileUrl";
import { AuthContext } from "../../context/AuthContext";
import { createAssignment, getAssignments, getMyAssignments, saveAssignment, submitAssignment } from "../../api/assignmentApi";
import { getMyTeachingAssignments } from "../../api/chargeApi";
import "./Assignments.css";


const emptyForm = { title: "", description: "", subject: "", department: "", programme: "", year: "", semester: "", section: "A", groupType: "full_section", groupName: "All", deadline: "", maxMarks: "" };

const Assignments = () => {
  const { user } = useContext(AuthContext);
  const isTeacher = ["teacher", "teacher_admin", "hod", "super_admin"].includes(user?.role);
  const [items, setItems] = useState([]);
  const [teaching, setTeaching] = useState([]);
  const [selectedCharge, setSelectedCharge] = useState("");
  const [filters, setFilters] = useState({ search: "", department: "", semester: "", subject: "" });
  const [form, setForm] = useState(emptyForm);
  const [file, setFile] = useState(null);
  const [submitFiles, setSubmitFiles] = useState({});

  const load = async () => {
    const data = isTeacher ? await getAssignments(filters) : await getMyAssignments();
    setItems(data);
  };

  useEffect(() => { load(); }, [isTeacher]);
  useEffect(() => {
    if (isTeacher) getMyTeachingAssignments().then(setTeaching).catch(() => setTeaching([]));
  }, [isTeacher]);

  const chargeOptions = useMemo(() => teaching.filter((charge) => charge.subject), [teaching]);

  const applyCharge = (id) => {
    setSelectedCharge(id);
    const charge = chargeOptions.find((item) => String(item._id) === String(id));
    if (!charge) return;
    setForm((current) => ({ ...current, ...charge, title: current.title, description: current.description, deadline: current.deadline, maxMarks: current.maxMarks }));
  };

  const submit = async (e) => {
    e.preventDefault();
    const data = new FormData();
    Object.entries(form).forEach(([k, v]) => data.append(k, v || ""));
    if (file) data.append("file", file);
    await createAssignment(data);
    alert("Subject-wise assignment posted");
    setForm(emptyForm);
    setSelectedCharge("");
    setFile(null);
    load();
  };

  const submitWork = async (assignmentId) => {
    const upload = submitFiles[assignmentId];
    if (!upload) return alert("Choose a file first");
    const data = new FormData();
    data.append("file", upload);
    await submitAssignment(assignmentId, data);
    alert("Assignment submitted");
    setSubmitFiles((current) => ({ ...current, [assignmentId]: null }));
    load();
  };

  return (
    <main className="feature-page assignments-page">
      <section className="feature-hero compact-hero">
        <span>Subject-wise Assignments</span>
        <h1>Assignment workspace</h1>
        <p>Assignments are now tied to exact teacher charges: department, programme, year, semester, section, group and subject.</p>
      </section>

      <section className="feature-panel">
        <div className="feature-form">
          <input placeholder="Search" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} />
          <input placeholder="Department" value={filters.department} onChange={(e) => setFilters({ ...filters, department: e.target.value })} />
          <input placeholder="Semester" value={filters.semester} onChange={(e) => setFilters({ ...filters, semester: e.target.value })} />
          <input placeholder="Subject" value={filters.subject} onChange={(e) => setFilters({ ...filters, subject: e.target.value })} />
          <button onClick={load}>Search</button>
        </div>
      </section>

      {isTeacher && (
        <section className="feature-panel">
          <h2>Post assignment for assigned class</h2>
          <p className="muted-text">Teachers can post only for classes/subjects assigned by HOD or Super Admin. One teacher may have charges across multiple departments.</p>
          <form className="feature-form" onSubmit={submit}>
            <select value={selectedCharge} onChange={(e) => applyCharge(e.target.value)}>
              <option value="">Select assigned subject/class</option>
              {chargeOptions.map((charge) => <option key={charge._id} value={charge._id}>{charge.label}</option>)}
            </select>
            <input placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <input placeholder="Subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
            <input placeholder="Department" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
            <input placeholder="Programme" value={form.programme} onChange={(e) => setForm({ ...form, programme: e.target.value })} />
            <input placeholder="Year" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} />
            <input placeholder="Semester" value={form.semester} onChange={(e) => setForm({ ...form, semester: e.target.value })} />
            <input placeholder="Section" value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value })} />
            <select value={form.groupType} onChange={(e) => setForm({ ...form, groupType: e.target.value, groupName: e.target.value === "full_section" ? "All" : form.groupName })}>
              <option value="full_section">Full Section</option><option value="sub_group">Sub Group</option><option value="lab_batch">Lab Batch</option><option value="elective">Elective</option><option value="specialization">Specialization</option>
            </select>
            <input placeholder="Group Name" value={form.groupName} onChange={(e) => setForm({ ...form, groupName: e.target.value })} />
            <input type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} />
            <input placeholder="Max Marks" value={form.maxMarks} onChange={(e) => setForm({ ...form, maxMarks: e.target.value })} />
            <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            <textarea placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <button>Post Assignment</button>
          </form>
        </section>
      )}

      <section className="feature-grid">
        {items.map((item) => {
          const mySubmission = item.submissions?.find((entry) => String(entry.student?._id || entry.student) === String(user?._id));
          return (
            <article className="feature-card" key={item._id}>
              <span className="feature-tag">{item.subject}</span>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
              <p>{item.department} • {item.programme || "Programme"} • Year {item.year || "—"} • Sem {item.semester} • Section {item.section} {item.groupName && item.groupName !== "All" ? `• ${item.groupName}` : ""}</p>
              {item.deadline && <p><b>Deadline:</b> {new Date(item.deadline).toLocaleDateString()}</p>}
              {item.maxMarks && <p><b>Max marks:</b> {item.maxMarks}</p>}
              {item.fileUrl && <a className="feature-btn" href={getFileUrl(item.fileUrl)} target="_blank" rel="noreferrer" download>Download Attachment</a>}
              {user && <button className="feature-btn alt" onClick={() => saveAssignment(item._id)}>Save</button>}

              {!isTeacher && (
                <div className="submission-box">
                  <b>{mySubmission ? `Submitted${mySubmission.marks !== undefined ? ` • Marks: ${mySubmission.marks}` : ""}` : "Submit your work"}</b>
                  {mySubmission?.feedback && <p>Feedback: {mySubmission.feedback}</p>}
                  <input type="file" onChange={(e) => setSubmitFiles((current) => ({ ...current, [item._id]: e.target.files?.[0] || null }))} />
                  <button className="feature-btn" onClick={() => submitWork(item._id)}>{mySubmission ? "Resubmit" : "Submit"}</button>
                </div>
              )}

              {isTeacher && item.submissions?.length ? (
                <div className="submission-box">
                  <b>{item.submissions.length} submission(s)</b>
                  {item.submissions.slice(0, 5).map((sub) => <p key={sub._id}>{sub.student?.rollNumber || "No roll"} • {sub.student?.name} {sub.marks !== undefined ? `• ${sub.marks} marks` : ""}</p>)}
                </div>
              ) : null}
            </article>
          );
        })}
      </section>
    </main>
  );
};

export default Assignments;
