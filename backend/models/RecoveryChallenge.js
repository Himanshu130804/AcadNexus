import mongoose from "mongoose";
const schema = new mongoose.Schema({ user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true }, institutionId: { type: mongoose.Schema.Types.ObjectId, ref: "Institution", default: null, index: true }, otpHash: { type: String, required: true, select: false }, resetGrantHash: { type: String, select: false }, expiresAt: { type: Date, required: true, index: { expires: 0 } }, resendAt: { type: Date, required: true }, attempts: { type: Number, default: 0 }, verifiedAt: Date, consumedAt: Date, createdAt: { type: Date, default: Date.now } });
schema.index({ user: 1, consumedAt: 1, createdAt: -1 });
export default mongoose.model("RecoveryChallenge", schema);
