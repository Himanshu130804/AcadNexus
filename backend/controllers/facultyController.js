import FacultyProfile from "../models/FacultyProfile.js";
import { searchRegex } from "../utils/search.js";
import User from "../models/User.js";

export const createFacultyProfile = async (req, res) => {
  const payload = { ...req.body };
  if (payload.user) {
    const user = await User.findById(payload.user).select("_id role");
    if (!user || !["teacher", "teacher_admin", "hod", "super_admin"].includes(user.role)) return res.status(400).json({ message: "Select a faculty member from your institute." });
  }
  const profile = await FacultyProfile.create(payload);
  res.status(201).json(profile);
};

export const getFacultyProfiles = async (req, res) => {
  const { department, search } = req.query;
  const filter = {};

  if (department) filter.department = searchRegex(department);

  if (search) {
    filter.$or = [
      { name: searchRegex(search) },
      { subjects: searchRegex(search) },
      { designation: searchRegex(search) },
    ];
  }

  const profiles = await FacultyProfile.find(filter).populate("user", "name email department role profilePhoto designation qualification experience officeHours phone subjects charges").sort({ name: 1 });

  const profileEmails = new Set(profiles.map((p) => String(p.email || p.user?.email || "").toLowerCase()).filter(Boolean));
  const userFilter = { role: { $in: ["teacher", "teacher_admin", "hod"] } };
  if (department) userFilter.department = searchRegex(department);
  if (search) userFilter.$or = [
    { name: searchRegex(search) },
    { department: searchRegex(search) },
    { designation: searchRegex(search) },
    { subjects: searchRegex(search) },
  ];

  const teachers = await User.find(userFilter).select("name email department role profilePhoto designation qualification experience officeHours phone subjects charges bio skills").sort({ name: 1 });
  const fallbackTeachers = teachers
    .filter((teacher) => !profileEmails.has(String(teacher.email || "").toLowerCase()))
    .map((teacher) => ({
      _id: `user-${teacher._id}`,
      user: teacher,
      name: teacher.name,
      email: teacher.email,
      department: teacher.department || "Department pending",
      designation: teacher.designation || (teacher.role === "hod" ? "Head of Department" : "Faculty"),
      subjects: [...new Set([...(teacher.subjects || []), ...((teacher.charges || []).map((c) => c.subject).filter(Boolean))])],
      qualification: teacher.qualification || "Not updated",
      experience: teacher.experience || "Not updated",
      officeHours: teacher.officeHours || "Not updated",
      phone: teacher.phone || "Not updated",
      photo: teacher.profilePhoto || "",
      bio: teacher.bio || "Profile details can be completed by the teacher or admin.",
    }));

  res.json([...profiles, ...fallbackTeachers]);
};

export const updateFacultyProfile = async (req, res) => {
  const allowed = ["name", "department", "designation", "email", "subjects", "qualification", "experience", "officeHours", "cabin", "bio"];
  const updates = Object.fromEntries(allowed.filter((key) => req.body[key] !== undefined).map((key) => [key, req.body[key]]));
  const existing = await FacultyProfile.findById(req.params.id).select("department");
  if (!existing) return res.status(404).json({ message: "Faculty profile not found" });
  if (req.user.role === "hod" && existing.department && String(existing.department).trim().toLowerCase() !== String(req.user.department || "").trim().toLowerCase()) {
    return res.status(403).json({ message: "HODs can update faculty profiles only within their department." });
  }
  const profile = await FacultyProfile.findByIdAndUpdate(req.params.id, { $set: updates }, { new: true, runValidators: true });
  if (!profile) return res.status(404).json({ message: "Faculty profile not found" });
  res.json(profile);
};
