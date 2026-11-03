import React, { useEffect, useState } from "react";
import { getContent } from "../../api/contentApi";
import ContentCard from "../../components/ContentCard/ContentCard";
import "./NotesLibrary.css";

const NotesLibrary = () => {
  const [notes, setNotes] = useState([]);
  const [filters, setFilters] = useState({
    search: "",
    department: "",
    semester: "",
    subject: "",
  });

  const load = async () => {
    const data = await getContent({ type: "note", ...filters });
    setNotes(data);
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <main className="notes-page">
      <section className="notes-hero">
        <span>Notes Library</span>
        <h1>Verified Academic Resources</h1>
        <p>Browse approved PDF, Word, Excel, PPT and image notes by department, semester and subject.</p>
      </section>

      <section className="notes-filters">
        <input placeholder="Search notes..." value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} />
        <input placeholder="Department" value={filters.department} onChange={(e) => setFilters({ ...filters, department: e.target.value })} />
        <input placeholder="Semester" value={filters.semester} onChange={(e) => setFilters({ ...filters, semester: e.target.value })} />
        <input placeholder="Subject" value={filters.subject} onChange={(e) => setFilters({ ...filters, subject: e.target.value })} />
        <button onClick={load}>Search</button>
      </section>

      <section className="notes-grid">
        {notes.length ? notes.map((item) => <ContentCard key={item._id} item={item} onChanged={load} />) : <div className="empty-card">No notes found.</div>}
      </section>
    </main>
  );
};

export default NotesLibrary;
