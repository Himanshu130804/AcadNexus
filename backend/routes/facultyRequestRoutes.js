import express from "express";
import { protect, allowTimetableManagers } from "../middleware/authMiddleware.js";
import {
  cancelFacultyRequest,
  createFacultyRequest,
  decideFacultyRequest,
  getCandidateTeachers,
  listFacultyRequests,
} from "../controllers/facultyRequestController.js";

const router = express.Router();

router.get("/", protect, allowTimetableManagers, listFacultyRequests);
router.post("/", protect, allowTimetableManagers, createFacultyRequest);
router.get("/candidates", protect, allowTimetableManagers, getCandidateTeachers);
router.patch("/:id/decision", protect, allowTimetableManagers, decideFacultyRequest);
router.patch("/:id/cancel", protect, allowTimetableManagers, cancelFacultyRequest);

export default router;
