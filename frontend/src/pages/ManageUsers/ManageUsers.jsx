import React, { useContext, useEffect, useMemo, useState } from "react";
import { AuthContext } from "../../context/AuthContext";
import { getUsers, setUserStatus, updateUserAcademic } from "../../api/adminApi";
import "./ManageUsers.css";

const managerRoles = ["super_admin", "institute_admin", "vice_chancellor"];
const roleOptions = [
  ["student", "Student"], ["student_admin", "Student Admin"], ["teacher", "Teacher"], ["teacher_admin", "Teacher Admin"],
  ["hod", "HOD"], ["edp", "EDP"], ["department_admin", "Department Admin"], ["staff", "Staff"],
  ["institute_admin", "Institute Admin"], ["vice_chancellor", "Vice Chancellor"],
];

const statusLabel = (user) => user.tenantStatus === "banned" ? "Banned" : user.tenantStatus === "suspended" || user.isSuspended ? "Suspended" : "Active";

const ManageUsers = () => {
  const { user: currentUser } = useContext(AuthContext);
  const [users, setUsers] = useState([]);
  const [editing, setEditing] = useState(null);
  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [busyId, setBusyId] = useState(null);
  const [message, setMessage] = useState("");

  const isManager = managerRoles.includes(currentUser?.role);
  const canManageTarget = (target) => {
    if (!isManager || !target || target._id === currentUser?._id) return false;
    if (["super_super_admin", "platform_super_admin"].includes(target.role)) return false;
    if (currentUser?.role === "institute_admin" && target.role === "vice_chancellor") return false;
    return true;
  };

  const load = async () => {
    try { setUsers(await getUsers()); }
    catch (error) { setMessage(error?.response?.data?.message || "Could not load users."); }
  };

  useEffect(() => { load(); }, []);

  const visibleUsers = useMemo(() => users.filter((u) => {
    const haystack = `${u.name || ""} ${u.email || ""} ${u.role || ""} ${u.department || ""} ${u.employeeId || ""} ${u.rollNumber || ""}`.toLowerCase();
    const matchesText = haystack.includes(filter.toLowerCase());
    const status = statusLabel(u).toLowerCase();
    return matchesText && (statusFilter === "all" || status === statusFilter);
  }), [users, filter, statusFilter]);

  const startEdit = (target) => {
    if (!canManageTarget(target)) return setMessage("You cannot edit this account.");
    setMessage("");
    setEditing({ ...target });
  };

  const update = (key, value) => setEditing((prev) => ({ ...prev, [key]: value }));

  const save = async () => {
    if (!editing) return;
    try {
      setBusyId(editing._id);
      await updateUserAcademic(editing._id, editing);
      setMessage("User details updated successfully.");
      setEditing(null);
      await load();
    } catch (error) {
      setMessage(error?.response?.data?.message || "Could not update this user.");
    } finally { setBusyId(null); }
  };

  const changeStatus = async (target, status) => {
    if (!canManageTarget(target)) return setMessage("You cannot manage this account.");
    const verb = status === "banned" ? "ban" : status === "suspended" ? "suspend" : "reactivate";
    if (!window.confirm(`Are you sure you want to ${verb} ${target.name}?`)) return;
    try {
      setBusyId(target._id);
      await setUserStatus(target._id, status);
      setMessage(`${target.name} is now ${status}.`);
      await load();
    } catch (error) {
      setMessage(error?.response?.data?.message || `Could not ${verb} this account.`);
    } finally { setBusyId(null); }
  };

  return (
    <div className="manage-users-page">
      <div className="breadcrumb">Home / Manage Users</div>
      <section className="manage-card">
        <div className="manage-heading">
          <div><span className="eyebrow">Institute Administration</span><h1>Manage Users</h1><p>Edit institute user details and control account access.</p></div>
          <div className="manage-summary"><strong>{visibleUsers.length}</strong><span>visible users</span></div>
        </div>
        {message && <div className="manage-message">{message}</div>}
        <div className="user-toolbar">
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search name, email, role, department…" />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="all">All statuses</option><option value="active">Active</option><option value="suspended">Suspended</option><option value="banned">Banned</option></select>
        </div>

        <div className="user-grid">
          {visibleUsers.map((target) => {
            const self = target._id === currentUser?._id;
            const manageable = canManageTarget(target);
            return <article className={`user-box ${statusLabel(target).toLowerCase()}`} key={target._id}>
              <div className="user-box-top"><div className="avatar">{(target.name || "U").slice(0, 1).toUpperCase()}</div><div><h3>{target.name}</h3><p>{target.email}</p></div><span className={`status-pill ${statusLabel(target).toLowerCase()}`}>{statusLabel(target)}</span></div>
              <div className="user-meta"><span>{target.role}</span><span>{target.employeeId || target.rollNumber || "No ID"}</span><span>{target.department || "No department"}</span></div>
              <p className="academic-line">{[target.programme, target.year, target.semester, target.section].filter(Boolean).join(" / ") || "No academic allocation"}</p>
              <div className="user-actions">
                <button onClick={() => startEdit(target)} disabled={!manageable || busyId === target._id}>{self ? "Your account" : "Edit details"}</button>
                {manageable && statusLabel(target) !== "Suspended" && <button className="warning" onClick={() => changeStatus(target, "suspended")} disabled={busyId === target._id}>Suspend</button>}
                {manageable && statusLabel(target) === "Suspended" && <button className="success" onClick={() => changeStatus(target, "active")} disabled={busyId === target._id}>Reactivate</button>}
                {manageable && statusLabel(target) !== "Banned" && <button className="danger" onClick={() => changeStatus(target, "banned")} disabled={busyId === target._id}>Ban</button>}
                {manageable && statusLabel(target) === "Banned" && <button className="success" onClick={() => changeStatus(target, "active")} disabled={busyId === target._id}>Unban</button>}
              </div>
              {self && <small className="self-note">You cannot suspend or ban your own account.</small>}
            </article>;
          })}
        </div>
        {!visibleUsers.length && <div className="empty-users">No users match the current filters.</div>}
      </section>

      {editing && <section className="edit-modal"><div className="edit-card">
        <div className="edit-title"><div><span className="eyebrow">User profile</span><h2>Edit {editing.name}</h2></div><button className="close-btn" onClick={() => setEditing(null)}>×</button></div>
        <label>Name<input value={editing.name || ""} onChange={(e) => update("name", e.target.value)} /></label>
        <label>Email<input type="email" value={editing.email || ""} onChange={(e) => update("email", e.target.value)} /></label>
        <label>Phone<input value={editing.phone || ""} onChange={(e) => update("phone", e.target.value)} /></label>
        <label>Employee ID<input value={editing.employeeId || ""} onChange={(e) => update("employeeId", e.target.value)} /></label>
        <label>Roll Number<input value={editing.rollNumber || ""} onChange={(e) => update("rollNumber", e.target.value)} /></label>
        <label>Designation<input value={editing.designation || ""} onChange={(e) => update("designation", e.target.value)} /></label>
        <label>Role<select value={editing.role || "student"} onChange={(e) => update("role", e.target.value)}>{roleOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Department<input value={editing.department || ""} onChange={(e) => update("department", e.target.value)} /></label>
        <label>Programme<input value={editing.programme || ""} onChange={(e) => update("programme", e.target.value)} /></label>
        <label>Year<input value={editing.year || ""} onChange={(e) => update("year", e.target.value)} /></label>
        <label>Semester<input value={editing.semester || ""} onChange={(e) => update("semester", e.target.value)} /></label>
        <label>Section<input value={editing.section || ""} onChange={(e) => update("section", e.target.value)} /></label>
        <label>Group type<select value={editing.groupType || "full_section"} onChange={(e) => update("groupType", e.target.value)}><option value="full_section">Full Section</option><option value="sub_group">Sub Group</option><option value="lab_batch">Lab Batch</option><option value="elective">Elective</option><option value="specialization">Specialization</option></select></label>
        <label>Group name<input value={editing.groupName || ""} onChange={(e) => update("groupName", e.target.value)} /></label>
        <label>Lab batch<input value={editing.labBatch || ""} onChange={(e) => update("labBatch", e.target.value)} /></label>
        <label>Elective group<input value={editing.electiveGroup || ""} onChange={(e) => update("electiveGroup", e.target.value)} /></label>
        <label>Specialization<input value={editing.specialization || ""} onChange={(e) => update("specialization", e.target.value)} /></label>
        <label>Qualification<input value={editing.qualification || ""} onChange={(e) => update("qualification", e.target.value)} /></label>
        <label>Experience<input value={editing.experience || ""} onChange={(e) => update("experience", e.target.value)} /></label>
        <label>Address<textarea value={editing.address || ""} onChange={(e) => update("address", e.target.value)} /></label>
        <label>Bio<textarea value={editing.bio || ""} onChange={(e) => update("bio", e.target.value)} /></label>
        <div className="modal-actions"><button onClick={save} disabled={busyId === editing._id}>{busyId === editing._id ? "Saving…" : "Save changes"}</button><button className="cancel" onClick={() => setEditing(null)}>Cancel</button></div>
      </div></section>}
    </div>
  );
};

export default ManageUsers;
