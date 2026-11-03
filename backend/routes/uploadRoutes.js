import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { upload } from "../middleware/uploadMiddleware.js";
import { uploadFiles } from "../controllers/uploadController.js";

const router = express.Router();

router.post("/", protect, upload.array("files", 5), uploadFiles);

export default router;
