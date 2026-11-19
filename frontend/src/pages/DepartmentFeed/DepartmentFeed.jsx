import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { getContent } from "../../api/contentApi";
import ContentCard from "../../components/ContentCard/ContentCard";

import "./DepartmentFeed.css";

const DepartmentFeed = () => {
  const { department } = useParams();

  const [events, setEvents] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [notes, setNotes] = useState([]);
  const [posts, setPosts] = useState([]);

  const load = async () => {
    const [eventData, announcementData, noteData, postData] = await Promise.all([
      getContent({ type: "event", department }),
      getContent({ type: "announcement", department }),
      getContent({ type: "note", department }),
      getContent({ type: "post", department }),
    ]);

    setEvents(eventData);
    setAnnouncements(announcementData);
    setNotes(noteData);
    setPosts(postData);
  };

  useEffect(() => {
    load();
  }, [department]);

  const renderSection = (title, items) => (
    <section className="department-section">
      <h2>{title}</h2>

      <div className="department-list">
        {items.length ? (
          items.map((item) => (
            <ContentCard key={item._id || item.id} item={item} onChanged={load} />
          ))
        ) : (
          <div className="empty-card">No {title.toLowerCase()} found.</div>
        )}
      </div>
    </section>
  );

  return (
    <div className="department-feed-page">
      <div className="breadcrumb">Home / Communities / {department}</div>

      <section className="department-feed-header">
        <span>Department Feed</span>
        <h1>{department}</h1>
        <p>
          View all events, announcements, notes and posts related to this department.
        </p>
      </section>

      {renderSection("Events", events)}
      {renderSection("Announcements", announcements)}
      {renderSection("Notes", notes)}
      {renderSection("Posts", posts)}
    </div>
  );
};

export default DepartmentFeed;
