import mongoose from "mongoose";
import { tenantScopePlugin } from "../utils/tenantContext.js";

const timetableSchema = new mongoose.Schema(
  {
    department: { type: String, required: true, trim: true },
    programme: { type: String, trim: true },
    year: { type: String, trim: true },
    semester: { type: String, required: true, trim: true },
    section: { type: String, default: "A", trim: true },
    groupType: { type: String, enum: ["full_section", "sub_group", "lab_batch", "elective", "specialization"], default: "full_section" },
    groupName: { type: String, default: "All", trim: true },
    day: { type: String, required: true, trim: true },
    startTime: { type: String, required: true, trim: true },
    endTime: { type: String, required: true, trim: true },
    subject: { type: String, required: true, trim: true },
    faculty: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    facultyName: { type: String, trim: true },
    room: { type: String, trim: true },
    isEditableByHod: { type: Boolean, default: true },
  },
  { timestamps: true }
);

timetableSchema.index({ institutionId: 1, department: 1, programme: 1, year: 1, semester: 1, section: 1, groupType: 1, groupName: 1 });
timetableSchema.index({ institutionId: 1, faculty: 1 });
timetableSchema.index({ institutionId: 1, day: 1, startTime: 1 });

timetableSchema.plugin(tenantScopePlugin, { field: "institutionId" });

export default mongoose.model("Timetable", timetableSchema);
