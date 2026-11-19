import React, { useContext, useEffect, useMemo, useState } from "react";
import { AuthContext } from "../../context/AuthContext";
import { createClub, getClubs, joinClub, reviewClub } from "../../api/clubApi";
import "./Clubs.css";

const clubCategories = [
  "Academic",
  "Coding & Technology",
  "Robotics",
  "Cultural",
  "Sports",
  "Literary",
  "Music & Dance",
  "Photography",
  "Entrepreneurship",
  "NSS",
  "NCC",
  "Social Impact",
  "Other",
];

const initialForm = { name: "", category: "", customCategory: "", description: "" };

const Clubs = () => {
  const { user } = useContext(AuthContext);
  const canCreateClub = ["student_admin", "teacher", "teacher_admin", "hod", "super_admin"].includes(user?.role);
  const canReviewClub = ["teacher", "teacher_admin", "hod", "super_admin"].includes(user?.role);
  const [list, setList] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      setList(await getClubs());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const availableCategories = useMemo(() => {
    const fromClubs = list.map((club) => club.category).filter(Boolean);
    return ["All", ...new Set([...clubCategories.filter((item) => item !== "Other"), ...fromClubs])];
  }, [list]);

  const visibleClubs = useMemo(() => {
    if (categoryFilter === "All") return list;
    return list.filter((club) => club.category === categoryFilter);
  }, [categoryFilter, list]);

  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async (e) => {
    e.preventDefault();

    const finalCategory = form.category === "Other" ? form.customCategory.trim() : form.category;
    if (!form.name.trim() || !finalCategory) {
      alert("Please enter club name and choose a category.");
      return;
    }

    await createClub({
      name: form.name.trim(),
      category: finalCategory,
      description: form.description.trim(),
    });

    alert(user?.role === "student_admin" ? "Club submitted for approval." : "Club created and approved.");
    setForm(initialForm);
    load();
  };

  return (
    <main className="feature-page">
      <section className="feature-hero">
        <span>Clubs & Societies</span>
        <h1>Campus activities hub</h1>
        <p>Coding club, robotics, cultural club, NSS, NCC and other societies.</p>
      </section>

      {canCreateClub && (
        <section className="feature-panel">
          <div className="panel-title-row">
            <div>
              <h2>Create Club</h2>
              <p>Select a standard category so clubs stay searchable and professional.</p>
            </div>
          </div>
          <form className="feature-form" onSubmit={submit}>
            <input placeholder="Club Name" value={form.name} onChange={(e) => update("name", e.target.value)} />
            <select value={form.category} onChange={(e) => update("category", e.target.value)}>
              <option value="">Select Category</option>
              {clubCategories.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
            {form.category === "Other" && (
              <input placeholder="Custom Category" value={form.customCategory} onChange={(e) => update("customCategory", e.target.value)} />
            )}
            <textarea placeholder="Description" value={form.description} onChange={(e) => update("description", e.target.value)} />
            <button>Create Club</button>
          </form>
        </section>
      )}

      <section className="feature-panel compact-panel">
        <div className="panel-title-row">
          <div>
            <h2>Browse Clubs</h2>
            <p>Use category filter to keep the page clean on phone screens.</p>
          </div>
          <select className="category-filter" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            {availableCategories.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
        </div>
      </section>

      {loading && <section className="feature-panel">Loading clubs...</section>}

      {!loading && visibleClubs.length === 0 && (
        <section className="feature-panel">No clubs found for this category.</section>
      )}

      <section className="feature-grid">
        {visibleClubs.map((club) => (
          <article className="feature-card" key={club._id}>
            <span className="feature-tag">{club.category || "Club"}{club.status === "pending" ? " • Pending approval" : ""}</span>
            <h3>{club.name}</h3>
            <p>{club.description || "No description added yet."}</p>
            <p><b>Members:</b> {club.members?.length || 0}</p>
            {club.createdBy && <p><b>Created by:</b> {club.createdBy.name || "User"}</p>}
            {club.status === "pending" && canReviewClub && (
              <div className="club-review-actions">
                <button className="feature-btn" onClick={() => reviewClub(club._id, "approved").then(load)}>Approve</button>
                <button className="feature-btn ghost" onClick={() => reviewClub(club._id, "rejected").then(load)}>Reject</button>
              </div>
            )}
            {user && club.status !== "pending" && <button className="feature-btn" onClick={() => joinClub(club._id).then(load)}>Join Club</button>}
          </article>
        ))}
      </section>
    </main>
  );
};

export default Clubs;
