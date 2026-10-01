// Genera los PNG de la extensión a partir de la geometría de public/icons/kinema-icon.svg.
// Sin dependencias: rasteriza con supersampling y codifica PNG con zlib.
// Uso: node scripts/generate-icons.mjs
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");
const SS = 8;

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const ACCENT = hex("#6d4aff");
const WHITE = hex("#ffffff");
const TINT = hex("#d4c9ff");

const segDist = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};
const inRoundRect = (x, y, r) => {
  const cx = Math.min(Math.max(x, r), 48 - r), cy = Math.min(Math.max(y, r), 48 - r);
  return x >= 0 && y >= 0 && x <= 48 && y <= 48 && Math.hypot(x - cx, y - cy) <= r;
};

const colorAt = (x, y) => {
  if (!inRoundRect(x, y, 14)) return null;
  if (segDist(x, y, 19, 25, 34, 10.5) <= 3.5) return TINT;
  if (segDist(x, y, 21, 24.5, 35, 38.5) <= 3.5) return WHITE;
  if (segDist(x, y, 15.5, 12.5, 15.5, 35.5) <= 3.5) return WHITE;
  return ACCENT;
};

function render(size, padding = 0) {
  const art = size - padding * 2;
  const px = Buffer.alloc(size * size * 4);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const ux = ((i - padding + (sx + 0.5) / SS) / art) * 48;
          const uy = ((j - padding + (sy + 0.5) / SS) / art) * 48;
          const c = colorAt(ux, uy);
          if (c) { r += c[0]; g += c[1]; b += c[2]; a++; }
        }
      }
      const o = (j * size + i) * 4;
      if (a) {
        px[o] = Math.round(r / a); px[o + 1] = Math.round(g / a); px[o + 2] = Math.round(b / a);
        px[o + 3] = Math.round((a / (SS * SS)) * 255);
      }
    }
  }
  return px;
}

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT, { recursive: true });
const jobs = [
  ["icon16.png", 16, 0],
  ["icon32.png", 32, 0],
  ["icon48.png", 48, 0],
  ["icon128.png", 128, 0],
  ["icon512.png", 512, 0],
  ["store-icon-128.png", 128, 16],
];
for (const [name, size, pad] of jobs) {
  writeFileSync(join(OUT, name), png(size, render(size, pad)));
  console.log(`✓ ${name} (${size}x${size}${pad ? `, padding ${pad}px` : ""})`);
}
