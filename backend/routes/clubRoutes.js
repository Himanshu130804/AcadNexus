import express from "express";
import {
  addClubEvent,
  createClub,
  getClubs,
  joinClub,
  reviewClub,
} from "../controllers/clubController.js";
import { allowRoles, protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", protect, getClubs);
router.post("/", protect, allowRoles("student_admin", "teacher", "teacher_admin", "hod", "super_admin"), createClub);
router.put("/:id/join", protect, joinClub);
router.patch("/:id/review", protect, allowRoles("teacher", "teacher_admin", "hod", "super_admin"), reviewClub);
router.post("/:id/events", protect, allowRoles("teacher_admin", "super_admin"), addClubEvent);

export default router;
