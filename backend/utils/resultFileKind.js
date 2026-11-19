// Single source of truth for which official-result upload formats AcadNexus accepts.
export const RESULT_FILE_KINDS = {
  xlsx: { extension: "xlsx", parserPath: "/v1/parse-xlsx", mimeTypes: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/octet-stream"] },
  csv: { extension: "csv", parserPath: "/v1/parse-csv", mimeTypes: ["text/csv", "application/csv", "application/vnd.ms-excel", "text/plain", "application/octet-stream"] },
};

export const resultFileKind = (filename = "") => {
  const extension = String(filename).toLowerCase().split(".").pop();
  return Object.keys(RESULT_FILE_KINDS).find((kind) => RESULT_FILE_KINDS[kind].extension === extension) || null;
};

export const isAcceptedResultFile = (filename, mimetype) => {
  const kind = resultFileKind(filename);
  return Boolean(kind && RESULT_FILE_KINDS[kind].mimeTypes.includes(String(mimetype || "").toLowerCase()));
};

export const csvTemplateText = () => "rollNumber,studentName,courseCode,courseName,semester,examSession,marks,maxMarks,grade\r\n";
