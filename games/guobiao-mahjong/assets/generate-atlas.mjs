import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const W = 1152, H = 1152, CW = 144, CH = 192, PAD = 8, TW = 128, TH = 176;
const red = '#b63831', green = '#216b51', blue = '#244f83', ink = '#243e36';
const text = (s, x, y, size, color = ink, extra = '') => `<text x="${x}" y="${y}" font-size="${size}" fill="${color}" text-anchor="middle" font-family="STKaiti,Kaiti SC,Songti SC,serif" font-weight="700" ${extra}>${s}</text>`;
const path = (d, color, width = 3, extra = '') => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`;
function dot(x, y, r, color) { return `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}"/><circle cx="${x}" cy="${y}" r="${r * .65}" fill="none" stroke="#faf4df" stroke-width="2.1"/><circle cx="${x}" cy="${y}" r="${r * .22}" fill="#faf4df"/>`; }
const layouts = {
  2: [[64, 51], [64, 117]], 3: [[33, 42], [64, 84], [95, 126]],
  4: [[35, 47], [93, 47], [35, 121], [93, 121]], 5: [[35, 44], [93, 44], [64, 84], [35, 124], [93, 124]],
  6: [[37, 39], [91, 39], [37, 84], [91, 84], [37, 129], [91, 129]],
  7: [[33, 30], [64, 50], [95, 70], [37, 105], [91, 105], [37, 137], [91, 137]],
  8: [[36, 32], [92, 32], [36, 67], [92, 67], [36, 102], [92, 102], [36, 137], [92, 137]],
  9: [[30, 36], [64, 36], [98, 36], [30, 84], [64, 84], [98, 84], [30, 132], [64, 132], [98, 132]],
};
function bamboo(x, y, size, color) {
  return `<g transform="translate(${x} ${y})"><rect x="${-size * .32}" y="${-size}" width="${size * .64}" height="${size * 2}" rx="${size * .2}" fill="${color}"/>${[-.7, 0, .7].map(k => path(`M${-size * .39} ${k * size}h${size * .78}`, '#f5eed8', 1.8)).join('')}${path(`M${-size * .13} ${-size * .8}v${size * 1.6}`, '#73a58a', 1.4)}</g>`;
}
function bird() {
  return `<g>${path('M72 55C96 37 102 51 89 62L79 73', green, 8)}<path d="M87 47l18 5-17 3" fill="${red}"/><circle cx="89" cy="48" r="2" fill="${ink}"/><path d="M70 62C42 51 25 71 39 95C52 111 78 100 85 77Z" fill="${green}"/><path d="M68 70C42 60 42 90 71 92" fill="#4f9680" stroke="${blue}" stroke-width="3"/>${[0, 1, 2, 3, 4].map(i => path(`M52 94Q${13 + i * 18} 122 ${20 + i * 15} 141`, i % 2 ? green : blue, 5)).join('')}${path('M73 96l9 24m-3-2 10 3', red, 3)}</g>`;
}
function flower(index) {
  const colors = ['#bd5b6c', '#d78e51', '#d2a449', '#7097b1', '#bf5262', '#906c9c', '#4a8a68', '#c7a146'];
  const color = colors[index]; let shapes = path('M65 143Q49 112 71 73', green, 4) + `<path d="M63 116Q32 93 30 115Q47 131 63 116M65 130Q89 104 98 124Q81 140 65 130" fill="#47846a"/>`;
  for (let j = 0; j < 3; j++) {
    const x = [72, 47, 91][j], y = [54, 88, 91][j], n = index === 7 ? 12 : 5;
    shapes += `<g transform="translate(${x} ${y})">${Array.from({ length: n }, (_, i) => `<ellipse cx="0" cy="-10" rx="${n === 12 ? 4 : 8}" ry="12" fill="${color}" stroke="#faf0dc" stroke-width=".6" transform="rotate(${i * 360 / n})"/>`).join('')}<circle r="5" fill="#d2ab4c"/></g>`;
  }
  return shapes + text(['春', '夏', '秋', '冬', '梅', '蘭', '竹', '菊'][index], 23, 42, 25, color) + text(String(index % 4 + 1), 106, 145, 16, color);
}
function face(tile) {
  if (tile < 9) return text(['一', '二', '三', '四', '五', '六', '七', '八', '九'][tile], 64, 75, 58) + text('萬', 64, 137, 56, red);
  if (tile === 9) return bird();
  if (tile < 18) { const n = tile - 8; return layouts[n].map(([x, y], i) => bamboo(x, y, n >= 7 ? 12 : n >= 4 ? 18 : 22, n === 5 && i === 2 || n === 7 && i < 3 || n === 9 && i >= 3 && i < 6 ? red : green)).join(''); }
  if (tile === 18) return dot(64, 84, 39, blue) + dot(64, 84, 23, green) + dot(64, 84, 9, red);
  if (tile < 27) { const n = tile - 17; return layouts[n].map(([x, y], i) => dot(x, y, n >= 7 ? 11.5 : 15, n === 3 ? [blue, green, red][i] : n === 5 && i === 2 || n === 6 && i < 2 || n === 7 && i >= 3 ? red : n === 9 ? [blue, green, red][Math.floor(i / 3)] : n === 2 || n === 6 || n === 7 ? green : blue)).join(''); }
  if (tile < 33) return text(['東', '南', '西', '北', '中', '發'][tile - 27], 64, 116, tile >= 31 ? 89 : 82, tile === 31 ? red : tile === 32 ? green : ink);
  if (tile === 33) return `<rect x="28" y="34" width="72" height="103" rx="4" fill="none" stroke="${blue}" stroke-width="7"/><rect x="35" y="41" width="58" height="89" rx="1" fill="none" stroke="${blue}" stroke-width="1.8"/>${[34, 130].map(y => path(`M28 ${y}h72`, blue, 3)).join('')}`;
  if (tile < 42) return flower(tile - 34);
  return `<rect x="5" y="5" width="118" height="153" rx="10" fill="url(#jade)"/><rect x="12" y="12" width="104" height="139" rx="6" fill="url(#weave)" stroke="#b4ba8b" stroke-width="1.3"/><path d="M64 39l34 41-34 41-34-41Z" fill="#244c3d" stroke="#bdc397" stroke-width="1.4"/>${text('雀', 64, 94, 34, '#bdc397')}`;
}
const names = Array.from({ length: 43 }, (_, t) => t < 27 ? `${t % 9 + 1}${['万', '条', '筒'][Math.floor(t / 9)]}` : ['东', '南', '西', '北', '中', '发', '白', '春', '夏', '秋', '冬', '梅', '兰', '竹', '菊', '牌背'][t - 27]);
const frames = names.map((name, id) => ({ id, name, x: id % 8 * CW + PAD, y: Math.floor(id / 8) * CH + PAD, width: TW, height: TH }));
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs><linearGradient id="ivory" x2=".8" y2="1"><stop stop-color="#fffdf2"/><stop offset=".58" stop-color="#f4eedc"/><stop offset="1" stop-color="#e5dcc3"/></linearGradient><linearGradient id="jade" x2="1" y2="1"><stop stop-color="#507b61"/><stop offset="1" stop-color="#244d3b"/></linearGradient><pattern id="weave" width="12" height="12" patternUnits="userSpaceOnUse"><path d="M6 0l6 6-6 6-6-6Z" fill="none" stroke="#d2d2a0" stroke-opacity=".14" stroke-width=".8"/></pattern></defs>${frames.map(f => `<g transform="translate(${f.x} ${f.y})"><rect x="1" y="6" width="126" height="168" rx="13" fill="#b5aa8e"/><rect x="1" y="1" width="126" height="162" rx="12" fill="url(#ivory)" stroke="#c9bea2" stroke-width="1.5"/><rect x="5" y="4" width="118" height="153" rx="9" fill="none" stroke="#ffffff" stroke-opacity=".6" stroke-width="1.1"/>${face(f.id)}</g>`).join('')}</svg>`;
const root = new URL('./', import.meta.url);
writeFileSync(fileURLToPath(new URL('tiles-supplement.svg', root)), svg);
writeFileSync(fileURLToPath(new URL('tiles-atlas.json', root)), JSON.stringify({ version: 1, image: 'tiles-atlas.png', width: W, height: H, tileWidth: TW, tileHeight: TH, cellWidth: CW, cellHeight: CH, padding: PAD, frames }, null, 2) + '\n');
console.log('Created procedural supplement SVG and frame metadata. Rasterize to tiles-supplement.png, then run pack-reference-atlas.mjs.');
