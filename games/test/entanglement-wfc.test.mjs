import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
const hook = registerHooks({ resolve(s, c, n) { return n(/^\.{1,2}\//.test(s) && !/\.[a-z0-9]+$/i.test(s) ? `${s}.ts` : s, c); } });
const { collapseTerrain, extendTerrainSites, TERRAIN_DIRECTIONS, TERRAIN_CATALOG, terrainKey, edgeSocket, ridgePort, terrainHeight } = await import('../entanglement-path/art/terrainWfc.ts');
const { hexPoint, hexCenter, HEX_RADIUS } = await import('../entanglement-path/art/hexGeometry.ts');
const { rasterizeTerrain, TERRAIN_RASTER_SIZE } = await import('../entanglement-path/art/terrainRaster.ts');
hook.deregister();
function board(radius = 4) {
  const result = [];
  for (let q = -radius; q <= radius; q++) for (let r = -radius; r <= radius; r++) {
    const d = Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
    if (d <= radius) result.push({ q, r, kind: d === radius ? 'wall' : 'play' });
  }
  return result;
}

test('terrain catalog declares all 64 shoreline cases, with exact reversed sockets on every neighbor', () => {
  assert.equal(TERRAIN_CATALOG.length, 64); assert.equal(new Set(TERRAIN_CATALOG.map(t => t.id)).size, 64);
  const manifest = JSON.parse(readFileSync(new URL('../entanglement-path/assets/ink/terrain-tiles.json', import.meta.url)));
  assert.deepEqual(manifest.shoreTiles, TERRAIN_CATALOG);
  for (let seed = 0; seed < 15; seed++) {
    const world = collapseTerrain(extendTerrainSites(board()), seed);
    assert.equal(world.nodes.size, 127); assert.ok(world.collapses > 0 && world.propagations > world.collapses);
    for (const node of world.nodes.values()) for (let side = 0; side < 6; side++) {
      const [dq, dr] = TERRAIN_DIRECTIONS[side], other = world.nodes.get(terrainKey(node.q + dq, node.r + dr));
      if (!other) continue;
      const a = edgeSocket(node.corners, side), b = edgeSocket(other.corners, (side + 3) % 6);
      assert.equal(a, ((b & 1) << 1) | (b >> 1), 'shared coast profiles agree');
      assert.equal(Boolean(node.ridges & (1 << side)), Boolean(other.ridges & (1 << ((side + 3) % 6))), 'every ridge has a matching outlet');
    }
  }
});

test('dedicated terrain worker payloads contain deterministic transferable pixels and finite ripple strokes', () => {
  const world = collapseTerrain(extendTerrainSites(board()), 17);
  for (const node of [...world.nodes.values()].filter((_, i) => i % 11 === 0)) {
    const a = rasterizeTerrain(node, world.seed), b = rasterizeTerrain(node, world.seed);
    assert.deepEqual(a, b); assert.equal(a.pixels.length, TERRAIN_RASTER_SIZE ** 2 * 4);
    assert.equal(a.waves.length % 2, 0);
    assert.ok(a.waves.every(value => Number.isNaN(value) || Number.isFinite(value)));
    for (let i = 3; i < a.pixels.length; i += 4) assert.equal(a.pixels[i], 255);
    assert.ok(a.pixels.buffer instanceof ArrayBuffer && a.waves.buffer instanceof ArrayBuffer);
  }
});

test('coast height and mountain spine positions remain continuous across actual hex seams', () => {
  const world = collapseTerrain(extendTerrainSites(board()), 37);
  for (const node of world.nodes.values()) for (let side = 0; side < 6; side++) {
    const [dq, dr] = TERRAIN_DIRECTIONS[side], other = world.nodes.get(terrainKey(node.q + dq, node.r + dr)); if (!other) continue;
    const center = hexCenter(dq, dr, HEX_RADIUS * Math.sqrt(3) / 2), a = hexPoint(side), b = hexPoint(side + 1);
    for (let i = 0; i <= 12; i++) {
      const x = a.x + (b.x - a.x) * i / 12, y = a.y + (b.y - a.y) * i / 12;
      assert.ok(Math.abs(terrainHeight(node, x, y, world.seed) - terrainHeight(other, x - center.x, y - center.y, world.seed)) < 1e-8);
    }
    if (node.ridges & (1 << side)) {
      const p = ridgePort(side), q = ridgePort((side + 3) % 6);
      assert.ok(Math.hypot(p.x - q.x - center.x, p.y - q.y - center.y) < 1e-8);
    }
  }
});

test('the wall ring forms one continuous mountain chain, while seeded maps restore exactly', () => {
  const sites = extendTerrainSites(board()), originalRandom = Math.random;
  Math.random = () => { throw Error('terrain cannot consume gameplay randomness'); };
  let a, b, c;
  try { a = collapseTerrain(sites, 71); b = collapseTerrain(sites, 71); c = collapseTerrain(sites, 72); } finally { Math.random = originalRandom; }
  assert.deepEqual([...a.nodes], [...b.nodes]); assert.notDeepEqual([...a.nodes], [...c.nodes]);
  const walls = [...a.nodes.values()].filter(n => n.kind === 'wall'), seen = new Set(), queue = [walls[0]];
  for (const node of queue) {
    const id = terrainKey(node.q, node.r); if (seen.has(id)) continue; seen.add(id);
    for (let d = 0; d < 6; d++) if (node.ridges & (1 << d)) { const [dq, dr] = TERRAIN_DIRECTIONS[d]; queue.push(a.nodes.get(terrainKey(node.q + dq, node.r + dr))); }
  }
  assert.equal(seen.size, walls.length);
  assert.throws(() => collapseTerrain(Array.from({ length: 513 }, (_, q) => ({ q, r: 0, kind: 'sea' })), 1), /bounded/);
});
