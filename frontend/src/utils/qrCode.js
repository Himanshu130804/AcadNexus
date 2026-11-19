// Dependency-free QR Code (Model 2) encoder: byte mode, error-correction level M, versions 1-10 (up to 213 bytes).
// Used to render the secure result-verification URL as a scannable code without adding a runtime dependency.

const EC_M = { // version -> [EC codewords per block, [[blockCount, dataCodewordsPerBlock], ...]]
  1: [10, [[1, 16]]], 2: [16, [[1, 28]]], 3: [26, [[1, 44]]], 4: [18, [[2, 32]]], 5: [24, [[2, 43]]],
  6: [16, [[4, 27]]], 7: [18, [[4, 31]]], 8: [22, [[2, 38], [2, 39]]], 9: [22, [[3, 36], [2, 37]]], 10: [26, [[4, 43], [1, 44]]],
};
export const QR_MAX_VERSION = 10;

const EXP = new Array(512); const LOG = new Array(256);
(() => { let x = 1; for (let i = 0; i < 255; i += 1) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; } for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255]; })();
const gfMul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

const generatorPoly = (degree) => {
  let poly = [1];
  for (let i = 0; i < degree; i += 1) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j += 1) { next[j] ^= poly[j]; next[j + 1] ^= gfMul(poly[j], EXP[i]); }
    poly = next;
  }
  return poly;
};
const reedSolomon = (data, degree) => {
  const gen = generatorPoly(degree); const work = [...data, ...new Array(degree).fill(0)];
  for (let i = 0; i < data.length; i += 1) { const factor = work[i]; if (factor !== 0) for (let j = 1; j < gen.length; j += 1) work[i + j] ^= gfMul(gen[j], factor); }
  return work.slice(data.length);
};

const dataCapacity = (version) => EC_M[version][1].reduce((sum, [count, size]) => sum + count * size, 0);
const lengthBits = (version) => (version <= 9 ? 8 : 16);

function encodeData(bytes, version) {
  const bits = [];
  const push = (value, length) => { for (let i = length - 1; i >= 0; i -= 1) bits.push((value >>> i) & 1); };
  push(0b0100, 4); push(bytes.length, lengthBits(version)); bytes.forEach((byte) => push(byte, 8));
  const capacityBits = dataCapacity(version) * 8;
  push(0, Math.min(4, capacityBits - bits.length));
  while (bits.length % 8) bits.push(0);
  const codewords = []; for (let i = 0; i < bits.length; i += 8) codewords.push(parseInt(bits.slice(i, i + 8).join(""), 2));
  for (let pad = 0xec; codewords.length < dataCapacity(version); pad ^= 0xec ^ 0x11) codewords.push(pad);
  return codewords;
}

function interleave(dataCodewords, version) {
  const [ecPerBlock, groups] = EC_M[version]; const blocks = []; let offset = 0;
  for (const [count, size] of groups) for (let i = 0; i < count; i += 1) { const data = dataCodewords.slice(offset, offset + size); offset += size; blocks.push({ data, ec: reedSolomon(data, ecPerBlock) }); }
  const out = []; const maxData = Math.max(...blocks.map((block) => block.data.length));
  for (let i = 0; i < maxData; i += 1) blocks.forEach((block) => { if (i < block.data.length) out.push(block.data[i]); });
  for (let i = 0; i < ecPerBlock; i += 1) blocks.forEach((block) => out.push(block.ec[i]));
  return out;
}

const alignmentPositions = (version, size) => {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2; const step = Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2;
  const positions = [6]; for (let pos = size - 7; positions.length < count; pos -= step) positions.splice(1, 0, pos);
  return positions;
};

const MASKS = [
  (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

function penalty(m) {
  const size = m.length; let score = 0;
  const lineScore = (get) => {
    for (let a = 0; a < size; a += 1) {
      let run = 1;
      for (let b = 1; b < size; b += 1) { if (get(a, b) === get(a, b - 1)) { run += 1; if (run === 5) score += 3; else if (run > 5) score += 1; } else run = 1; }
      for (let b = 0; b + 10 < size; b += 1) {
        const w = []; for (let k = 0; k < 11; k += 1) w.push(get(a, b + k) ? 1 : 0); const s = w.join("");
        if (s === "10111010000" || s === "00001011101") score += 40;
      }
    }
  };
  lineScore((r, c) => m[r][c]); lineScore((c, r) => m[r][c]);
  for (let y = 0; y < size - 1; y += 1) for (let x = 0; x < size - 1; x += 1) if (m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) score += 3;
  const dark = m.flat().filter(Boolean).length; score += Math.floor(Math.abs((dark * 100) / (size * size) - 50) / 5) * 10;
  return score;
}

/** Returns a square boolean matrix (true = dark module) for the UTF-8 text. Throws if it exceeds version 10. */
export function generateQrMatrix(text) {
  const bytes = Array.from(new TextEncoder().encode(String(text)));
  if (!bytes.length) throw new Error("QR content cannot be empty.");
  let version = 0;
  for (let v = 1; v <= QR_MAX_VERSION; v += 1) if (4 + lengthBits(v) + bytes.length * 8 <= dataCapacity(v) * 8) { version = v; break; }
  if (!version) throw new Error("QR content is too long.");
  const size = 17 + version * 4;
  const modules = Array.from({ length: size }, () => new Array(size).fill(false));
  const isFunction = Array.from({ length: size }, () => new Array(size).fill(false));
  const setFn = (x, y, dark) => { if (x >= 0 && y >= 0 && x < size && y < size) { modules[y][x] = dark; isFunction[y][x] = true; } };

  for (let i = 0; i < size; i += 1) { setFn(6, i, i % 2 === 0); setFn(i, 6, i % 2 === 0); }
  const finder = (cx, cy) => { for (let dy = -4; dy <= 4; dy += 1) for (let dx = -4; dx <= 4; dx += 1) { const dist = Math.max(Math.abs(dx), Math.abs(dy)); setFn(cx + dx, cy + dy, dist !== 2 && dist !== 4); } };
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
  const align = alignmentPositions(version, size);
  align.forEach((cx, i) => align.forEach((cy, j) => { if ((i === 0 && j === 0) || (i === 0 && j === align.length - 1) || (i === align.length - 1 && j === 0)) return; for (let dy = -2; dy <= 2; dy += 1) for (let dx = -2; dx <= 2; dx += 1) setFn(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1); }));
  const drawFormat = (target, mask) => {
    const data = (0 << 3) | mask; let rem = data; for (let i = 0; i < 10; i += 1) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412; const bit = (i) => ((bits >>> i) & 1) === 1;
    const set = (x, y, dark) => { target[y][x] = dark; };
    for (let i = 0; i <= 5; i += 1) set(8, i, bit(i)); set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8)); for (let i = 9; i < 15; i += 1) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i += 1) set(size - 1 - i, 8, bit(i)); for (let i = 8; i < 15; i += 1) set(8, size - 15 + i, bit(i)); set(8, size - 8, true);
  };
  // Reserve the format area so data is not placed there.
  for (let i = 0; i < 9; i += 1) { isFunction[8][i] = true; isFunction[i][8] = true; }
  for (let i = 0; i < 8; i += 1) { isFunction[8][size - 1 - i] = true; isFunction[size - 1 - i][8] = true; }
  isFunction[size - 8][8] = true;
  if (version >= 7) {
    let rem = version; for (let i = 0; i < 12; i += 1) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (version << 12) | rem;
    for (let i = 0; i < 18; i += 1) { const dark = ((bits >>> i) & 1) === 1; const a = size - 11 + (i % 3); const b = Math.floor(i / 3); setFn(a, b, dark); setFn(b, a, dark); }
  }

  const codewords = interleave(encodeData(bytes, version), version); let bitIndex = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert += 1) for (let j = 0; j < 2; j += 1) {
      const x = right - j; const upward = ((right + 1) & 2) === 0; const y = upward ? size - 1 - vert : vert;
      if (!isFunction[y][x] && bitIndex < codewords.length * 8) { modules[y][x] = ((codewords[bitIndex >>> 3] >>> (7 - (bitIndex & 7))) & 1) === 1; bitIndex += 1; }
    }
  }
  let best = null; let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask += 1) {
    const candidate = modules.map((row) => row.slice());
    for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) if (!isFunction[y][x] && MASKS[mask](x, y)) candidate[y][x] = !candidate[y][x];
    drawFormat(candidate, mask);
    const score = penalty(candidate); if (score < bestScore) { bestScore = score; best = candidate; }
  }
  return best;
}

/** SVG path data ("M x y h1 v1 h-1 z" per dark module) including a 4-module quiet zone; returns { path, size }. */
export function qrSvgPath(matrix, quietZone = 4) {
  const parts = []; matrix.forEach((row, y) => row.forEach((dark, x) => { if (dark) parts.push(`M${x + quietZone} ${y + quietZone}h1v1h-1z`); }));
  return { path: parts.join(""), size: matrix.length + quietZone * 2 };
}
