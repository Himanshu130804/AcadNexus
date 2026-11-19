import React, { useContext } from "react";
import { Link } from "react-router-dom";
import { AuthContext } from "../../context/AuthContext";
import "./Forbidden.css";

const Forbidden = () => {
  const { user } = useContext(AuthContext);
  return (
    <main className="forbidden-page">
      <section className="forbidden-card">
        <span>403</span>
        <h1>This module is not available for your role</h1>
        <p>You are signed in as <b>{user?.role || "user"}</b>. AcadNexus now blocks mismatched student, teacher and super-admin workflows instead of showing the wrong panel.</p>
        <Link to="/dashboard">Back to dashboard</Link>
      </section>
    </main>
  );
};
export default Forbidden;
