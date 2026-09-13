import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  BOOST_MAX_SPEED,
  BURN_HEALTH,
  BOOST_PAD_HALF_WIDTH,
  BOOST_ZONES,
  CRUISE_MAX_SPEED,
  RAIL_LIMIT,
  ROAD_HALF_WIDTH,
  TRACK_CONTROL_POINTS,
  TOTAL_LAPS,
  boostZoneAt,
  createInitialRaceState,
  createRaceTrack,
  racePose,
  sampleTrack,
  stepRace,
} from '../neon-circuit/RaceRules.ts';
import { CIRCUITS, circuitTrack, trackMap } from '../neon-circuit/RaceRules.ts';

const straightTrack = { length: 100_000, samples: [{ x: 0, y: 0, z: 0, heading: 0, pitch: 0, bank: 0, distance: 0 }, { x: 0, y: 0, z: 100_000, heading: 0, pitch: 0, bank: 0, distance: 100_000 }] };


test('neon circuit generates a long, wide, elevated, and banked closed course', () => {
  const track = createRaceTrack(520);
  assert.equal(track.samples.length, 520);
  assert.ok(TRACK_CONTROL_POINTS.length >= 24);
  assert.ok(track.length > 19_000);
  assert.ok(Math.max(...track.samples.map(sample => sample.y)) - Math.min(...track.samples.map(sample => sample.y)) > 350);
  assert.ok(Math.max(...track.samples.map(sample => Math.abs(sample.bank))) >= 0.4);
  assert.ok(ROAD_HALF_WIDTH * 2 >= 150);
  assert.ok(BOOST_PAD_HALF_WIDTH * 2 < ROAD_HALF_WIDTH * 0.6);
  assert.equal(BOOST_ZONES.length, 5);
  const start = sampleTrack(track, 0);
  const wrapped = sampleTrack(track, track.length);
  assert.ok(Math.hypot(start.x - wrapped.x, start.y - wrapped.y, start.z - wrapped.z) < 1e-8);
  assert.ok(new Set(track.samples.map(sample => Math.round(sample.heading * 10))).size > 20);
});

test('hover racer accelerates, steers laterally, brakes, and respects cruise speed', () => {
  const track = straightTrack;
  let state = { ...createInitialRaceState(), distance: track.length * 0.18 };
  for (let index = 0; index < 240; index++) {
    state = stepRace(track, state, { throttle: 1, brake: 0, steer: index > 220 ? 0.25 : 0 }, 1 / 60).state;
  }
  assert.ok(CRUISE_MAX_SPEED >= 650);
  assert.ok(BOOST_MAX_SPEED >= 900);
  assert.ok(state.speed > 560 && state.speed <= CRUISE_MAX_SPEED);
  assert.ok(state.lateral > 0);
  const braked = stepRace(track, state, { throttle: 0, brake: 1, steer: 0 }, 0.05).state;
  assert.ok(braked.speed < state.speed);
  assert.ok(Math.abs(racePose(track, state).x - sampleTrack(track, state.distance).x) > 0.01);
});

test('cyan pads grant boost and allow the racer to exceed cruise speed', () => {
  const track = straightTrack;
  const distance = BOOST_ZONES[0] * track.length;
  const initial = { ...createInitialRaceState(), distance, speed: CRUISE_MAX_SPEED, activeBoostZone: -1 };
  let result = stepRace(track, initial, { throttle: 1, brake: 0, steer: 0 }, 1 / 120);
  assert.ok(result.events.includes('boost'));
  assert.ok(result.state.boostRemaining > 1);
  for (let index = 0; index < 60; index++) result = stepRace(track, result.state, { throttle: 1, brake: 0, steer: 0 }, 1 / 120);
  assert.ok(result.state.speed > CRUISE_MAX_SPEED);
  assert.ok(result.state.speed <= BOOST_MAX_SPEED);
  assert.equal(boostZoneAt(BOOST_ZONES[1], 0), 1);
  assert.equal(boostZoneAt(BOOST_ZONES[1], 50), -1);
});

test('rails cause a deterministic impact penalty', () => {
  const track = createRaceTrack();
  const initial = { ...createInitialRaceState(), speed: 180, lateral: RAIL_LIMIT - 0.2, lateralSpeed: 80 };
  const result = stepRace(track, initial, { throttle: 1, brake: 0, steer: 1 }, 0.05);
  assert.ok(result.events.includes('wall'));
  assert.equal(result.state.wallHits, 1);
  assert.ok(Math.abs(result.state.lateral) <= RAIL_LIMIT);
  assert.ok(result.state.health < initial.health);
  assert.ok(result.state.speed < initial.speed);
});

test('the race advances through three laps and then finishes', () => {
  const track = createRaceTrack();
  const nearLine = track.length - 1;
  const lapTwo = stepRace(track, { ...createInitialRaceState(), distance: nearLine, speed: 100 }, { throttle: 1, brake: 0, steer: 0 }, 0.05);
  assert.ok(lapTwo.events.includes('lap'));
  assert.equal(lapTwo.state.lap, 2);
  const finish = stepRace(track, { ...lapTwo.state, lap: TOTAL_LAPS, distance: nearLine, speed: 100 }, { throttle: 1, brake: 0, steer: 0 }, 0.05);
  assert.ok(finish.events.includes('finish'));
  assert.equal(finish.state.finished, true);
  assert.equal(finish.state.speed, 0);
});

test('manifest and page expose the racer, controls, timing, boost, and debug hooks', async () => {
  const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
  const entry = manifest.entries.find(candidate => candidate.id === 'neon-circuit');
  assert.ok(entry);
  assert.equal(entry.entry, 'neon-circuit/main.ts');
  assert.ok(entry.capabilities.includes('3d'));
  assert.ok(entry.capabilities.includes('particles'));
  assert.ok(entry.capabilities.includes('gltf'));
  assert.ok(entry.capabilities.includes('gui'));
  assert.ok(entry.capabilities.includes('custom-shader'));
  assert.ok(entry.assets.includes('neon-circuit/assets/wraith-raider.glb'));
  assert.ok(existsSync(new URL('../neon-circuit/index.html', import.meta.url)));
  const model = await readFile(new URL('../neon-circuit/assets/wraith-raider.glb', import.meta.url));
  assert.equal(model.subarray(0, 4).toString('ascii'), 'glTF');
  assert.ok(model.length > 1_000_000);

  const source = await readFile(new URL('../neon-circuit/main.ts', import.meta.url), 'utf8');
  const flameShader = await readFile(new URL('../neon-circuit/ThrusterFlameTexture.ts', import.meta.url), 'utf8');
  const html = await readFile(new URL('../neon-circuit/index.html', import.meta.url), 'utf8');
  assert.match(source, /new SingleSlotGameSave<RacerSaveData>/);
  assert.match(source, /window\.__neonCircuit/);
  assert.match(source, /new RaceParticles\(this\.world, smoke, spark\)/);
  for (const asset of ['smoke-puff.png', 'boost-chevron.png', 'gui-button.png', 'gui-panel.png', 'gui-dial.png', 'gui-title.png']) {
    assert.ok(entry.assets.includes(`neon-circuit/assets/${asset}`));
    const png = await readFile(new URL(`../neon-circuit/assets/${asset}`, import.meta.url));
    assert.equal(png.subarray(1, 4).toString('ascii'), 'PNG');
  }
  assert.match(source, /new GltfModelComponent\(\{/);
  assert.match(source, /wraith-raider\.glb/);
  assert.match(source, /new ThrusterFlameTexture\(this\.engine\.device\)/);
  assert.match(source, /texture: this\.thrusterFlame\.texture/);
  assert.match(flameShader, /THRUSTER_FLAME_WGSL/);
  assert.match(flameShader, /createRenderPipeline\(\{/);
  assert.match(flameShader, /flame\.boost/);
  assert.match(source, /createPathExtrusion3D/);
  assert.doesNotMatch(source, /`Road-\$\{index\}`/);
  assert.match(source, /arrowleft'[\s\S]*\? 1 : 0\)[\s\S]*-[\s\S]*arrowright'/);
  assert.match(source, /const RACER_MODEL_SCALE = 0\.078/);
  const gui = await readFile(new URL('../neon-circuit/NeonCircuitGui.ts', import.meta.url), 'utf8');
  assert.match(source, /new GuiSystem/);
  assert.match(gui, /new GuiRoot/);
  assert.match(gui, /new GuiButton/);
  assert.match(gui, /new GuiImage/);
  assert.doesNotMatch(html, /<(button|svg|section|header|dl)\b/);
  assert.match(html, /<pre id="result" hidden/);
  assert.match(html, /neon-circuit-gesture-v11/);
});


test('all three routes are distinct closed circuits with accurate, bounded thumbnails', () => {
  assert.equal(CIRCUITS.length, 3);
  const maps = CIRCUITS.map(circuit => {
    const track = circuitTrack(circuit);
    assert.ok(track.length > 15_000);
    const start = sampleTrack(track, 0), end = sampleTrack(track, track.length);
    assert.deepEqual(start, end);
    const map = trackMap(track);
    for (const [, x, y] of map.path.matchAll(/[ML]([\d.]+),([\d.]+)/g)) {
      assert.ok(Number(x) >= 18 && Number(x) <= 282);
      assert.ok(Number(y) >= 18 && Number(y) <= 174);
    }
    return map.path;
  });
  assert.equal(new Set(maps).size, 3);
});

test('holding throttle without turning hits walls on every course', () => {
  for (const circuit of CIRCUITS) {
    const track = circuitTrack(circuit);
    let state = createInitialRaceState();
    for (let frame = 0; frame < 60 * 30 && !state.destroyed; frame++) {
      state = stepRace(track, state, { throttle: 1, brake: 0, steer: 0 }, 1 / 60).state;
    }
    assert.ok(state.wallHits > 0, circuit.id);
    assert.ok(state.health < 100, circuit.id);
    assert.equal(state.finished, false);
  }
});

test('deliberate steering and braking can complete all three courses without damage', () => {
  for (const circuit of CIRCUITS) {
    const track = circuitTrack(circuit);
    let state = { ...createInitialRaceState(), lateral: -30 };
    for (let frame = 0; frame < 60 * 400 && !state.finished && !state.destroyed; frame++) {
      const here = sampleTrack(track, state.distance);
      const ahead = sampleTrack(track, state.distance + 8);
      const curvature = Math.atan2(Math.sin(ahead.heading - here.heading), Math.cos(ahead.heading - here.heading)) / 8;
      const yaw = 0.72 + Math.min(1, state.speed / 500) * 0.42;
      const steer = Math.max(-1, Math.min(1, (curvature * state.speed - state.headingOffset * 3 - (state.lateral + 30) * 0.012) / yaw));
      let maxCurvature = Math.abs(curvature);
      for (let look = 40; look <= 500; look += 40) {
        const a = sampleTrack(track, state.distance + look), b = sampleTrack(track, state.distance + look + 8);
        maxCurvature = Math.max(maxCurvature, Math.abs(Math.atan2(Math.sin(b.heading - a.heading), Math.cos(b.heading - a.heading))) / 8);
      }
      const targetSpeed = Math.min(490, 0.68 / Math.max(0.0001, maxCurvature));
      state = stepRace(track, state, { throttle: state.speed < targetSpeed ? 1 : 0, brake: state.speed > targetSpeed + 10 ? 1 : 0, steer }, 1 / 60).state;
    }
    assert.equal(state.finished, true, circuit.id);
    assert.equal(state.health, 100, circuit.id);
  }
});

test('faster and more direct wall strikes increase damage, cancel boost, and shake the camera', () => {
  const collide = (speed, headingOffset) => stepRace(straightTrack, { ...createInitialRaceState(), speed,
    lateral: RAIL_LIMIT - 0.01, lateralSpeed: speed * Math.sin(headingOffset), headingOffset, boostRemaining: 1 },
    { throttle: 0, brake: 0, steer: 0 }, 1 / 120).state;
  const slow = collide(200, 0.3), fast = collide(650, 0.3), direct = collide(650, 1.1);
  assert.ok(slow.health > fast.health);
  assert.ok(fast.health > direct.health);
  assert.ok(direct.speed < 650 * 0.4);
  assert.equal(direct.boostRemaining, 0);
  assert.ok(direct.impact > fast.impact);
  assert.ok(stepRace(straightTrack, direct, { throttle: 0, brake: 0, steer: 0 }, 0.05).state.impact < direct.impact);
});

test('critical damage destroys the ship, freezes the race, and reset restores full hull', () => {
  const result = stepRace(straightTrack, { ...createInitialRaceState(), health: 1, speed: 650,
    lateral: RAIL_LIMIT, lateralSpeed: 500, headingOffset: 1 }, { throttle: 1, brake: 0, steer: 1 }, 0.05);
  assert.ok(result.events.includes('destroyed'));
  assert.equal(result.state.health, 0);
  assert.equal(result.state.speed, 0);
  assert.equal(result.state.finished, false);
  assert.equal(stepRace(straightTrack, result.state, { throttle: 1, brake: 0, steer: 1 }, 0.05).state, result.state);
  assert.ok(createInitialRaceState().health > BURN_HEALTH);
  assert.equal(createInitialRaceState().impact, 0);
});

test('zero-time steps are inert and fixed subdivisions agree at 20, 60 and 120 Hz', () => {
  const initial = { ...createInitialRaceState(), speed: 600, lateral: RAIL_LIMIT - 1, headingOffset: 0.5 };
  assert.equal(stepRace(straightTrack, initial, { throttle: 1, brake: 0, steer: 1 }, 0).state, initial);
  const runs = [20, 60, 120].map(rate => {
    let state = initial;
    for (let frame = 0; frame < rate * 2; frame++) state = stepRace(straightTrack, state, { throttle: 1, brake: 0, steer: 0.4 }, 1 / rate).state;
    return state;
  });
  for (const state of runs.slice(1)) for (const key of ['speed', 'health', 'lateral', 'distance', 'wallHits']) {
    assert.ok(Math.abs(state[key] - runs[0][key]) < 1e-7, key);
  }
});


test('boost expiration preserves momentum and smoothly returns to cruise even with throttle held', () => {
  let state = { ...createInitialRaceState(), distance: 18000, speed: BOOST_MAX_SPEED, boostRemaining: 1 / 240 };
  const first = stepRace(straightTrack, state, { throttle: 1, brake: 0, steer: 0 }, 1 / 60).state;
  assert.equal(first.boostRemaining, 0);
  assert.ok(first.speed > CRUISE_MAX_SPEED + 200);
  assert.ok(state.speed - first.speed <= 2.01, 'expiration cannot truncate speed in one frame');
  state = first;
  for (let i = 0; i < 180; i++) {
    const next = stepRace(straightTrack, state, { throttle: 1, brake: 0, steer: 0 }, 1 / 60).state;
    assert.ok(next.speed <= state.speed && next.speed >= CRUISE_MAX_SPEED);
    assert.ok(state.speed - next.speed <= 2.01);
    state = next;
  }
  assert.equal(state.speed, CRUISE_MAX_SPEED);
  const braked = stepRace(straightTrack, first, { throttle: 0, brake: 1, steer: 0 }, 0.05).state;
  const coasting = stepRace(straightTrack, first, { throttle: 0, brake: 0, steer: 0 }, 0.05).state;
  assert.ok(braked.speed < coasting.speed && coasting.speed > CRUISE_MAX_SPEED);
});

test('steering scrubs a small symmetric amount of speed without a discontinuous speed cap', () => {
  const initial = { ...createInitialRaceState(), distance: 18000, speed: CRUISE_MAX_SPEED };
  const turn = steer => stepRace(straightTrack, initial, { throttle: 1, brake: 0, steer }, 0.05).state;
  const straight = turn(0), left = turn(1), right = turn(-1), gentle = turn(0.5);
  assert.equal(left.wallHits, 0);
  assert.equal(left.speed, right.speed);
  assert.ok(left.speed < gentle.speed && gentle.speed < straight.speed);
  assert.ok(left.speed > initial.speed * 0.96);
  const recovered = stepRace(straightTrack, left, { throttle: 1, brake: 0, steer: 0 }, 0.05).state;
  assert.ok(recovered.speed > left.speed);
});
