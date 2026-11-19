import express from "express";
import {
  getAuditLogs,
  getStats,
  getUserById,
  getUsers,
  updateRole,
  updateUserAcademic,
  setUserStatus,
  listPlatformAdmins,
  createPlatformAdmin,
  resendPlatformAdminInvitation,
  setPlatformAdminStatus,
} from "../controllers/adminController.js";
import { allowAdmins, allowRoles, allowSuperAdmin, protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/stats", protect, allowAdmins, getStats);
router.get("/users", protect, allowAdmins, getUsers);
router.get("/users/:id", protect, allowAdmins, getUserById);
router.put("/users/:id", protect, allowAdmins, updateUserAcademic);
router.patch("/users/:id/status", protect, allowSuperAdmin, setUserStatus);
router.put("/users/:id/role", protect, allowSuperAdmin, updateRole);
router.get("/audit-logs", protect, allowSuperAdmin, getAuditLogs);

router.get("/platform-admins", protect, allowRoles("super_super_admin"), listPlatformAdmins);
router.post("/platform-admins", protect, allowRoles("super_super_admin"), createPlatformAdmin);
router.post("/platform-admins/:id/resend-invitation", protect, allowRoles("super_super_admin"), resendPlatformAdminInvitation);
router.patch("/platform-admins/:id/status", protect, allowRoles("super_super_admin"), setPlatformAdminStatus);

export default router;
