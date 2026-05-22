// Генератор иконок: SVG → PNG (через @resvg/resvg-js) → ICO. SVG — единственный
// источник правды дизайна, виден человеку и редактируется напрямую. Resvg
// рендерит с правильным subpixel hinting'ом — иконки чёткие на любом размере
// без "мыла" от наивного antialias'а, который был в старом pixel-based коде.
//
// На выходе кладём:
//   src-tauri/icons/32x32.png
//   src-tauri/icons/128x128.png
//   src-tauri/icons/128x128@2x.png      (256x256)
//   src-tauri/icons/icon.png            (512x512)
//   src-tauri/icons/icon.ico            (16/24/32/48/64/128/256)
//   src-tauri/icons/tray.png            (32x32)
//   src-tauri/icons/tray-muted.png      (32x32)
//   src-tauri/icons/taskbar-overlay-muted.ico (16/20/24/32/48)
//   src-tauri/icons/sources/*.svg       (исходники, можно править вручную)
//
// .icns не делаем — для Windows-сборки не нужен. macOS — через `cargo tauri icon`.

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, '..', 'src-tauri', 'icons');
const sourcesDir = resolve(outDir, 'sources');
mkdirSync(outDir, { recursive: true });
mkdirSync(sourcesDir, { recursive: true });

// ============================================================================
// Палитра. ВНИМАНИЕ: должна совпадать с tailwind.config.ts / index.css токенами.
// ============================================================================
const BG = 'rgb(9, 9, 11)';        // zinc-950
const FG = 'rgb(255, 255, 255)';   // white
const MUTE = 'rgb(244, 63, 94)';   // rose-500

// ============================================================================
// SVG-источники. ViewBox 0..100 — все размеры в "процентах от иконки",
// resvg сам отскейлит при рендеринге.
// ============================================================================

/** App-иконка — оригинальные пропорции из старого pixel-based генератора
 *  (до всех экспериментов). ViewBox 100×100, скруглённый угол 22%, три
 *  pill-линии на 70%/100%/55% доступной ширины, вертикально по центру. */
function svgAppIcon() {
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <rect x="0"  y="0"     width="100"  height="100" rx="22"   fill="${BG}"/>
  <rect x="22" y="28.75" width="39.2" height="8.5" rx="4.25" fill="${FG}"/>
  <rect x="22" y="45.75" width="56"   height="8.5" rx="4.25" fill="${FG}"/>
  <rect x="22" y="62.75" width="30.8" height="8.5" rx="4.25" fill="${FG}"/>
</svg>`;
}

/** Tray в состоянии мута: тёмный rounded square + белый микрофон (тело +
 *  стенд + база) + красная диагональ. Иконка системного трея. */
function svgTrayMuted() {
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="100" height="100" rx="22" ry="22" fill="${BG}"/>
  <!-- Mic pill body (capsule = rounded rect с rx = w/2) -->
  <rect x="34" y="17" width="32" height="42" rx="16" fill="${FG}"/>
  <!-- Mic stand -->
  <rect x="46.5" y="62" width="7" height="12" fill="${FG}"/>
  <!-- Mic base -->
  <rect x="30" y="74.5" width="40" height="7" rx="2" fill="${FG}"/>
  <!-- Red diagonal slash -->
  <line x1="18" y1="22" x2="82" y2="78" stroke="${MUTE}" stroke-width="18" stroke-linecap="round"/>
</svg>`;
}

/** Taskbar-overlay в состоянии мута: красный круг + белый микрофон + тёмная
 *  диагональ. Маленький бейдж (16-48px), который Windows рисует поверх
 *  обычной app-иконки в панели задач. */
function svgOverlayMuted() {
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <circle cx="50" cy="50" r="49.5" fill="${MUTE}"/>
  <!-- Mic body — чуть меньше чем у tray, чтобы вписаться в круг -->
  <rect x="36" y="22" width="28" height="36" rx="14" fill="${FG}"/>
  <!-- Stand -->
  <rect x="47" y="60" width="6" height="9" fill="${FG}"/>
  <!-- Base -->
  <rect x="33" y="70" width="34" height="6" rx="2" fill="${FG}"/>
  <!-- Slash тёмная — контраст и с белым mic, и с красным фоном -->
  <line x1="22" y1="22" x2="78" y2="78" stroke="${BG}" stroke-width="10" stroke-linecap="round"/>
</svg>`;
}

// ============================================================================
// SVG → PNG через resvg. Resvg рендерит с subpixel hinting'ом — линии
// аккуратно ложатся на pixel grid, без мыла. Это ключевое отличие от
// старого ручного pixel-based кода.
// ============================================================================

function rasterize(svgString, size) {
  const resvg = new Resvg(svgString, {
    fitTo: { mode: 'width', value: size },
    shapeRendering: 2, // GeometricPrecision — плавные кривые на больших размерах
    textRendering: 0,
  });
  return resvg.render().asPng();
}

// ============================================================================
// ICO packing. Спецификация: 6-байт header, N×16-байт directory entries,
// затем raw PNG blocks. Tauri читает ICO через image-ico feature.
// ============================================================================

function buildIco(entries) {
  // ВАЖНО: первый entry должен быть КРУПНЫМ. Tauri 2 (см. issue #14596) в
  // runtime читает только entries[0] и из него строит HICON для taskbar /
  // title-bar / Alt-Tab. Если первым лежит 16×16, Windows вынужден
  // апскейлить его на все DPI → мыло. С 256-первым Windows downscale'ит
  // (HighQualityBicubic) — чётко на любом размере. Остальные entries
  // нужны только для shell'а Explorer'а, который читает ICO целиком.
  const sorted = [...entries].sort((a, b) => b.size - a.size);
  const count = sorted.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);     // reserved
  header.writeUInt16LE(1, 2);     // type=ICO
  header.writeUInt16LE(count, 4);

  const dirEntrySize = 16;
  let dataOffset = 6 + count * dirEntrySize;
  const directory = Buffer.alloc(count * dirEntrySize);
  const dataBlocks = [];

  for (let i = 0; i < sorted.length; i++) {
    const { size, png } = sorted[i];
    const eo = i * dirEntrySize;
    directory[eo] = size >= 256 ? 0 : size;       // width (0 = 256)
    directory[eo + 1] = size >= 256 ? 0 : size;   // height
    directory[eo + 2] = 0;                         // color count
    directory[eo + 3] = 0;                         // reserved
    directory.writeUInt16LE(1, eo + 4);            // color planes
    directory.writeUInt16LE(32, eo + 6);           // bits per pixel
    directory.writeUInt32LE(png.length, eo + 8);   // image size
    directory.writeUInt32LE(dataOffset, eo + 12);  // offset
    dataOffset += png.length;
    dataBlocks.push(png);
  }
  return Buffer.concat([header, directory, ...dataBlocks]);
}

// ============================================================================
// Output
// ============================================================================

// Сохраняем исходники SVG — можно открыть в редакторе и поправить дизайн вручную.
writeFileSync(resolve(sourcesDir, 'app-icon.svg'), svgAppIcon());
writeFileSync(resolve(sourcesDir, 'tray-muted.svg'), svgTrayMuted());
writeFileSync(resolve(sourcesDir, 'overlay-muted.svg'), svgOverlayMuted());
console.log(`wrote sources/*.svg (3 files)`);

// App icon — PNG разных размеров + multi-res ICO.
const appIconSvg = svgAppIcon();
const make = (size, name) => {
  writeFileSync(resolve(outDir, name), rasterize(appIconSvg, size));
  console.log(`wrote ${name} (${size}x${size})`);
};

make(32, '32x32.png');
make(128, '128x128.png');
make(256, '128x128@2x.png');
make(512, 'icon.png');
make(32, 'tray.png');

// icon.ico — стандартный набор Windows-размеров. Windows shell сам выберет
// нужный для каждого DPI (16 для 100%, 32 для 200%, и т.д.).
{
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const pngs = sizes.map((size) => ({ size, png: rasterize(appIconSvg, size) }));
  writeFileSync(resolve(outDir, 'icon.ico'), buildIco(pngs));
  console.log(`wrote icon.ico (${sizes.length} resolutions)`);
}

// Tray в muted-состоянии — отдельный PNG 32×32 (трей системы рисует именно
// такой размер на стандартном DPI Windows).
{
  writeFileSync(resolve(outDir, 'tray-muted.png'), rasterize(svgTrayMuted(), 32));
  console.log(`wrote tray-muted.png (32x32)`);
}

// Taskbar overlay в muted-состоянии — multi-res ICO. Windows подберёт размер
// под текущий DPI: 100% → 16, 125% → 20, 150% → 24, 200% → 32.
{
  const sizes = [16, 20, 24, 32, 48];
  const overlaySvg = svgOverlayMuted();
  const pngs = sizes.map((size) => ({ size, png: rasterize(overlaySvg, size) }));
  writeFileSync(resolve(outDir, 'taskbar-overlay-muted.ico'), buildIco(pngs));
  console.log(`wrote taskbar-overlay-muted.ico (${sizes.length} resolutions)`);
}

// .icns: пишем 1×1 заглушку — нужна только для macOS-сборки, которая идёт
// отдельным маршрутом `cargo tauri icon`. Tauri требует чтобы файл существовал.
{
  const stub = rasterize(svgAppIcon(), 16);
  writeFileSync(resolve(outDir, 'icon.icns'), stub);
  console.log(`wrote icon.icns (placeholder; используйте \`cargo tauri icon\` для macOS-сборки)`);
}
