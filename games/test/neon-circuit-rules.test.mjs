import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  BOOST_MAX_SPEED,
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
  const track = createRaceTrack();
  let state = { ...createInitialRaceState(), distance: track.length * 0.18 };
  for (let index = 0; index < 240; index++) {
    state = stepRace(track, state, { throttle: 1, brake: 0, steer: index > 80 && index < 120 ? 1 : 0 }, 1 / 60).state;
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
  const track = createRaceTrack();
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
  assert.equal(Math.abs(result.state.lateral), RAIL_LIMIT);
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
  assert.match(source, /ParticleEmitter3D/);
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
  assert.match(html, /data-control="a"/);
  assert.match(html, /data-control="w"/);
  assert.match(html, /id="boost-fill"/);
  assert.match(html, /id="timer"/);
  assert.match(html, /neon-circuit-hyperspeed-v2/);
});
