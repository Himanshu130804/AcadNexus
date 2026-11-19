import React, { useEffect, useMemo, useState } from "react";
import { getMyProgramme } from "../../api/academicApi";
import "./Programme.css";

const Programme = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        setData(await getMyProgramme());
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const grouped = useMemo(() => {
    return (data?.semesterSubjects || []).reduce((acc, item) => {
      const key = item.basketName || item.category || "Semester Subjects";
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {});
  }, [data]);

  if (loading) return <main className="programme-page"><section className="programme-card">Loading programme...</section></main>;
  const student = data?.student || {};

  return (
    <main className="programme-page">
      <div className="breadcrumb">Home / Programme</div>
      <section className="programme-hero">
        <span>Academic Identity</span>
        <h1>{student.programme || "Programme not assigned"}</h1>
        <p>{student.department || "Department pending"} • {student.year || "Year pending"} • {student.semester || "Semester pending"} • Section {student.section || "-"}</p>
      </section>

      <section className="programme-grid">
        <article className="programme-card"><small>Roll number</small><b>{student.rollNumber || "Not assigned"}</b></article>
        <article className="programme-card"><small>Active credits</small><b>{data?.credits?.selected || 0}</b></article>
        <article className="programme-card"><small>Semester credits offered</small><b>{data?.credits?.total || 0}</b></article>
        <article className="programme-card"><small>Lab / group</small><b>{student.labBatch || student.groupName || "Full section"}</b></article>
      </section>

      <section className="programme-card programme-details">
        <h2>Current academic mapping</h2>
        <div className="identity-list">
          <p><span>Student</span><b>{student.name}</b></p>
          <p><span>Department</span><b>{student.department || "Pending"}</b></p>
          <p><span>Programme</span><b>{student.programme || "Pending"}</b></p>
          <p><span>Year</span><b>{student.year || "Pending"}</b></p>
          <p><span>Semester</span><b>{student.semester || "Pending"}</b></p>
          <p><span>Section</span><b>{student.section || "Pending"}</b></p>
          <p><span>Elective</span><b>{student.electiveGroup || "Not locked"}</b></p>
          <p><span>Specialization</span><b>{student.specialization || "Not locked"}</b></p>
        </div>
        <p className="programme-note">These fields are controlled by HOD/EDP. Students can view them but cannot change the academic mapping directly.</p>
      </section>

      <section className="programme-card">
        <h2>Semester subject structure</h2>
        {!Object.keys(grouped).length && <p>No subject structure has been published for this semester yet.</p>}
        <div className="subject-structure">
          {Object.entries(grouped).map(([group, subjects]) => (
            <div className="subject-basket" key={group}>
              <div className="basket-head"><h3>{group}</h3><span>{subjects.length} subjects</span></div>
              {subjects.map((subject) => (
                <div className="subject-line" key={subject._id || subject.name}>
                  <b>{subject.name}</b>
                  <span>{subject.category || "Subject"}</span>
                  <span>{subject.credits || 0} credits</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
};

export default Programme;
