import React, { useContext, useEffect, useMemo, useState } from "react";
import { AuthContext } from "../context/AuthContext";
import {
  createAcademicOption,
  getAcademicOptions,
  getRegistrationAcademicOptions,
  setAcademicOptionStatus,
  updateAcademicOption
} from "../api/academicApi";
import { scopedProgrammes, scopedSemesters, scopedYears, uniqueNames } from "../utils/academicScope";
import "./AcademicMaster/AcademicMaster.css";

const initial = {
  name: "", code: "", department: "", programme: "", year: "", semester: "",
  category: "Core", basketName: "Core Subjects", basketType: "core", selectionLimit: 0,
  credits: 4
};

const categoryMap = {
  Core: { basketName: "Core Subjects", basketType: "core", selectionLimit: 0 },
  Elective: { basketName: "Elective Basket 1", basketType: "elective", selectionLimit: 1 },
  Specialization: { basketName: "Specialization Basket", basketType: "specialization", selectionLimit: 1 },
  Lab: { basketName: "Lab Subjects", basketType: "lab", selectionLimit: 0 },
  Tutorial: { basketName: "Tutorial Subjects", basketType: "tutorial", selectionLimit: 0 },
};

const normalize = (value = "") => String(value).trim().toLowerCase();

const SubjectMaster = () => {
  const { user } = useContext(AuthContext);
  const isHod = user?.role === "hod";
  const canManage = ["super_admin", "edp", "hod", "teacher_admin"].includes(user?.role);
  const [items, setItems] = useState([]);
  const [registrationDepartments, setRegistrationDepartments] = useState([]);
  const [form, setForm] = useState({ ...initial, department: isHod ? (user?.department || "") : "" });
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
  try {
    const [academicItems, registrationOptions] = await Promise.all([
      getAcademicOptions({ includeInactive: true }),
      getRegistrationAcademicOptions(),
    ]);

    setItems(Array.isArray(academicItems) ? academicItems : []);

    setRegistrationDepartments(
      Array.isArray(registrationOptions?.departments)
        ? registrationOptions.departments
        : []
    );
  } catch (error) {
    console.error("Unable to load Subject Master options:", error);
    setItems([]);
    setRegistrationDepartments([]);
  }
};

useEffect(() => {
  load();
}, []);

 const departments = useMemo(() => {
  const activeDepartments = uniqueNames(
    items.filter(
      (item) =>
        item.type === "department" &&
        item.isActive !== false
    ),
    "name"
  );

  const subjectDepartments = uniqueNames(
    items.filter(
      (item) =>
        item.type === "subject" &&
        item.department
    ),
    "department"
  );

  const registrationNames = registrationDepartments
    .map((department) =>
      typeof department === "string"
        ? department
        : department?.name
    )
    .filter(Boolean);

  const merged = [
    ...registrationNames,
    ...activeDepartments,
    ...subjectDepartments,
    form.department,
  ]
    .map((name) => String(name).trim())
    .filter(Boolean);

  return merged.filter(
    (name, index, list) =>
      list.findIndex(
        (item) => normalize(item) === normalize(name)
      ) === index
  );
}, [items, registrationDepartments, form.department]);
  const programmes = useMemo(() => {
    const scoped = scopedProgrammes(items.filter((item) => item.isActive !== false), form.department);
    return form.programme && !scoped.includes(form.programme) ? [...scoped, form.programme] : scoped;
  }, [items, form.department, form.programme]);
  const years = useMemo(() => {
    const scoped = scopedYears(items.filter((item) => item.isActive !== false), form.programme, form.department);
    return form.year && !scoped.includes(form.year) ? [...scoped, form.year] : scoped;
  }, [items, form.programme, form.department, form.year]);
  const semesters = useMemo(() => {
    const scoped = scopedSemesters(items.filter((item) => item.isActive !== false), form.programme, form.year, form.department);
    return form.semester && !scoped.includes(form.semester) ? [...scoped, form.semester] : scoped;
  }, [items, form.programme, form.year, form.department, form.semester]);

  const subjects = useMemo(() => items.filter((item) => item.type === "subject" && (!isHod || normalize(item.department) === normalize(user?.department || ""))), [items, isHod, user]);

  const resetForm = () => {
    setEditingId(null);
    setForm((current) => ({ ...initial, department: isHod ? (user?.department || "") : current.department }));
  };

  const update = (key, value) => setForm((current) => {
    const next = { ...current, [key]: value };
    if (key === "category") Object.assign(next, categoryMap[value] || {});
    if (key === "department") { next.programme = ""; next.year = ""; next.semester = ""; }
    if (key === "programme") { next.year = ""; next.semester = ""; }
    if (key === "year") next.semester = "";
    return next;
  });

  const startEdit = (item) => {
    setEditingId(item._id);
    setForm({
      name: item.name || "",
      code: item.code || "",
      department: item.department || "",
      programme: item.programme || "",
      year: item.year || "",
      semester: item.semester || "",
      category: item.category || "Core",
      basketName: item.basketName || categoryMap[item.category || "Core"]?.basketName || "Core Subjects",
      basketType: item.basketType || categoryMap[item.category || "Core"]?.basketType || "core",
      selectionLimit: item.selectionLimit ?? categoryMap[item.category || "Core"]?.selectionLimit ?? 0,
      credits: item.credits ?? 4,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submit = async (e) => {
    e.preventDefault();
    const required = ["name", "department", "programme", "year", "semester", "category", "basketName"];
    const missing = required.find((field) => !String(form[field] || "").trim());
    if (missing) return alert(`${missing} is required`);
    setSaving(true);
    try {
      const payload = { ...form, type: "subject", credits: Number(form.credits || 0), selectionLimit: Number(form.selectionLimit || 0) };
      if (editingId) {
        await updateAcademicOption(editingId, payload);
        alert("Subject updated successfully. The updated details will be used in dropdowns, course cards, timetable, attendance, notes and assignments.");
      } else {
        await createAcademicOption(payload);
        alert("Subject published. It will now appear in subject dropdowns and student course cards for the matching semester.");
      }
      resetForm();
      await load();
    } catch (error) {
      alert(error?.response?.data?.message || error?.message || "Subject could not be saved. Please check all required fields and try again.");
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (item) => {
    const nextStatus = item.isActive === false;
    const label = nextStatus ? "activate" : "deactivate";
    if (!window.confirm(`Are you sure you want to ${label} ${item.name}?`)) return;
    await setAcademicOptionStatus(item._id, nextStatus);
    await load();
  };

  const grouped = subjects.reduce((acc, item) => {
    const key = [item.department, item.programme, item.year, item.semester].filter(Boolean).join(" • ") || "Unmapped";
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  return (
    <main className="academic-master-page">
      <div className="breadcrumb">Home / Subject Master</div>
      <section className="academic-hero">
        <span>Semester Subject Control</span>
        <h1>Subject Master</h1>
        <p>HOD/EDP define semester-wise subjects, credits, elective baskets, specialization baskets and lab subjects. Existing subjects can be corrected later by HOD for own department or by Super Admin globally.</p>
      </section>

      <section className="academic-card">
        <div className="panel-heading compact-heading">
          <div>
            <h2>{editingId ? "Edit subject" : "Create subject for a semester"}</h2>
            <p className="muted-text">Faculty is assigned later from Teacher Charges. Do not delete used subjects; deactivate them to keep old attendance, notes and assignments safe.</p>
          </div>
          {editingId && <button type="button" className="secondary-action" onClick={resetForm}>Cancel Edit</button>}
        </div>
        <form className="academic-form" onSubmit={submit}>
          <label><span>Department</span><select value={form.department} disabled={isHod} onChange={(e) => update("department", e.target.value)}><option value="">Select Department</option>{departments.map((name) => <option key={name} value={name}>{name}</option>)}</select><small>{isHod ? "Locked to your department" : "Super Admin/EDP can move a subject to another valid department."}</small></label>
          <label><span>Programme</span><select value={form.programme} onChange={(e) => update("programme", e.target.value)}><option value="">Select Programme</option>{programmes.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
          <label><span>Year</span><select value={form.year} onChange={(e) => update("year", e.target.value)}><option value="">Select Year</option>{years.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
          <label><span>Semester</span><select value={form.semester} onChange={(e) => update("semester", e.target.value)}><option value="">Select Semester</option>{semesters.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
          <label><span>Subject name</span><input value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="Compiler Design" /></label>
          <label><span>Subject code</span><input value={form.code} onChange={(e) => update("code", e.target.value)} placeholder="CSE601" /></label>
          <label><span>Category</span><select value={form.category} onChange={(e) => update("category", e.target.value)}>{Object.keys(categoryMap).map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
          <label><span>Basket name</span><input value={form.basketName} onChange={(e) => update("basketName", e.target.value)} placeholder="Elective Basket 1" /></label>
          <label><span>Selection limit</span><input type="number" min="0" value={form.selectionLimit} onChange={(e) => update("selectionLimit", e.target.value)} /></label>
          <label><span>Credits</span><input type="number" min="0" value={form.credits} onChange={(e) => update("credits", e.target.value)} /></label>
          <button disabled={!canManage || saving}>{saving ? "Saving..." : editingId ? "Update Subject" : "Publish Subject"}</button>
        </form>
      </section>

      <section className="academic-grid subject-master-grid">
        {Object.entries(grouped).length ? Object.entries(grouped).map(([scope, list]) => (
          <article className="academic-card" key={scope}>
            <h3>{scope}</h3>
            {list.map((item) => (
              <div className={`academic-row subject-row ${item.isActive === false ? "inactive-row" : ""}`} key={item._id}>
                <div>
                  <b>{item.name}</b>
                  <small>{item.code || "No code"} • {item.category || "Subject"} • {item.basketName || "No basket"} • {item.credits || 0} credits {item.isActive === false ? "• Inactive" : ""}</small>
                </div>
                {canManage && (
                  <div className="row-actions">
                    <button type="button" onClick={() => startEdit(item)}>Edit</button>
                    <button type="button" className="secondary-action" onClick={() => toggleStatus(item)}>{item.isActive === false ? "Activate" : "Deactivate"}</button>
                  </div>
                )}
              </div>
            ))}
          </article>
        )) : (
          <article className="academic-card"><h3>No subjects yet</h3><p className="muted-text">Create the first subject for a department, programme, year and semester. It will automatically appear in the matching student course cards and academic dropdowns.</p></article>
        )}
      </section>
    </main>
  );
};

export default SubjectMaster;
