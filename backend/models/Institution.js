import mongoose from "mongoose";

const institutionSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  type: { type: String, enum: ["university", "college", "institute", "school", "other"], default: "college" },
  status: { type: String, enum: ["pending", "active", "suspended", "archived"], default: "pending", index: true },
  branding: { logoUrl: String, primaryColor: String, accentColor: String },
  contact: { email: String, phone: String, website: String },
  address: { line1: String, city: String, state: String, country: String, postalCode: String },
  settings: { academicYear: String, timezone: { type: String, default: "Asia/Kolkata" }, registrationMode: { type: String, enum: ["invite", "domain", "open"], default: "invite" } },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  deletedAt: { type: Date, default: null },
  // Latest archival record (cleared on restore). Full lifecycle lives in archiveHistory.
  archive: {
    archivedAt: { type: Date, default: null },
    archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reason: { type: String, default: "", maxlength: 500 },
    previousStatus: { type: String, enum: ["pending", "active", "suspended", "archived"], default: undefined }
  },
  archiveHistory: [{
    action: { type: String, enum: ["archived", "restored"], required: true },
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    byRole: { type: String, default: "" },
    at: { type: Date, default: Date.now },
    reason: { type: String, default: "", maxlength: 500 },
    fromStatus: String,
    toStatus: String
  }]
}, { timestamps: true });
institutionSchema.index({ name: 1 });
institutionSchema.index({ deletedAt: 1, status: 1 });
export default mongoose.model("Institution", institutionSchema);
