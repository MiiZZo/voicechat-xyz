import { app, BrowserWindow, Menu, Tray, nativeImage, type NativeImage } from 'electron';
import zlib from 'node:zlib';

/**
 * Generate a 32x32 PNG of a filled green circle, programmatically.
 * Avoids shipping a binary asset file. Replace with a real icon later if desired.
 */
function buildIconPng(): Buffer {
  const size = 32;
  const cx = size / 2 - 0.5;
  const cy = size / 2 - 0.5;
  const r = size / 2 - 1;
  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const inside = dx * dx + dy * dy <= r * r;
      const i = (y * size + x) * 4;
      if (inside) {
        rgba[i] = 16; // R
        rgba[i + 1] = 185; // G — emerald-500
        rgba[i + 2] = 129; // B
        rgba[i + 3] = 255; // A
      } else {
        rgba[i + 3] = 0; // transparent
      }
    }
  }
  return encodePng(rgba, size, size);
}

/** Minimal PNG encoder: signature + IHDR + IDAT (zlib of filter-0 scanlines) + IEND. */
function encodePng(rgba: Buffer, width: number, height: number): Buffer {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const stride = width * 4;
  const raw = Buffer.alloc(height * (1 + stride));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + stride)] = 0; // filter type "none"
    rgba.copy(raw, y * (1 + stride) + 1, y * stride, (y + 1) * stride);
  }
  const idat = zlib.deflateSync(raw);

  return Buffer.concat([sig, makeChunk('IHDR', ihdr), makeChunk('IDAT', idat), makeChunk('IEND', Buffer.alloc(0))]);
}

function makeChunk(type: string, data: Buffer): Buffer {
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
  return ((c ^ 0xffffffff) >>> 0);
}

function buildIconImage(): NativeImage {
  return nativeImage.createFromBuffer(buildIconPng());
}

let trayInstance: Tray | null = null;

/**
 * Create the system tray icon with a context menu (Open / Quit) and
 * double-click-to-show behavior. Returns the Tray for cleanup.
 */
export function setupTray(opts: {
  getWindow: () => BrowserWindow | null;
  onQuit: () => void;
}): Tray {
  if (trayInstance) return trayInstance;

  const tray = new Tray(buildIconImage());
  tray.setToolTip('VoiceChat');

  const showWindow = () => {
    const win = opts.getWindow();
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  };

  const menu = Menu.buildFromTemplate([
    { label: 'Открыть VoiceChat', click: showWindow },
    { type: 'separator' },
    { label: 'Выйти', click: opts.onQuit },
  ]);
  tray.setContextMenu(menu);
  tray.on('double-click', showWindow);
  // Single click also shows on Windows — most users expect it
  tray.on('click', showWindow);

  trayInstance = tray;
  app.on('before-quit', () => {
    if (trayInstance) {
      trayInstance.destroy();
      trayInstance = null;
    }
  });

  return tray;
}
