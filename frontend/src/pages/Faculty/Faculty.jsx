import React, { useContext, useEffect, useMemo, useState } from "react";
import { AuthContext } from "../../context/AuthContext";
import { createFacultyProfile, getFacultyProfiles } from "../../api/facultyApi";
import { getUsers } from "../../api/adminApi";
import "./Faculty.css";

const teacherRoles = ["teacher", "teacher_admin", "hod"];

const Faculty = () => {
  const { user } = useContext(AuthContext);
  const canCreate = ["teacher_admin", "hod", "super_admin"].includes(user?.role);
  const [list, setList] = useState([]);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ name: "", department: "", designation: "", email: "", subjects: "", qualification: "", experience: "", officeHours: "", cabin: "", bio: "" });

  const load = async () => {
    const profiles = await getFacultyProfiles();
    let users = [];
    try { users = await getUsers(); } catch { users = []; }
    const profileEmails = new Set((profiles || []).map((p) => String(p.email || p.user?.email || "").toLowerCase()).filter(Boolean));
    const fallbackTeachers = (users || [])
      .filter((u) => teacherRoles.includes(u.role) && !profileEmails.has(String(u.email || "").toLowerCase()))
      .map((u) => ({
        _id: `user-${u._id}`,
        name: u.name,
        email: u.email,
        department: u.department || "Department pending",
        designation: u.designation || (u.role === "hod" ? "Head of Department" : "Faculty"),
        subjects: (u.charges || []).map((c) => c.subject).filter(Boolean),
        qualification: u.qualification || "Not updated",
        experience: u.experience || "Not updated",
        officeHours: u.officeHours || "Not updated",
        cabin: u.cabin || "Not updated",
        bio: "Profile details can be completed by the teacher or admin.",
        user: u,
      }));
    setList([...(profiles || []), ...fallbackTeachers]);
  };

  useEffect(() => { load(); }, []);

  const visibleList = useMemo(() => {
    if (user?.role === "hod" && user.department) {
      return list.filter((faculty) => String(faculty.department || faculty.user?.department || "").toLowerCase() === String(user.department).toLowerCase());
    }
    return list;
  }, [list, user]);

  const submit = async (e) => {
    e.preventDefault();
    await createFacultyProfile({ ...form, subjects: form.subjects.split(",").map((s) => s.trim()).filter(Boolean) });
    alert("Faculty profile added");
    setForm({ name: "", department: "", designation: "", email: "", subjects: "", qualification: "", experience: "", officeHours: "", cabin: "", bio: "" });
    load();
  };

  return (
    <main className="feature-page faculty-page">
      <section className="feature-hero">
        <span>Faculty Profiles</span>
        <h1>Know your teachers</h1>
        <p>Teachers are shown as professional cards. Open a card to view department, subjects, office hours, contact details and profile information.</p>
      </section>

      {canCreate && (
        <section className="feature-panel">
          <h2>Add / complete faculty profile</h2><br />
          <form className="feature-form" onSubmit={submit}>
            <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input placeholder="Department" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
            <input placeholder="Designation" value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} />
            <input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <input placeholder="Subjects comma separated" className="wide" value={form.subjects} onChange={(e) => setForm({ ...form, subjects: e.target.value })} />
            <input placeholder="Qualification" value={form.qualification} onChange={(e) => setForm({ ...form, qualification: e.target.value })} />
            <input placeholder="Experience" value={form.experience} onChange={(e) => setForm({ ...form, experience: e.target.value })} />
            <input placeholder="Office Hours" value={form.officeHours} onChange={(e) => setForm({ ...form, officeHours: e.target.value })} />
            <input placeholder="Cabin" value={form.cabin} onChange={(e) => setForm({ ...form, cabin: e.target.value })} />
            <textarea placeholder="Bio" value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} />
            <button>Add Faculty</button>
          </form>
        </section>
      )}

      {!visibleList.length && <section className="feature-panel"><h2>No faculty profiles yet.</h2><p>Once teachers/HODs are created or profiles are completed, faculty cards will appear here.</p></section>}

      <section className="feature-grid faculty-card-grid">
        {visibleList.map((faculty) => (
          <button type="button" className="feature-card faculty-card-button" key={faculty._id} onClick={() => setSelected(faculty)}>
            <span className="feature-tag">{faculty.department || faculty.user?.department || "Department pending"}</span>
            <h3>{faculty.name || faculty.user?.name}</h3>
            <p>{faculty.designation || "Faculty"}</p>
            <p><b>Subjects:</b> {faculty.subjects?.length ? faculty.subjects.join(", ") : "Assigned subjects pending"}</p>
            <p><b>Office:</b> {[faculty.officeHours, faculty.cabin].filter(Boolean).join(" • ") || "Not updated"}</p>
          </button>
        ))}
      </section>

      {selected && (
        <div className="faculty-modal-backdrop" onClick={() => setSelected(null)}>
          <article className="faculty-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelected(null)}>×</button>
            <span className="feature-tag">{selected.department || selected.user?.department || "Department pending"}</span>
            <h2>{selected.name || selected.user?.name}</h2>
            <p className="muted-text">{selected.designation || "Faculty"}</p>
            <div className="faculty-profile-grid">
              <p><span>Email</span><b>{selected.email || selected.user?.email || "Not updated"}</b></p>
              <p><span>Subjects</span><b>{selected.subjects?.length ? selected.subjects.join(", ") : "Pending"}</b></p>
              <p><span>Qualification</span><b>{selected.qualification || "Not updated"}</b></p>
              <p><span>Experience</span><b>{selected.experience || "Not updated"}</b></p>
              <p><span>Office hours</span><b>{selected.officeHours || "Not updated"}</b></p>
              <p><span>Cabin</span><b>{selected.cabin || "Not updated"}</b></p>
            </div>
            <p>{selected.bio || "No bio added yet."}</p>
          </article>
        </div>
      )}
    </main>
  );
};

export default Faculty;
