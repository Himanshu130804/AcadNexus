import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getMyCourses, selectMySubject } from "../../api/academicApi";
import "./Courses.css";

const Courses = () => {
  const [data, setData] = useState({ courses: [], groups: {} });
  const [loading, setLoading] = useState(true);

  const loadCourses = async () => {
    setLoading(true);
    try {
      setData(await getMyCourses());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCourses();
  }, []);

  const handleSelect = async (event, course) => {
    event.preventDefault();
    event.stopPropagation();
    if (!course.canSelect) return;
    try {
      await selectMySubject(course._id);
      alert(`${course.name} selected and locked. Contact HOD/EDP/Super Admin for any change.`);
      await loadCourses();
    } catch (error) {
      alert(error.response?.data?.message || "Subject selection failed");
    }
  };

  const totals = useMemo(() => {
    const courses = data.courses || [];
    return {
      credits: courses.filter((item) => item.selected).reduce((sum, item) => sum + Number(item.credits || 0), 0),
      subjects: courses.filter((item) => item.selected).length,
      pending: courses.reduce((sum, item) => sum + Number(item.assignments?.pending || 0), 0),
    };
  }, [data]);

  return (
    <main className="courses-page">
      <div className="breadcrumb">Home / My Courses</div>
      <section className="courses-hero">
        <span>Semester Workspace</span>
        <h1>My Courses</h1>
        <p>Subjects are created by HOD/EDP. Students can view assigned core, lab, elective and specialization subjects but cannot edit credits or mappings.</p>
      </section>

      <section className="course-stats">
        <article><b>{totals.subjects}</b><small>Selected subjects</small></article>
        <article><b>{totals.credits}</b><small>Active credits</small></article>
        <article><b>{totals.pending}</b><small>Pending assignments</small></article>
      </section>

      {loading && <section className="simple-card"><p>Loading courses...</p></section>}

      {!loading && !data.courses?.length && (
        <section className="empty-card">
          <h2>No semester subjects configured yet.</h2>
          <p>Ask your HOD/EDP office to define subjects, credits, elective baskets, specialization baskets and lab subjects for your current programme and semester.</p>
        </section>
      )}

      {Object.entries(data.groups || {}).map(([group, courses]) => (
        <section className="course-group" key={group}>
          <div className="group-head">
            <div>
              <h2>{group}</h2>
              <p>{/elective|specialization/i.test(group) ? "Choose/lock policy is controlled by HOD or EDP." : "Automatically assigned for your semester."}</p>
            </div>
            <span>{courses.length} subjects</span>
          </div>
          <div className="course-grid">
            {courses.map((course) => (
              <Link className={`course-card ${course.selected ? "selected" : "not-selected"}`} to={`/courses/${encodeURIComponent(course.name)}`} key={course._id || course.name}>
                <div className="course-card-top">
                  <span>{course.category}</span>
                  <b>{course.credits} Credits</b>
                </div>
                <h3>{course.name}</h3>
                <p>{course.code || "Subject code pending"}</p>
                <div className="course-meta">
                  <span>Faculty</span><strong>{course.teacher}</strong>
                  <span>Attendance</span><strong>{course.attendance?.percentage || 0}%</strong>
                  <span>Next class</span><strong>{course.nextClass}</strong>
                  <span>Assignments</span><strong>{course.assignments?.pending || 0} pending</strong>
                </div>
                {course.selected ? (
                  <em className="selected-note">Selected and locked for you</em>
                ) : course.locked ? (
                  <em>Locked because {course.lockedBySubject || "another subject"} is already selected in this basket</em>
                ) : course.canSelect ? (
                  <button type="button" className="select-subject-btn" onClick={(event) => handleSelect(event, course)}>Select this subject</button>
                ) : (
                  <em>Available option — not selected/locked for you yet</em>
                )}
              </Link>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
};

export default Courses;
