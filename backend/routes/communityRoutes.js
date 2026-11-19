import express from "express";
import { createCommunity, getCommunities, joinCommunity } from "../controllers/communityController.js";
import { allowAdmins, protect } from "../middleware/authMiddleware.js";
const router = express.Router();
router.get("/", protect, getCommunities);
router.post("/", protect, allowAdmins, createCommunity);
router.put("/:id/join", protect, joinCommunity);
export default router;
