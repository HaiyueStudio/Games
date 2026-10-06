import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { SPRITES, ATLAS_COLUMNS } from './sprites.ts';

// Dependency-free PNG exporter; all pixels are original artwork in sprites.ts.
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type); const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}
function png(pixels) {
  const height = pixels.length; const width = pixels[0].length;
  const raw = Buffer.alloc(height * (1 + width * 4));
  pixels.forEach((row, y) => row.forEach((color, x) => {
    if (!color) return;
    const offset = y * (width * 4 + 1) + 1 + x * 4;
    const value = parseInt(color.slice(1), 16);
    raw[offset] = value >> 16; raw[offset + 1] = (value >> 8) & 255; raw[offset + 2] = value & 255; raw[offset + 3] = 255;
  }));
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const directory = fileURLToPath(new URL('./assets/', import.meta.url));
mkdirSync(directory, { recursive: true });
const atlas = Array.from({ length: Math.ceil(SPRITES.length / ATLAS_COLUMNS) * 16 }, () => Array(ATLAS_COLUMNS * 16).fill(''));
const metadata = {};
SPRITES.forEach((sprite, i) => {
  const x = i % ATLAS_COLUMNS * 16; const y = Math.floor(i / ATLAS_COLUMNS) * 16;
  sprite.pixels.forEach((row, dy) => row.forEach((color, dx) => { atlas[y + dy][x + dx] = color; }));
  metadata[sprite.name] = { x, y, width: 16, height: 16 };
  writeFileSync(new URL(`./assets/${sprite.name}.png`, import.meta.url), png(sprite.pixels));
});
writeFileSync(new URL('./assets/atlas.png', import.meta.url), png(atlas));
writeFileSync(new URL('./assets/atlas.json', import.meta.url), `${JSON.stringify(metadata, null, 2)}\n`);
const cards = SPRITES.map(s => `<figure><img src="${s.name}.png" alt="${s.name}"><figcaption>${s.name}</figcaption></figure>`).join('\n');
writeFileSync(new URL('./assets/index.html', import.meta.url), `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>铁甲前线 · 像素素材库</title><style>body{background:#161d18;color:#dfdbbd;font:14px monospace;padding:32px}main{display:flex;flex-wrap:wrap;gap:16px}figure{margin:0;padding:16px;background:#26302b;text-align:center;width:130px}img{width:96px;height:96px;image-rendering:pixelated}figcaption{margin-top:12px}</style><h1>IRON OUTPOST / 像素素材库</h1><p>原创 16 × 16 像素 · 透明 PNG · 双帧履带 · 可重复生成</p><main>${cards}</main></html>`);
console.log(`Generated ${SPRITES.length} original pixel sprites and atlas.`);
