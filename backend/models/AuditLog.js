import mongoose from "mongoose";
import { tenantScopePlugin } from "../utils/tenantContext.js";

const schema = new mongoose.Schema({
  action: String,
  content: { type: mongoose.Schema.Types.ObjectId, ref: "Content" },
  student: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  admin: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  adminRole: String,
  status: String,
  remarks: String,
  // Optional structured fields used by institution / Vice Chancellor / registration-code events.
  targetId: { type: mongoose.Schema.Types.ObjectId, index: true, default: undefined },
  targetType: { type: String, default: undefined },
  outcome: { type: String, enum: ["success", "failure"], default: undefined },
  metadata: { type: mongoose.Schema.Types.Mixed, default: undefined }
}, { timestamps: true });

schema.index({ admin: 1, createdAt: -1 });
schema.index({ content: 1, createdAt: -1 });
schema.index({ status: 1, createdAt: -1 });

schema.plugin(tenantScopePlugin, { field: "institutionId" });

export default mongoose.model("AuditLog", schema);
