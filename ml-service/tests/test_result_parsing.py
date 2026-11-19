"""Framework-free tests for the shared XLSX/CSV result-file contract (run: python -m unittest discover -s tests)."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.result_parsing import ResultFileError, csv_template, is_formula_like, map_headers, parse_csv_bytes  # noqa: E402

HEAD = "rollNumber,studentName,courseCode,courseName,semester,examSession,marks,maxMarks,grade\r\n"


class CsvParsingTests(unittest.TestCase):
    def test_valid_csv_matches_xlsx_record_shape(self):
        parsed = parse_csv_bytes((HEAD + "R001,A B,CS101,Intro,1,Dec-2025,78,100,A\r\n").encode())
        self.assertEqual(parsed["totalRows"], 1)
        self.assertEqual(parsed["records"][0]["sourceRow"], 2)
        self.assertEqual(parsed["records"][0]["record"]["rollNumber"], "R001")
        self.assertEqual(parsed["records"][0]["errors"], [])

    def test_blank_rows_skipped_and_empty_cells_become_none(self):
        parsed = parse_csv_bytes((HEAD + ",,,,,,,,\r\nR2,,CS1,Intro,1,S,5,10,\r\n").encode())
        self.assertEqual(parsed["totalRows"], 1)
        self.assertIsNone(parsed["records"][0]["record"]["grade"])
        self.assertEqual(parsed["records"][0]["sourceRow"], 3)

    def test_quoted_commas_bom_and_semicolon_delimiter(self):
        parsed = parse_csv_bytes(("\ufeff" + HEAD + 'R1,"Doe, Jane",C1,N,1,S,5,10,B\r\n').encode("utf-8"))
        self.assertEqual(parsed["records"][0]["record"]["studentName"], "Doe, Jane")
        semi = b"rollNumber;courseCode;courseName;semester;examSession;marks;maxMarks\nR1;C1;N;1;S;5;10\n"
        self.assertEqual(parse_csv_bytes(semi)["records"][0]["record"]["marks"], "5")

    def test_formula_injection_rows_are_rejected_but_negative_numbers_are_data(self):
        body = (HEAD + "R1,x,=HYPERLINK(\"http://evil\"),N,1,S,5,10,\r\nR2,x,C,N,1,S,-3,10,\r\n@R3,x,C,N,1,S,3,10,\r\n").encode()
        rows = parse_csv_bytes(body)["records"]
        self.assertEqual(rows[0]["errors"], ["Formula cells are not permitted"])
        self.assertEqual(rows[1]["errors"], [])
        self.assertEqual(rows[2]["errors"], ["Formula cells are not permitted"])
        self.assertTrue(is_formula_like("+SUM(A1)"))
        self.assertFalse(is_formula_like("+4"))

    def test_header_contract(self):
        for bad, status in [(b"rollNumber,bogus\r\n1,2", 422), (b"rollNumber,courseCode\r\n", 422), (b"", 422), (b"\xff\xfe\x00", 422)]:
            with self.assertRaises(ResultFileError) as ctx:
                parse_csv_bytes(bad)
            self.assertEqual(ctx.exception.status, status)
        with self.assertRaises(ResultFileError):
            map_headers(["rollNumber", "RollNumber", "courseCode", "courseName", "semester", "examSession", "marks", "maxMarks"])

    def test_size_and_row_limits(self):
        with self.assertRaises(ResultFileError) as ctx:
            parse_csv_bytes(b"x" * (5 * 1024 * 1024 + 1))
        self.assertEqual(ctx.exception.status, 413)
        rows = "".join(f"R{i},C,N,1,S,5,10\r\n" for i in range(5001))
        with self.assertRaises(ResultFileError) as ctx:
            parse_csv_bytes(("rollNumber,courseCode,courseName,semester,examSession,marks,maxMarks\r\n" + rows).encode())
        self.assertEqual(ctx.exception.status, 413)

    def test_template_headers_round_trip(self):
        parsed = parse_csv_bytes((csv_template() + "R1,A,C1,N,1,S,5,10,B\r\n").encode())
        self.assertEqual(parsed["totalRows"], 1)


if __name__ == "__main__":
    unittest.main()
