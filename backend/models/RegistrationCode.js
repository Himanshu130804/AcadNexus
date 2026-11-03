import mongoose from "mongoose";
import { tenantScopePlugin } from "../utils/tenantContext.js";

const registrationCodeSchema = new mongoose.Schema(
  {
    codeHash: { type: String, required: true, unique: true, index: true, select: false },
    codePrefix: { type: String, required: true, trim: true },
    codeType: {
      type: String,
      enum: ["institution_admin", "vice_chancellor", "teacher", "student", "staff", "edp"],
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: ["super_admin", "institute_admin", "vice_chancellor", "teacher", "student", "staff", "edp"],
      required: true,
    },
    institution: { type: mongoose.Schema.Types.ObjectId, ref: "Institution", required: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    expiresAt: { type: Date, required: true, index: true },
    maxUses: { type: Number, min: 1, max: 1000, default: 1 },
    usedCount: { type: Number, min: 0, default: 0 },
    status: { type: String, enum: ["active", "used", "expired", "revoked"], default: "active", index: true },
    usedBy: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        usedAt: { type: Date },
      },
    ],
    revokedAt: { type: Date, default: null },
    revokedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

registrationCodeSchema.index({ institution: 1, status: 1, codeType: 1, createdAt: -1 });
// A teacher/EDP code is a shared institute credential: only one active code per role may exist.
// Expired active records are transitioned to `expired` before issuing a replacement.
registrationCodeSchema.index(
  { institution: 1, codeType: 1 },
  { unique: true, partialFilterExpression: { status: "active", codeType: { $in: ["teacher", "edp"] } } }
);
registrationCodeSchema.plugin(tenantScopePlugin, { field: "institution" });

export default mongoose.model("RegistrationCode", registrationCodeSchema);
