import test from "node:test";
import assert from "node:assert/strict";
import { resultFileKind, isAcceptedResultFile, RESULT_FILE_KINDS, csvTemplateText } from "../utils/resultFileKind.js";

test("result upload accepts only .xlsx and .csv with plausible MIME types", () => {
  assert.equal(resultFileKind("Results.XLSX"), "xlsx");
  assert.equal(resultFileKind("results.csv"), "csv");
  assert.equal(resultFileKind("results.xls"), null);
  assert.equal(resultFileKind("results.csv.exe"), null);
  assert.equal(resultFileKind("noextension"), null);
  assert.ok(isAcceptedResultFile("a.csv", "text/csv"));
  assert.ok(isAcceptedResultFile("a.csv", "application/vnd.ms-excel")); // Windows/Excel reports CSV this way
  assert.ok(isAcceptedResultFile("a.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"));
  assert.ok(!isAcceptedResultFile("a.csv", "application/x-msdownload"));
  assert.ok(!isAcceptedResultFile("a.xlsx", "text/csv"));
  assert.ok(!isAcceptedResultFile("a.html", "text/html"));
});

test("each format maps to its own parser endpoint and the CSV template carries the contract headers", () => {
  assert.equal(RESULT_FILE_KINDS.xlsx.parserPath, "/v1/parse-xlsx");
  assert.equal(RESULT_FILE_KINDS.csv.parserPath, "/v1/parse-csv");
  assert.match(csvTemplateText(), /^rollNumber,studentName,courseCode,courseName,semester,examSession,marks,maxMarks,grade/);
});
