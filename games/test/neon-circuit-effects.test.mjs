import assert from 'node:assert/strict';
import test from 'node:test';
import { EXHAUST_SOCKETS, healthRingColor, damageEnvelope, propulsionEnvelope, rotateBodyPoint, speedFov } from '../neon-circuit/RacerEffects.ts';

test('idle and coasting jets stay short even at boost speed; throttle controls sustained thrust', () => {
  for (const speed of [0, 400, 920]) {
    assert.equal(propulsionEnvelope(speed, false, true, 1, false), 1.35);
    assert.equal(propulsionEnvelope(speed, true, false, 1, false), 1.35);
  }
  assert.ok(propulsionEnvelope(650, true, true, 0, false) > 15);
  assert.equal(propulsionEnvelope(650, true, true, 0, true), 0);
});

test('half hull emits light smoke and critical hull adds restrained fire and denser smoke', () => {
  assert.equal(damageEnvelope(100).smokeRate, 0);
  assert.ok(damageEnvelope(50).smokeRate > 0);
  assert.equal(damageEnvelope(40).fire, 0);
  assert.ok(damageEnvelope(18).fire > 0);
  assert.ok(damageEnvelope(18).smokeRate > damageEnvelope(45).smokeRate);
  assert.ok(damageEnvelope(18).smokeOpacity > damageEnvelope(45).smokeOpacity);
  assert.ok(damageEnvelope(0).fire < 0.5);
});

test('exhaust sockets follow bank and pitch, preserve separation, and rotate with the ship', () => {
  const left = rotateBodyPoint(EXHAUST_SOCKETS[0], 0.28, 1.3, 0.4);
  const right = rotateBodyPoint(EXHAUST_SOCKETS[1], 0.28, 1.3, 0.4);
  assert.ok(Math.abs(Math.hypot(...left.map((v, i) => v - right[i])) - 12.64) < 1e-8);
  assert.ok(Math.abs(left[1] - right[1]) > 2);
  assert.deepEqual(rotateBodyPoint([1, 2, 3], 0, 0, 0), [1, 2, 3]);
  const turned = rotateBodyPoint([0, 0, -1], 0, Math.PI / 2, 0);
  assert.ok(Math.abs(turned[0] + 1) < 1e-8);
});

test('FOV narrows gradually with speed and stays bounded at extreme inputs', () => {
  assert.ok(speedFov(0) > speedFov(300));
  assert.ok(speedFov(300) > speedFov(650));
  assert.ok(speedFov(650) > speedFov(920));
  assert.equal(speedFov(-20), speedFov(0));
  assert.equal(speedFov(5000), speedFov(920));
  assert.ok(speedFov(920) >= 0.6);
  assert.ok(speedFov(0) - speedFov(650) > 0.25);
  assert.ok(speedFov(920) < 0.65);
});


test('health dial changes colour strictly below two-thirds and one-third health', () => {
  const green = healthRingColor(100), amber = healthRingColor(50), red = healthRingColor(0);
  assert.deepEqual(healthRingColor(200 / 3), green);
  assert.deepEqual(healthRingColor(200 / 3 - 0.001), amber);
  assert.deepEqual(healthRingColor(100 / 3), amber);
  assert.deepEqual(healthRingColor(100 / 3 - 0.001), red);
  assert.notDeepEqual(green, amber); assert.notDeepEqual(amber, red);
});


test('speedometer units match distance travelled and course distance units', async () => {
  const { speedKmh, distanceKm, formatSpeed } = await import('../neon-circuit/RaceUnits.ts');
  for (const speed of [0,100,650,920]) {
    assert.ok(Math.abs(speedKmh(speed) - distanceKm(speed * 3600)) < 1e-9);
  }
  assert.equal(formatSpeed(650),'234');
  assert.equal(formatSpeed(920),'331');
  assert.equal(formatSpeed(0),'000');
  assert.equal(formatSpeed(-1),'000');
  assert.equal(distanceKm(20000),2);
});
