import React, { useContext, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AuthContext } from "../../context/AuthContext";
import { getTodayTimetable } from "../../api/timetableApi";
import "./Dashboard.css";
import StudentInsights from "../../components/StudentInsights/StudentInsights";

const roleLabel = { super_super_admin: "Platform Command Workspace", platform_super_admin: "Platform Admin Workspace", student: "Student Workspace", student_admin: "Student Admin Workspace", teacher: "Teacher Workspace", teacher_admin: "Teacher Admin Workspace", hod: "HOD Workspace", edp: "EDP Workspace", super_admin: "Super Admin Workspace", institute_admin: "Institute Governance Workspace", vice_chancellor: "Vice Chancellor Leadership Workspace" };
const cardsByRole = {
  platform_super_admin: [["Institute Directory", "/institutes", "Manage institutions registered on the AcadNexus platform."], ["Archived Institutions", "/archived-institutions", "Review and restore archived institutions."], ["Vice Chancellors", "/vice-chancellors", "Create, assign and manage Vice Chancellor accounts."], ["Registration Codes", "/registration-codes", "Issue institution-bound platform access codes."], ["Platform Audit Logs", "/audit-logs", "Review platform-level administrative activity."], ["Platform Reports", "/reports", "Review platform-wide operational reports."]],
  super_super_admin: [["Institute Directory", "/institutes", "Create, edit, activate, suspend or archive institutes served by AcadNexus."], ["Archived Institutions", "/archived-institutions", "Review archived institutions and restore them."], ["Vice Chancellors", "/vice-chancellors", "Create, assign, activate and deactivate Vice Chancellors."], ["Platform Administration", "/manage-users", "Generate and revoke institution administrator and senior-authority registration codes."], ["Platform Audit Logs", "/audit-logs", "Review cross-institute administrative activity."], ["Platform Reports", "/reports", "Review platform-wide operational reports."]],
  institute_admin: [["Registration Codes", "/registration-codes", "Generate and revoke institution-bound Teacher, Student, Staff and EDP codes."], ["Manage Users", "/manage-users", "Manage accounts associated with your institute."], ["Academic Master", "/academic-master", "Manage institutional academic structure."], ["Manage Timetable", "/admin-timetable", "Manage institute timetable operations."], ["Teacher Charges", "/teacher-charges", "Manage institutional teaching responsibilities."], ["Audit Logs", "/audit-logs", "Review institutional administrative activity."]],
  vice_chancellor: [["Institution Admin Registration", "/institution-admin-registration", "Generate and revoke Institution Admin registration codes for your institution."], ["Registration Codes", "/registration-codes", "Manage institution-bound account registration codes."], ["Manage Users", "/manage-users", "Manage accounts across your institute."], ["Academic Master", "/academic-master", "Manage institutional academic structure."], ["Manage Timetable", "/admin-timetable", "Manage institute timetable operations."], ["Teacher Charges", "/teacher-charges", "Manage institutional teaching responsibilities."], ["Institute Governance", "/institute-governance", "Lead institution-wide governance and administration."], ["Reports", "/reports", "Review institute-wide reports."]],
  student: [["Today's Timetable", "/timetable", "See classes for your section, subgroup, elective and specialization."], ["Attendance", "/attendance", "Review subject-wise percentage."], ["Assignments", "/assignments", "Track due work."], ["Notes Library", "/notes", "Access approved notes."], ["Announcements", "/announcements", "Read targeted notices."]],
  student_admin: [["Approval Center", "/admin", "Moderate assigned content."], ["Reports", "/reports", "Review activity issues."], ["Communities", "/communities", "Organise department communities."], ["Notifications", "/notifications", "Track assigned actions."]],
  teacher: [["Mark Attendance", "/mark-attendance", "Only for classes assigned to you."], ["My Timetable", "/timetable", "View today's and weekly classes."], ["Assignments", "/assignments", "Create and review assigned subject work."], ["Notes", "/notes", "Upload notes for assigned subjects."], ["My Charges", "/my-charges", "View responsibilities assigned by HOD/Super Admin."]],
  teacher_admin: [["Mark Attendance", "/mark-attendance", "Only for assigned classes."], ["My Timetable", "/timetable", "View schedule."], ["Approval Center", "/admin", "Approve content inside your charge."], ["Submit Content", "/submit", "Publish university activity updates."]],
  hod: [["Today's Department Classes", "/admin-timetable", "Monitor department schedule."], ["Teacher Charges", "/teacher-charges", "Assign subjects/classes to teachers."], ["Manage Timetable", "/admin-timetable", "Create/edit department timetable."], ["Department Reports", "/reports", "Review attendance and activities."], ["Approval Center", "/admin", "Approve department content."]],
  edp: [["Student Master", "/manage-users", "Manage student academic records and cohort allocations."], ["Official Results", "/results", "Review validated result drafts and publish authorized records."], ["Student Reports", "/reports", "Review student record and academic data status." ]],
  super_admin: [["Manage Users", "/manage-users", "Control roles and records."], ["Academic Master", "/academic-master", "Build hierarchy and mappings."], ["Teacher Charges", "/teacher-charges", "Assign HODs and teaching charges."], ["Manage Timetable", "/admin-timetable", "Central timetable control."], ["Audit Logs", "/audit-logs", "Track changes."], ["Reports", "/reports", "University activity reports."]],
};

const Dashboard = () => {
  const { user } = useContext(AuthContext);
  const [todayClasses, setTodayClasses] = useState([]);
  const [loadingToday, setLoadingToday] = useState(false);
  const cards = cardsByRole[user?.role] || cardsByRole.student;
  const isPlatformRole = ["super_super_admin", "platform_super_admin"].includes(user?.role);

  useEffect(() => {
    if (["student", "student_admin", "teacher", "teacher_admin", "hod"].includes(user?.role)) {
      setLoadingToday(true);
      getTodayTimetable().then(setTodayClasses).catch(() => setTodayClasses([])).finally(() => setLoadingToday(false));
    }
  }, [user?.role]);

  const profileCompleteness = [user?.department, user?.programme || user?.designation, user?.rollNumber || user?.employeeId, user?.year || user?.officeHours].filter(Boolean).length;

  return (
    <main className={`dashboard-page dashboard-${(user?.role || "student").replace(/_/g, "-")}`}>
      <section className="dashboard-hero">
        <div><span>{roleLabel[user?.role] || "Campus Workspace"}</span><h1>{["super_super_admin", "platform_super_admin"].includes(user?.role) ? "Platform overview" : `Welcome, ${user?.name || "User"}`}</h1><p>{["super_super_admin", "platform_super_admin"].includes(user?.role) ? "A central view of institution access, platform operations and governance." : "Your academic workspace, with the records and actions available to your role."}</p></div>
        <div className="dashboard-profile-score"><strong>{isPlatformRole ? "Global" : `${profileCompleteness}/4`}</strong><small>{isPlatformRole ? "Platform scope" : "Profile readiness"}</small></div>
      </section>

      <section className="dashboard-insights">
        {isPlatformRole ? <><div><b>Multi-institution</b><span>Platform scope</span></div><div><b>Institution access</b><span>Administration</span></div><div><b>Platform controls</b><span>Governance</span></div></> : <><div><b>{user?.department || "Not set"}</b><span>Department</span></div><div><b>{user?.programme || user?.designation || "Not set"}</b><span>Programme / Designation</span></div><div><b>{user?.groupName || user?.section || "Not set"}</b><span>Section / Group</span></div></>}<div><b>{user?.role || "student"}</b><span>Access role</span></div>
      </section>

      {["student", "student_admin", "teacher", "teacher_admin", "hod"].includes(user?.role) && <section className="dashboard-today">
        <div className="today-head"><div><h2>Today's classes</h2><p>{loadingToday ? "Loading schedule..." : todayClasses.length ? "From your timetable." : "No class found for today."}</p></div><Link to={user?.role === "hod" ? "/admin-timetable" : "/timetable"}>Open timetable</Link></div>
        <div className="today-list">{todayClasses.length ? todayClasses.map((item) => <article key={item._id} className="today-class"><b>{item.startTime} - {item.endTime}</b><span>{item.subject}</span><small>{item.programme} • {item.year} • Sem {item.semester} • Sec {item.section} • {item.groupType || "full_section"}: {item.groupName || "All"}</small><small>{item.facultyName || item.faculty?.name || "Faculty"} • Room {item.room || "TBA"}</small></article>) : <div className="today-empty">Your dashboard will show classes automatically once timetable and assignments match your profile.</div>}</div>
      </section>}

      {["student", "student_admin"].includes(user?.role) && <StudentInsights />}

      {user?.role === "edp" && <section className="dashboard-today"><div className="today-head"><div><h2>Examination data workspace</h2><p>Manage student master records and review official result drafts after the institution finalizes examination data.</p></div><Link to="/results">Review official results</Link></div></section>}

      <section className="dashboard-grid">{cards.map(([title, link, description]) => <Link to={link} key={title} className="dashboard-card"><h2>{title}</h2><p>{description}</p><span>Open module →</span></Link>)}</section>
    </main>
  );
};
export default Dashboard;
