import mongoose from "mongoose";
import { tenantScopePlugin } from "../utils/tenantContext.js";

const schema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  title: String,
  message: String,
  read: { type: Boolean, default: false }
}, { timestamps: true });

schema.plugin(tenantScopePlugin, { field: "institutionId" });

export default mongoose.model("Notification", schema);
