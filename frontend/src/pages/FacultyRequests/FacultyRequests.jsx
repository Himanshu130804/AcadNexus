import React, { useContext, useEffect, useMemo, useState } from "react";
import { getAcademicOptions } from "../../api/academicApi";
import { cancelFacultyRequest, createFacultyRequest, decideFacultyRequest, getCandidateTeachers, getFacultyRequests } from "../../api/facultyRequestApi";
import { AuthContext } from "../../context/AuthContext";
import { scopedProgrammes, scopedSemesters, scopedYears, uniqueNames, validateAcademicCombination } from "../../utils/academicScope";
import "./FacultyRequests.css";

const statusClass = (status) => `status-pill ${status || "pending"}`;

const FacultyRequests = () => {
  const { user } = useContext(AuthContext);
  const [academicOptions, setAcademicOptions] = useState([]);
  const [requests, setRequests] = useState([]);
  const [box, setBox] = useState("all");
  const [candidates, setCandidates] = useState({});
  const [selectedTeachers, setSelectedTeachers] = useState({});
  const [decisionNotes, setDecisionNotes] = useState({});
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    requestingDepartment: user?.department || "",
    targetDepartment: "",
    programme: "",
    year: "All",
    semester: "",
    section: "All",
    groupType: "full_section",
    groupName: "All",
    subject: "",
    lecturesPerWeek: 3,
    expectedHoursPerWeek: 3,
    reason: "",
  });

  const departments = useMemo(() => uniqueNames(academicOptions, "department"), [academicOptions]);
  const programmes = useMemo(() => form.requestingDepartment ? scopedProgrammes(academicOptions, form.requestingDepartment) : [], [academicOptions, form.requestingDepartment]);
  const years = useMemo(() => form.programme ? scopedYears(academicOptions, form.programme) : uniqueNames(academicOptions, "year"), [academicOptions, form.programme]);
  const semesters = useMemo(() => form.programme ? scopedSemesters(academicOptions, form.programme, form.year) : uniqueNames(academicOptions, "semester"), [academicOptions, form.programme, form.year]);
  const sections = useMemo(() => uniqueNames(academicOptions, "section"), [academicOptions]);

  const load = async () => {
    setLoading(true);
    try {
      const [options, list] = await Promise.all([getAcademicOptions(), getFacultyRequests({ box })]);
      setAcademicOptions(options);
      setRequests(list);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [box]);

  const updateForm = (key, value) => {
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (key === "requestingDepartment") { next.programme = ""; next.year = "All"; next.semester = ""; }
      if (key === "programme") { next.year = "All"; next.semester = ""; }
      if (key === "year") next.semester = "";
      if (key === "groupType" && value === "full_section") next.groupName = "All";
      return next;
    });
  };

  const submit = async (e) => {
    e.preventDefault();
    const combinationError = validateAcademicCombination({ ...form, department: form.requestingDepartment }, academicOptions);
    if (combinationError) return alert(combinationError);
    if (!form.targetDepartment || !form.subject || !form.programme || !form.semester) return alert("Fill target department, programme, semester and subject.");
    if (form.requestingDepartment.toLowerCase() === form.targetDepartment.toLowerCase()) return alert("For same department, assign teacher charge directly.");
    await createFacultyRequest(form);
    alert("Faculty requirement request sent to the target department HOD.");
    setForm({ ...form, targetDepartment: "", subject: "", reason: "" });
    setBox("outgoing");
    load();
  };

  const loadCandidates = async (department, requestId) => {
    const list = await getCandidateTeachers(department);
    setCandidates((current) => ({ ...current, [requestId]: list }));
  };

  const approve = async (request) => {
    const teacherId = selectedTeachers[request._id];
    if (!teacherId) return alert("Select the teacher to assign from your department.");
    await decideFacultyRequest(request._id, { action: "approve", teacherId, decisionNote: decisionNotes[request._id] || "" });
    alert("Request approved and teacher charge created.");
    load();
  };

  const reject = async (request) => {
    await decideFacultyRequest(request._id, { action: "reject", decisionNote: decisionNotes[request._id] || "" });
    alert("Request rejected.");
    load();
  };

  const cancel = async (request) => {
    await cancelFacultyRequest(request._id);
    alert("Request cancelled.");
    load();
  };

  const isIncomingForMe = (request) => user?.role === "super_admin" || request.targetDepartment?.toLowerCase() === user?.department?.toLowerCase();
  const isOutgoingByMe = (request) => request.requestingDepartment?.toLowerCase() === user?.department?.toLowerCase();

  return (
    <div className="faculty-request-page">
      <div className="breadcrumb">Home / Faculty Requirements</div>
      <section className="fr-hero">
        <span>Inter-department workflow</span>
        <h1>Faculty requirement requests</h1>
        <p>Requesting HOD sends a requirement. The expert/home department HOD chooses the suitable teacher. Only after approval is the teacher charge created.</p>
      </section>

      <section className="fr-grid">
        <form className="fr-card fr-form" onSubmit={submit}>
          <h2>Create requirement</h2>
          <label><span>Requesting Department</span><select disabled={user?.role === "hod"} value={form.requestingDepartment} onChange={(e) => updateForm("requestingDepartment", e.target.value)}><option value="">Select</option>{departments.map((d) => <option key={d} value={d}>{d}</option>)}</select></label>
          <label><span>Expert / Home Department</span><select value={form.targetDepartment} onChange={(e) => updateForm("targetDepartment", e.target.value)}><option value="">Select</option>{departments.filter((d) => d !== form.requestingDepartment).map((d) => <option key={d} value={d}>{d}</option>)}</select></label>
          <label><span>Programme</span><select value={form.programme} onChange={(e) => updateForm("programme", e.target.value)}><option value="">Select</option>{programmes.map((p) => <option key={p} value={p}>{p}</option>)}</select></label>
          <label><span>Year</span><select value={form.year} onChange={(e) => updateForm("year", e.target.value)}><option value="All">All</option>{years.map((y) => <option key={y} value={y}>{y}</option>)}</select></label>
          <label><span>Semester</span><select value={form.semester} onChange={(e) => updateForm("semester", e.target.value)}><option value="">Select</option>{semesters.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
          <label><span>Section</span><select value={form.section} onChange={(e) => updateForm("section", e.target.value)}><option value="All">All</option>{sections.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
          <label><span>Group Type</span><select value={form.groupType} onChange={(e) => updateForm("groupType", e.target.value)}><option value="full_section">Full Section</option><option value="sub_group">Sub Group</option><option value="lab_batch">Lab Batch</option><option value="elective">Elective</option><option value="specialization">Specialization</option></select></label>
          <label><span>Group Name</span><input value={form.groupName} onChange={(e) => updateForm("groupName", e.target.value)} placeholder="All / A1 / Lab-1 / Elective-1" /></label>
          <label><span>Subject Needed</span><input value={form.subject} onChange={(e) => updateForm("subject", e.target.value)} placeholder="DBMS / AI / Data Structures" /></label>
          <label><span>Lectures / Week</span><input type="number" min="1" value={form.lecturesPerWeek} onChange={(e) => updateForm("lecturesPerWeek", e.target.value)} /></label>
          <label className="full"><span>Reason / Notes</span><textarea value={form.reason} onChange={(e) => updateForm("reason", e.target.value)} placeholder="Why this department support is needed" /></label>
          <button>Send Request</button>
        </form>

        <section className="fr-card">
          <div className="fr-head">
            <h2>Requests</h2>
            <select value={box} onChange={(e) => setBox(e.target.value)}><option value="all">All</option><option value="incoming">Incoming</option><option value="outgoing">Outgoing</option></select>
          </div>
          {loading ? <p>Loading requests...</p> : null}
          <div className="fr-list">
            {requests.map((request) => (
              <article className="fr-request" key={request._id}>
                <div className="fr-request-top"><b>{request.subject}</b><span className={statusClass(request.status)}>{request.status}</span></div>
                <p>{request.requestingDepartment} requested faculty from {request.targetDepartment}</p>
                <small>{request.programme} / {request.year} / {request.semester} / {request.section} / {request.groupType}: {request.groupName} • {request.lecturesPerWeek} lectures/week</small>
                {request.assignedTeacher ? <p className="fr-assigned">Assigned: {request.assignedTeacher.name} ({request.assignedTeacher.department})</p> : null}
                {request.reason ? <p className="fr-note">{request.reason}</p> : null}

                {request.status === "pending" && isIncomingForMe(request) ? (
                  <div className="decision-box">
                    {!candidates[request._id] ? <button type="button" onClick={() => loadCandidates(request.targetDepartment, request._id)}>Load {request.targetDepartment} Teachers</button> : (
                      <select value={selectedTeachers[request._id] || ""} onChange={(e) => setSelectedTeachers({ ...selectedTeachers, [request._id]: e.target.value })}>
                        <option value="">Select teacher from {request.targetDepartment}</option>
                        {candidates[request._id].map((teacher) => <option key={teacher._id} value={teacher._id}>{teacher.name} — {teacher.employeeId || teacher.email}</option>)}
                      </select>
                    )}
                    <input placeholder="Decision note" value={decisionNotes[request._id] || ""} onChange={(e) => setDecisionNotes({ ...decisionNotes, [request._id]: e.target.value })} />
                    <div className="decision-actions"><button type="button" onClick={() => approve(request)}>Approve & Assign</button><button type="button" className="ghost-danger" onClick={() => reject(request)}>Reject</button></div>
                  </div>
                ) : null}

                {request.status === "pending" && isOutgoingByMe(request) ? <button className="ghost-danger" onClick={() => cancel(request)}>Cancel Request</button> : null}
              </article>
            ))}
            {!requests.length && !loading ? <div className="empty-state"><b>No faculty requests yet.</b><span>Create an inter-department requirement or check incoming requests.</span></div> : null}
          </div>
        </section>
      </section>
    </div>
  );
};

export default FacultyRequests;
