import test from "node:test";
import assert from "node:assert/strict";
import { parseOfficialResultCsv } from "../src/utils/officialResultCsv.js";

const header = "roll_number,course_code,course_name,semester,exam_session,marks,max_marks,grade";

test("parses a valid result CSV and quoted commas", () => {
  const parsed = parseOfficialResultCsv(`${header}\n22001,CS101,\"Programming, Fundamentals\",4,May 2026,82,100,A`);
  assert.equal(parsed.records.length, 1);
  assert.equal(parsed.records[0].courseName, "Programming, Fundamentals");
  assert.equal(parsed.records[0].marks, 82);
  assert.equal(parsed.errors.length, 0);
});

test("reports invalid marks and duplicate result rows without discarding valid rows", () => {
  const parsed = parseOfficialResultCsv(`${header}\n22001,CS101,Programming,4,May 2026,82,100,A\n22002,CS102,Networks,4,May 2026,120,100,F\n22001,CS101,Programming,4,May 2026,82,100,A`);
  assert.equal(parsed.records.length, 1);
  assert.equal(parsed.errors.length, 2);
});

test("supports CRLF and UTF-8 BOM", () => {
  const parsed = parseOfficialResultCsv(`\uFEFF${header}\r\n22001,CS101,Programming,4,May 2026,82,100,A`);
  assert.equal(parsed.records.length, 1);
});

test("rejects missing columns and malformed quoted fields", () => {
  assert.throws(() => parseOfficialResultCsv("rollNumber,marks\n1,90"), /Missing required columns/);
  assert.throws(() => parseOfficialResultCsv(`${header}\n1,CS,\"unfinished,4,May,10,20,A`), /unclosed quoted field/);
});
