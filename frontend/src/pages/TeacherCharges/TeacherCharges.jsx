import React, { useContext, useEffect, useMemo, useState } from "react";
import { AuthContext } from "../../context/AuthContext";
import { getAcademicOptions } from "../../api/academicApi";
import {
  assignCharge,
  getChargeTypes,
  getTeachers,
  removeCharge,
} from "../../api/chargeApi";
import { scopedProgrammes, scopedSemesters, scopedYears, uniqueNames, validateAcademicCombination } from "../../utils/academicScope";
import { getAttendanceGroups } from "../../api/attendanceApi";
import "./TeacherCharges.css";

const groupFieldByType = { full_section: "full_section", sub_group: "sub_group", lab_batch: "lab_batch", elective: "elective", specialization: "specialization" };

const ScopeSelect = ({ label, value, onChange, options }) => {
  const finalOptions = ["All", ...options.filter((item) => item !== "All")];
  const safeOptions = value && !finalOptions.includes(value) ? [value, ...finalOptions] : finalOptions;
  return (
    <label className="charge-field">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {safeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
};

const TeacherCharges = () => {
  const { user } = useContext(AuthContext);
  const isHod = user?.role === "hod";
  const [teachers, setTeachers] = useState([]);
  const [types, setTypes] = useState([]);
  const [academicOptions, setAcademicOptions] = useState([]);
  const [groupOptions, setGroupOptions] = useState({ full_section: ["All"], sub_group: [], lab_batch: [], elective: [], specialization: [] });
  const [form, setForm] = useState({
    teacherId: "",
    chargeIndex: "",
    department: "All",
    programme: "All",
    year: "All",
    semester: "All",
    section: "All",
    community: "",
    groupType: "full_section",
    groupName: "All",
    subjectId: "",
    subject: "",
  });

  const departments = useMemo(() => uniqueNames(academicOptions, "department"), [academicOptions]);
  const programmes = useMemo(() => form.department === "All" ? [] : scopedProgrammes(academicOptions, form.department), [academicOptions, form.department]);
  const years = useMemo(() => form.programme === "All" ? uniqueNames(academicOptions, "year") : scopedYears(academicOptions, form.programme), [academicOptions, form.programme]);
  const semesters = useMemo(() => form.programme === "All" ? uniqueNames(academicOptions, "semester") : scopedSemesters(academicOptions, form.programme, form.year), [academicOptions, form.programme, form.year]);
  const sections = useMemo(() => uniqueNames(academicOptions, "section"), [academicOptions]);

  const subjectOptions = useMemo(() => {
    return academicOptions
      .filter((item) => item.type === "subject" && item.isActive !== false)
      .filter((item) => form.department === "All" || item.department === form.department)
      .filter((item) => form.programme === "All" || item.programme === form.programme)
      .filter((item) => form.year === "All" || item.year === form.year)
      .filter((item) => form.semester === "All" || item.semester === form.semester)
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }, [academicOptions, form.department, form.programme, form.year, form.semester]);

  const selectedType = types[Number(form.chargeIndex)];
  const isTeachingCharge = selectedType?.type === "teaching";

  const load = async () => {
    const [teacherData, typeData, optionsData] = await Promise.all([
      getTeachers(),
      getChargeTypes(),
      getAcademicOptions(),
    ]);
    setTeachers(teacherData);
    setTypes(typeData);
    setAcademicOptions(optionsData);
  };

  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    const ready = form.department !== "All" && form.programme !== "All" && form.year !== "All" && form.semester !== "All" && form.section !== "All";
    if (!ready) return;
    getAttendanceGroups({ department: form.department, programme: form.programme, year: form.year, semester: form.semester, section: form.section, subjectId: form.subjectId, subject: form.subject })
      .then(setGroupOptions)
      .catch(() => setGroupOptions({ full_section: ["All"], sub_group: [], lab_batch: [], elective: [], specialization: [] }));
  }, [form.department, form.programme, form.year, form.semester, form.section, form.subjectId, form.subject]);

  const activeGroupOptions = useMemo(() => {
    if (form.groupType === "full_section") return ["All"];
    const defaults = ["sub_group", "lab_batch"].includes(form.groupType) ? ["G1", "G2", "G3", "G4", "G5"] : [];
    return [...new Set([...defaults, ...(groupOptions[form.groupType] || []), form.groupName].filter(Boolean))].filter((item) => item !== "All").sort();
  }, [groupOptions, form.groupType, form.groupName]);


  const updateScope = (key, value) => {
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (key === "department") { next.programme = "All"; next.year = "All"; next.semester = "All"; next.subjectId = ""; next.subject = ""; }
      if (key === "programme") { next.year = "All"; next.semester = "All"; next.subjectId = ""; next.subject = ""; }
      if (key === "year") { next.semester = "All"; next.subjectId = ""; next.subject = ""; }
      return next;
    });
  };

  const submit = async (e) => {
    e.preventDefault();

    const selected = types[Number(form.chargeIndex)];

    if (!form.teacherId || !selected) {
      alert("Select teacher and university responsibility");
      return;
    }

    if (form.department !== "All" && form.programme !== "All") {
      const combinationError = validateAcademicCombination(form, academicOptions);
      if (combinationError) {
        alert(combinationError);
        return;
      }
    }

    if (selected.type === "teaching" && !form.subjectId) {
      alert("Select a subject from Subject Master. Manual subject typing is disabled to avoid spelling mismatch.");
      return;
    }

    await assignCharge(form.teacherId, {
      name: selected.name,
      type: selected.type,
      permissions: selected.permissions,
      department: form.department,
      programme: form.programme,
      year: form.year,
      semester: form.semester,
      section: form.section,
      community: form.community,
      groupType: form.groupType,
      groupName: form.groupName,
      subjectId: form.subjectId,
      subject: form.subject,
    });

    alert("Responsibility assigned. Subject and teacher are now linked with exact Subject Master data.");
    load();
  };

  const deleteCharge = async (teacherId, chargeId) => {
    await removeCharge(teacherId, chargeId);
    load();
  };

  return (
    <div className="teacher-charges-page">
      <div className="breadcrumb">Home / University Responsibilities</div>

      <section className="charge-card hero-charge">
        <span>Governance</span>
        <h1>Assign university responsibilities</h1>
        <p>
          Use this for all non-result university work: class incharge, HOD, cultural, sports, NSS, NCC,
          club coordination, announcements, approvals, attendance and timetable responsibilities.
        </p>
      </section>

      <section className="charge-card">
        <h2>New responsibility</h2>
        <p className="muted-text">Programmes and subjects are filtered strictly by Academic Master. HODs see only teachers from their own department here. For another department teacher, use Faculty Requirement Requests.</p>

        <form onSubmit={submit} className="charge-form">
          <label className="charge-field">
            <span>Teacher</span>
            <select value={form.teacherId} onChange={(e) => setForm({ ...form, teacherId: e.target.value })}>
              <option value="">Select Teacher</option>
              {teachers.map((teacher) => (
                <option value={teacher._id} key={teacher._id}>
                  {teacher.name} — {teacher.department || "No Department"}
                </option>
              ))}
            </select>
          </label>

          <label className="charge-field">
            <span>Responsibility</span>
            <select value={form.chargeIndex} onChange={(e) => setForm({ ...form, chargeIndex: e.target.value, subjectId: "", subject: "" })}>
              <option value="">Select Responsibility</option>
              {types.map((type, index) => (
                <option value={index} key={type.type + type.name}>{type.name}</option>
              ))}
            </select>
          </label>

          <ScopeSelect label="Department" value={form.department} onChange={(value) => updateScope("department", value)} options={departments} />
          <ScopeSelect label="Programme" value={form.programme} onChange={(value) => updateScope("programme", value)} options={programmes} />
          <ScopeSelect label="Year" value={form.year} onChange={(value) => updateScope("year", value)} options={years} />
          <ScopeSelect label="Semester" value={form.semester} onChange={(value) => updateScope("semester", value)} options={semesters} />
          <ScopeSelect label="Section" value={form.section} onChange={(value) => updateScope("section", value)} options={sections} />

          <label className="charge-field"><span>Group Type</span><select value={form.groupType} onChange={(e) => setForm({ ...form, groupType: e.target.value, groupName: e.target.value === "full_section" ? "All" : "" })}><option value="full_section">Full Section</option><option value="sub_group">Sub Group</option><option value="lab_batch">Lab Batch</option><option value="elective">Elective Group</option><option value="specialization">Specialization</option></select><small>Groups are not fixed; they come from actual student allocation.</small></label>
          <label className="charge-field"><span>Group Name</span>{form.groupType === "full_section" ? <select value="All" disabled><option value="All">All</option></select> : <><select value={activeGroupOptions.includes(form.groupName) ? form.groupName : "__custom"} onChange={(e) => setForm({ ...form, groupName: e.target.value === "__custom" ? "" : e.target.value })}><option value="">Select Group</option>{activeGroupOptions.map((option) => <option key={option} value={option}>{option}</option>)}<option value="__custom">Add / type group</option></select><input placeholder="A1 / Lab-1 / Elective-1 / AI" value={form.groupName} onChange={(e) => setForm({ ...form, groupName: e.target.value })} /></>}</label>
          <label className="charge-field">
            <span>Subject</span>
            <select
              value={form.subjectId}
              disabled={!isTeachingCharge}
              onChange={(e) => {
                const subject = subjectOptions.find((item) => item._id === e.target.value);
                setForm({
                  ...form,
                  subjectId: e.target.value,
                  subject: subject?.name || "",
                  department: subject?.department || form.department,
                  programme: subject?.programme || form.programme,
                  year: subject?.year || form.year,
                  semester: subject?.semester || form.semester,
                });
              }}
            >
              <option value="">{isTeachingCharge ? "Select Subject from Subject Master" : "Subject not required"}</option>
              {subjectOptions.map((subject) => (
                <option key={subject._id} value={subject._id}>{subject.name} — {subject.code || "No code"} — {subject.credits || 0} credits</option>
              ))}
            </select>
            <small>{isTeachingCharge ? "Subject is selected from Subject Master, so spelling stays same everywhere." : "Only teaching assignments need a subject."}</small>
          </label>
          <label className="charge-field">
            <span>Community / Club</span>
            <input placeholder="Optional" value={form.community} onChange={(e) => setForm({ ...form, community: e.target.value })} />
          </label>

          <button>Assign Responsibility</button>
        </form>
      </section>

      <section className="charge-card">
        <h2>Current responsibilities</h2>

        <div className="teacher-list">
          {teachers.map((teacher) => (
            <article className="teacher-box" key={teacher._id}>
              <h3>{teacher.name}</h3>
              <p>{teacher.email}</p>

              {teacher.charges?.length ? (
                teacher.charges.map((charge) => (
                  <div className="charge-row" key={charge._id}>
                    <div>
                      <b>{charge.name}</b>
                      <span>{charge.department} / {charge.programme} / {charge.year} / {charge.semester} / {charge.section} / {charge.groupType || "full_section"}: {charge.groupName || "All"}</span>
                      <small>{charge.subject ? `Subject: ${charge.subject} • ` : ""}{charge.permissions?.join(", ")}</small>
                    </div>
                    <button onClick={() => deleteCharge(teacher._id, charge._id)}>Remove</button>
                  </div>
                ))
              ) : (
                <p>No responsibilities assigned.</p>
              )}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
};

export default TeacherCharges;
