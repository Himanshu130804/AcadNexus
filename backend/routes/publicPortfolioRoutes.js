import express from "express";
import { publicVerifyRateLimit } from "../middleware/securityMiddleware.js";
import { getPublicPortfolio } from "../controllers/extendedAcademicController.js";
const router = express.Router();
router.get("/:studentId", publicVerifyRateLimit, getPublicPortfolio);
export default router;
