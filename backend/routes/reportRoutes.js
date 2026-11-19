import express from "express";
import {
  createReport,
  getReports,
  updateReport,
} from "../controllers/reportController.js";
import { allowAdmins, protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/", protect, createReport);
router.get("/", protect, allowAdmins, getReports);
router.put("/:id", protect, allowAdmins, updateReport);

export default router;
