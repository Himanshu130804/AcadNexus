import mongoose from "mongoose";
import { tenantScopePlugin } from "../utils/tenantContext.js";

const reportSchema = new mongoose.Schema(
  {
    content: { type: mongoose.Schema.Types.ObjectId, ref: "Content", required: true },
    reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    reason: {
      type: String,
      enum: ["Spam", "Wrong Notes", "Offensive Content", "Misinformation", "Duplicate Content", "Fake Announcement", "Other"],
      required: true,
    },
    details: String,
    status: {
      type: String,
      enum: ["pending", "reviewed", "resolved", "dismissed"],
      default: "pending",
    },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    adminRemarks: String,
  },
  { timestamps: true }
);

reportSchema.plugin(tenantScopePlugin, { field: "institutionId" });

export default mongoose.model("Report", reportSchema);
