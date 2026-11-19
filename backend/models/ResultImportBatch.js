import mongoose from "mongoose";
import { tenantScopePlugin } from "../utils/tenantContext.js";

const rowSchema = new mongoose.Schema({
  sourceRow: { type: Number, required: true },
  rollNumber: { type: String, trim: true, default: "" },
  studentName: { type: String, default: "" },
  uploadedStudentName: { type: String, default: "" },
  courseCode: { type: String, trim: true, default: "" },
  courseName: { type: String, trim: true, default: "" },
  semester: { type: String, trim: true, default: "" },
  examSession: { type: String, trim: true, default: "" },
  marks: { type: Number, min: 0, default: null },
  maxMarks: { type: Number, min: 1, default: null },
  grade: { type: String, default: "" },
  student: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  application: { type: mongoose.Schema.Types.ObjectId, ref: "AcademicApplication" },
  supersedes: { type: mongoose.Schema.Types.ObjectId, ref: "OfficialResult" },
  validationErrors: { type: [String], default: [] },
  warnings: { type: [String], default: [] },
  correctedAt: Date,
  correctedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { _id: true });

const schema = new mongoose.Schema({
  institutionId: { type: mongoose.Schema.Types.ObjectId, ref: "Institution", required: true, index: true },
  department: { type: String, default: "" },
  academicYear: { type: String, default: "" },
  subjectCode: { type: String, default: "" },
  examinationType: { type: String, enum: ["regular", "supplementary", "improvement", "revaluation"], default: "regular" },
  examSession: { type: String, required: true, trim: true },
  filename: { type: String, required: true, maxlength: 180 },
  fileSha256: { type: String, required: true },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  status: { type: String, enum: ["needs_correction", "ready", "confirmed", "published", "rejected"], default: "needs_correction", index: true },
  rows: { type: [rowSchema], default: [] },
  totalRows: { type: Number, default: 0 },
  validRows: { type: Number, default: 0 },
  rejectedRows: { type: Number, default: 0 },
  warningsCount: { type: Number, default: 0 },
  confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  confirmedAt: Date,
  publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  publishedAt: Date,
  history: [{ action: String, actor: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, at: { type: Date, default: Date.now }, metadata: mongoose.Schema.Types.Mixed }],
}, { timestamps: true });
schema.index({ institutionId: 1, createdAt: -1 });
schema.index({ institutionId: 1, fileSha256: 1 }, { unique: true, name: "result_import_file_unique" });
schema.options.optimisticConcurrency = true;
schema.plugin(tenantScopePlugin, { field: "institutionId" });
export default mongoose.model("ResultImportBatch", schema);
