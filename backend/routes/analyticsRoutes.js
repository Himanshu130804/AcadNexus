import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { publicVerifyRateLimit } from "../middleware/securityMiddleware.js";
import { getCohortClusters, getMyAnalytics } from "../controllers/analyticsController.js";

const router = express.Router();
router.get("/me", protect, publicVerifyRateLimit, getMyAnalytics);
router.get("/cohort-clusters", protect, publicVerifyRateLimit, getCohortClusters);
export default router;
