import { readFileSync, writeFileSync } from 'node:fs';
import { decodePng } from '../../../../../Engine/scripts/visual-regression/png.mjs';
const image = decodePng(readFileSync(new URL('digits.png', import.meta.url)));
const glyphs = {};
for (const [index, char] of [...'0123456789+/'].entries()) {
  const x0 = Math.round(index % 4 * image.width / 4), y0 = Math.round(Math.floor(index / 4) * image.height / 3);
  const x1 = Math.round((index % 4 + 1) * image.width / 4), y1 = Math.round((Math.floor(index / 4) + 1) * image.height / 3);
  // Use the dominant ink component so a neighboring glyph's dry-brush fleck
  // cannot enlarge this glyph's crop into the previous row/column.
  const cellWidth = x1 - x0, cellHeight = y1 - y0, seen = new Uint8Array(cellWidth * cellHeight);
  let dominant = { count: 0, left: x1, top: y1, right: x0, bottom: y0 };
  for (let sy = y0; sy < y1; sy++) for (let sx = x0; sx < x1; sx++) {
    const local = (sy - y0) * cellWidth + sx - x0;
    if (seen[local] || image.data[(sy * image.width + sx) * 4 + 3] < 60) continue;
    const queue = [local]; seen[local] = 1;
    const component = { count: 0, left: sx, top: sy, right: sx, bottom: sy };
    for (let head = 0; head < queue.length; head++) {
      const index = queue[head], x = index % cellWidth + x0, y = Math.floor(index / cellWidth) + y0;
      component.count++; component.left = Math.min(component.left, x); component.right = Math.max(component.right, x);
      component.top = Math.min(component.top, y); component.bottom = Math.max(component.bottom, y);
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (nx < x0 || nx >= x1 || ny < y0 || ny >= y1) continue;
        const next = (ny - y0) * cellWidth + nx - x0;
        if (seen[next] || image.data[(ny * image.width + nx) * 4 + 3] < 60) continue;
        seen[next] = 1; queue.push(next);
      }
    }
    if (component.count > dominant.count) dominant = component;
  }
  const left = Math.max(x0, dominant.left - 2), top = Math.max(y0, dominant.top - 2);
  const right = Math.min(x1 - 1, dominant.right + 2), bottom = Math.min(y1 - 1, dominant.bottom + 2);
  if (right <= left || bottom <= top) throw new Error(`Empty glyph ${char}`);
  glyphs[char] = { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}
writeFileSync(new URL('digits.json', import.meta.url), JSON.stringify({ version: 1, image: 'digits.png', width: image.width, height: image.height, glyphs }, null, 2) + '\n');
const lineHeight = Math.round(image.height / 3), advance = Math.round(image.width / 4);
const lines = [`info face="MoJing Ink Brush" size=${lineHeight} bold=0 italic=0 charset="" unicode=1 stretchH=100 smooth=1 aa=1 padding=0,0,0,0 spacing=0,0`,
  `common lineHeight=${lineHeight} base=${lineHeight - 20} scaleW=${image.width} scaleH=${image.height} pages=1 packed=0`,
  'page id=0 file="digits.png"', 'chars count=12',
  ...Object.entries(glyphs).map(([char, g]) => `char id=${char.charCodeAt(0)} x=${g.x} y=${g.y} width=${g.width} height=${g.height} xoffset=${Math.round((advance - g.width) / 2)} yoffset=${lineHeight - 20 - g.height} xadvance=${advance} page=0 chnl=15`), 'kernings count=0'];
writeFileSync(new URL('digits.fnt', import.meta.url), lines.join('\n') + '\n');
console.log('Built ink bitmap font metrics for 12 glyphs');
