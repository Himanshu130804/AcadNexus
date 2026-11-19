import mongoose from "mongoose";
import { tenantScopePlugin } from "../utils/tenantContext.js";
const recoveryJobSchema = new mongoose.Schema({
  institution: { type: mongoose.Schema.Types.ObjectId, ref: "Institution", default: null, index: true },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  scope: { type: String, enum: ["institution", "platform"], required: true },
  type: { type: String, enum: ["restore", "export", "point_in_time_restore"], required: true },
  status: { type: String, enum: ["requested", "approved", "running", "completed", "failed", "cancelled"], default: "requested", index: true },
  reason: { type: String, required: true },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  startedAt: Date, completedAt: Date, backupReference: String, resultSummary: String, errorCode: String
}, { timestamps: true });
recoveryJobSchema.index({ scope: 1, status: 1, createdAt: -1 });
recoveryJobSchema.plugin(tenantScopePlugin, { field: "institution" });

export default mongoose.model("RecoveryJob", recoveryJobSchema);
