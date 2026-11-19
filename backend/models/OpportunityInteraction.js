import mongoose from "mongoose";
import { tenantScopePlugin } from "../utils/tenantContext.js";
const schema = new mongoose.Schema({ institutionId: { type: mongoose.Schema.Types.ObjectId, ref: "Institution", required: true, index: true }, opportunity: { type: mongoose.Schema.Types.ObjectId, ref: "Opportunity", required: true, index: true }, student: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true }, kind: { type: String, enum: ["bookmark", "dismiss", "feedback", "click", "apply"], required: true }, feedback: { type: String, enum: ["relevant", "not_relevant", "already_applied", "not_interested", "other"], default: undefined }, note: { type: String, maxlength: 500, default: "" } }, { timestamps: true });
schema.index({ institutionId: 1, opportunity: 1, student: 1, kind: 1 }, { unique: true });
schema.plugin(tenantScopePlugin, { field: "institutionId" });
export default mongoose.model("OpportunityInteraction", schema);
