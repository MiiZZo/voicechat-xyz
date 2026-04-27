import { nativeImage, type NativeImage } from 'electron';
import { drawAppIconRgba, encodePng } from './icon-draw.js';

/** App icon used by BrowserWindow taskbar entry. */
export function buildAppIconImage(): NativeImage {
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const base = sizes.map((size) => nativeImage.createFromBuffer(encodePng(drawAppIconRgba(size), size, size)));
  // Take the largest as primary; addRepresentation lets HiDPI swap up automatically.
  const main = base[base.length - 1]!;
  for (let i = 0; i < base.length - 1; i++) {
    const s = sizes[i]!;
    main.addRepresentation({
      scaleFactor: s / sizes[0]!,
      width: s,
      height: s,
      buffer: base[i]!.toPNG(),
    });
  }
  return main;
}

/** Tray icon — 32x32 is standard for Windows tray. */
export function buildTrayIconImage(): NativeImage {
  const png = encodePng(drawAppIconRgba(32), 32, 32);
  return nativeImage.createFromBuffer(png);
}
