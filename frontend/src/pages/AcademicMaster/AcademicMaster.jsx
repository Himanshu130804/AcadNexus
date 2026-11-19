import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  cleanupAcademicOptions,
  createAcademicOption,
  getAcademicOptions,
  seedAcademicOptions,
  setAcademicOptionStatus,
  updateAcademicOption,
} from "../../api/academicApi";
import { normalizeAcademic } from "../../utils/academicScope";
import "./AcademicMaster.css";

const initialDepartment = { name: "", code: "" };
const initialProgramme = {
  department: "",
  name: "",
  code: "",
  variant: "",
  specialization: "",
  durationYears: 4,
  semesterCount: 8,
  degreeLevel: "Undergraduate",
};

const programmeDefaults = (name = "") => {
  const value = normalizeAcademic(name);
  if (value.includes("b arch")) return { durationYears: 5, semesterCount: 10, degreeLevel: "Undergraduate" };
  if (["m tech", "mca", "mba", "m com", "ma", "m sc", "msc", "m pharm", "llm", "m ed"].includes(value)) return { durationYears: 2, semesterCount: 4, degreeLevel: "Postgraduate" };
  if (["bca", "bba", "b com", "ba", "b sc", "bsc", "b pharm", "llb", "b ed"].includes(value)) return { durationYears: 3, semesterCount: 6, degreeLevel: "Undergraduate" };
  if (value.includes("b tech") || value === "bse") return { durationYears: 4, semesterCount: 8, degreeLevel: "Undergraduate" };
  return { durationYears: 4, semesterCount: 8, degreeLevel: "Undergraduate" };
};

const AcademicMaster = () => {
  const [items, setItems] = useState([]);
 const [savingDepartment, setSavingDepartment] = useState(false);
const [savingProgramme, setSavingProgramme] = useState(false);
  const [loading, setLoading] = useState(false);
  const [departmentForm, setDepartmentForm] = useState(initialDepartment);
  const [programmeForm, setProgrammeForm] = useState(initialProgramme);
  const [editingDepartment, setEditingDepartment] = useState(null);
  const [editingProgramme, setEditingProgramme] = useState(null);

  const load = async () => {
  setLoading(true);

  try {
    const data = await getAcademicOptions({
      includeInactive: "true",
    });

    setItems(Array.isArray(data) ? data : []);
  } catch (error) {
    console.error("Academic Master load error:", error);

    alert(
      error?.response?.data?.message ||
      error?.message ||
      "Academic data could not be loaded."
    );

    setItems([]);
  } finally {
    setLoading(false);
  }
};

 useEffect(() => {
  const fetchAcademicData = async () => {
    await load();
  };

  fetchAcademicData();
}, []);

  const dedupeBy = (list, getKey) => Array.from(new Map(list.map((item) => [getKey(item), item])).values());
  const departments = useMemo(() => dedupeBy(items.filter((item) => item.type === "department"), (item) => normalizeAcademic(item.name)), [items]);
  const activeDepartments = useMemo(() => departments.filter((item) => item.isActive !== false), [departments]);
  const departmentNames = useMemo(() => {
    const seen = new Set();
    return activeDepartments
      .map((item) => item.name)
      .filter(Boolean)
      .filter((name) => {
        const key = normalizeAcademic(name);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }, [activeDepartments]);
  const programmeItems = useMemo(() => dedupeBy(items.filter((item) => item.type === "programme" && item.department), (item) => `${normalizeAcademic(item.department)}:${normalizeAcademic(item.name)}`), [items]);
 
 const programmesByDepartment = programmeItems.reduce(
  (acc, item) => {
    const key = item.department || "Unmapped";

    if (!acc[key]) {
      acc[key] = [];
    }

    acc[key].push(item);

    return acc;
  },
  {}
);

 const submitDepartment = async (e) => {
  e.preventDefault();

  const name = departmentForm.name.trim();
  const code = departmentForm.code.trim();

  if (!name) {
    return alert("Department name is required.");
  }

  setSavingDepartment(true);

  try {
    const payload = {
      type: "department",
      name,
      code,
    };

    if (editingDepartment) {
      await updateAcademicOption(
        editingDepartment._id,
        payload
      );

      alert("Department updated successfully.");
    } else {
      await createAcademicOption(payload);

      alert("Department created successfully.");
    }

    setDepartmentForm({ ...initialDepartment });
    setEditingDepartment(null);

    await load();
  } catch (error) {
    console.error("Department save error:", error);

    alert(
      error?.response?.data?.message ||
      error?.message ||
      "Department could not be saved."
    );
  } finally {
    setSavingDepartment(false);
  }
};

 const submitProgramme = async (e) => {
  e.preventDefault();

  const department = programmeForm.department.trim();
  const name = programmeForm.name.trim();

  if (!department) {
    return alert("Please select a department.");
  }

  if (!name) {
    return alert("Programme name is required.");
  }

  const durationYears = Number(
    programmeForm.durationYears
  );

  const semesterCount = Number(
    programmeForm.semesterCount
  );

  if (
    !Number.isFinite(durationYears) ||
    durationYears < 1
  ) {
    return alert("Programme duration must be at least 1 year.");
  }

  if (
    !Number.isFinite(semesterCount) ||
    semesterCount < 1
  ) {
    return alert("Semester count must be at least 1.");
  }

  setSavingProgramme(true);

  try {
    const payload = {
      type: "programme",
      department,
      name,
      baseProgramme: name,
      code: programmeForm.code.trim(),
      variant: programmeForm.variant.trim(),
      specialization:
        programmeForm.specialization.trim(),
      durationYears,
      semesterCount,
      degreeLevel: programmeForm.degreeLevel,
    };

    if (editingProgramme) {
      await updateAcademicOption(
        editingProgramme._id,
        payload
      );

      alert("Programme mapping updated successfully.");
    } else {
      await createAcademicOption(payload);

      alert("Programme mapped successfully.");
    }

    setProgrammeForm({ ...initialProgramme });
    setEditingProgramme(null);

    await load();
  } catch (error) {
    console.error("Programme save error:", error);

    alert(
      error?.response?.data?.message ||
      error?.message ||
      "Programme mapping could not be saved."
    );
  } finally {
    setSavingProgramme(false);
  }
};
  const updateProgramme = (key, value) => {
    setProgrammeForm((current) => {
      const next = { ...current, [key]: value };
      if (key === "name") {
        const meta = programmeDefaults(value);
        next.durationYears = meta.durationYears;
        next.semesterCount = meta.semesterCount;
        next.degreeLevel = meta.degreeLevel;
      }
      if (key === "durationYears") next.semesterCount = Math.max(1, Number(value || 1) * 2);
      return next;
    });
  };


  const startDepartmentEdit = (item) => {
  setEditingDepartment(item);

  setDepartmentForm({
    name: item.name || "",
    code: item.code || "",
  });

  window.scrollTo({
    top: 0,
    behavior: "smooth",
  });
};

const startProgrammeEdit = (item) => {
  setEditingProgramme(item);

  setProgrammeForm({
    department: item.department || "",
    name: item.baseProgramme || item.name || "",
    code: item.code || "",
    variant: item.variant || "",
    specialization: item.specialization || "",
    durationYears: Number(item.durationYears) || 4,
    semesterCount: Number(item.semesterCount) || 8,
    degreeLevel: item.degreeLevel || "Undergraduate",
  });

  window.scrollTo({
    top: 0,
    behavior: "smooth",
  });
};
 const changeStatus = async (item, isActive) => {
  const action = isActive ? "activate" : "deactivate";

  if (!window.confirm(`Do you want to ${action} ${item.name}?`)) {
    return;
  }

  try {
    await setAcademicOptionStatus(item._id, isActive);
    await load();
  } catch (error) {
    console.error("Academic status update error:", error);

    alert(
      error?.response?.data?.message ||
        error?.message ||
        `Could not ${action} ${item.name}.`
    );
  }
};

 const seed = async () => {
  try {
    setLoading(true);

    await seedAcademicOptions();

    alert(
      "Default starter data checked. You can edit or deactivate it from this page."
    );

    await load();
  } catch (error) {
    console.error("Academic seed error:", error);

    alert(
      error?.response?.data?.message ||
        error?.message ||
        "Default academic data could not be checked."
    );
  } finally {
    setLoading(false);
  }
};

const cleanup = async () => {
  if (
    !window.confirm(
      "This will deactivate duplicate active academic records. Continue?"
    )
  ) {
    return;
  }

  try {
    setLoading(true);

    const data = await cleanupAcademicOptions();

    alert(data?.message || "Academic data cleaned.");

    await load();
  } catch (error) {
    console.error("Academic cleanup error:", error);

    alert(
      error?.response?.data?.message ||
        error?.message ||
        "Academic data could not be cleaned."
    );
  } finally {
    setLoading(false);
  }
};

  return (
    <main className="academic-master-page simple-academic-page">
      <div className="breadcrumb">Home / Academic Master</div>

      <section className="academic-hero simple-hero">
        <div>
          <span>Simple setup</span>
          <h1>Academic Master</h1>
          <p>
            Use this page only for official departments and department-programme mappings. Subjects are created in Subject Master and teachers are assigned in Teacher Charges.
          </p>
        </div>
        <div className="academic-actions">
         <button type="button" onClick={seed} disabled={loading}>
  {loading ? "Checking..." : "Check default data"}
</button>
          <button
  type="button"
  className="secondary-action"
  onClick={cleanup}
  disabled={loading}
>
  Clean duplicates
</button>

          <Link to="/subject-master">Subject Master</Link>
        </div>
      </section>

      <section className="instruction-strip">
        <div><b>Step 1</b><span>Create or edit a department, for example Architecture.</span></div>
        <div><b>Step 2</b><span>Map programmes to only the departments that offer them.</span></div>
        <div><b>Step 3</b><span>Set years and semesters per programme, for example B.Arch = 5 years / 10 semesters.</span></div>
      </section>

      <section className="academic-split">
        <article className="academic-card elevated-card">
          <div className="section-kicker">Department</div>
          <h2>{editingDepartment ? "Edit department" : "Create department"}</h2>
          <p className="muted-text">Default data is editable. Deactivate old names instead of deleting records used by students.</p>
          <form className="academic-form compact dept-form" onSubmit={submitDepartment}>
            <label><span>Department name</span><input value={departmentForm.name} onChange={(e) => setDepartmentForm({ ...departmentForm, name: e.target.value })} placeholder="Architecture" /></label>
            <label><span>Code</span><input value={departmentForm.code} onChange={(e) => setDepartmentForm({ ...departmentForm, code: e.target.value })} placeholder="ARCH" /></label>
           <button
  type="submit"
  disabled={savingDepartment}
>
  {savingDepartment
    ? "Saving..."
    : editingDepartment
      ? "Update Department"
      : "Save Department"}
</button>
           {editingDepartment && (
  <button
    type="button"
    className="secondary-action"
    disabled={savingDepartment}
    onClick={() => {
      setEditingDepartment(null);
      setDepartmentForm({ ...initialDepartment });
    }}
  >
    Cancel
  </button>
)}
          </form>
        </article>

        <article className="academic-card elevated-card">
          <div className="section-kicker">Programme</div>
          <h2>{editingProgramme ? "Edit programme mapping" : "Map programme"}</h2>
          <p className="muted-text">Supports B.Tech, BSE, B.Arch, B.Sc (Hons.) Mathematics and any future programme.</p>
          <form className="academic-form programme-form" onSubmit={submitProgramme}>
            <label><span>Department</span><select value={programmeForm.department} onChange={(e) => updateProgramme("department", e.target.value)}><option value="">Select Department</option>{departmentNames.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
            <label><span>Programme</span><input value={programmeForm.name} onChange={(e) => updateProgramme("name", e.target.value)} placeholder="B.Arch / B.Sc / BSE" /></label>
            <label><span>Variant</span><input value={programmeForm.variant} onChange={(e) => updateProgramme("variant", e.target.value)} placeholder="Hons. / General" /></label>
            <label><span>Specialization</span><input value={programmeForm.specialization} onChange={(e) => updateProgramme("specialization", e.target.value)} placeholder="Mathematics / AI" /></label>
            <label><span>Years</span><input type="number" min="1" value={programmeForm.durationYears} onChange={(e) => updateProgramme("durationYears", e.target.value)} /></label>
            <label><span>Semesters</span><input type="number" min="1" value={programmeForm.semesterCount} onChange={(e) => updateProgramme("semesterCount", e.target.value)} /></label>
            <label><span>Degree level</span><select value={programmeForm.degreeLevel} onChange={(e) => updateProgramme("degreeLevel", e.target.value)}><option>Undergraduate</option><option>Postgraduate</option><option>Diploma</option><option>Integrated</option></select></label>
            <label><span>Code</span><input value={programmeForm.code} onChange={(e) => updateProgramme("code", e.target.value)} placeholder="BARCH / BSE" /></label>
<button
  type="submit"
  disabled={savingProgramme}
>
  {savingProgramme
    ? "Saving..."
    : editingProgramme
      ? "Update Programme"
      : "Save Programme"}
</button>
            {editingProgramme && (
  <button
    type="button"
    className="secondary-action"
    disabled={savingProgramme}
    onClick={() => {
      setEditingProgramme(null);
      setProgrammeForm({ ...initialProgramme });
    }}
  >
    Cancel
  </button>
)}
          </form>
        </article>
      </section>

      <section className="academic-card guide-card">
        <h2>Clear responsibility</h2>
        <div className="academic-info-grid">
          <div><b>Academic Master</b><small>Departments and programme duration only.</small></div>
          <div><b>Subject Master</b><small>Semester subjects, credits, electives, labs.</small></div>
          <div><b>Teacher Charges</b><small>Assign teachers after subjects exist.</small></div>
          <div><b>Student Courses</b><small>Generated from official mapping automatically.</small></div>
        </div>
      </section>

      <section className="academic-grid academic-grid-3">
        <article className="academic-card">
          <h3>Departments</h3>
          {departments.length ? departments.map((item) => (
            <div className={`academic-row ${item.isActive === false ? "inactive-row" : ""}`} key={item._id}>
              <div>
                <b>{item.name}</b>
                <small>{item.code || "No code"} {item.isActive === false ? "• Inactive" : ""}</small>
              </div>
              <div className="row-actions">
                <button type="button" onClick={() => startDepartmentEdit(item)}>Edit</button>
                <button type="button" onClick={() => changeStatus(item, item.isActive === false)}>{item.isActive === false ? "Activate" : "Deactivate"}</button>
              </div>
            </div>
          )) : <p>No departments yet.</p>}
        </article>

        <article className="academic-card wide-card">
          <h3>Department-programme mappings</h3>
          {Object.entries(programmesByDepartment).length ? Object.entries(programmesByDepartment).map(([department, list]) => (
            <div className="mapping-block" key={department}>
              <h4>{department}</h4>
              {list.map((item) => (
                <div className={`academic-row ${item.isActive === false ? "inactive-row" : ""}`} key={item._id}>
                  <div>
                    <b>{item.name}</b>
                    <small>{item.durationYears || programmeDefaults(item.name).durationYears} years • {item.semesterCount || programmeDefaults(item.name).semesterCount} semesters • {item.degreeLevel || programmeDefaults(item.name).degreeLevel}</small>
                  </div>
                  <div className="row-actions">
                    <button type="button" onClick={() => startProgrammeEdit(item)}>Edit</button>
                    <button type="button" onClick={() => changeStatus(item, item.isActive === false)}>{item.isActive === false ? "Activate" : "Deactivate"}</button>
                  </div>
                </div>
              ))}
            </div>
          )) : <p>No programme mappings yet.</p>}
        </article>
      </section>
    </main>
  );
};

export default AcademicMaster;
