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
  deletedAt: { type: Date, default: null }
}, { timestamps: true });
institutionSchema.index({ name: 1 });
export default mongoose.model("Institution", institutionSchema);
