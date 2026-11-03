import mongoose from "mongoose";
import { tenantScopePlugin } from "../utils/tenantContext.js";

const facultyRequestSchema = new mongoose.Schema(
  {
    requestingDepartment: { type: String, required: true },
    targetDepartment: { type: String, required: true },
    programme: { type: String, required: true },
    year: { type: String, default: "All" },
    semester: { type: String, required: true },
    section: { type: String, default: "All" },
    groupType: { type: String, default: "full_section" },
    groupName: { type: String, default: "All" },
    subject: { type: String, required: true },
    lecturesPerWeek: { type: Number, default: 1 },
    expectedHoursPerWeek: { type: Number, default: 1 },
    reason: { type: String, default: "" },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "cancelled"],
      default: "pending",
    },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    processedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    assignedTeacher: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    decisionNote: { type: String, default: "" },
    processedAt: Date,
  },
  { timestamps: true }
);

facultyRequestSchema.index({ requestingDepartment: 1, targetDepartment: 1, status: 1 });
facultyRequestSchema.index({ requestedBy: 1, status: 1 });
facultyRequestSchema.index({ assignedTeacher: 1 });

facultyRequestSchema.plugin(tenantScopePlugin, { field: "institutionId" });

export default mongoose.model("FacultyRequest", facultyRequestSchema);
