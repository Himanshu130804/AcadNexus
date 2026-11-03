export const getFileType = (mimeType = "") => {
  if (mimeType.includes("pdf")) return "pdf";
  if (mimeType.includes("word")) return "word";
  if (mimeType.includes("excel") || mimeType.includes("spreadsheet")) return "excel";
  if (mimeType.includes("powerpoint") || mimeType.includes("presentation")) return "ppt";
  if (mimeType.includes("image")) return "image";
  return "other";
};
