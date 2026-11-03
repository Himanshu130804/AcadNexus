import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getMyCourses } from "../../api/academicApi";
import { getMyAssignments } from "../../api/assignmentApi";
import { getMyAttendance } from "../../api/attendanceApi";
import { getMyTimetable } from "../../api/timetableApi";
import { getContent } from "../../api/contentApi";
import "./CourseDetail.css";

const same = (a = "", b = "") => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

const CourseDetail = () => {
  const { subject } = useParams();
  const name = decodeURIComponent(subject || "");
  const [courseData, setCourseData] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [timetable, setTimetable] = useState([]);
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [coursesRes, assignmentRes, attendanceRes, timetableRes, notesRes] = await Promise.all([
          getMyCourses(), getMyAssignments(), getMyAttendance(), getMyTimetable(), getContent({ type: "note", subject: name }),
        ]);
        setCourseData(coursesRes.courses?.find((item) => same(item.name, name)) || null);
        setAssignments((assignmentRes || []).filter((item) => same(item.subject, name)));
        setAttendance((attendanceRes || []).filter((item) => same(item.subject, name)));
        setTimetable((timetableRes || []).filter((item) => same(item.subject, name)));
        setNotes((notesRes || []).filter((item) => !item.subject || same(item.subject, name)));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [name]);

  const attendanceSummary = useMemo(() => {
    if (courseData?.attendance) return courseData.attendance;
    const item = attendance[0];
    return item ? { percentage: item.percentage, present: item.present, total: item.total } : { percentage: 0, present: 0, total: 0 };
  }, [attendance, courseData]);

  if (loading) return <main className="course-detail"><section className="detail-panel">Loading subject...</section></main>;

  return (
    <main className="course-detail">
      <div className="breadcrumb"><Link to="/courses">My Courses</Link> / {name}</div>
      <section className="course-detail-hero">
        <span>{courseData?.category || "Subject"}</span>
        <h1>{name}</h1>
        <p>{courseData?.code || "Subject code pending"} • {courseData?.credits || 0} credits • {courseData?.basketName || "Semester Subject"}</p>
      </section>

      <section className="detail-stats">
        <article><b>{attendanceSummary.percentage || 0}%</b><small>Attendance</small></article>
        <article><b>{assignments.length}</b><small>Assignments</small></article>
        <article><b>{notes.length}</b><small>Notes</small></article>
        <article><b>{timetable.length}</b><small>Weekly classes</small></article>
      </section>

      <section className="detail-grid">
        <article className="detail-panel">
          <h2>Faculty</h2>
          <p className="big-line">{courseData?.teacher || timetable[0]?.facultyName || timetable[0]?.faculty?.name || "Faculty not assigned yet"}</p>
          <p>Faculty is controlled by HOD through teacher charge or timetable assignment.</p>
        </article>

        <article className="detail-panel">
          <h2>Subject Attendance</h2>
          <p className="big-line">{attendanceSummary.present || 0} / {attendanceSummary.total || 0} present</p>
          <p>Subject-wise attendance appears automatically after your assigned teacher marks it.</p>
        </article>

        <article className="detail-panel wide">
          <h2>Timetable for this subject</h2>
          {timetable.length ? timetable.map((item) => (
            <div className="detail-row" key={item._id}>
              <b>{item.day}</b>
              <span>{item.startTime} - {item.endTime}</span>
              <span>{item.room || "Room pending"}</span>
              <span>{item.groupName && item.groupName !== "All" ? item.groupName : "Full section"}</span>
            </div>
          )) : <p>No timetable entries for this subject yet.</p>}
        </article>

        <article className="detail-panel wide">
          <h2>Assignments</h2>
          {assignments.length ? assignments.map((item) => (
            <div className="detail-row" key={item._id}>
              <b>{item.title}</b>
              <span>{item.dueDate ? new Date(item.dueDate).toLocaleDateString() : "No due date"}</span>
              <span>{item.submissions?.length ? "Submitted" : "Pending"}</span>
            </div>
          )) : <p>No assignments for this subject yet.</p>}
        </article>

        <article className="detail-panel wide">
          <h2>Notes & Resources</h2>
          {notes.length ? notes.map((item) => (
            <div className="detail-row" key={item._id}>
              <b>{item.title}</b>
              <span>{item.createdBy?.name || "Faculty"}</span>
              <span>{item.fileName || "Resource"}</span>
            </div>
          )) : <p>No notes uploaded for this subject yet.</p>}
        </article>
      </section>
    </main>
  );
};

export default CourseDetail;
