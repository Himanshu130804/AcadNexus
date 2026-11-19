import express from "express";
import { upload } from "../middleware/uploadMiddleware.js";

import {
  getMyCourses,
  getMyProfile,
  updateMyProfile,
} from "../controllers/profileController.js";

import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();


router.get("/me", protect, getMyProfile);
router.put("/me", protect, upload.single("profilePhoto"), updateMyProfile);
router.get("/courses", protect, getMyCourses);

export default router;
