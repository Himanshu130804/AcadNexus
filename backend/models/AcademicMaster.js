import mongoose from "mongoose";
import { tenantScopePlugin } from "../utils/tenantContext.js";

const academicMasterSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["department", "programme", "year", "semester", "section", "course", "subject"],
      required: true,
    },
    name: { type: String, required: true },
    code: String,
    normalizedName: { type: String, required: true },
    department: { type: String, default: "" },
    programme: { type: String, default: "" },
    baseProgramme: { type: String, default: "" },
    variant: { type: String, default: "" },
    specialization: { type: String, default: "" },
    durationYears: { type: Number, default: 0 },
    semesterCount: { type: Number, default: 0 },
    degreeLevel: { type: String, default: "" },
    year: { type: String, default: "" },
    semester: { type: String, default: "" },
    credits: Number,
    category: String,
    subjectType: String,
    basketName: { type: String, default: "" },
    basketType: { type: String, default: "" },
    selectionLimit: { type: Number, default: 0 },
    groupName: { type: String, default: "" },
    teacher: String,
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

academicMasterSchema.index({ institutionId: 1, type: 1, normalizedName: 1, department: 1, programme: 1, year: 1, semester: 1, basketName: 1 });

academicMasterSchema.plugin(tenantScopePlugin, { field: "institutionId" });

export default mongoose.model("AcademicMaster", academicMasterSchema);
