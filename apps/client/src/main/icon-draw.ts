/**
 * Pure icon drawing utilities. No Electron imports — usable from build scripts
 * (Node CLI) and from the main process at runtime.
 *
 * Design: a rounded square in emerald-500 with three white horizontal "chat
 * lines" inside. Reads as a chat / message app at any size from 16 to 256.
 */

import zlib from 'node:zlib';

const BG = { r: 16, g: 185, b: 129 }; // emerald-500
const FG = { r: 255, g: 255, b: 255 };

/** Draw the app icon at the given square size. Returns RGBA buffer. */
export function drawAppIconRgba(size: number): Buffer {
  const buf = Buffer.alloc(size * size * 4);
  const radius = Math.max(2, Math.round(size * 0.22));

  // Three chat lines, vertically centered.
  // Lines have decreasing widths (top short, middle long, bottom medium) so it
  // reads as text.
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

      // Rounded-square coverage with anti-aliased edge (single 4× supersample).
      const bgCov = roundedSquareCoverage(x, y, size, size, radius);
      if (bgCov <= 0) {
        buf[i + 3] = 0;
        continue;
      }

      // Determine if this pixel sits on one of the chat lines.
      let lineCov = 0;
      for (const line of lines) {
        const right = lineLeft + Math.round(lineMaxWidth * line.widthFrac);
        const lineRadius = lineHeight / 2;
        // Treat each line as a rounded rectangle with semicircular caps.
        const inLineY = y + 0.5 >= line.y && y + 0.5 < line.y + lineHeight;
        if (!inLineY) continue;
        if (x + 0.5 >= lineLeft + lineRadius && x + 0.5 < right - lineRadius) {
          lineCov = 1;
          break;
        }
        // Caps
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

      // Blend foreground over background.
      const bgR = BG.r;
      const bgG = BG.g;
      const bgB = BG.b;
      const r = Math.round(bgR * (1 - lineCov) + FG.r * lineCov);
      const g = Math.round(bgG * (1 - lineCov) + FG.g * lineCov);
      const b = Math.round(bgB * (1 - lineCov) + FG.b * lineCov);

      buf[i] = r;
      buf[i + 1] = g;
      buf[i + 2] = b;
      buf[i + 3] = Math.round(255 * bgCov);
    }
  }
  return buf;
}

/** Coverage of a pixel (x, y) inside a rounded rectangle. 0..1 with AA at the edge. */
function roundedSquareCoverage(x: number, y: number, w: number, h: number, r: number): number {
  // 4x supersample
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

function insideRoundedRect(px: number, py: number, w: number, h: number, r: number): boolean {
  if (px < 0 || py < 0 || px > w || py > h) return false;
  // Inside straight zones
  if (px >= r && px <= w - r) return true;
  if (py >= r && py <= h - r) return true;
  // Corner zones
  const cx = px < r ? r : w - r;
  const cy = py < r ? r : h - r;
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= r * r;
}

function smoothstep(dist: number, radius: number): number {
  if (dist <= radius - 0.5) return 1;
  if (dist >= radius + 0.5) return 0;
  return radius + 0.5 - dist;
}

/** Encode RGBA buffer as PNG. Returns PNG bytes. */
export function encodePng(rgba: Buffer, width: number, height: number): Buffer {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
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

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crc]);
}

const CRC_TABLE: Uint32Array = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = (CRC_TABLE[(c ^ (buf[i] ?? 0)) & 0xff] ?? 0) ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Pack multiple PNG images into a single Windows .ico file.
 * Modern Windows (Vista+) accepts PNG-encoded ICO entries directly.
 */
export function buildIco(entries: { size: number; png: Buffer }[]): Buffer {
  const sorted = [...entries].sort((a, b) => a.size - b.size);
  const count = sorted.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: 1 = icon
  header.writeUInt16LE(count, 4);

  const dirEntrySize = 16;
  let dataOffset = 6 + count * dirEntrySize;

  const directory = Buffer.alloc(count * dirEntrySize);
  const dataBlocks: Buffer[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const { size, png } = sorted[i]!;
    const entryOffset = i * dirEntrySize;
    directory[entryOffset] = size >= 256 ? 0 : size; // width
    directory[entryOffset + 1] = size >= 256 ? 0 : size; // height
    directory[entryOffset + 2] = 0; // colors
    directory[entryOffset + 3] = 0; // reserved
    directory.writeUInt16LE(1, entryOffset + 4); // planes
    directory.writeUInt16LE(32, entryOffset + 6); // bpp
    directory.writeUInt32LE(png.length, entryOffset + 8); // dataSize
    directory.writeUInt32LE(dataOffset, entryOffset + 12); // dataOffset
    dataOffset += png.length;
    dataBlocks.push(png);
  }

  return Buffer.concat([header, directory, ...dataBlocks]);
}
