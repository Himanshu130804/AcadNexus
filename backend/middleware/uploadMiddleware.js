import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";

const configured = Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
if (configured) {
  cloudinary.config({ cloud_name: process.env.CLOUDINARY_CLOUD_NAME, api_key: process.env.CLOUDINARY_API_KEY, api_secret: process.env.CLOUDINARY_API_SECRET, secure: true });
}

const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => ({
    folder: `ac adnexus/${file.mimetype.startsWith("image/") ? "images" : "documents"}`.replace("ac adnexus", "acadnexus"),
    resource_type: "auto",
    public_id: `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/\.[^.]+$/, "")}`,
  }),
});

const allowedMimeTypes = [
  "application/pdf", "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip", "image/jpeg", "image/png", "image/webp",
];

const extensionByMime = {
  "application/pdf": [".pdf"],
  "application/msword": [".doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "application/vnd.ms-excel": [".xls"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "application/vnd.ms-powerpoint": [".ppt"],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": [".pptx"],
  "application/zip": [".zip"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
};

export const upload = multer({
  storage,
  fileFilter(req, file, cb) {
    const extension = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf("."));
    if (allowedMimeTypes.includes(file.mimetype) && extensionByMime[file.mimetype]?.includes(extension)) return cb(null, true);
    const error = new Error("Unsupported or mismatched file type. Upload a correctly named PDF, Office document, ZIP, JPG, PNG or WEBP file.");
    error.status = 400;
    cb(error);
  },
  limits: { fileSize: 25 * 1024 * 1024, files: 5 },
});
