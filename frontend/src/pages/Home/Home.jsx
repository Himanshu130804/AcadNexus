import React, { useContext, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AuthContext } from "../../context/AuthContext";
import { getGroupedContent } from "../../api/contentApi";
import "./Home.css";

const roleIntro = {
  student: "Check your classes, attendance, assignments and campus updates.",
  student_admin: "Review student services, reports and campus communities.",
  teacher_admin: "Manage classes, attendance, assignments and course updates.",
  super_admin: "Review academic operations, account access and institutional activity.",
};

const quickLinks = {
  student: [
    ["▦", "My dashboard", "/dashboard", "Your academic overview"],
    ["◷", "Timetable", "/timetable", "Classes and schedule"],
    ["✓", "Attendance", "/attendance", "Track your attendance"],
    ["▤", "Assignments", "/assignments", "Tasks and submissions"],
    ["▧", "Notes & resources", "/notes", "Learning materials"],
    ["◇", "Campus events", "/events", "What's happening"],
    ["◉", "Announcements", "/announcements", "Important updates"],
    ["◎", "Communities", "/communities", "Connect with peers"],
  ],
  student_admin: [
    ["▦", "Dashboard", "/dashboard", "Your overview"],
    ["✓", "Approval center", "/admin", "Review pending items"],
    ["▤", "Reports", "/reports", "Review activity"],
    ["♙", "Manage users", "/manage-users", "Accounts and access"],
    ["＋", "Submit content", "/submit", "Share campus updates"],
    ["◎", "Communities", "/communities", "Support campus groups"],
  ],
  teacher_admin: [
    ["▦", "Dashboard", "/dashboard", "Your overview"],
    ["✓", "Mark attendance", "/mark-attendance", "Record class attendance"],
    ["◷", "Manage timetable", "/admin-timetable", "Plan teaching schedules"],
    ["＋", "Submit content", "/submit", "Share resources and updates"],
    ["▤", "Assignments", "/assignments", "Manage coursework"],
    ["▧", "Notes & resources", "/notes", "Teaching materials"],
    ["◇", "Approval center", "/admin", "Review pending items"],
    ["◈", "My charges", "/my-charges", "View assigned duties"],
  ],
  super_admin: [
    ["▦", "Dashboard", "/dashboard", "Institution overview"],
    ["♙", "Manage users", "/manage-users", "Accounts and permissions"],
    ["▧", "Academic master", "/academic-master", "Academic structure"],
    ["◈", "Teacher charges", "/teacher-charges", "Teaching responsibilities"],
    ["◷", "Manage timetable", "/admin-timetable", "Schedule management"],
    ["≡", "Audit logs", "/audit-logs", "Trace sensitive changes"],
    ["▤", "Reports", "/reports", "Institution reporting"],
    ["✓", "Approval center", "/admin", "Review pending items"],
  ],
};

function FeatureLink({ item }) {
  const [icon, label, to, detail] = item;
  return <Link className="an-feature" to={to}>
    <span className="an-feature-icon" aria-hidden="true">{icon}</span>
    <span className="an-feature-copy"><strong>{label}</strong><small>{detail}</small></span>
    <span className="an-feature-arrow" aria-hidden="true">↗</span>
  </Link>;
}

const Home = () => {
  const { user } = useContext(AuthContext);
  const [events, setEvents] = useState({ allUniversity: [], myDepartment: [], allowedOthers: [] });
  const [announcements, setAnnouncements] = useState({ allUniversity: [], myDepartment: [], allowedOthers: [] });
  useEffect(() => {
    if (!user) return;
    let active = true;
    Promise.all([
      getGroupedContent({ type: "event" }).catch(() => null),
      getGroupedContent({ type: "announcement" }).catch(() => null),
    ]).then(([eventData, announcementData]) => {
      if (!active) return;
      if (eventData) setEvents(eventData);
      if (announcementData) setAnnouncements(announcementData);
    });
    return () => { active = false; };
  }, [user]);

  const links = quickLinks[user?.role] || quickLinks.student;
  const classLabel = useMemo(
    () => [user?.department, user?.programme, user?.year, user?.semester, user?.section && `Section ${user.section}`].filter(Boolean).join(" · "),
    [user]
  );
  const firstName = user?.name?.trim()?.split(/\s+/)[0] || "there";
  const latestEvents = events.allUniversity.slice(0, 3);
  const latestAnnouncements = announcements.allUniversity.slice(0, 3);

  return <main className="portal-home">
    <section className="an-hero">
      <div className="an-hero-copy">
        <span className="an-eyebrow"><span className="an-live-dot" /> CAMPUS LIFE</span>
        <h1>Good to see you,<br /><em>{firstName}.</em></h1>
        <p>{roleIntro[user?.role] || roleIntro.student}</p>
        <div className="an-user-meta">
          <span className="an-role-pill">{(user?.role || "student").replaceAll("_", " ")}</span>
          <span>{classLabel || user?.designation || "Your academic workspace"}</span>
        </div>
      </div>
      <div className="an-hero-art" aria-hidden="true">
        <div className="an-orbit an-orbit-one" /><div className="an-orbit an-orbit-two" />
        <div className="an-art-core"><span>AN</span><small>ACADEMIC<br />NETWORK</small></div>
        <span className="an-float an-float-one">✳</span><span className="an-float an-float-two">↗</span>
      </div>
    </section>

    <section className="an-section">
      <div className="an-section-heading"><div><span className="an-kicker">YOUR WORKSPACE</span><h2>Quick access</h2><p>Open a tool or check the latest campus updates.</p></div><span className="an-section-count">{links.length} shortcuts</span></div>
      <div className="an-feature-grid">{links.map((item) => <FeatureLink item={item} key={item[2]} />)}</div>
    </section>

    <section className="an-updates">
      <div className="an-section-heading"><div><span className="an-kicker">LATEST UPDATES</span><h2>Campus updates</h2><p>Events and notices from your university.</p></div></div>
      <div className="an-update-grid">
        <article className="an-update-card">
          <div className="an-update-title"><span className="an-update-icon event-icon">◇</span><div><h3>University events</h3><small>What's coming up</small></div><Link to="/events" aria-label="View events">↗</Link></div>
          {latestEvents.length ? latestEvents.map(item => <div className="an-feed-row" key={item._id}><span className="an-feed-dot" /><span>{item.title}</span></div>) : <p className="an-empty">No university events to show yet.</p>}
        </article>
        <article className="an-update-card">
          <div className="an-update-title"><span className="an-update-icon notice-icon">≋</span><div><h3>Announcements</h3><small>Notices and reminders</small></div><Link to="/announcements" aria-label="View announcements">↗</Link></div>
          {latestAnnouncements.length ? latestAnnouncements.map(item => <div className="an-feed-row" key={item._id}><span className="an-feed-dot" /><span>{item.title}</span></div>) : <p className="an-empty">Approved announcements will appear here.</p>}
        </article>
      </div>
    </section>
    <footer className="an-home-footer"><span>AcadNexus</span><span>Academic tools and campus updates, together.</span></footer>
  </main>;
};

export default Home;
