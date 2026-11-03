import React, { useContext, useEffect, useMemo, useState } from "react";
import { AuthContext } from "../../context/AuthContext";
import { getAcademicOptions } from "../../api/academicApi";
import { getAttendanceGroups, getStudentsForAttendance, markAttendance, updateStudentGroupForAttendance } from "../../api/attendanceApi";
import { scopedProgrammes, scopedSemesters, scopedYears, uniqueNames, validateAcademicCombination } from "../../utils/academicScope";
import "./MarkAttendance.css";

const fallbackSections = ["A", "B", "C"];
const today = new Date().toISOString().slice(0, 10);
const groupFieldByType = { sub_group: "groupName", lab_batch: "labBatch", elective: "electiveGroup", specialization: "specialization" };

const SelectField = ({ label, value, onChange, options = [], required = false, disabled = false }) => {
  const safeOptions = value && !options.includes(value) ? [value, ...options] : options;
  return (
    <label className="attendance-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} required={required} disabled={disabled}>
        <option value="">Select {label}</option>
        {safeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
};

const MarkAttendance = () => {
  const { user } = useContext(AuthContext);
  const [academicOptions, setAcademicOptions] = useState([]);
  const [students, setStudents] = useState([]);
  const [records, setRecords] = useState({});
  const [studentGroups, setStudentGroups] = useState({});
  const [groups, setGroups] = useState({ full_section: ["All"], sub_group: [], lab_batch: [], elective: [], specialization: [] });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [groupSavingId, setGroupSavingId] = useState("");
  const [form, setForm] = useState({
    department: user?.department || "",
    programme: user?.programme || "",
    year: user?.year || "",
    semester: user?.semester || "",
    section: user?.section || "A",
    groupType: "full_section",
    groupName: "All",
    subjectId: "",
    subject: "",
    date: today,
  });

  const departments = useMemo(() => uniqueNames(academicOptions, "department"), [academicOptions]);
  const programmes = useMemo(() => scopedProgrammes(academicOptions, form.department), [academicOptions, form.department]);
  const years = useMemo(() => scopedYears(academicOptions, form.programme, form.department), [academicOptions, form.programme, form.department]);
  const semesters = useMemo(() => scopedSemesters(academicOptions, form.programme, form.year, form.department), [academicOptions, form.programme, form.year, form.department]);
  const sections = useMemo(() => uniqueNames(academicOptions, "section").length ? uniqueNames(academicOptions, "section") : fallbackSections, [academicOptions]);

  const subjectOptions = useMemo(() => academicOptions
    .filter((item) => item.type === "subject" && item.name && item.isActive !== false)
    .filter((item) => !item.department || item.department === form.department)
    .filter((item) => !item.programme || item.programme === form.programme)
    .filter((item) => !item.year || item.year === form.year)
    .filter((item) => !item.semester || item.semester === form.semester)
    .sort((a, b) => String(a.name).localeCompare(String(b.name))), [academicOptions, form.department, form.programme, form.year, form.semester]);

  const activeGroupOptions = useMemo(() => {
    if (form.groupType === "full_section") return ["All"];
    const defaultSubGroups = ["G1", "G2", "G3", "G4", "G5"];
    const defaults = ["sub_group", "lab_batch"].includes(form.groupType) ? defaultSubGroups : [];
    const byType = groups[form.groupType] || [];
    const fromStudents = students.map((student) => student[groupFieldByType[form.groupType]]).filter(Boolean);
    return [...new Set([...defaults, ...byType, ...fromStudents, form.groupName].filter(Boolean))].filter((item) => item !== "All" || form.groupType === "full_section").sort();
  }, [groups, form.groupType, form.groupName, students]);

  useEffect(() => {
    getAcademicOptions().then(setAcademicOptions).catch(console.error);
  }, []);

  useEffect(() => {
    const required = ["department", "programme", "year", "semester", "section"].every((key) => form[key]);
    if (!required) return;
    getAttendanceGroups({
      department: form.department,
      programme: form.programme,
      year: form.year,
      semester: form.semester,
      section: form.section,
      subject: form.subject,
      subjectId: form.subjectId,
    }).then(setGroups).catch(() => setGroups({ full_section: ["All"], sub_group: [], lab_batch: [], elective: [], specialization: [] }));
  }, [form.department, form.programme, form.year, form.semester, form.section, form.subject, form.subjectId]);

  const update = (key, value) => setForm((current) => {
    const next = { ...current, [key]: value };
    if (key === "department") { next.programme = ""; next.year = ""; next.semester = ""; next.subjectId = ""; next.subject = ""; }
    if (key === "programme") { next.year = ""; next.semester = ""; next.subjectId = ""; next.subject = ""; }
    if (key === "year") { next.semester = ""; next.subjectId = ""; next.subject = ""; }
    if (key === "semester") { next.subjectId = ""; next.subject = ""; }
    if (key === "groupType") next.groupName = value === "full_section" ? "All" : "";
    return next;
  });

  const updateSubject = (subjectId) => {
    const subject = subjectOptions.find((item) => item._id === subjectId);
    setForm((current) => ({ ...current, subjectId, subject: subject?.name || "" }));
  };

  const loadStudents = async () => {
    const required = ["department", "programme", "year", "semester", "section", "subjectId"];
    const missing = required.filter((key) => !form[key]);
    if (missing.length) return alert(`Please select ${missing.join(", ")}.`);
    if (form.groupType !== "full_section" && !form.groupName) return alert("Select or type a group name first.");
    const combinationError = validateAcademicCombination(form, academicOptions);
    if (combinationError) return alert(combinationError);
    setLoading(true);
    try {
      const data = await getStudentsForAttendance({
        department: form.department,
        programme: form.programme,
        year: form.year,
        semester: form.semester,
        section: form.section,
        groupType: form.groupType,
        groupName: form.groupName,
        subjectId: form.subjectId,
        subject: form.subject,
      });
      setStudents(data);
      setRecords(Object.fromEntries(data.map((student) => [student._id, "present"])));
      setStudentGroups(Object.fromEntries(data.map((student) => [student._id, {
        groupName: student.groupName || "All",
        labBatch: student.labBatch || "",
        electiveGroup: student.electiveGroup || "",
        specialization: student.specialization || "",
      }])));
      if (!data.length) alert("No students found for this exact class/group. Check student academic details and group allocation in Manage Users or update the group from this page.");
    } catch (error) {
      alert(error.response?.data?.message || "Could not load students");
    } finally {
      setLoading(false);
    }
  };

  const setAll = (status) => setRecords(Object.fromEntries(students.map((student) => [student._id, status])));

  const submit = async (event) => {
    event.preventDefault();
    if (!students.length) return alert("Load students first.");
    setSaving(true);
    try {
      await markAttendance({
        ...form,
        records: students.map((student) => ({ student: student._id, status: records[student._id] || "absent" })),
      });
      alert("Attendance saved successfully.");
    } catch (error) {
      alert(error.response?.data?.message || "Attendance save failed");
    } finally {
      setSaving(false);
    }
  };

  const updateStudentGroup = async (student) => {
    const values = studentGroups[student._id] || {};
    setGroupSavingId(student._id);
    try {
      const updated = await updateStudentGroupForAttendance(student._id, { ...values, subject: form.subject, subjectId: form.subjectId });
      setStudents((current) => current.map((item) => item._id === student._id ? { ...item, ...updated } : item));
      alert("Student group allocation updated.");
    } catch (error) {
      alert(error.response?.data?.message || "Student group could not be updated");
    } finally {
      setGroupSavingId("");
    }
  };

  const presentCount = students.filter((student) => records[student._id] === "present").length;

  return (
    <main className="attendance-page">
      <section className="attendance-hero">
        <span>Attendance</span>
        <h1>Mark class attendance</h1>
        <p>Attendance is linked with Subject Master, Teacher Charges and student group allocation. Theory can use All, while labs/electives can use only the actual groups available for that class.</p>
      </section>

      <section className="attendance-panel">
        <div className="attendance-panel-head">
          <div>
            <h2>Class selector</h2>
            <p>Subjects are selected from Subject Master only. Group list is not fixed to five groups; it comes from actual student allocation.</p>
          </div>
          <button type="button" onClick={loadStudents}>{loading ? "Loading..." : "Load Students"}</button>
        </div>
        <div className="attendance-grid">
          <SelectField label="Department" value={form.department} onChange={(value) => update("department", value)} options={departments} required />
          <SelectField label="Programme" value={form.programme} onChange={(value) => update("programme", value)} options={programmes} required />
          <SelectField label="Year" value={form.year} onChange={(value) => update("year", value)} options={years} required />
          <SelectField label="Semester" value={form.semester} onChange={(value) => update("semester", value)} options={semesters} required />
          <SelectField label="Section" value={form.section} onChange={(value) => update("section", value)} options={sections} required />
          <label className="attendance-field"><span>Group Type</span><select value={form.groupType} onChange={(e) => update("groupType", e.target.value)}><option value="full_section">Full Section</option><option value="sub_group">Sub Group</option><option value="lab_batch">Lab Batch</option><option value="elective">Elective</option><option value="specialization">Specialization</option></select></label>
          <label className="attendance-field"><span>Group Name</span>{form.groupType === "full_section" ? <select value="All" disabled><option value="All">All</option></select> : <><select value={activeGroupOptions.includes(form.groupName) ? form.groupName : "__custom"} onChange={(e) => update("groupName", e.target.value === "__custom" ? "" : e.target.value)}><option value="">Select Group</option>{activeGroupOptions.map((option) => <option key={option} value={option}>{option}</option>)}<option value="__custom">Add / type new group</option></select><input placeholder="Example: A1, Lab-1, Elective-1" value={form.groupName} onChange={(e) => update("groupName", e.target.value)} /></>}</label>
          <label className="attendance-field"><span>Date</span><input type="date" value={form.date} onChange={(e) => update("date", e.target.value)} /></label>
          <label className="attendance-field"><span>Subject</span><select value={form.subjectId} onChange={(e) => updateSubject(e.target.value)} required><option value="">Select Subject from Subject Master</option>{subjectOptions.map((subject) => <option key={subject._id} value={subject._id}>{subject.name} — {subject.code || "No code"}</option>)}</select></label>
        </div>
      </section>

      <form className="attendance-panel" onSubmit={submit}>
        <div className="attendance-panel-head">
          <div>
            <h2>Student list</h2>
            <p>{students.length ? `${presentCount}/${students.length} marked present` : "Load students to start marking."}</p>
          </div>
          <div className="attendance-actions">
            <button type="button" className="ghost" onClick={() => setAll("present")} disabled={!students.length}>All Present</button>
            <button type="button" className="ghost" onClick={() => setAll("absent")} disabled={!students.length}>All Absent</button>
            <button disabled={!students.length || saving}>{saving ? "Saving..." : "Save Attendance"}</button>
          </div>
        </div>

        <div className="student-attendance-list">
          {students.length ? students.map((student) => (
            <div className="student-attendance-row" key={student._id}>
              <div>
                <b>{student.rollNumber || "No roll"} • {student.name}</b>
                <p>{student.email}</p>
                <small>Sub group: {student.groupName || "All"} • Lab: {student.labBatch || "-"} • Elective: {student.electiveGroup || "-"} • Spl: {student.specialization || "-"}</small>
                <div className="inline-group-editor">
                  <input placeholder="Sub group" value={studentGroups[student._id]?.groupName || ""} onChange={(e) => setStudentGroups((current) => ({ ...current, [student._id]: { ...(current[student._id] || {}), groupName: e.target.value } }))} />
                  <input placeholder="Lab batch" value={studentGroups[student._id]?.labBatch || ""} onChange={(e) => setStudentGroups((current) => ({ ...current, [student._id]: { ...(current[student._id] || {}), labBatch: e.target.value } }))} />
                  <input placeholder="Elective" value={studentGroups[student._id]?.electiveGroup || ""} onChange={(e) => setStudentGroups((current) => ({ ...current, [student._id]: { ...(current[student._id] || {}), electiveGroup: e.target.value } }))} />
                  <input placeholder="Specialization" value={studentGroups[student._id]?.specialization || ""} onChange={(e) => setStudentGroups((current) => ({ ...current, [student._id]: { ...(current[student._id] || {}), specialization: e.target.value } }))} />
                  <button type="button" className="ghost" onClick={() => updateStudentGroup(student)} disabled={groupSavingId === student._id}>{groupSavingId === student._id ? "Saving..." : "Update Group"}</button>
                </div>
              </div>
              <div className="status-toggle">
                <label><input type="radio" name={student._id} checked={records[student._id] === "present"} onChange={() => setRecords((current) => ({ ...current, [student._id]: "present" }))} /> Present</label>
                <label><input type="radio" name={student._id} checked={records[student._id] === "absent"} onChange={() => setRecords((current) => ({ ...current, [student._id]: "absent" }))} /> Absent</label>
              </div>
            </div>
          )) : <div className="empty-attendance">No students loaded yet.</div>}
        </div>
      </form>
    </main>
  );
};

export default MarkAttendance;
