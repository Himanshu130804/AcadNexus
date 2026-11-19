import mongoose from "mongoose";
import { tenantScopePlugin } from "../utils/tenantContext.js";
const schema = new mongoose.Schema({ institutionId: { type: mongoose.Schema.Types.ObjectId, ref: "Institution", required: true, index: true }, student: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true }, subjectCode: { type: String, required: true, trim: true }, subjectName: { type: String, default: "" }, topicCode: { type: String, default: "" }, topicName: { type: String, required: true, trim: true }, assessmentName: { type: String, required: true, trim: true }, marks: { type: Number, required: true, min: 0 }, maxMarks: { type: Number, required: true, min: 0.01 }, assessedAt: { type: Date, required: true }, questionMapping: [{ questionCode: String, learningOutcome: String }] }, { timestamps: true });
schema.index({ institutionId: 1, student: 1, subjectCode: 1, topicCode: 1, assessedAt: -1 });
schema.plugin(tenantScopePlugin, { field: "institutionId" });
export default mongoose.model("TopicAssessment", schema);
