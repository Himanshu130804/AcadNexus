import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { FiActivity, FiBookOpen, FiCalendar, FiCheckSquare, FiClipboard, FiDatabase, FiGrid, FiHome, FiKey, FiLogOut, FiMenu, FiMessageSquare, FiSettings, FiShield, FiUsers, FiBell, FiBarChart2 } from "react-icons/fi";
import { AuthContext } from "../../context/AuthContext";
import "./PortalLayout.css";

const roleNames = {
  super_super_admin: "Platform Owner",
  student: "Student",
  student_admin: "Student Admin",
  teacher: "Teacher",
  teacher_admin: "Teacher Admin",
  hod: "HOD",
  edp: "EDP",
  super_admin: "Super Admin",
  platform_super_admin: [["Platform Command", [["Dashboard", "/dashboard"], ["Registration Codes", "/registration-codes"], ["Institute Directory", "/institutes"], ["Audit Logs", "/audit-logs"]]]],
  institute_admin: "Institute Admin",
  vice_chancellor: "Vice Chancellor",
  staff: "Staff",
};

const commonCampus = [["Events", "/events"], ["Announcements", "/announcements"], ["Communities", "/communities"], ["Clubs", "/clubs"], ["Faculty", "/faculty"]];

const menus = {
  super_super_admin: [
    ["Platform Command", [["Platform Overview", "/dashboard"], ["Institute Directory", "/institutes"], ["Create Institute", "/institutes"], ["Registration Codes", "/registration-codes"], ["Platform Audit Logs", "/audit-logs"], ["Platform Reports", "/reports"]]],
  ],
  institute_admin: [
    ["Institute Administration", [["Home", "/"], ["Dashboard", "/dashboard"], ["Registration Codes", "/registration-codes"], ["Manage Users", "/manage-users"], ["Academic Master", "/academic-master"], ["Subject Master", "/subject-master"], ["Manage Timetable", "/admin-timetable"], ["Teacher Charges", "/teacher-charges"], ["Faculty Requests", "/faculty-requests"], ["Audit Logs", "/audit-logs"], ["Reports", "/reports"], ["Results", "/results"]]],
    ["Campus Management", [["Events", "/events"], ["Announcements", "/announcements"], ["Communities", "/communities"], ["Clubs", "/clubs"], ["Faculty", "/faculty"], ["Profile", "/profile"], ["Notifications", "/notifications"]]],
  ],
  vice_chancellor: [
    ["Institute Administration", [["Home", "/"], ["Dashboard", "/dashboard"], ["Registration Codes", "/registration-codes"], ["Manage Users", "/manage-users"], ["Academic Master", "/academic-master"], ["Subject Master", "/subject-master"], ["Manage Timetable", "/admin-timetable"], ["Teacher Charges", "/teacher-charges"], ["Faculty Requests", "/faculty-requests"], ["Audit Logs", "/audit-logs"], ["Reports", "/reports"], ["Results", "/results"]]],
    ["Leadership", [["Institute Governance", "/institute-governance"], ["Events", "/events"], ["Announcements", "/announcements"], ["Communities", "/communities"], ["Clubs", "/clubs"], ["Faculty", "/faculty"], ["Profile", "/profile"], ["Notifications", "/notifications"]]],
  ],
  staff: [["Staff", [["Home", "/"], ["Dashboard", "/dashboard"], ["Profile", "/profile"], ["Notifications", "/notifications"]]]],
  student: [
    ["Student", [["Home", "/"], ["Dashboard", "/dashboard"], ["Profile", "/profile"], ["Programme", "/programme"], ["My Courses", "/courses"]]],
    ["Academic", [["Notes", "/notes"], ["Assignments", "/assignments"], ["Timetable", "/timetable"], ["Attendance", "/attendance"]]],
    ["Campus", commonCampus],
    ["Activity", [["Submit Content", "/submit"], ["Saved", "/saved"], ["Notifications", "/notifications"], ["Reports", "/reports"], ["Results", "/results"]]],
  ],
  student_admin: [
    ["Workspace", [["Home", "/"], ["Dashboard", "/dashboard"], ["Profile", "/profile"], ["Notifications", "/notifications"]]],
    ["Moderation", [["Approval Center", "/admin"], ["Reports", "/reports"], ["Manage Users", "/manage-users"], ["My Charges", "/my-charges"]]],
    ["Campus", commonCampus],
    ["Resources", [["Notes", "/notes"], ["Assignments", "/assignments"], ["Saved", "/saved"]]],
  ],
  teacher: [
    ["Teacher", [["Home", "/"], ["Dashboard", "/dashboard"], ["Profile", "/profile"], ["My Charges", "/my-charges"], ["Notifications", "/notifications"]]],
    ["Academic", [["Today's Classes", "/dashboard"], ["Mark Attendance", "/mark-attendance"], ["Assignments", "/assignments"], ["Notes", "/notes"], ["Timetable", "/timetable"], ["Results", "/results"]]],
    ["Campus", commonCampus],
  ],
  teacher_admin: [
    ["Teacher", [["Home", "/"], ["Dashboard", "/dashboard"], ["Profile", "/profile"], ["My Charges", "/my-charges"], ["Notifications", "/notifications"]]],
    ["Academic", [["Today's Classes", "/dashboard"], ["Mark Attendance", "/mark-attendance"], ["Assignments", "/assignments"], ["Notes", "/notes"], ["Timetable", "/timetable"], ["Results", "/results"]]],
    ["Moderation", [["Approval Center", "/admin"], ["Reports", "/reports"], ["Submit Content", "/submit"]]],
    ["Campus", commonCampus],
  ],
  hod: [
    ["HOD", [["Home", "/"], ["Dashboard", "/dashboard"], ["Profile", "/profile"], ["My Charges", "/my-charges"], ["Notifications", "/notifications"]]],
    ["Department Control", [["Subject Master", "/subject-master"], ["Teacher Charges", "/teacher-charges"], ["Faculty Requests", "/faculty-requests"], ["Manage Timetable", "/admin-timetable"], ["Mark Attendance", "/mark-attendance"], ["Department Reports", "/reports"], ["Results", "/results"]]],
    ["Academic", [["Assignments", "/assignments"], ["Notes", "/notes"], ["Faculty", "/faculty"]]],
    ["Campus", commonCampus],
  ],
  edp: [
    ["EDP", [["Home", "/"], ["Dashboard", "/dashboard"], ["Student Master", "/manage-users"], ["Student Reports", "/reports"], ["My Profile", "/profile"], ["Notifications", "/notifications"]]],
    ["Student Records", [["Admissions", "/manage-users"], ["Roll Numbers", "/manage-users"], ["Section Allocation", "/manage-users"], ["Group Allocation", "/manage-users"], ["Electives", "/manage-users"], ["Subject Master", "/subject-master"]]],
  ],
  super_admin: [
    ["Super Admin", [["Home", "/"], ["Dashboard", "/dashboard"], ["Admin Center", "/admin"], ["Manage Users", "/manage-users"], ["Registration Codes", "/registration-codes"], ["Institute Directory", "/institutes"], ["Academic Master", "/academic-master"], ["Subject Master", "/subject-master"]]],
    ["Governance", [["Teacher Charges", "/teacher-charges"], ["Faculty Requests", "/faculty-requests"], ["Audit Logs", "/audit-logs"], ["Reports", "/reports"], ["Results", "/results"], ["Approval Center", "/admin"]]],
    ["Academic Control", [["Manage Timetable", "/admin-timetable"], ["Attendance Audit", "/mark-attendance"], ["Faculty", "/faculty"], ["Programmes", "/programme"]]],
    ["Campus View", commonCampus],
  ],
};

const iconFor = (label) => {
  const key = label.toLowerCase();
  if (key.includes("dashboard") || key === "home") return <FiHome aria-hidden="true" />;
  if (key.includes("user") || key.includes("faculty")) return <FiUsers aria-hidden="true" />;
  if (key.includes("registration") || key.includes("code")) return <FiKey aria-hidden="true" />;
  if (key.includes("academic") || key.includes("course") || key.includes("subject") || key.includes("programme")) return <FiBookOpen aria-hidden="true" />;
  if (key.includes("timetable") || key.includes("class")) return <FiCalendar aria-hidden="true" />;
  if (key.includes("attendance")) return <FiCheckSquare aria-hidden="true" />;
  if (key.includes("result") || key.includes("report")) return <FiBarChart2 aria-hidden="true" />;
  if (key.includes("audit") || key.includes("governance") || key.includes("admin") || key.includes("approval")) return <FiShield aria-hidden="true" />;
  if (key.includes("event")) return <FiActivity aria-hidden="true" />;
  if (key.includes("announcement") || key.includes("community")) return <FiMessageSquare aria-hidden="true" />;
  if (key.includes("club")) return <FiGrid aria-hidden="true" />;
  if (key.includes("notification")) return <FiBell aria-hidden="true" />;
  if (key.includes("charge")) return <FiClipboard aria-hidden="true" />;
  if (key.includes("settings") || key.includes("profile")) return <FiSettings aria-hidden="true" />;
  if (key.includes("logs") || key.includes("records") || key.includes("master")) return <FiDatabase aria-hidden="true" />;
  return <FiGrid aria-hidden="true" />;
};

const PortalLayout = () => {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef(null);
  const sidebarRef = useRef(null);
  const role = user?.role || "student";
  const menuGroups = menus[role] || menus.student;
  const pageTitle = useMemo(() => menuGroups.flatMap(([, links]) => links).find(([, path]) => path === location.pathname)?.[0] || "AcadNexus", [location.pathname, menuGroups]);
  const handleLogout = async () => { await logout(); navigate("/login"); };

  useEffect(() => {
    document.title = `${pageTitle} · AcadNexus`;
  }, [pageTitle]);

  useEffect(() => {
    if (!menuOpen) return;
    sidebarRef.current?.querySelector("a")?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        requestAnimationFrame(() => menuButtonRef.current?.focus());
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);
  return (
    <div className={`portal-shell workspace-${role.replace(/_/g, "-")}`} data-role={role}>
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <aside ref={sidebarRef} id="acadnexus-navigation" className={`portal-sidebar ${menuOpen ? "open" : ""}`} aria-label="AcadNexus navigation">
        <div className="portal-brand"><span className="brand-icon">AN</span><span className="brand-text">AcadNexus</span></div>
        <div className="role-card"><b>{roleNames[role] || "User"}</b><span>{user?.name || "Campus user"}</span></div>
        <nav className="portal-menu" aria-label="Portal navigation">
          {menuGroups.map(([group, links]) => <section key={group}><p>{group}</p>{links.map(([label, to]) => <NavLink key={`${group}-${to}`} to={to} onClick={() => { setMenuOpen(false); requestAnimationFrame(() => menuButtonRef.current?.focus()); }}>{iconFor(label)}<span>{label}</span></NavLink>)}</section>)}
        </nav>
      </aside>
      {menuOpen && <button className="portal-overlay" aria-label="Close navigation menu" onClick={() => { setMenuOpen(false); requestAnimationFrame(() => menuButtonRef.current?.focus()); }} />}
      <main id="main-content" className="portal-main">
        <header className="portal-topbar">
          <button ref={menuButtonRef} className="mobile-menu-btn" onClick={() => setMenuOpen(true)} aria-label="Open navigation menu" aria-expanded={menuOpen} aria-controls="acadnexus-navigation"><FiMenu aria-hidden="true" /></button>
          <div className="topbar-title"><h1>{pageTitle}</h1><span>{roleNames[role]} Workspace</span></div>
          <div className="portal-user"><NavLink to="/notifications" className="notification-link">Alerts</NavLink><NavLink to="/profile" className="user-chip"><b>{user?.rollNumber || user?.employeeId || user?.name || "User"}</b><span>{user?.name?.charAt(0)?.toUpperCase() || "U"}</span></NavLink><button onClick={handleLogout} title="Sign out"><FiLogOut aria-hidden="true" /><span>Logout</span></button></div>
        </header>
        <section className="portal-content"><Outlet /></section>
      </main>
    </div>
  );
};
export default PortalLayout;
