import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getRegistrationAcademicOptions } from "../../api/academicApi";
import { getInstitutions, registerUser, validateRegistrationCode } from "../../api/authApi";
import "./Register.css";

const emptyOptions = { departments: [], programmes: [], years: [], semesters: [], sections: [] };

const accountTypes = [
  ["student", "Student", "Register directly without a code"],
  ["teacher", "Teacher / Faculty", "Use the shared institute code"],
  ["edp", "EDP", "Use the shared institute code"],
  ["staff", "Staff", "Use the registration code provided to you"],
  ["institute_admin", "Institution Admin", "Use the authorized admin code"],
  ["vice_chancellor", "Vice Chancellor", "Use the authorized VC code"],
];

const roleLabel = {
  institute_admin: "Institution Admin",
  vice_chancellor: "Vice Chancellor",
  teacher: "Teacher / Faculty",
  student: "Student",
  staff: "Staff",
  edp: "EDP",
};

const roleFromCode = (role) => role === "super_super_admin" || role === "platform_super_admin" ? "platform_owner" : role;

const semesterForYear = (semesterName = "", yearName = "") => {
  const sem = Number(String(semesterName).match(/\d+/)?.[0] || 0);
  const year = Number(String(yearName).match(/\d+/)?.[0] || 0);
  if (!sem || !year) return true;
  return sem === year * 2 - 1 || sem === year * 2;
};

export default function Register() {
  const navigate = useNavigate();
  const [accountType, setAccountType] = useState("");
  const [institutions, setInstitutions] = useState([]);
  const [options, setOptions] = useState(emptyOptions);
  const [code, setCode] = useState("");
  const [registration, setRegistration] = useState(null);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    institutionId: "",
    name: "",
    email: "",
    password: "",
    department: "",
    programme: "",
    year: "",
    semester: "",
    section: "",
    rollNumber: "",
    employeeId: "",
    designation: "",
    admissionYear: "",
  });

  useEffect(() => {
    document.title = "Register · AcadNexus";
    getInstitutions()
      .then((data) => setInstitutions(Array.isArray(data) ? data : []))
      .catch(() => setInstitutions([]));
  }, []);

  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const selectAccountType = (type) => {
    setAccountType(type);
    setCode("");
    setRegistration(null);
    setOptions(emptyOptions);
    setMessage("");
    setError("");
  };

  const verifyCode = async () => {
    if (!code.trim()) return;
    setChecking(true);
    setError("");
    setMessage("");
    setRegistration(null);

    try {
      const data = await validateRegistrationCode(code.trim());
      const actualRole = roleFromCode(data.role);
      if (actualRole !== accountType) {
        setError(`This code is for ${roleLabel[actualRole] || actualRole}, not ${roleLabel[accountType] || accountType}.`);
        return;
      }

      setRegistration(data);
      setMessage("Code verified. You can now complete the registration form.");
      const academic = await getRegistrationAcademicOptions({ institutionId: data.institution._id });
      setOptions({ ...emptyOptions, ...academic });
    } catch (err) {
      setError(err.response?.data?.message || "Registration code could not be verified.");
    } finally {
      setChecking(false);
    }
  };

  const selectStudentInstitution = async (institutionId) => {
    update("institutionId", institutionId);
    setOptions(emptyOptions);
    setError("");
    if (!institutionId) return;
    try {
      const academic = await getRegistrationAcademicOptions({ institutionId });
      setOptions({ ...emptyOptions, ...academic });
    } catch (err) {
      setError(err.response?.data?.message || "Could not load the academic options for this institution.");
    }
  };

  const programmes = useMemo(() => {
    if (!form.department) return [];
    return (options.programmes || []).filter((item) => !item.department || item.department === form.department);
  }, [options.programmes, form.department]);

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!accountType) {
      setError("Please select how you want to register first.");
      return;
    }

    if (accountType !== "student" && !registration) {
      setError("Enter and verify the registration code provided by the authorized administrator.");
      return;
    }

    if (!form.name.trim() || !form.email.trim() || !form.password.trim()) {
      setError("Name, email and password are required.");
      return;
    }

    if (accountType === "student" && !form.institutionId) {
      setError("Please select your institution.");
      return;
    }

    if (["student", "teacher", "staff", "edp"].includes(accountType) && !form.department) {
      setError("Department is required for this registration type.");
      return;
    }

    if (accountType === "student" && (!form.rollNumber || !form.programme || !form.year || !form.semester || !form.section)) {
      setError("Complete the student academic details.");
      return;
    }

    if (["teacher", "staff", "edp"].includes(accountType) && (!form.employeeId || !form.designation)) {
      setError("Employee ID and designation are required for this registration type.");
      return;
    }

    try {
      await registerUser({
        ...form,
        accountType,
        registrationCode: accountType === "student" ? "" : code.trim(),
      });
      alert("Account created successfully. Please login.");
      navigate("/login");
    } catch (err) {
      setError(err.response?.data?.message || "Registration failed");
    }
  };

  const needsDepartment = ["student", "teacher", "staff", "edp"].includes(accountType);
  const needsEmployeeFields = ["teacher", "staff", "edp"].includes(accountType);
  const isCodeRole = accountType && accountType !== "student";

  return (
    <main className="register-page">
      <section className="register-card">
        <div className="register-intro">
          <span>AcadNexus · ACCOUNT REGISTRATION</span>
          <h1>Choose how you want to register.</h1>
          <p>
            Start by selecting your account type. Students register directly. Teachers, EDP staff and other authorized roles continue with the registration code provided by the appropriate administrator.
          </p>
          <button type="button" className="login-link intro-login-link" onClick={() => navigate("/login")}>
            Already have an account? <strong>Go to Login</strong>
          </button>
        </div>

        <form className="register-form" onSubmit={submit}>
          <div className="register-field-group">
            <div className="register-field-heading">
              <label>1. Select account type</label>
              <span>This choice comes before any registration code or personal details.</span>
            </div>
            <div className="account-toggle">
              {accountTypes.map(([value, label, description]) => (
                <button key={value} type="button" className={accountType === value ? "active" : ""} onClick={() => selectAccountType(value)}>
                  <span className="account-icon">{value === "student" ? "🎓" : value === "teacher" ? "👨‍🏫" : value === "edp" ? "🗂️" : value === "staff" ? "🧑‍💼" : value === "institute_admin" ? "🏢" : "🎖️"}</span>
                  <strong>{label}</strong>
                  <small>{description}</small>
                </button>
              ))}
            </div>
          </div>

          {!accountType && (
            <div className="register-placeholder">
              <strong>Select an account type to continue.</strong>
              <span>The registration form will appear after you choose Student or another authorized account type.</span>
            </div>
          )}

          {isCodeRole && (
            <div className="register-field-group code-step">
              <div className="register-field-heading">
                <label>2. Registration code</label>
                <span>
                  {accountType === "teacher" || accountType === "edp"
                    ? `Enter the shared ${accountType === "edp" ? "EDP" : "Teacher / Faculty"} institute code given to you by the VC or Institute Admin.`
                    : "Enter the authorized registration code given to you."}
                </span>
              </div>
              <div className="register-grid-2">
                <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Enter registration code" autoComplete="off" spellCheck="false" />
                <button type="button" className="btn verify-btn" onClick={verifyCode} disabled={checking || !code.trim()}>{checking ? "Verifying…" : "Verify code"}</button>
              </div>
              {registration && <div className="verified-code">
                <strong>{roleLabel[registration.role] || registration.role}</strong>
                <span>{registration.institution.name} · {registration.institution.code} · {registration.remainingUses} use(s) remaining · expires {new Date(registration.expiresAt).toLocaleString()}</span>
              </div>}
            </div>
          )}

          {accountType && (
            <>
              {accountType === "student" && (
                <div className="register-field-group">
                  <div className="register-field-heading">
                    <label>2. Institution</label>
                    <span>Students choose their active institution directly; no registration code is required.</span>
                  </div>
                  <select value={form.institutionId} onChange={(e) => selectStudentInstitution(e.target.value)} required>
                    <option value="">Select Institution</option>
                    {institutions.map((institution) => <option key={institution._id} value={institution._id}>{institution.name}</option>)}
                  </select>
                </div>
              )}

              {(accountType === "student" || registration) && (
                <>
                  <div className="register-field-heading form-step-heading"><label>{isCodeRole ? "3. Account details" : "3. Account details"}</label><span>Enter the details that will be used for your AcadNexus account.</span></div>
                  <input placeholder="Full Name" value={form.name} onChange={(e) => update("name", e.target.value)} required />
                  <input placeholder="Email" type="email" autoComplete="email" value={form.email} onChange={(e) => update("email", e.target.value)} required />

                  {needsDepartment && <select value={form.department} onChange={(e) => { update("department", e.target.value); update("programme", ""); }} required>
                    <option value="">Select Department</option>
                    {(options.departments || []).map((item) => <option key={item._id || item.name} value={item.name}>{item.name}</option>)}
                  </select>}

                  {accountType === "student" && <>
                    <select value={form.programme} onChange={(e) => update("programme", e.target.value)} required>
                      <option value="">Select Programme</option>
                      {programmes.map((item) => <option key={`${item.name}-${item.department}`} value={item.name}>{item.name}</option>)}
                    </select>
                    <div className="register-grid-2">
                      <select value={form.year} onChange={(e) => update("year", e.target.value)} required>
                        <option value="">Select Year</option>
                        {(options.years || []).map((item) => <option key={item._id || item.name} value={item.name}>{item.name}</option>)}
                      </select>
                      <select value={form.semester} onChange={(e) => update("semester", e.target.value)} required>
                        <option value="">Select Semester</option>
                        {(options.semesters || []).filter((item) => semesterForYear(item.name, form.year)).map((item) => <option key={item._id || item.name} value={item.name}>{item.name}</option>)}
                      </select>
                    </div>
                    <div className="register-grid-2">
                      <select value={form.section} onChange={(e) => update("section", e.target.value)} required>
                        <option value="">Select Section</option>
                        {(options.sections || []).map((item) => <option key={item._id || item.name} value={item.name}>{item.name}</option>)}
                      </select>
                      <input placeholder="Roll Number" value={form.rollNumber} onChange={(e) => update("rollNumber", e.target.value)} required />
                    </div>
                    <input placeholder="Admission Year (optional)" value={form.admissionYear} onChange={(e) => update("admissionYear", e.target.value)} />
                  </>}

                  {needsEmployeeFields && <div className="register-grid-2">
                    <input placeholder="Employee ID" value={form.employeeId} onChange={(e) => update("employeeId", e.target.value)} required />
                    <input placeholder="Designation" value={form.designation} onChange={(e) => update("designation", e.target.value)} required />
                  </div>}

                  {(accountType === "vice_chancellor" || accountType === "institute_admin") && <input placeholder="Designation (optional)" value={form.designation} onChange={(e) => update("designation", e.target.value)} />}

                  <input type="password" placeholder="Create Password (12+ chars, upper/lowercase and number)" autoComplete="new-password" minLength={12} maxLength={128} pattern="(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9]).{12,128}" value={form.password} onChange={(e) => update("password", e.target.value)} required />
                  {message && <div className="register-message" role="status">{message}</div>}
                  {error && <div className="register-error" role="alert">{error}</div>}
                  <button className="register-submit" type="submit">Create {roleLabel[accountType] || "Account"}</button>
                </>
              )}
            </>
          )}

          <div className="register-footer">
            <span>Already registered?</span>
            <button type="button" className="login-link" onClick={() => navigate("/login")}>Go to Login</button>
          </div>
        </form>
      </section>
    </main>
  );
}
