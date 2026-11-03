import mongoose from "mongoose";
import { tenantScopePlugin } from "../utils/tenantContext.js";

const resultHistorySchema = new mongoose.Schema({
  action: { type: String, enum: ["created", "corrected", "published"], required: true },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  reason: { type: String, default: "" },
  snapshot: { type: mongoose.Schema.Types.Mixed },
  at: { type: Date, default: Date.now },
}, { _id: false });

const officialResultSchema = new mongoose.Schema({
  institutionId: { type: mongoose.Schema.Types.ObjectId, index: true, default: null },
  student: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  rollNumber: { type: String, required: true, trim: true },
  courseCode: { type: String, required: true, trim: true },
  courseName: { type: String, required: true, trim: true },
  semester: { type: String, required: true, trim: true },
  examSession: { type: String, required: true, trim: true },
  marks: { type: Number, required: true, min: 0 },
  maxMarks: { type: Number, required: true, min: 1 },
  grade: { type: String, default: "" },
  status: { type: String, enum: ["draft", "published"], default: "draft", index: true },
  verificationCode: { type: String, unique: true, sparse: true },
  history: [resultHistorySchema],
  publishedAt: Date,
}, { timestamps: true });

officialResultSchema.index({ institutionId: 1, rollNumber: 1, courseCode: 1, semester: 1, examSession: 1 }, { unique: true });
officialResultSchema.plugin(tenantScopePlugin, { field: "institutionId" });

export default mongoose.model("OfficialResult", officialResultSchema);
