"""Pure (framework-free) helpers for validating official-result upload files.

The same header vocabulary and safety rules are shared by the XLSX and CSV parsers so
that both formats accept exactly the same columns and produce the same record shape.
No file content is ever evaluated as a formula or executed.
"""
from __future__ import annotations

import csv
import io
import re
from typing import Any

MAX_FILE_BYTES = 5 * 1024 * 1024
MAX_DATA_ROWS = 5000

HEADER_ALIASES = {
    "rollnumber": "rollNumber", "studentrollnumber": "rollNumber", "studentidentifier": "rollNumber",
    "studentname": "studentName",
    "coursecode": "courseCode", "subjectcode": "courseCode",
    "coursename": "courseName", "subjectname": "courseName",
    "semester": "semester",
    "examsession": "examSession", "session": "examSession",
    "marks": "marks", "totalmarks": "marks",
    "maxmarks": "maxMarks", "maximummarks": "maxMarks",
    "grade": "grade",
}
REQUIRED_FIELDS = {"rollNumber", "courseCode", "courseName", "semester", "examSession", "marks", "maxMarks"}
TEMPLATE_HEADERS = ["rollNumber", "studentName", "courseCode", "courseName", "semester", "examSession", "marks", "maxMarks", "grade"]

_NUMBER = re.compile(r"^[+-]?\d+(\.\d+)?$")


class ResultFileError(Exception):
    """Validation failure carrying an HTTP status and a client-safe detail."""

    def __init__(self, status: int, detail: Any):
        super().__init__(str(detail))
        self.status = status
        self.detail = detail


def map_headers(headers: list[str]) -> list[str]:
    """Return the canonical field name for every header, enforcing the upload contract."""
    normalized = ["".join(ch.lower() for ch in h if ch.isalnum()) for h in headers]
    mapped = [HEADER_ALIASES.get(h, "") for h in normalized]
    unknown = [headers[i] for i, field in enumerate(mapped) if not field and headers[i]]
    if unknown:
        raise ResultFileError(422, {"message": "Unsupported spreadsheet columns; use the AcadNexus template", "columns": unknown})
    if any(not header for header in headers):
        raise ResultFileError(422, "Column headers cannot be blank")
    fields = [f for f in mapped if f]
    if len(fields) != len(set(fields)):
        raise ResultFileError(422, "Workbook contains duplicate or ambiguous column headers")
    missing = sorted(REQUIRED_FIELDS - set(mapped))
    if missing:
        raise ResultFileError(422, {"message": "Required columns are missing", "missing": missing})
    return mapped


def is_formula_like(value: str) -> bool:
    """True for CSV cells a spreadsheet application would evaluate (formula injection)."""
    text = value.strip()
    if not text:
        return False
    if text[0] in "=@":
        return True
    if text[0] in "+-" and not _NUMBER.match(text):
        return True
    return text[0] in "\t\r"


def parse_csv_bytes(raw: bytes) -> dict[str, Any]:
    """Parse an official-result CSV into the same structure produced for XLSX uploads."""
    if len(raw) > MAX_FILE_BYTES:
        raise ResultFileError(413, "File exceeds the 5 MB limit")
    if b"\x00" in raw:
        raise ResultFileError(422, "File is not a valid CSV text file")
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise ResultFileError(422, "CSV must be UTF-8 encoded")
    if not text.strip():
        raise ResultFileError(422, "File is empty")
    first_line = text.splitlines()[0]
    delimiter = max([",", ";", "\t"], key=first_line.count)
    if first_line.count(delimiter) == 0:
        delimiter = ","
    try:
        reader = csv.reader(io.StringIO(text, newline=""), delimiter=delimiter, strict=True)
        header_row = next(reader)
    except (csv.Error, StopIteration):
        raise ResultFileError(422, "CSV header row is malformed or missing")
    headers = [h.strip() for h in header_row]
    while headers and not headers[-1]:
        headers.pop()
    if any(is_formula_like(h) for h in headers):
        raise ResultFileError(422, "Formula cells are not permitted")
    mapped = map_headers(headers)
    records: list[dict[str, Any]] = []
    try:
        for row_number, cells in enumerate(reader, start=2):
            if not any(cell.strip() for cell in cells):
                continue
            if len(cells) > len(headers) and any(cell.strip() for cell in cells[len(headers):]):
                records.append({"sourceRow": row_number, "record": {}, "errors": ["Row has more values than header columns"]})
                continue
            if any(is_formula_like(cell) for cell in cells):
                records.append({"sourceRow": row_number, "record": {}, "errors": ["Formula cells are not permitted"]})
                continue
            record: dict[str, Any] = {}
            for index, field_name in enumerate(mapped):
                value = cells[index].strip() if index < len(cells) else ""
                record[field_name] = value if value != "" else None
            records.append({"sourceRow": row_number, "record": record, "errors": []})
            if len(records) > MAX_DATA_ROWS:
                raise ResultFileError(413, "File exceeds the 5,000 data row limit")
    except csv.Error:
        raise ResultFileError(422, "CSV contains malformed quoting")
    return {"sheet": "csv", "headers": headers, "records": records, "totalRows": len(records)}


def csv_template() -> str:
    return ",".join(TEMPLATE_HEADERS) + "\r\n"
