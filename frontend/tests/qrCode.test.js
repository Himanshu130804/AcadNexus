import test from "node:test";
import assert from "node:assert/strict";
import { generateQrMatrix, qrSvgPath, QR_MAX_VERSION } from "../src/utils/qrCode.js";

const finderAt = (m, x, y) => { for (let dy = 0; dy < 7; dy += 1) for (let dx = 0; dx < 7; dx += 1) { const edge = dx === 0 || dy === 0 || dx === 6 || dy === 6; const core = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4; if (m[y + dy][x + dx] !== (edge || core)) return false; } return true; };

test("QR matrix has valid size, three finder patterns, timing pattern and dark module", () => {
  const m = generateQrMatrix("https://example.edu/verify-result/" + "ab12".repeat(12));
  const size = m.length; assert.equal((size - 17) % 4, 0);
  assert.ok(finderAt(m, 0, 0) && finderAt(m, size - 7, 0) && finderAt(m, 0, size - 7));
  for (let i = 8; i < size - 8; i += 1) { assert.equal(m[6][i], i % 2 === 0); assert.equal(m[i][6], i % 2 === 0); }
  assert.equal(m[size - 8][8], true);
});

test("QR output is deterministic and version grows with content length", () => {
  assert.deepEqual(generateQrMatrix("AcadNexus"), generateQrMatrix("AcadNexus"));
  assert.equal(generateQrMatrix("a").length, 21);
  assert.equal(generateQrMatrix("a".repeat(14)).length, 21);
  assert.equal(generateQrMatrix("a".repeat(15)).length, 25);
  assert.equal(generateQrMatrix("a".repeat(213)).length, 17 + 4 * QR_MAX_VERSION);
});

test("QR rejects empty or oversized content and supports UTF-8", () => {
  assert.throws(() => generateQrMatrix(""));
  assert.throws(() => generateQrMatrix("a".repeat(214)));
  assert.ok(generateQrMatrix("परिणाम ✓").length >= 21);
});

test("SVG path covers exactly the dark modules with a quiet zone", () => {
  const m = generateQrMatrix("x"); const { path, size } = qrSvgPath(m);
  assert.equal(size, m.length + 8);
  assert.equal((path.match(/M/g) || []).length, m.flat().filter(Boolean).length);
});
