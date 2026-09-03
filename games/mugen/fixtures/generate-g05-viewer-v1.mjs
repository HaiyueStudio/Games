import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const utf8 = new TextEncoder();
mkdirSync(directory, { recursive: true });

write('hero.def', `[Info]
name = "Viewer Fighter"
displayname = "Viewer Fighter EX"
author = "Haiyue Fixture"
mugenversion = 1.1
localcoord = 640,360
[Files]
cmd=hero.cmd
sprite=hero.sff
anim=hero.air
pal1=hero.act
`);
write('hero.cmd', '[Command]\nname=x\ncommand=x\n');
write('hero.air', `[Begin Action 0]
Clsn2Default: 1
Clsn2[0] = -5,-10,5,0
0,0,0,0,8
LoopStart
1,0,3,-2,8,H,AS256D0,1.25,0.75,15
Clsn1: 1
Clsn1[0] = 0,-8,8,-2
99,0,0,0,8

[Begin Action 10]
0,0,0,0,0
1,0,0,0,-1
`);
writeFileSync(resolve(directory, 'hero.sff'), buildLinkedSffV1());
const act = new Uint8Array(768);
for (let index = 0; index < act.length; index++) act[index] = index & 255;
writeFileSync(resolve(directory, 'hero.act'), act);

function write(name, source) { writeFileSync(resolve(directory, name), utf8.encode(source)); }

function buildLinkedSffV1() {
  const palette = new Uint8Array(768);
  palette.set([20, 100, 220], 3);
  palette.set([240, 245, 255], 6);
  const first = pcx8(16, 24, fighterPixels(), palette);
  const records = [
    { group: 0, item: 0, axisX: 8, axisY: 23, link: 0, shared: false, data: first },
    { group: 1, item: 0, axisX: 7, axisY: 22, link: 0, shared: true, data: null },
  ];
  const output = new Uint8Array(512 + records.reduce((sum, record) => sum + 32 + (record.data?.byteLength ?? 0), 0));
  output.set(utf8.encode('ElecbyteSpr\0'));
  output.set([0, 0, 0, 1], 12);
  const view = new DataView(output.buffer);
  view.setUint32(20, records.length, true); view.setUint32(24, 512, true);
  let offset = 512;
  for (let index = 0; index < records.length; index++) {
    const record = records[index];
    const next = index + 1 < records.length ? offset + 32 + (record.data?.byteLength ?? 0) : 0;
    view.setUint32(offset, next, true); view.setUint32(offset + 4, record.data?.byteLength ?? 0, true);
    view.setInt16(offset + 8, record.axisX, true); view.setInt16(offset + 10, record.axisY, true);
    view.setUint16(offset + 12, record.group, true); view.setUint16(offset + 14, record.item, true); view.setUint16(offset + 16, record.link, true);
    output[offset + 18] = record.shared ? 1 : 0;
    if (record.data) output.set(record.data, offset + 32);
    offset = next;
  }
  return output;
}

function fighterPixels() {
  const width = 16; const height = 24; const pixels = new Uint8Array(width * height);
  const fill = (left, top, right, bottom, color) => { for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) pixels[y * width + x] = color; };
  fill(6, 1, 9, 5, 2); fill(4, 6, 11, 14, 1); fill(2, 7, 3, 15, 2); fill(12, 7, 13, 15, 2); fill(5, 15, 7, 22, 1); fill(9, 15, 11, 22, 1);
  return pixels;
}

function pcx8(width, height, pixels, palette) {
  const encoded = [];
  for (const value of pixels) { if (value >= 0xc0) encoded.push(0xc1, value); else encoded.push(value); }
  const output = new Uint8Array(128 + encoded.length + 769);
  const view = new DataView(output.buffer);
  output.set([10, 5, 1, 8], 0); view.setUint16(8, width - 1, true); view.setUint16(10, height - 1, true);
  output[65] = 1; view.setUint16(66, width, true); output.set(encoded, 128);
  output[128 + encoded.length] = 0x0c; output.set(palette, 129 + encoded.length);
  return output;
}
