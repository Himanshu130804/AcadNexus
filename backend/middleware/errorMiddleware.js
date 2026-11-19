import multer from "multer";

export const notFound = (req, res) => res.status(404).json({ message: "Route not found" });
export const errorHandler = (err, req, res, next) => {
  // Log minimal metadata only. Avoid request bodies, headers, tokens, reset links,
  // uploaded content, and full DB error objects in centralized production logs.
  console.error("[request-error]", {
    method: req.method,
    path: req.path,
    status: Number(err.status || err.statusCode) || 500,
    name: err.name || "Error",
    message: process.env.NODE_ENV === "production"
      ? "Request failed"
      : String(err.message || "Request failed").slice(0, 300),
  });
  if (res.headersSent) return next(err);

  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") return res.status(413).json({ message: "Uploaded file exceeds the 25 MB limit." });
    if (err.code === "LIMIT_FILE_COUNT") return res.status(400).json({ message: "Too many files. Maximum 5 files per request." });
    return res.status(400).json({ message: "Invalid file upload." });
  }

  const status = Number(err.status || err.statusCode);
  const safeStatus = status >= 400 && status < 600 ? status : 500;
  const message = safeStatus === 500 ? "Internal server error" : (err.publicMessage || err.message || "Request failed");
  res.status(safeStatus).json({ message });
};
