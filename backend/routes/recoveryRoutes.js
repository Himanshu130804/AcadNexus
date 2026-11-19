import express from "express";
import { authRateLimit } from "../middleware/securityMiddleware.js";
import { startOtpRecovery, verifyOtpRecovery, completeOtpRecovery } from "../controllers/recoveryController.js";
const router = express.Router();
router.post("/start", authRateLimit, startOtpRecovery);
router.post("/verify", authRateLimit, verifyOtpRecovery);
router.post("/complete", authRateLimit, completeOtpRecovery);
export default router;
