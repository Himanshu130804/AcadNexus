import mongoose from "mongoose";
import { tenantScopePlugin } from "../utils/tenantContext.js";

const facultyProfileSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    name: { type: String, required: true },
    department: String,
    designation: String,
    email: String,
    subjects: [String],
    qualification: String,
    experience: String,
    officeHours: String,
    cabin: String,
    bio: String,
  },
  { timestamps: true }
);

facultyProfileSchema.plugin(tenantScopePlugin, { field: "institutionId" });

export default mongoose.model("FacultyProfile", facultyProfileSchema);
