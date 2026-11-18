// SPDX-License-Identifier: MIT
// RGB/RGBA decoder adapted from Haiyue Engine's scripts/visual-regression/png.mjs.
// Copyright (c) 2026 Haiyue Engine contributors. See the repository MIT license.
import { crc32, deflateSync, inflateSync } from 'node:zlib';

const signature = Buffer.from('89504e470d0a1a0a', 'hex');
const paeth = (a, b, c) => {
  const estimate = a + b - c;
  const da = Math.abs(estimate - a), db = Math.abs(estimate - b), dc = Math.abs(estimate - c);
  return da <= db && da <= dc ? a : db <= dc ? b : c;
};

export function decodePng(png) {
  if (!png.subarray(0, 8).equals(signature)) throw Error('Expected PNG image data.');
  let width = 0, height = 0, channels = 0;
  const compressed = [];
  for (let offset = 8; offset + 12 <= png.length;) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    const end = offset + length + 12;
    if (end > png.length) throw Error('Incomplete PNG chunk.');
    const data = png.subarray(offset + 8, end - 4);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      channels = data[9] === 6 ? 4 : data[9] === 2 ? 3 : 0;
      if (data[8] !== 8 || data[12] !== 0 || !channels) throw Error('Atlas inputs must be non-interlaced RGB or RGBA PNGs with eight bits per channel.');
    } else if (type === 'IDAT') compressed.push(data);
    else if (type === 'tRNS') throw Error('Export transparent atlas inputs as RGBA PNGs.');
    else if (type === 'IEND') break;
    offset = end;
  }
  if (!width || !height || !channels || width * height > 32 * 1024 * 1024) throw Error('Invalid PNG dimensions.');
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(compressed), { maxOutputLength: (stride + 1) * height });
  if (raw.length !== (stride + 1) * height) throw Error('Incomplete PNG pixel data.');
  const rows = Buffer.allocUnsafe(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[(stride + 1) * y];
    if (filter > 4) throw Error(`Unsupported PNG filter ${filter}.`);
    for (let x = 0; x < stride; x++) {
      const i = y * stride + x;
      const left = x >= channels ? rows[i - channels] : 0;
      const up = y ? rows[i - stride] : 0;
      const diagonal = y && x >= channels ? rows[i - stride - channels] : 0;
      const prediction = filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? up
        : filter === 3 ? (left + up) >> 1 : paeth(left, up, diagonal);
      rows[i] = raw[i + y + 1] + prediction;
    }
  }
  if (channels === 4) return { width, height, data: rows };
  const rgba = Buffer.allocUnsafe(width * height * 4);
  for (let s = 0, d = 0; s < rows.length; s += 3, d += 4) {
    rgba[d] = rows[s]; rgba[d + 1] = rows[s + 1]; rgba[d + 2] = rows[s + 2]; rgba[d + 3] = 255;
  }
  return { width, height, data: rgba };
}

function chunk(type, data) {
  const result = Buffer.allocUnsafe(data.length + 12);
  result.writeUInt32BE(data.length);
  result.write(type, 4, 4, 'ascii');
  data.copy(result, 8);
  result.writeUInt32BE(crc32(result.subarray(4, result.length - 4)), result.length - 4);
  return result;
}

export function encodePng({ width, height, data }, adaptive = false) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width); header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = 6;
  const stride = width * 4, scanlines = Buffer.allocUnsafe((stride + 1) * height);
  const alternate = adaptive ? Buffer.allocUnsafe(scanlines.length) : undefined;
  const rows = adaptive ? Array.from({ length: 5 }, () => Buffer.allocUnsafe(stride)) : [];
  for (let y = 0; y < height; y++) {
    const start = y * (stride + 1);
    const scores = [0, 0, 0, 0, 0];
    scanlines[start] = 4;
    for (let x = 0; x < stride; x++) {
      const i = y * stride + x;
      const left = x >= 4 ? data[i - 4] : 0, up = y ? data[i - stride] : 0;
      const diagonal = y && x >= 4 ? data[i - stride - 4] : 0;
      const predicted = paeth(left, up, diagonal), value = data[i];
      scanlines[start + x + 1] = value - predicted;
      if (!alternate) continue;
      rows[0][x] = value;
      rows[1][x] = value - left;
      rows[2][x] = value - up;
      rows[3][x] = value - ((left + up) >> 1);
      rows[4][x] = value - predicted;
      for (let filter = 0; filter < rows.length; filter++) {
        const residual = rows[filter][x];
        scores[filter] += Math.min(residual, 256 - residual);
      }
    }
    if (!alternate) continue;
    let best = 4;
    for (let filter = 0; filter < 4; filter++) if (scores[filter] < scores[best]) best = filter;
    alternate[start] = best;
    rows[best].copy(alternate, start + 1);
  }
  let compressed = deflateSync(scanlines, { level: 9 });
  if (alternate) {
    const candidate = deflateSync(alternate, { level: 9 });
    if (candidate.length < compressed.length) compressed = candidate;
  }
  return Buffer.concat([signature, chunk('IHDR', header), chunk('IDAT', compressed), chunk('IEND', Buffer.alloc(0))]);
}
