import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getGroupedContent } from "../../api/contentApi";
import ContentCard from "../../components/ContentCard/ContentCard";
import "./Announcements.css";

const Announcements = () => {
  const [groups, setGroups] = useState({ allUniversity: [], myDepartment: [], allowedOthers: [] });
  const load = async () => setGroups(await getGroupedContent({ type: "announcement" }));
  useEffect(() => { load().catch(console.error); }, []);
  const announcements = [...(groups.allUniversity || []), ...(groups.myDepartment || []), ...(groups.allowedOthers || [])];

  return (
    <main className="content-list-page">
      <section className="content-list-hero">
        <div>
          <span>Announcements</span>
          <h1>Campus notices</h1>
          <p>Approved notices appear based on campus, department and class visibility.</p>
        </div>
        <Link to="/submit">Create Notice</Link>
      </section>
      <section className="content-list-grid">
        {announcements.length ? announcements.map((item) => <ContentCard key={item._id} item={item} onChanged={load} />) : <div className="empty-card">No announcements found. Use Create Notice to submit one.</div>}
      </section>
    </main>
  );
};

export default Announcements;
