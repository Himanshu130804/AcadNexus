import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getGroupedContent } from "../../api/contentApi";
import ContentCard from "../../components/ContentCard/ContentCard";
import "./Events.css";

const Events = () => {
  const [groups, setGroups] = useState({ allUniversity: [], myDepartment: [], allowedOthers: [] });

  const load = async () => setGroups(await getGroupedContent({ type: "event" }));

  useEffect(() => { load().catch(console.error); }, []);

  const events = [...(groups.allUniversity || []), ...(groups.myDepartment || []), ...(groups.allowedOthers || [])];

  return (
    <main className="content-list-page">
      <section className="content-list-hero">
        <div>
          <span>Events</span>
          <h1>Campus events</h1>
          <p>Approved university, department and class events appear here.</p>
        </div>
        <Link to="/submit">Create Event</Link>
      </section>
      <section className="content-list-grid">
        {events.length ? events.map((item) => <ContentCard key={item._id} item={item} onChanged={load} />) : <div className="empty-card">No events found. Use Create Event to submit one.</div>}
      </section>
    </main>
  );
};

export default Events;
