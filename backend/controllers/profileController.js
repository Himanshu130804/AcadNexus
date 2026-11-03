import User from "../models/User.js";
import AcademicMaster from "../models/AcademicMaster.js";

const parseArrayField = (value) => {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (typeof value !== "string") return [];

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map(String).map((item) => item.trim()).filter(Boolean);
  } catch {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }

  return [];
};

export const getMyProfile = async (req, res) => {
  const user = await User.findById(req.user._id).select("-password");
  res.json(user);
};

export const updateMyProfile = async (req, res) => {
  const currentUser = await User.findById(req.user._id);

  if (!currentUser) {
    res.status(404);
    throw new Error("User not found");
  }

  if (currentUser.role === "super_admin") {
    res.status(403);
    throw new Error("Super Admin profile updates must be managed through account governance settings.");
  }

  const updates = {};
  const simplePersonalFields = ["phone", "address", "bio"];

  simplePersonalFields.forEach((field) => {
    if (req.body[field] !== undefined) updates[field] = String(req.body[field]).trim();
  });

  if (req.body.skills !== undefined) updates.skills = parseArrayField(req.body.skills);

  if (currentUser.role === "teacher_admin") {
    if (req.body.subjects !== undefined) updates.subjects = parseArrayField(req.body.subjects);
    ["officeHours", "qualification", "experience"].forEach((field) => {
      if (req.body[field] !== undefined) updates[field] = String(req.body[field]).trim();
    });
  }

  if (req.file) updates.profilePhoto = req.file.path;

  const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true, runValidators: true }).select("-password");
  res.json(user);
};

export const getMyCourses = async (req, res) => {
  const user = await User.findById(req.user._id).select("-password");
  const filter = { type: "subject", isActive: true };

  if (user.department) {
    filter.$or = [{ department: user.department }, { department: "" }, { department: { $exists: false } }];
  }
  if (user.programme) filter.programme = { $in: [user.programme, "", null] };
  if (user.semester) filter.semester = { $in: [user.semester, "", null] };

  const courses = await AcademicMaster.find(filter).sort({ semester: 1, name: 1 });
  res.json(courses);
};
