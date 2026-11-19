import express from "express";
import { authRateLimit } from "../middleware/securityMiddleware.js";
import { protect, allowRoles } from "../middleware/authMiddleware.js";
import { createRegistrationCode, listRegistrationCodes, revokeRegistrationCode, validateRegistrationCode } from "../controllers/registrationCodeController.js";

const router = express.Router();
router.post("/validate", authRateLimit, validateRegistrationCode);
router.get("/", protect, allowRoles("super_super_admin", "platform_super_admin", "super_admin", "institute_admin"), listRegistrationCodes);
router.post("/", protect, allowRoles("super_super_admin", "platform_super_admin", "super_admin", "institute_admin"), createRegistrationCode);
router.patch("/:id/revoke", protect, allowRoles("super_super_admin", "platform_super_admin", "super_admin", "institute_admin"), revokeRegistrationCode);
export default router;
