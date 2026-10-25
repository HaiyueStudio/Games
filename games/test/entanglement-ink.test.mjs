import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { boardPigmentAt, cellPigment, paperEdgeFade, pigmentAt, scrollProgress, revealProgress, veilAlpha, INTRO_DURATION_MS } from '../entanglement-path/art/inkNoise.ts';
import { decodePng } from '../../../Engine/scripts/visual-regression/png.mjs';
const hook = registerHooks({ resolve(specifier, context, next) {
  return next(/^\.{1,2}\//.test(specifier) && !/\.[a-z0-9]+$/i.test(specifier) ? `${specifier}.ts` : specifier, context);
} });
const { brushEdgePoint, hexCenter, hexPlaneSize, pathCurve, HEX_TEXTURE_STRETCH } = await import('../entanglement-path/art/hexGeometry.ts');
hook.deregister();

test('ink variation is deterministic, spatially continuous and independent per board cell', () => {
  const seeds = new Set();
  for (let q = -4; q <= 4; q++) for (let r = -4; r <= 4; r++) {
    const seed = cellPigment(q, r, 0); assert.equal(seed, cellPigment(q, r, 0)); seeds.add(seed);
    assert.notEqual(seed, cellPigment(q, r, 1));
  }
  assert.ok(seeds.size > 75);
  const values = [];
  for (let x = 0; x < 200; x += 5) {
    const value = pigmentAt(x, 80, 42); values.push(value);
    assert.ok(value >= 0 && value <= 1);
    assert.ok(Math.abs(value - pigmentAt(x + .01, 80, 42)) < .01);
  }
  assert.ok(Math.max(...values) - Math.min(...values) > .25);
});

test('board pigment keeps a single hue with visible but bounded per-cell shade variation', () => {
  const greens = [];
  for (let seed = 0; seed < 100; seed++) for (let x = 0; x < 256; x += 16) {
    const [r, g, b] = boardPigmentAt(x, 110, seed); greens.push(g);
    assert.ok(Math.abs(r / g - 136 / 164) < .004);
    assert.ok(Math.abs(b / g - 155 / 164) < .004);
  }
  const range = Math.max(...greens) - Math.min(...greens);
  assert.ok(range > 25 && range < 65, 'clear light/dark variation without introducing other hues');
});

test('tile rim washes into paper smoothly, then becomes transparent at the outer fibers', () => {
  let pigment = 0, alpha = 0;
  for (let distance = -1; distance <= 24; distance += .1) {
    const sample = paperEdgeFade(distance);
    assert.ok(sample.pigment >= pigment && sample.alpha >= alpha);
    assert.ok(sample.pigment >= 0 && sample.pigment <= 1 && sample.alpha >= 0 && sample.alpha <= 1);
    pigment = sample.pigment; alpha = sample.alpha;
  }
  assert.deepEqual(paperEdgeFade(-1), { pigment: 0, alpha: 0 });
  assert.deepEqual(paperEdgeFade(24), { pigment: 1, alpha: 1 });
  assert.ok(paperEdgeFade(3).pigment < .1 && paperEdgeFade(3).alpha === 1, 'outer rim is opaque paper, not a dark stroke');
  assert.ok(paperEdgeFade(9).pigment > .4 && paperEdgeFade(9).pigment < .6, 'halfway through the rim mixes paper and pigment');
});

test('brush contour wanders, varies pressure and joins its corners without discontinuities', () => {
  const offsets = [], pressures = [];
  for (let edge = 0; edge < 6; edge++) {
    const end = brushEdgePoint(edge, 1, 42), next = brushEdgePoint((edge + 1) % 6, 0, 42);
    assert.ok(Math.hypot(end.x - next.x, end.y - next.y) < 1e-9);
    for (let i = 0; i <= 22; i++) {
      const p = brushEdgePoint(edge, i / 22, 42);
      assert.deepEqual(p, brushEdgePoint(edge, i / 22, 42)); offsets.push(p.offset); pressures.push(p.pressure);
    }
  }
  assert.ok(Math.max(...offsets) - Math.min(...offsets) > 4);
  assert.ok(Math.max(...pressures) - Math.min(...pressures) > .4);
  assert.notDeepEqual(brushEdgePoint(1, .5, 42), brushEdgePoint(1, .5, 43));
});

test('all twelve ports share exact seam positions and C1 Bezier tangents at every board scale', () => {
  const directions = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];
  for (const screen of [38, 43.7, 55]) {
    const plane = hexPlaneSize(screen);
    const map = p => ({ x: (p.x - 128) * HEX_TEXTURE_STRETCH * plane.width / 256, y: (p.y - 128) * plane.height / 256 });
    for (let port = 0; port < 12; port++) {
      const side = Math.floor(port / 2), opposite = ((side + 3) % 6) * 2 + 1 - port % 2;
      const center = hexCenter(...directions[side], screen);
      for (let other = 0; other < 12; other++) {
        if (other === port) continue;
        const a = pathCurve(other, port), b = pathCurve(opposite, (opposite + 5) % 12);
        const end = map(a.end), start = map(b.start), controlA = map(a.control2), controlB = map(b.control1);
        assert.ok(Math.hypot(end.x - start.x - center.x, end.y - start.y - center.y) < 1e-9, 'shared port position');
        assert.ok(Math.hypot((end.x - controlA.x) - (controlB.x - start.x), (end.y - controlA.y) - (controlB.y - start.y)) < 1e-9, 'shared derivative direction and magnitude');
      }
    }
  }
});

test('scroll opens before ink dissolves, with bounded monotone crossfade and exact endpoints', () => {
  assert.equal(scrollProgress(0), 0); assert.equal(scrollProgress(1350), 1);
  assert.equal(revealProgress(1000), 0); assert.equal(revealProgress(INTRO_DURATION_MS), 1);
  assert.ok(scrollProgress(1150) > .99);
  for (const noise of [0, .1, .4, .7, 1]) {
    let last = 1;
    for (let i = 0; i <= 100; i++) {
      const alpha = veilAlpha(noise, i / 100); assert.ok(alpha <= last && alpha >= 0 && alpha <= 1); last = alpha;
    }
    assert.equal(veilAlpha(noise, 0), 1); assert.equal(veilAlpha(noise, 1), 0);
  }
  assert.notEqual(veilAlpha(.25, .5), veilAlpha(.75, .5));
});

test('ink bitmap atlas contains ten Arabic digits and two symbols with usable alpha and BMFont metadata', () => {
  const base = new URL('../entanglement-path/assets/ink/', import.meta.url);
  const font = JSON.parse(readFileSync(new URL('digits.json', base)));
  const image = decodePng(readFileSync(new URL('digits.png', base)));
  assert.deepEqual(Object.keys(font.glyphs).sort(), [...'0123456789+/'].sort());
  assert.equal(image.width, font.width); assert.equal(image.height, font.height);
  for (const [char, rect] of Object.entries(font.glyphs)) {
    assert.ok(rect.width > 50 && rect.height > 150, char);
    assert.ok(rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= image.width && rect.y + rect.height <= image.height);
    let ink = 0;
    for (let y = rect.y; y < rect.y + rect.height; y++) for (let x = rect.x; x < rect.x + rect.width; x++) if (image.data[(y * image.width + x) * 4 + 3] > 100) ink++;
    assert.ok(ink > 1500 && ink < rect.width * rect.height * .9, char + ' contains ink and negative space');
  }
  const bmfont = readFileSync(new URL('digits.fnt', base), 'utf8');
  assert.match(bmfont, /chars count=12/); assert.match(bmfont, /page id=0 file="digits.png"/);
});
