import { BOOST_MAX_SPEED, CRUISE_MAX_SPEED } from '../neon-circuit/RaceRules.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import { EXHAUST_SOCKETS, healthRingColor, damageEnvelope, propulsionEnvelope, rotateBodyPoint, speedFov, speedCameraPhi } from '../neon-circuit/RacerEffects.ts';

test('idle and coasting jets stay short even at boost speed; throttle controls sustained thrust', () => {
  for (const speed of [0, CRUISE_MAX_SPEED, BOOST_MAX_SPEED]) {
    assert.equal(propulsionEnvelope(speed, false, true, 1, false, BOOST_MAX_SPEED), 1.35);
    assert.equal(propulsionEnvelope(speed, true, false, 1, false, BOOST_MAX_SPEED), 1.35);
  }
  assert.ok(propulsionEnvelope(CRUISE_MAX_SPEED, true, true, 0, false, BOOST_MAX_SPEED) > 15);
  assert.equal(propulsionEnvelope(CRUISE_MAX_SPEED, true, true, 0, true, BOOST_MAX_SPEED), 0);
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
  assert.ok(speedFov(0, BOOST_MAX_SPEED) > speedFov(300, BOOST_MAX_SPEED));
  assert.ok(speedFov(300, BOOST_MAX_SPEED) > speedFov(CRUISE_MAX_SPEED, BOOST_MAX_SPEED));
  assert.ok(speedFov(CRUISE_MAX_SPEED, BOOST_MAX_SPEED) > speedFov(BOOST_MAX_SPEED, BOOST_MAX_SPEED));
  assert.equal(speedFov(-20, BOOST_MAX_SPEED), speedFov(0, BOOST_MAX_SPEED));
  assert.equal(speedFov(5000, BOOST_MAX_SPEED), speedFov(BOOST_MAX_SPEED, BOOST_MAX_SPEED));
  for (const [speed, degrees] of [[0, 60], [CRUISE_MAX_SPEED, 40], [BOOST_MAX_SPEED, 30]]) {
    assert.ok(Math.abs(speedFov(speed, BOOST_MAX_SPEED) * 180 / Math.PI - degrees) < 1e-10);
  }
  for (let speed = 1; speed <= BOOST_MAX_SPEED; speed++) {
    assert.ok(speedFov(speed, BOOST_MAX_SPEED) < speedFov(speed - 1, BOOST_MAX_SPEED));
  }
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
  assert.equal(formatSpeed(CRUISE_MAX_SPEED),'360');
  assert.equal(formatSpeed(BOOST_MAX_SPEED),'522');
  assert.equal(formatSpeed(0),'000');
  assert.equal(formatSpeed(-1),'000');
  assert.equal(distanceKm(20000),2);
});


test('narrower high-speed lens gains a forward sightline and follows the road slope', () => {
  for (const slope of [-0.3, 0, 0.3]) {
    let previous = speedCameraPhi(0, slope, BOOST_MAX_SPEED);
    for (let speed = 20; speed <= BOOST_MAX_SPEED; speed += 20) {
      const phi = speedCameraPhi(speed, slope, BOOST_MAX_SPEED);
      assert.ok(phi > previous); previous = phi;
    }
    assert.ok(speedCameraPhi(BOOST_MAX_SPEED, slope, BOOST_MAX_SPEED) - speedCameraPhi(0, slope, BOOST_MAX_SPEED) > 0.2);
  }
  assert.ok(speedCameraPhi(CRUISE_MAX_SPEED, 0.3, BOOST_MAX_SPEED) > speedCameraPhi(CRUISE_MAX_SPEED, 0, BOOST_MAX_SPEED));
  assert.ok(speedCameraPhi(CRUISE_MAX_SPEED, -0.3, BOOST_MAX_SPEED) < speedCameraPhi(CRUISE_MAX_SPEED, 0, BOOST_MAX_SPEED));
  assert.equal(speedCameraPhi(-100, 0, BOOST_MAX_SPEED), speedCameraPhi(0, 0, BOOST_MAX_SPEED));
  assert.equal(speedCameraPhi(2000, 0, BOOST_MAX_SPEED), speedCameraPhi(BOOST_MAX_SPEED, 0, BOOST_MAX_SPEED));
});

test('wall haptic strength grades speed-and-incidence impact and handles invalid values', async () => {
  const {wallHaptic}=await import('../neon-circuit/RacerEffects.ts');
  assert.equal(wallHaptic(.23),'light');assert.equal(wallHaptic(.5),'medium');assert.equal(wallHaptic(.9),'heavy');
  assert.equal(wallHaptic(-1),'light');assert.equal(wallHaptic(NaN),'light');assert.equal(wallHaptic(5),'heavy');
});
