import mongoose from "mongoose";
import { tenantScopePlugin } from "../utils/tenantContext.js";

const attendanceRecordSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  status: { type: String, enum: ["present", "absent"], default: "absent" },
});

const attendanceSchema = new mongoose.Schema(
  {
    department: { type: String, required: true, trim: true },
    programme: { type: String, required: true, trim: true },
    year: { type: String, required: true, trim: true },
    semester: { type: String, required: true, trim: true },
    section: { type: String, default: "A", trim: true },
    groupType: { type: String, default: "full_section", trim: true },
    groupName: { type: String, default: "All", trim: true },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: "AcademicMaster" },
    subject: { type: String, required: true, trim: true },
    teacherChargeId: { type: mongoose.Schema.Types.ObjectId },
    date: { type: String, required: true, trim: true },
    markedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    records: [attendanceRecordSchema],
  },
  { timestamps: true }
);

attendanceSchema.index({ institutionId: 1, department: 1, programme: 1, year: 1, semester: 1, section: 1, groupType: 1, groupName: 1, subject: 1, date: 1 }, { unique: true });
attendanceSchema.index({ institutionId: 1, "records.student": 1, date: -1 });

attendanceSchema.plugin(tenantScopePlugin, { field: "institutionId" });

export default mongoose.model("Attendance", attendanceSchema);
