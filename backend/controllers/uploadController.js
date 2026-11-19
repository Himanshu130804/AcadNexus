import { getFileType } from "../utils/fileType.js";

export const uploadFiles = async (req, res) => {
  const files = req.files || [];

  const uploaded = files.map((file) => ({
    originalName: file.originalname,
    filename: file.filename,
    url: file.path,
    mimeType: file.mimetype,
    size: file.size,
    fileType: getFileType(file.mimetype),
  }));

  res.status(201).json(uploaded);
};
