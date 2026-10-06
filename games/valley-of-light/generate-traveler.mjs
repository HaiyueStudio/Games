import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Original low-poly traveler, standard glTF 2.0 node animation; no external assets.
const chunks = [], views = [], accessors = [];
let byteLength = 0;
function accessor(values, type, bounds = false) {
  const data = new Float32Array(values), size = { SCALAR: 1, VEC3: 3, VEC4: 4 }[type];
  const view = views.push({ buffer: 0, byteOffset: byteLength, byteLength: data.byteLength }) - 1;
  chunks.push(Buffer.from(data.buffer)); byteLength += data.byteLength;
  const item = { bufferView: view, componentType: 5126, count: values.length / size, type };
  if (bounds) {
    item.min = Array.from({ length: size }, (_, i) => Math.min(...values.filter((_, n) => n % size === i)));
    item.max = Array.from({ length: size }, (_, i) => Math.max(...values.filter((_, n) => n % size === i)));
  }
  return accessors.push(item) - 1;
}
const position = [], normal = [];
for (const [n, corners] of [
  [[0,0,1], [[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]]],
  [[0,0,-1], [[1,-1,-1],[-1,-1,-1],[-1,1,-1],[1,1,-1]]],
  [[1,0,0], [[1,-1,1],[1,-1,-1],[1,1,-1],[1,1,1]]],
  [[-1,0,0], [[-1,-1,-1],[-1,-1,1],[-1,1,1],[-1,1,-1]]],
  [[0,1,0], [[-1,1,1],[1,1,1],[1,1,-1],[-1,1,-1]]],
  [[0,-1,0], [[-1,-1,-1],[1,-1,-1],[1,-1,1],[-1,-1,1]]],
]) for (const i of [0,1,2,0,2,3]) { position.push(...corners[i].map(v => v / 2)); normal.push(...n); }
const pos = accessor(position, 'VEC3', true), norm = accessor(normal, 'VEC3');
const materials = [
  { name: 'Warm porcelain cloak', pbrMetallicRoughness: { baseColorFactor: [0.94,0.9,0.79,1], metallicFactor: 0, roughnessFactor: 1 } },
  { name: 'Midnight face and boots', pbrMetallicRoughness: { baseColorFactor: [0.055,0.15,0.19,1], metallicFactor: 0, roughnessFactor: 1 } },
  { name: 'Terracotta scarf', pbrMetallicRoughness: { baseColorFactor: [0.75,0.26,0.16,1], metallicFactor: 0, roughnessFactor: 1 } },
  { name: 'Lantern amber', pbrMetallicRoughness: { baseColorFactor: [1,0.66,0.19,1], metallicFactor: 0.2, roughnessFactor: 0.4 }, emissiveFactor: [0.65,0.27,0.04] },
];
const meshes = materials.map((m, material) => ({ name: m.name, primitives: [{ attributes: { POSITION: pos, NORMAL: norm }, material }] }));
const nodes = [{ name: 'Traveler', children: [] }];
function node(name, parent, translation, scale, mesh) {
  const n = { name, translation, children: [] };
  if (scale) n.scale = scale;
  if (mesh !== undefined) n.mesh = mesh;
  const id = nodes.push(n) - 1; nodes[parent].children.push(id); return id;
}
const body = node('Breathing root', 0, [0,0.02,0]);
node('Cloak', body, [0,0.48,0], [.38,.48,.26], 0);
node('Cloak hem', body, [0,0.28,0], [.46,.16,.32], 0);
node('Hood', body, [0,.84,0], [.4,.34,.34], 0);
node('Face', body, [0,.82,-.176], [.24,.2,.028], 1);
node('Scarf', body, [0,.65,-.015], [.4,.09,.32], 2);
node('Scarf tail', body, [.1,.45,.18], [.12,.36,.05], 2);
const joints = [];
for (const [label, x, y, z, material, dims, offset] of [
  ['Left leg', -.115,.28,0,1,[.12,.25,.14],[0,-.125,0]],
  ['Right leg', .115,.28,0,1,[.12,.25,.14],[0,-.125,0]],
  ['Left arm', -.25,.62,0,0,[.12,.3,.14],[0,-.15,0]],
  ['Right arm', .25,.62,0,0,[.12,.3,.14],[0,-.15,0]],
]) { const j = node(label, body, [x,y,z]); joints.push(j); node(`${label} mesh`, j, offset, dims, material); }
node('Lantern', joints[2], [0,-.35,0], [.14,.19,.14], 3);
node('Lantern cap', joints[2], [0,-.245,0], [.17,.03,.17], 1);
const animations = [];
for (const walking of [false, true]) {
  const duration = walking ? .8 : 2.4, times = Array.from({length: 17}, (_, i) => duration * i / 16);
  const input = accessor(times, 'SCALAR', true), samplers = [], channels = [];
  function track(target, path, values, type) {
    const sampler = samplers.push({ input, output: accessor(values, type), interpolation: 'LINEAR' }) - 1;
    channels.push({ sampler, target: { node: target, path } });
  }
  joints.forEach((joint, i) => track(joint, 'rotation', times.flatMap((_, k) => {
    const angle = Math.sin(k / 16 * Math.PI * 2) * (walking ? (i < 2 ? .52 : .32) : .035) * (i % 2 ? -1 : 1) * (i < 2 ? 1 : -1);
    return [Math.sin(angle / 2), 0, 0, Math.cos(angle / 2)];
  }), 'VEC4'));
  track(body, 'translation', times.flatMap((_, k) => [0,.02 + (walking ? .022 * (1 - Math.cos(k / 16 * Math.PI * 4)) : .016 * Math.sin(k / 16 * Math.PI * 2)),0]), 'VEC3');
  animations.push({ name: walking ? 'Walk' : 'Idle', samplers, channels });
}
const gltf = { asset: { version: '2.0', generator: 'Haiyue — Beyond the Valley / original procedural traveler' }, scene: 0, scenes: [{ nodes: [0] }], nodes, meshes, materials, animations, accessors, bufferViews: views, buffers: [{ byteLength, uri: `data:application/octet-stream;base64,${Buffer.concat(chunks).toString('base64')}` }] };
const directory = fileURLToPath(new URL('./assets/', import.meta.url));
mkdirSync(directory, { recursive: true });
writeFileSync(`${directory}/traveler.gltf`, JSON.stringify(gltf, null, 2) + '\n');
console.log(`Traveler: ${nodes.length} nodes, Idle + Walk, ${byteLength} buffer bytes.`);
