import express from "express";
import {
  createFacultyProfile,
  getFacultyProfiles,
  updateFacultyProfile,
} from "../controllers/facultyController.js";
import { allowRoles, protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", protect, getFacultyProfiles);
router.post("/", protect, allowRoles("teacher_admin", "hod", "super_admin"), createFacultyProfile);
router.put("/:id", protect, allowRoles("teacher_admin", "hod", "super_admin"), updateFacultyProfile);

export default router;
