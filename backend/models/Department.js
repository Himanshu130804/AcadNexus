import mongoose from "mongoose";
import { tenantScopePlugin } from "../utils/tenantContext.js";
const departmentSchema = new mongoose.Schema({
  institution: { type: mongoose.Schema.Types.ObjectId, ref: "Institution", required: true, index: true },
  name: { type: String, required: true, trim: true },
  code: { type: String, required: true, trim: true, uppercase: true },
  description: String,
  head: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  status: { type: String, enum: ["active", "inactive"], default: "active" },
  programmes: [{ name: String, code: String, award: String, durationYears: Number, mode: String }],
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });
departmentSchema.index({ institution: 1, code: 1 }, { unique: true });
departmentSchema.index({ institution: 1, name: 1 }, { unique: true });
departmentSchema.plugin(tenantScopePlugin, { field: "institution" });

export default mongoose.model("Department", departmentSchema);
