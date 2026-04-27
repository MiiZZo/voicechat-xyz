// Generates apps/client/build/icon.ico (multi-resolution, used by electron-builder)
// and apps/client/build/icon.png (256x256, fallback) by re-implementing the same
// pure-JS drawing logic that src/main/icon-draw.ts uses at runtime.
//
// Kept in vanilla .mjs (not TS) so it runs under plain `node` with no extra
// devDependencies. The drawing parameters here MUST stay in sync with
// src/main/icon-draw.ts — both files render the same glyph.

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, '..', 'build');
mkdirSync(outDir, { recursive: true });

const BG = { r: 16, g: 185, b: 129 };
const FG = { r: 255, g: 255, b: 255 };

function drawAppIconRgba(size) {
  const buf = Buffer.alloc(size * size * 4);
  const radius = Math.max(2, Math.round(size * 0.22));

  const lineHeight = Math.max(1, Math.round(size * 0.085));
  const lineGap = Math.max(1, Math.round(size * 0.085));
  const totalLines = 3 * lineHeight + 2 * lineGap;
  const linesTop = Math.round((size - totalLines) / 2);
  const linePadX = Math.round(size * 0.22);

  const lines = [
    { y: linesTop, widthFrac: 0.7 },
    { y: linesTop + lineHeight + lineGap, widthFrac: 1.0 },
    { y: linesTop + 2 * (lineHeight + lineGap), widthFrac: 0.55 },
  ];
  const lineLeft = linePadX;
  const lineMaxRight = size - linePadX;
  const lineMaxWidth = lineMaxRight - lineLeft;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const bgCov = roundedSquareCoverage(x, y, size, size, radius);
      if (bgCov <= 0) {
        buf[i + 3] = 0;
        continue;
      }
      let lineCov = 0;
      for (const line of lines) {
        const right = lineLeft + Math.round(lineMaxWidth * line.widthFrac);
        const lineRadius = lineHeight / 2;
        const inLineY = y + 0.5 >= line.y && y + 0.5 < line.y + lineHeight;
        if (!inLineY) continue;
        if (x + 0.5 >= lineLeft + lineRadius && x + 0.5 < right - lineRadius) {
          lineCov = 1;
          break;
        }
        const cy = line.y + lineHeight / 2;
        const leftCx = lineLeft + lineRadius;
        const rightCx = right - lineRadius;
        const dxL = x + 0.5 - leftCx;
        const dxR = x + 0.5 - rightCx;
        const dy = y + 0.5 - cy;
        const distL = Math.sqrt(dxL * dxL + dy * dy);
        const distR = Math.sqrt(dxR * dxR + dy * dy);
        if (x + 0.5 < leftCx && distL <= lineRadius) {
          lineCov = Math.max(lineCov, smoothstep(distL, lineRadius));
        } else if (x + 0.5 >= rightCx && distR <= lineRadius) {
          lineCov = Math.max(lineCov, smoothstep(distR, lineRadius));
        }
      }
      const r = Math.round(BG.r * (1 - lineCov) + FG.r * lineCov);
      const g = Math.round(BG.g * (1 - lineCov) + FG.g * lineCov);
      const b = Math.round(BG.b * (1 - lineCov) + FG.b * lineCov);
      buf[i] = r;
      buf[i + 1] = g;
      buf[i + 2] = b;
      buf[i + 3] = Math.round(255 * bgCov);
    }
  }
  return buf;
}

function roundedSquareCoverage(x, y, w, h, r) {
  let hits = 0;
  for (let sy = 0; sy < 2; sy++) {
    for (let sx = 0; sx < 2; sx++) {
      const px = x + (sx + 0.5) / 2;
      const py = y + (sy + 0.5) / 2;
      if (insideRoundedRect(px, py, w, h, r)) hits++;
    }
  }
  return hits / 4;
}

function insideRoundedRect(px, py, w, h, r) {
  if (px < 0 || py < 0 || px > w || py > h) return false;
  if (px >= r && px <= w - r) return true;
  if (py >= r && py <= h - r) return true;
  const cx = px < r ? r : w - r;
  const cy = py < r ? r : h - r;
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= r * r;
}

function smoothstep(dist, radius) {
  if (dist <= radius - 0.5) return 1;
  if (dist >= radius + 0.5) return 0;
  return radius + 0.5 - dist;
}

function encodePng(rgba, width, height) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const stride = width * 4;
  const raw = Buffer.alloc(height * (1 + stride));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + stride)] = 0;
    rgba.copy(raw, y * (1 + stride) + 1, y * stride, (y + 1) * stride);
  }
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crc]);
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = (CRC_TABLE[(c ^ buf[i]) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function buildIco(entries) {
  const sorted = [...entries].sort((a, b) => a.size - b.size);
  const count = sorted.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);
  const dirEntrySize = 16;
  let dataOffset = 6 + count * dirEntrySize;
  const directory = Buffer.alloc(count * dirEntrySize);
  const dataBlocks = [];
  for (let i = 0; i < sorted.length; i++) {
    const { size, png } = sorted[i];
    const eo = i * dirEntrySize;
    directory[eo] = size >= 256 ? 0 : size;
    directory[eo + 1] = size >= 256 ? 0 : size;
    directory[eo + 2] = 0;
    directory[eo + 3] = 0;
    directory.writeUInt16LE(1, eo + 4);
    directory.writeUInt16LE(32, eo + 6);
    directory.writeUInt32LE(png.length, eo + 8);
    directory.writeUInt32LE(dataOffset, eo + 12);
    dataOffset += png.length;
    dataBlocks.push(png);
  }
  return Buffer.concat([header, directory, ...dataBlocks]);
}

const sizes = [16, 24, 32, 48, 64, 128, 256];
const pngs = sizes.map((size) => ({
  size,
  png: encodePng(drawAppIconRgba(size), size, size),
}));

writeFileSync(resolve(outDir, 'icon.ico'), buildIco(pngs));
writeFileSync(resolve(outDir, 'icon.png'), pngs[pngs.length - 1].png);
console.log(`✓ wrote ${resolve(outDir, 'icon.ico')} (${sizes.length} resolutions)`);
console.log(`✓ wrote ${resolve(outDir, 'icon.png')} (256x256)`);
