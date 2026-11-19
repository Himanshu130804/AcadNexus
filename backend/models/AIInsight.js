import mongoose from "mongoose";
import { tenantScopePlugin } from "../utils/tenantContext.js";

const aiInsightSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  insightType: { type: String, enum: ["performance", "trend", "anomaly", "attention", "recommendation"], required: true },
  result: { type: mongoose.Schema.Types.Mixed, required: true },
  supportingEvidence: [{ type: String, maxlength: 500 }],
  modelVersion: { type: String, required: true, maxlength: 100 },
  generatedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, index: { expires: 0 } },
}, { timestamps: true });
aiInsightSchema.index({ institutionId: 1, student: 1, insightType: 1, generatedAt: -1 });
aiInsightSchema.plugin(tenantScopePlugin, { field: "institutionId" });
export default mongoose.model("AIInsight", aiInsightSchema);
