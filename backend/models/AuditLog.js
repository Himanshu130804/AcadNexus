import mongoose from "mongoose";
import { tenantScopePlugin } from "../utils/tenantContext.js";

const schema = new mongoose.Schema({
  action: String,
  content: { type: mongoose.Schema.Types.ObjectId, ref: "Content" },
  student: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  admin: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  adminRole: String,
  status: String,
  remarks: String
}, { timestamps: true });

schema.index({ admin: 1, createdAt: -1 });
schema.index({ content: 1, createdAt: -1 });
schema.index({ status: 1, createdAt: -1 });

schema.plugin(tenantScopePlugin, { field: "institutionId" });

export default mongoose.model("AuditLog", schema);
