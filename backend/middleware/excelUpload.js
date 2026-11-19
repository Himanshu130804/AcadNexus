import multer from "multer";
import { isAcceptedResultFile } from "../utils/resultFileKind.js";
// Official-result uploads: .xlsx workbooks or .csv text files only, held in memory (5 MB, one file).
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 }, fileFilter(_req, file, cb) {
  if (isAcceptedResultFile(file.originalname, file.mimetype)) return cb(null, true);
  const error = new Error("Upload a valid .xlsx workbook or .csv file."); error.status = 415; cb(error);
} });
export default upload;
