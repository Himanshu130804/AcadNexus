import React, { useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../../context/AuthContext";
import { getMyProfile, updateMyProfile } from "../../api/profileApi";
import "./EditProfile.css";

const teacherRoles = ["teacher_admin"];
const studentRoles = ["student", "student_admin"];

const EditProfile = () => {
  const { user } = useContext(AuthContext);
  const role = user?.role || "student";
  const isTeacher = teacherRoles.includes(role);
  const isStudent = studentRoles.includes(role);

  const [form, setForm] = useState({
    phone: "",
    address: "",
    bio: "",
    skills: "",
    subjects: "",
    officeHours: "",
    qualification: "",
    experience: "",
  });
  const [saving, setSaving] = useState(false);
  const [photo, setPhoto] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    getMyProfile().then((profile) => {
      setForm({
        phone: profile.phone || "",
        address: profile.address || "",
        bio: profile.bio || "",
        skills: Array.isArray(profile.skills) ? profile.skills.join(", ") : "",
        subjects: Array.isArray(profile.subjects) ? profile.subjects.join(", ") : "",
        officeHours: profile.officeHours || "",
        qualification: profile.qualification || "",
        experience: profile.experience || "",
      });
    });
  }, []);

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);

    const data = new FormData();
    data.append("phone", form.phone);
    data.append("address", form.address);
    data.append("bio", form.bio);
    data.append("skills", JSON.stringify(form.skills.split(",").map((item) => item.trim()).filter(Boolean)));

    if (isTeacher) {
      data.append("subjects", JSON.stringify(form.subjects.split(",").map((item) => item.trim()).filter(Boolean)));
      data.append("officeHours", form.officeHours);
      data.append("qualification", form.qualification);
      data.append("experience", form.experience);
    }

    if (photo) data.append("profilePhoto", photo);

    await updateMyProfile(data);
    setSaving(false);
    navigate("/profile");
  };

  return (
    <div className="edit-profile-page">
      <div className="breadcrumb">Home / Profile / Edit</div>

      <form className="edit-profile-card" onSubmit={save}>
        <div className="edit-profile-header">
          <span>{isTeacher ? "Teacher profile" : "Student profile"}</span>
          <h1>Edit Personal Profile</h1>
          <p>{isTeacher ? "Update teaching details that students and admins can use." : "Update personal details only. Academic details are controlled by admins."}</p>
        </div>

        <section className="form-section full">
          <h2>Basic details</h2>
          <div className="responsive-form-grid">
            <label>
              Profile Photo
              <input type="file" accept=".jpg,.jpeg,.png,.webp" onChange={(e) => setPhoto(e.target.files?.[0] || null)} />
            </label>
            <label>
              Phone
              <input value={form.phone} inputMode="tel" onChange={(e) => update("phone", e.target.value)} />
            </label>
            <label>
              Address
              <input value={form.address} onChange={(e) => update("address", e.target.value)} />
            </label>
            <label>
              Skills
              <input placeholder={isTeacher ? "Teaching, Mentoring, Research" : "React, Java, Design"} value={form.skills} onChange={(e) => update("skills", e.target.value)} />
            </label>
          </div>
        </section>

        <section className="form-section full">
          <h2>Bio</h2>
          <label>
            Short introduction
            <textarea maxLength="320" value={form.bio} onChange={(e) => update("bio", e.target.value)} />
            <small>{form.bio.length}/320 characters</small>
          </label>
        </section>

        {isTeacher && (
          <section className="form-section full">
            <h2>Teacher details</h2>
            <div className="responsive-form-grid">
              <label>
                Subjects
                <input placeholder="DBMS, Computer Networks" value={form.subjects} onChange={(e) => update("subjects", e.target.value)} />
              </label>
              <label>
                Office Hours
                <input placeholder="Mon-Fri, 2 PM - 4 PM" value={form.officeHours} onChange={(e) => update("officeHours", e.target.value)} />
              </label>
              <label>
                Qualification
                <input placeholder="M.Tech, PhD" value={form.qualification} onChange={(e) => update("qualification", e.target.value)} />
              </label>
              <label>
                Experience
                <input placeholder="8 years" value={form.experience} onChange={(e) => update("experience", e.target.value)} />
              </label>
            </div>
          </section>
        )}

        {isStudent && (
          <p className="warning full">Academic details like roll number, department, programme, year, semester and section are admin-controlled.</p>
        )}

        <div className="form-actions full">
          <button type="button" className="secondary" onClick={() => navigate("/profile")}>Cancel</button>
          <button disabled={saving}>{saving ? "Saving..." : "Save Profile"}</button>
        </div>
      </form>
    </div>
  );
};

export default EditProfile;
