import express from "express";
import { protect, allowRoles } from "../middleware/authMiddleware.js";
import { getPlatformReports } from "../controllers/platformReportController.js";

const router = express.Router();
router.get("/", protect, allowRoles("super_super_admin", "platform_super_admin", "institute_admin", "vice_chancellor", "student", "teacher"), getPlatformReports);
export default router;
