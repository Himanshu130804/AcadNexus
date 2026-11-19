import React, { useContext, useEffect, useMemo, useState } from "react";
import { AuthContext } from "../../context/AuthContext";
import { getAcademicOptions } from "../../api/academicApi";
import { submitContent } from "../../api/contentApi";
import "./SubmitContent.css";

const fallbackSections = ["A", "B", "C"];

const getNameList = (options, type) =>
  options
    .filter((option) => option.type === type && option.name)
    .map((option) => option.name)
    .filter((name, index, list) => name && list.indexOf(name) === index);

const SelectField = ({ label, value, onChange, options = [], required = false }) => {
  const safeOptions = value && !options.includes(value) ? [value, ...options] : options;
  return (
    <label className="submit-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} required={required}>
        <option value="">Select {label}</option>
        {safeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
};

const initialForm = (user) => ({
  type: "post",
  category: "general",
  title: "",
  body: "",
  department: user?.department || "",
  programme: user?.programme || "",
  year: user?.year || "",
  semester: user?.semester || "",
  section: user?.section || "A",
  subject: "",
  visibility: "all",
  targetDepartment: user?.department || "",
  targetProgramme: user?.programme || "",
  targetYear: user?.year || "",
  targetSemester: user?.semester || "",
  targetSection: user?.section || "A",
  community: "",
  eventDate: "",
  eventTime: "",
  venue: "",
  deadline: "",
});

const SubmitContent = () => {
  const { user } = useContext(AuthContext);
  const [academicOptions, setAcademicOptions] = useState([]);
  const [form, setForm] = useState(initialForm(user));
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getAcademicOptions().then(setAcademicOptions).catch(console.error);
  }, []);

  const departments = useMemo(() => getNameList(academicOptions, "department"), [academicOptions]);
  const programmes = useMemo(() => getNameList(academicOptions, "programme"), [academicOptions]);
  const years = useMemo(() => getNameList(academicOptions, "year"), [academicOptions]);
  const semesters = useMemo(() => getNameList(academicOptions, "semester"), [academicOptions]);
  const sections = useMemo(() => getNameList(academicOptions, "section").length ? getNameList(academicOptions, "section") : fallbackSections, [academicOptions]);
  const subjects = useMemo(() => {
    const scoped = academicOptions.filter((option) => {
      if (option.type !== "subject") return false;
      return (!option.department || option.department === form.department || option.department === form.targetDepartment) &&
        (!option.programme || option.programme === form.programme || option.programme === form.targetProgramme) &&
        (!option.year || option.year === form.year || option.year === form.targetYear) &&
        (!option.semester || option.semester === form.semester || option.semester === form.targetSemester);
    });
    return scoped.map((option) => option.name).filter((name, index, list) => name && list.indexOf(name) === index);
  }, [academicOptions, form]);

  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async (e) => {
    e.preventDefault();

    if (!form.title.trim()) return alert("Title is required.");
    if (!form.body.trim() && !file) return alert("Add a description or upload a file.");
    if (form.visibility === "department" && !form.targetDepartment) return alert("Target department is required.");
    if (form.visibility === "class") {
      const missing = ["targetDepartment", "targetProgramme", "targetYear", "targetSemester", "targetSection"].filter((key) => !form[key]);
      if (missing.length) return alert("Select full class target: department, programme, year, semester and section.");
    }
    if (form.type === "event" && !form.eventDate) return alert("Event date is required.");
    if (form.type === "note" && !form.subject.trim()) return alert("Subject is required for notes.");

    const data = new FormData();
    Object.entries(form).forEach(([key, value]) => data.append(key, value || ""));
    data.append("targetDepartments", form.visibility === "all" ? "" : form.targetDepartment);
    data.append("targetProgrammes", form.visibility === "class" ? form.targetProgramme : "");
    data.append("targetYears", form.visibility === "class" ? form.targetYear : "");
    data.append("targetSemesters", form.visibility === "class" ? form.targetSemester : "");
    data.append("targetSections", form.visibility === "class" ? form.targetSection : "");
    data.append("targetCommunity", form.visibility === "community" ? form.community : "");
    if (file) data.append("file", file);

    setSubmitting(true);
    try {
      const saved = await submitContent(data);
      alert(saved.status === "approved" ? "Content published." : "Content submitted for approval.");
      setForm(initialForm(user));
      setFile(null);
    } catch (error) {
      alert(error.response?.data?.message || "Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="submit-page">
      <section className="submit-hero">
        <span>Content Studio</span>
        <h1>Create posts, notes, events and notices</h1>
        <p>Use one clean form for campus posts. Select a target so students only see content relevant to their class, department or community.</p>
      </section>

      <form className="submit-card" onSubmit={submit}>
        <div className="submit-section-title">
          <h2>Content details</h2>
          <p>Teachers with permission and Super Admin publish directly. Other submissions go to Approval Center.</p>
        </div>

        <div className="submit-grid">
          <label className="submit-field"><span>Content Type</span><select value={form.type} onChange={(e) => update("type", e.target.value)}><option value="post">Post / Discussion</option><option value="note">Notes / Study Material</option><option value="event">Event</option><option value="announcement">Announcement / Notice</option><option value="assignment">Assignment</option></select></label>
          <label className="submit-field"><span>Category</span><select value={form.category} onChange={(e) => update("category", e.target.value)}><option value="general">General</option><option value="academic">Academic</option><option value="department">Department</option><option value="exam">Exam</option><option value="placement">Placement</option><option value="club">Club</option><option value="sports">Sports</option><option value="cultural">Cultural</option><option value="library">Library</option></select></label>
          <label className="submit-field"><span>Visibility</span><select value={form.visibility} onChange={(e) => update("visibility", e.target.value)}><option value="all">All Campus</option><option value="department">Department Only</option><option value="class">Specific Class</option><option value="community">Community</option></select></label>
        </div>

        <label className="submit-field wide"><span>Title</span><input placeholder="Clear title" value={form.title} onChange={(e) => update("title", e.target.value)} /></label>
        <label className="submit-field wide"><span>Description</span><textarea rows="5" placeholder="Write the details students need..." value={form.body} onChange={(e) => update("body", e.target.value)} /></label>

        <div className="submit-section-title"><h2>Source / academic details</h2></div>
        <div className="submit-grid">
          <SelectField label="Department" value={form.department} onChange={(value) => update("department", value)} options={departments} />
          <SelectField label="Programme" value={form.programme} onChange={(value) => update("programme", value)} options={programmes} />
          <SelectField label="Year" value={form.year} onChange={(value) => update("year", value)} options={years} />
          <SelectField label="Semester" value={form.semester} onChange={(value) => update("semester", value)} options={semesters} />
          <SelectField label="Section" value={form.section} onChange={(value) => update("section", value)} options={sections} />
          {subjects.length ? <SelectField label="Subject" value={form.subject} onChange={(value) => update("subject", value)} options={subjects} /> : <label className="submit-field"><span>Subject</span><input placeholder="Subject" value={form.subject} onChange={(e) => update("subject", e.target.value)} /></label>}
        </div>

        {form.visibility !== "all" && <div className="submit-section-title"><h2>Target audience</h2></div>}
        {form.visibility === "department" && <div className="submit-grid"><SelectField label="Target Department" value={form.targetDepartment} onChange={(value) => update("targetDepartment", value)} options={departments} required /></div>}
        {form.visibility === "class" && <div className="submit-grid"><SelectField label="Target Department" value={form.targetDepartment} onChange={(value) => update("targetDepartment", value)} options={departments} required /><SelectField label="Target Programme" value={form.targetProgramme} onChange={(value) => update("targetProgramme", value)} options={programmes} required /><SelectField label="Target Year" value={form.targetYear} onChange={(value) => update("targetYear", value)} options={years} required /><SelectField label="Target Semester" value={form.targetSemester} onChange={(value) => update("targetSemester", value)} options={semesters} required /><SelectField label="Target Section" value={form.targetSection} onChange={(value) => update("targetSection", value)} options={sections} required /></div>}
        {form.visibility === "community" && <label className="submit-field wide"><span>Community Name</span><input placeholder="Community name" value={form.community} onChange={(e) => update("community", e.target.value)} /></label>}

        {(form.type === "event" || form.type === "assignment") && <div className="submit-grid"><label className="submit-field"><span>{form.type === "event" ? "Event Date" : "Deadline"}</span><input type="date" value={form.type === "event" ? form.eventDate : form.deadline} onChange={(e) => update(form.type === "event" ? "eventDate" : "deadline", e.target.value)} /></label>{form.type === "event" && <label className="submit-field"><span>Event Time</span><input type="time" value={form.eventTime} onChange={(e) => update("eventTime", e.target.value)} /></label>}<label className="submit-field"><span>Venue / Room</span><input placeholder="Venue" value={form.venue} onChange={(e) => update("venue", e.target.value)} /></label></div>}

        <label className="file-upload">
          <strong>Upload file</strong>
          <span>PDF, Word, Excel, PPT, JPG, PNG, WEBP up to 20MB</span>
          <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.webp" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </label>

        {file && <p className="selected-file">Selected: {file.name}</p>}

        <div className="submit-actions"><button disabled={submitting}>{submitting ? "Submitting..." : "Submit Content"}</button></div>
      </form>
    </main>
  );
};

export default SubmitContent;
