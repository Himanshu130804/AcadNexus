import express from "express";

import {
  createAcademicOption,
  getAcademicOptions,
  getRegistrationOptions,
  getMyCourses,
  getMyProgramme,
  selectMySubject,
  seedAcademicOptions,
  updateAcademicOption,
  deactivateAcademicOption,
  cleanupAcademicDuplicates,
} from "../controllers/academicController.js";

import { protect, allowRoles } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/registration-options", getRegistrationOptions);
router.get("/", protect, getAcademicOptions);
router.get("/me/programme", protect, getMyProgramme);
router.get("/me/courses", protect, getMyCourses);
router.post("/me/courses/:id/select", protect, selectMySubject);

router.post(
  "/",
  protect,
  allowRoles("hod", "edp", "teacher_admin", "student_admin", "super_admin"),
  createAcademicOption
);

router.put(
  "/:id",
  protect,
  allowRoles("hod", "edp", "teacher_admin", "student_admin", "super_admin"),
  updateAcademicOption
);

router.patch(
  "/:id/status",
  protect,
  allowRoles("hod", "edp", "teacher_admin", "student_admin", "super_admin"),
  deactivateAcademicOption
);

router.post(
  "/cleanup",
  protect,
  allowRoles("super_admin"),
  cleanupAcademicDuplicates
);

router.post(
  "/seed",
  protect,
  allowRoles("super_admin"),
  seedAcademicOptions
);

export default router;
