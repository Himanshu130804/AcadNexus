import express from "express";
import { upload } from "../middleware/uploadMiddleware.js";

import {
  addComment,
  createContent,
  getApprovedContent,
  getGroupedFeed,
  getMyContent,
  getPendingContent,
  getSavedContent,
  getVisibleFeed,
  reviewContent,
  toggleLike,
  toggleSave,
} from "../controllers/contentController.js";

import { allowAdmins, protect } from "../middleware/authMiddleware.js";

const router = express.Router();


router.get("/", protect, getApprovedContent);
router.get("/visible", protect, getVisibleFeed);
router.get("/grouped", protect, getGroupedFeed);
router.get("/me", protect, getMyContent);
router.get("/saved", protect, getSavedContent);
router.post("/", protect, upload.single("file"), createContent);
router.get("/pending", protect, allowAdmins, getPendingContent);
router.put("/:id/review", protect, allowAdmins, reviewContent);
router.put("/:id/like", protect, toggleLike);
router.put("/:id/save", protect, toggleSave);
router.post("/:id/comments", protect, addComment);

export default router;
