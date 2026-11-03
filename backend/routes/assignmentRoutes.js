import express from "express";
import { upload } from "../middleware/uploadMiddleware.js";
import {
  createAssignment,
  getAssignments,
  getMyAssignments,
  gradeSubmission,
  submitAssignment,
  toggleSaveAssignment,
} from "../controllers/assignmentController.js";
import { allowAcademicAdmins, protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", protect, getAssignments);
router.get("/me", protect, getMyAssignments);
router.post("/", protect, allowAcademicAdmins, upload.single("file"), createAssignment);
router.post("/:id/submit", protect, upload.single("file"), submitAssignment);
router.put("/:id/submissions/:submissionId/grade", protect, allowAcademicAdmins, gradeSubmission);
router.put("/:id/save", protect, toggleSaveAssignment);

export default router;
