import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { publicVerifyRateLimit } from "../middleware/securityMiddleware.js";
import { listResults, verifyResult } from "../controllers/officialResultController.js";
const router = express.Router();
router.get("/verify/:code", publicVerifyRateLimit, verifyResult);
router.get("/", protect, listResults);
// Legacy direct draft creation and per-record publication are intentionally disabled.
// All new official results must pass the staged import/confirmation/publication workflow.
export default router;
