import express from "express";
import { protect, allowRoles } from "../middleware/authMiddleware.js";
import { listViceChancellors, getViceChancellor, createViceChancellor, updateViceChancellor, setViceChancellorStatus, reassignViceChancellor } from "../controllers/viceChancellorController.js";

const router = express.Router();
// Platform Admin only. Institution-level roles (including Vice Chancellors) are rejected.
const platformOnly = [protect, allowRoles("super_super_admin", "platform_super_admin")];
router.get("/", ...platformOnly, listViceChancellors);
router.post("/", ...platformOnly, createViceChancellor);
router.get("/:id", ...platformOnly, getViceChancellor);
router.put("/:id", ...platformOnly, updateViceChancellor);
router.patch("/:id/status", ...platformOnly, setViceChancellorStatus);
router.patch("/:id/institution", ...platformOnly, reassignViceChancellor);
export default router;
