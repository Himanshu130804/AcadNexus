import mongoose from "mongoose";
import { tenantScopePlugin } from "../utils/tenantContext.js";

const clubSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    category: String,
    description: String,
    coordinator: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "approved" },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    events: [
      {
        title: String,
        date: String,
        description: String,
      },
    ],
  },
  { timestamps: true }
);

clubSchema.plugin(tenantScopePlugin, { field: "institutionId" });

export default mongoose.model("Club", clubSchema);
