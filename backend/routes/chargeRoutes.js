import express from "express";
import {
  assignCharge,
  getChargeTypes,
  getMyCharges,
  getMyTeachingAssignments,
  getTeachers,
  removeCharge,
} from "../controllers/chargeController.js";
import { protect, allowSuperAdmin, allowTimetableManagers } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/types", protect, getChargeTypes);
router.get("/me", protect, getMyCharges);
router.get("/my-teaching", protect, getMyTeachingAssignments);
router.get("/teachers", protect, allowTimetableManagers, getTeachers);
router.post("/teachers/:teacherId", protect, allowTimetableManagers, assignCharge);
router.delete("/teachers/:teacherId/:chargeId", protect, allowTimetableManagers, removeCharge);

export default router;
