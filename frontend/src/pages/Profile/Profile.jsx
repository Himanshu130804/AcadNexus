import React, { useEffect, useState } from "react";
import { getFileUrl } from "../../utils/fileUrl";
import { Link } from "react-router-dom";
import { getMyProfile } from "../../api/profileApi";
import "./Profile.css";


const academicFields = ["department", "programme", "year", "semester", "section", "admissionYear"];
const teacherFields = ["subjects", "officeHours", "qualification", "experience"];

const pretty = (value) => Array.isArray(value) ? (value.length ? value.join(", ") : "-") : (value || "-");

const Profile = () => {
  const [profile, setProfile] = useState(null);

  useEffect(() => { getMyProfile().then(setProfile); }, []);

  if (!profile) return <div className="profile-loading">Loading profile...</div>;

  const imageUrl = profile.profilePhoto ? getFileUrl(profile.profilePhoto) : "";
  const canEditPersonalProfile = profile.role !== "super_admin";
  const showAcademic = profile.role === "student" || profile.role === "student_admin" || profile.role === "super_admin";
  const showTeacher = profile.role === "teacher_admin";

  return (
    <div className="profile-page">
      <div className="breadcrumb">Home / Profile</div>

      <section className="profile-panel">
        {imageUrl ? <img src={imageUrl} alt={profile.name} className="profile-photo" /> : <div className="profile-avatar">{profile.name?.charAt(0)?.toUpperCase()}</div>}
        <div className="profile-summary">
          <span>{profile.role?.replaceAll("_", " ")}</span>
          <h1>{profile.name}</h1>
          <p>{profile.rollNumber || profile.employeeId || profile.email}</p>
          <p>{profile.email}</p>
          {canEditPersonalProfile ? (
            <Link to="/edit-profile"><button>Edit Personal Profile</button></Link>
          ) : (
            <small>Platform Owner account settings are managed from governance modules.</small>
          )}
        </div>
      </section>

      <section className="profile-info-card">
        <h2>Basic Details</h2>
        <div className="info-grid compact">
          <div><b>Role</b><span>{profile.role}</span></div>
          <div><b>Phone</b><span>{profile.phone || "-"}</span></div>
          <div><b>Address</b><span>{profile.address || "-"}</span></div>
          <div><b>Bio</b><span>{profile.bio || "-"}</span></div>
          <div><b>Skills</b><span>{pretty(profile.skills)}</span></div>
        </div>
      </section>

      {showAcademic && (
        <section className="profile-info-card">
          <h2>Academic Details</h2>
          <div className="info-grid">
            {academicFields.map((field) => <div key={field}><b>{field}</b><span>{pretty(profile[field])}</span></div>)}
          </div>
          <p className="note">Academic fields can be updated by authorized admins only.</p>
        </section>
      )}

      {showTeacher && (
        <section className="profile-info-card">
          <h2>Teacher Details</h2>
          <div className="info-grid">
            {teacherFields.map((field) => <div key={field}><b>{field}</b><span>{pretty(profile[field])}</span></div>)}
          </div>
        </section>
      )}
    </div>
  );
};

export default Profile;
