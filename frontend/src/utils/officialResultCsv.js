const REQUIRED_COLUMNS = [
  "roll_number",
  "course_code",
  "course_name",
  "semester",
  "exam_session",
  "marks",
  "max_marks",
  "grade",
];

function parseCsvRows(source) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
      continue;
    }

    if (character === '"' && cell.length === 0) {
      quoted = true;
    } else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\n" || character === "\r") {
      row.push(cell);
      cell = "";
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      if (character === "\r" && source[index + 1] === "\n") index += 1;
    } else {
      cell += character;
    }
  }

  if (quoted) throw new Error("CSV contains an unclosed quoted field.");
  row.push(cell);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  return rows;
}

export function parseOfficialResultCsv(input) {
  if (typeof input !== "string" || !input.trim()) {
    throw new Error("CSV file is empty.");
  }

  const rows = parseCsvRows(input.replace(/^\uFEFF/, ""));
  if (!rows.length) throw new Error("CSV file is empty.");

  const headers = rows[0].map((value) => value.trim().toLowerCase());
  const missing = REQUIRED_COLUMNS.filter((column) => !headers.includes(column));
  if (missing.length) {
    throw new Error(`Missing required columns: ${missing.join(", ")}`);
  }

  const positions = Object.fromEntries(headers.map((header, index) => [header, index]));
  const records = [];
  const errors = [];
  const seen = new Set();

  rows.slice(1).forEach((cells, index) => {
    const sourceRow = index + 2;
    if (cells.length !== headers.length) {
      errors.push({ row: sourceRow, reason: "Column count does not match the header." });
      return;
    }

    const read = (key) => String(cells[positions[key]] ?? "").trim();
    const record = {
      rollNumber: read("roll_number"),
      courseCode: read("course_code"),
      courseName: read("course_name"),
      semester: read("semester"),
      examSession: read("exam_session"),
      marks: Number(read("marks")),
      maxMarks: Number(read("max_marks")),
      grade: read("grade"),
      sourceRow,
    };

    const requiredValues = [record.rollNumber, record.courseCode, record.courseName, record.semester, record.examSession, read("marks"), read("max_marks"), record.grade];
    if (requiredValues.some((value) => value === "")) {
      errors.push({ row: sourceRow, reason: "One or more required values are missing." });
      return;
    }
    if (!Number.isFinite(record.marks) || !Number.isFinite(record.maxMarks) || record.marks < 0 || record.maxMarks <= 0 || record.marks > record.maxMarks) {
      errors.push({ row: sourceRow, reason: "Marks must be non-negative and cannot exceed a positive maximum." });
      return;
    }

    const duplicateKey = [record.rollNumber, record.courseCode, record.semester, record.examSession].join("\u0000").toLowerCase();
    if (seen.has(duplicateKey)) {
      errors.push({ row: sourceRow, reason: "Duplicate student, subject, semester and examination session." });
      return;
    }
    seen.add(duplicateKey);
    records.push(record);
  });

  return { records, errors };
}
