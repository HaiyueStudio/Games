import { writeFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { deflateSync } from 'node:zlib';
import { slots } from './catalog.ts';
const hook = registerHooks({ resolve(specifier, context, next) {
  return next(/^\.{1,2}\//.test(specifier) && !/\.[a-z0-9]+$/i.test(specifier) ? specifier + '.ts' : specifier, context);
} });
const { INTRO, OVERWORLD } = await import('./pack.ts');
hook.deregister();

const codes = new Map(slots.map(([, code, name]) => [name, code]));
const bytes = text => Buffer.from(text);
const join = (...parts) => Buffer.concat(parts);
const word = n => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
const dword = n => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
const roomLayer = Buffer.from('0c000c0000ff00000000000000000000803f0000803f0000010000803fffffff02', 'hex');
function plane(tag, data) {
  const zlib = deflateSync(data, { level: 1 });
  return join(bytes(tag), dword(zlib.length), zlib);
}
function create([id, title, subtitle], width, height, layout, metadata = 'leveltype=0\nlevels=0\npaths=0\nspecials=0\n') {
  const grids = [Buffer.alloc(width * height * 2, 255)];
  const place = (name, x, y) => {
    const code = name === 'edge' ? 0 : codes.get(name);
    if (code === undefined) throw Error(name);
    const offset = 2 * (y * width + x);
    let grid = grids.find(grid => grid.readUInt16LE(offset) === 0xffff);
    if (!grid) { grid = Buffer.alloc(width * height * 2, 255); grids.push(grid); }
    grid.writeUInt16LE(code, offset);
  };
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (x === 0 || x === width - 1 || y === 0 || y === height - 1) place('edge', x, y);
  }
  layout(place, (x, y, words) => words.split(' ').forEach((name, i) => place('text_' + name, x + i, y)));
  const layers = join(word(grids.length), ...grids.map(grid => join(dword(width), dword(height), roomLayer,
    plane('MAIN', grid), bytes('DATA'), dword(1), Buffer.of(0), plane('', Buffer.alloc(width * height)))));
  writeFileSync(new URL(id + '.l', import.meta.url), join(bytes('ACHTUNG!'), word(0x0105),
    bytes('MAP '), dword(2), word(0), bytes('LAYR'), dword(layers.length), layers));
  writeFileSync(new URL(id + '.ld', import.meta.url),
    `[general]\nname=${title}\nsubtitle=${subtitle}\nauthor=HaiyueStudio\npalette=default.png\n${metadata}`);
}

create(INTRO[0], 13, 9, (place, words) => {
  words(1, 1, 'baba is you'); words(9, 1, 'flag is win'); words(1, 7, 'rock is push');
  place('baba', 3, 4); place('flag', 10, 4);
  for (let y = 3; y <= 5; y++) place('rock', 6, y);
  for (const x of [2, 3, 7, 8, 9, 10]) place('tile', x, 6);
  place('grass', 10, 7); place('love', 11, 6);
});
create(INTRO[1], 13, 10, (place, words) => {
  words(1, 1, 'baba is you'); words(9, 1, 'flag is win'); words(3, 7, 'wall is stop');
  for (let y = 1; y <= 8; y++) place('wall', 8, y);
  place('baba', 3, 4); place('flag', 10, 4); place('grass', 11, 7);
});
create(INTRO[2], 14, 10, (place, words) => {
  words(1, 1, 'baba is you'); words(10, 1, 'flag is win'); words(1, 8, 'wall is stop');
  words(4, 6, 'rock is'); words(6, 5, 'you');
  for (let y = 1; y <= 8; y++) place('wall', 8, y);
  place('baba', 3, 4); place('rock', 10, 4); place('flag', 11, 6); place('love', 11, 8);
});
create(INTRO[3], 14, 10, (place, words) => {
  words(1, 1, 'baba is you'); words(10, 1, 'flag is win'); words(1, 7, 'lava is hot');
  words(1, 8, 'lava is push'); words(5, 8, 'ice is melt'); words(10, 7, 'ice is defeat');
  words(10, 8, 'wall is stop');
  for (let y = 1; y <= 8; y++) if (y !== 4) place('wall', 8, y);
  place('baba', 3, 4); place('lava', 6, 4); place('ice', 8, 4); place('flag', 11, 4);
});
create(INTRO[4], 13, 9, (place, words) => {
  words(1, 1, 'baba is you'); words(1, 7, 'wall is stop'); words(7, 6, 'rock is');
  words(9, 5, 'win'); place('baba', 2, 4); place('rock', 10, 3);
  place('star', 10, 7); place('grass', 11, 6);
});

const nodes = [[2, 6], [5, 6], [5, 3], [8, 3], [8, 6]];
const paths = [];
for (let i = 1; i < nodes.length; i++) {
  const [fromX, fromY] = nodes[i - 1];
  const [toX, toY] = nodes[i];
  const dx = Math.sign(toX - fromX), dy = Math.sign(toY - fromY);
  for (let x = fromX + dx, y = fromY + dy; x !== toX || y !== toY; x += dx, y += dy) paths.push([x, y]);
}
const links = nodes.map(([x, y], i) => `${i}file=${INTRO[i][0]}\n${i}x=${x}\n${i}y=${y}\n${i}state=${i ? 1 : 2}\n${i}style=2\n${i}number=${i + 1}\n`);
const roads = paths.map(([x, y], i) => `${i}x=${x}\n${i}y=${y}\n${i}style=0\n`);
create(OVERWORLD, 11, 9, place => {
  for (const [name, x, y] of [
    ['flower', 1, 2], ['grass', 2, 2], ['rock', 3, 3], ['star', 3, 1], ['star', 7, 1], ['flower', 9, 2],
    ['water', 1, 4], ['grass', 4, 4], ['water', 7, 5], ['love', 6, 7], ['rock', 1, 7], ['flower', 9, 7],
  ]) place(name, x, y);
}, `leveltype=1\nselectorX=2\nselectorY=6\nlevels=${links.length}\npaths=${roads.length}\nspecials=0\n[levels]\n${links.join('')}[paths]\n${roads.join('')}`);
