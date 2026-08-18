import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const SOURCE = new URL('./blocks.glb', import.meta.url);
const OUT_DIR = new URL('./block-previews/', import.meta.url);
const SCALE = 1400;
const CANVAS_W = 220;
const CANVAS_H = 190;
const VIEW_W = 176;
const VIEW_H = 132;

function parseGlb(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error('Not a GLB file');
  let offset = 12;
  let gltf = null;
  let binary = null;
  while (offset + 8 <= buffer.length) {
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    const start = offset + 8;
    const chunk = buffer.subarray(start, start + length);
    if (type === 0x4e4f534a) gltf = JSON.parse(chunk.toString('utf8'));
    if (type === 0x004e4942) binary = chunk;
    offset = start + length;
  }
  if (!gltf || !binary) throw new Error('Missing GLB chunks');
  return { gltf, binary };
}

function readFloatAccessor(gltf, binary, accessorIndex, itemSize) {
  const accessor = gltf.accessors[accessorIndex];
  const view = gltf.bufferViews[accessor.bufferView];
  const stride = view.byteStride ?? itemSize * 4;
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const out = new Float32Array(accessor.count * itemSize);
  for (let i = 0; i < accessor.count; i++) {
    for (let c = 0; c < itemSize; c++) out[i * itemSize + c] = binary.readFloatLE(start + i * stride + c * 4) * SCALE;
  }
  return out;
}

function readIndices(gltf, binary, accessorIndex) {
  const accessor = gltf.accessors[accessorIndex];
  const view = gltf.bufferViews[accessor.bufferView];
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const out = [];
  for (let i = 0; i < accessor.count; i++) {
    if (accessor.componentType === 5125) out.push(binary.readUInt32LE(start + i * 4));
    else if (accessor.componentType === 5123) out.push(binary.readUInt16LE(start + i * 2));
    else if (accessor.componentType === 5121) out.push(binary.readUInt8(start + i));
    else throw new Error(`Unsupported index type ${accessor.componentType}`);
  }
  return out;
}

function sanitize(name) {
  return name.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '');
}

function bounds(positions) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let c = 0; c < 3; c++) {
      min[c] = Math.min(min[c], positions[i + c]);
      max[c] = Math.max(max[c], positions[i + c]);
    }
  }
  return { min, max, center: min.map((v, i) => (v + max[i]) * 0.5) };
}

function rotateProject(point) {
  const yaw = -Math.PI * 0.27;
  const pitch = Math.PI * 0.18;
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const x1 = point[0] * cy - point[2] * sy;
  const z1 = point[0] * sy + point[2] * cy;
  const y1 = point[1] * cp - z1 * sp;
  const z2 = point[1] * sp + z1 * cp;
  return [x1, -y1, z2];
}

function normal(a, b, c) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const length = Math.hypot(nx, ny, nz) || 1;
  return [nx / length, ny / length, nz / length];
}

function shade(a, b, c) {
  const n = normal(a, b, c);
  const light = [-0.38, 0.74, 0.55];
  const dot = Math.abs(n[0] * light[0] + n[1] * light[1] + n[2] * light[2]);
  const v = Math.round(150 + dot * 82);
  return `rgb(${v},${v},${Math.min(255, v + 8)})`;
}

function renderMesh(name, positions, indices) {
  const box = bounds(positions);
  const vertices = [];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    const p = [
      positions[i] - box.center[0],
      positions[i + 1] - box.center[1],
      positions[i + 2] - box.center[2],
    ];
    const projected = rotateProject(p);
    vertices.push({ world: p, view: projected });
    minX = Math.min(minX, projected[0]);
    maxX = Math.max(maxX, projected[0]);
    minY = Math.min(minY, projected[1]);
    maxY = Math.max(maxY, projected[1]);
  }
  const fit = Math.min(VIEW_W / Math.max(1, maxX - minX), VIEW_H / Math.max(1, maxY - minY));
  const cx = CANVAS_W * 0.5;
  const cy = 84;
  const triangles = [];
  const sourceIndices = indices.length ? indices : Array.from({ length: positions.length / 3 }, (_, i) => i);
  for (let i = 0; i + 2 < sourceIndices.length; i += 3) {
    const ia = sourceIndices[i], ib = sourceIndices[i + 1], ic = sourceIndices[i + 2];
    const a = vertices[ia], b = vertices[ib], c = vertices[ic];
    triangles.push({
      depth: (a.view[2] + b.view[2] + c.view[2]) / 3,
      color: shade(a.world, b.world, c.world),
      points: [a, b, c].map(v => `${(cx + v.view[0] * fit).toFixed(1)},${(cy + v.view[1] * fit).toFixed(1)}`).join(' '),
    });
  }
  triangles.sort((a, b) => a.depth - b.depth);
  const polys = triangles
    .map(t => `<polygon points="${t.points}" fill="${t.color}" stroke="rgba(34,42,48,0.22)" stroke-width="0.35"/>`)
    .join('\n');
  const label = escapeXml(name);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_W}" height="${CANVAS_H}" viewBox="0 0 ${CANVAS_W} ${CANVAS_H}">
  <rect width="100%" height="100%" fill="#edf1f5"/>
  <g>${polys}</g>
  <text x="110" y="172" text-anchor="middle" font-family="ui-sans-serif, system-ui, sans-serif" font-size="12" fill="#27313a">${label}</text>
</svg>
`;
}

function escapeXml(value) {
  return value.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[ch]));
}

const { gltf, binary } = parseGlb(readFileSync(SOURCE));
mkdirSync(OUT_DIR, { recursive: true });
const manifest = [];

for (let i = 0; i < gltf.meshes.length; i++) {
  const mesh = gltf.meshes[i];
  const primitive = mesh.primitives?.[0];
  if (!mesh.name || !primitive || primitive.mode !== undefined && primitive.mode !== 4) continue;
  const positions = readFloatAccessor(gltf, binary, primitive.attributes.POSITION, 3);
  const indices = primitive.indices !== undefined ? readIndices(gltf, binary, primitive.indices) : [];
  const filename = `${String(i).padStart(3, '0')}-${sanitize(mesh.name)}.svg`;
  writeFileSync(new URL(filename, OUT_DIR), renderMesh(mesh.name, positions, indices));
  manifest.push({ index: i, name: mesh.name, file: filename });
}

writeFileSync(new URL('manifest.json', OUT_DIR), `${JSON.stringify(manifest, null, 2)}\n`);
writeFileSync(new URL('index.html', OUT_DIR), `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>WFC Block Previews</title>
  <style>
    body { margin: 0; padding: 18px; background: #d8dde3; font-family: ui-sans-serif, system-ui, sans-serif; }
    h1 { margin: 0 0 14px; font-size: 18px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
    a { display: block; color: #17212b; text-decoration: none; background: #f8fafc; border: 1px solid rgba(20,30,40,.18); border-radius: 6px; overflow: hidden; }
    img { display: block; width: 100%; height: auto; }
    span { display: block; padding: 8px 10px; font-size: 12px; border-top: 1px solid rgba(20,30,40,.12); }
  </style>
</head>
<body>
  <h1>WFC Block Previews (${manifest.length})</h1>
  <div class="grid">
    ${manifest.map(item => `<a href="./${item.file}" target="_blank"><img src="./${item.file}" alt="${escapeXml(item.name)}"><span>${String(item.index).padStart(3, '0')} ${escapeXml(item.name)}</span></a>`).join('\n    ')}
  </div>
</body>
</html>
`);

console.log(`Generated ${manifest.length} previews in ${join(basename(new URL('.', import.meta.url).pathname), 'block-previews')}`);
