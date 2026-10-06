import assert from 'node:assert/strict';
import test from 'node:test';
import { createGame, createMap, createTank, stepGame, nextStage, canMove, applyPowerup, dropPowerup, isGameState, ENEMY_STATS, FORT_CELLS, POWERUPS } from '../tank-battle/rules.ts';

function arena(mode = 1) {
  const s = createGame(mode, 1985); s.tiles.fill('ground'); s.spawnTimer = 150;
  s.tanks.forEach(t => { t.shield = 0; }); return s;
}
function bullet(s, x, y, direction = 0, player = 1, power = 0) {
  const b = { id: s.nextId++, owner: s.tanks.find(t => t.player === player)?.id ?? 999, x, y, direction, player, power };
  s.bullets.push(b); return b;
}
function run(s, frames = 1, inputs = []) { for (let i = 0; i < frames; i++) stepGame(s, inputs); }

test('all five 26×26 maps contain requested terrain and protected base/spawn lanes', () => {
  const all = new Set();
  for (let stage = 1; stage <= 5; stage++) {
    const map = createMap(stage); assert.equal(map.length, 676); map.forEach(t => all.add(t));
    for (const i of FORT_CELLS) assert.equal(map[i], 'brick');
    const s = createGame(2); s.tiles = map;
    for (const tank of s.tanks) assert.equal(canMove(s, tank, tank.x, tank.y), true);
  }
  assert.deepEqual([...all].sort(), ['brick', 'forest', 'ground', 'snow', 'steel', 'water']);
});
test('same seed and input stream yield identical simulations', () => {
  const a = createGame(2, 13); const b = createGame(2, 13);
  for (let i = 0; i < 1800; i++) {
    const inputs = [{ direction: Math.floor(i / 130) % 4, fire: true }, { direction: Math.floor(i / 180) % 4, fire: i % 3 === 0 }];
    stepGame(a, inputs); stepGame(b, inputs);
  }
  assert.deepEqual(a, b); assert.ok(isGameState(a));
});
test('brick, steel and water block tanks; snow and forest allow movement', () => {
  for (const terrain of ['brick', 'steel', 'water', 'snow', 'forest']) {
    const s = arena(); const tank = s.tanks[0]; s.tiles[10 * 26 + 10] = terrain;
    assert.equal(canMove(s, tank, 168, 168), terrain === 'snow' || terrain === 'forest');
  }
});
test('normal shells remove brick quadrants; only max-level friendly shells break steel', () => {
  for (const [terrain, power, player, destroyed] of [['brick', 0, 1, true], ['steel', 2, 1, false], ['steel', 3, 1, true], ['steel', 3, 0, false]]) {
    const s = arena(); const cell = 10 * 26 + 10; s.tiles[cell] = terrain; bullet(s, 168, 180, 0, player, power); run(s, 3);
    assert.equal(s.tiles[cell], destroyed ? 'ground' : terrain); assert.equal(s.bullets.length, 0);
  }
});
test('shells cross water and forest; opposing projectiles cancel', () => {
  const s = arena(); s.tiles[10 * 26 + 10] = 'water'; s.tiles[9 * 26 + 10] = 'forest';
  bullet(s, 168, 181); run(s, 13); assert.equal(s.bullets.length, 1); assert.ok(s.bullets[0].y < 144);
  s.bullets = []; bullet(s, 100, 104, 0); bullet(s, 100, 94, 2, 0); run(s, 2); assert.equal(s.bullets.length, 0);
});
test('enemy armor takes multiple hits; a destroyed flashing enemy drops reachable loot exactly once', () => {
  const s = arena(); const enemy = createTank(s, 'heavy', 168, 168, 0, true); enemy.shield = 0; s.tanks.push(enemy); s.freeze = 600;
  for (let hit = 0; hit < 4; hit++) { bullet(s, 168, 186); run(s, 3); }
  assert.equal(s.killed, 1); assert.equal(s.pickups.length, 1); assert.equal(s.players[0].score, ENEMY_STATS.heavy.points);
  assert.equal(s.tanks.includes(enemy), false);
  assert.equal(canMove({ ...s, tanks: [] }, { id: -1 }, s.pickups[0].x, s.pickups[0].y), true);
});
test('normal enemy does not drop loot, spawn shield absorbs shots', () => {
  const s = arena(); const e = createTank(s, 'scout', 168, 168); s.tanks.push(e); s.freeze = 600;
  bullet(s, 168, 186); run(s, 3); assert.equal(e.hp, 1);
  e.shield = 0; bullet(s, 168, 186); run(s, 3); assert.equal(s.killed, 1); assert.equal(s.pickups.length, 0);
});
test('each pickup has its documented effect and upgrades are capped', () => {
  const s = arena(); const p = s.tanks[0];
  for (let i = 0; i < 5; i++) applyPowerup(s, p, 'star');
  assert.equal(p.level, 3); assert.equal(s.players[0].level, 3);
  applyPowerup(s, p, 'shield'); assert.equal(p.shield, 600);
  applyPowerup(s, p, 'life'); assert.equal(s.players[0].lives, 4);
  applyPowerup(s, p, 'clock'); assert.equal(s.freeze, 600);
  applyPowerup(s, p, 'shovel'); assert.equal(s.fortify, 1200); assert.ok(FORT_CELLS.every(i => s.tiles[i] === 'steel'));
  const e = createTank(s, 'scout', 50, 50, 0, true); s.tanks.push(e); applyPowerup(s, p, 'bomb');
  assert.equal(s.killed, 1); assert.equal(s.pickups.length, 1); assert.equal(s.tanks.length, 1);
  assert.ok(s.players[0].score >= 5000);
});
test('fortification expires and snow keeps a released tank sliding, then stops it', () => {
  const s = arena(); s.fortify = 1; FORT_CELLS.forEach(i => { s.tiles[i] = 'steel'; });
  const tank = s.tanks[0]; tank.x = 144; tank.y = 300; s.tiles.fill('snow');
  run(s, 5, [{ direction: 0, fire: false }]); const y = tank.y;
  run(s, 10); assert.ok(tank.y < y); run(s, 15); const settled = tank.y; run(s, 3); assert.equal(tank.y, settled);
  assert.ok(FORT_CELLS.every(i => s.tiles[i] === 'brick'));
});
test('freeze stops enemies and spawns but allows player movement and shooting', () => {
  const s = arena(); const e = createTank(s, 'runner', 100, 100); s.tanks.push(e); s.freeze = 200; s.spawnTimer = 0;
  run(s, 20, [{ direction: 0, fire: true }]);
  assert.equal(e.y, 100); assert.equal(e.x, 100); assert.equal(s.spawned, 0);
  assert.ok(s.tanks[0].y < 400); assert.ok(s.bullets.some(b => b.player === 1));
});
test('two players move and fire independently; friendly shells do not damage the partner', () => {
  const s = arena(2); const [a, b] = s.tanks; a.x = 80; a.y = 300; b.x = 144; b.y = 300;
  run(s, 10, [{ direction: 0, fire: true }, { direction: 1, fire: true }]); assert.ok(a.y < 300); assert.ok(b.x > 144);
  assert.ok(s.bullets.some(bullet => bullet.player === 1)); assert.ok(s.bullets.some(bullet => bullet.player === 2));
  s.bullets = []; bullet(s, b.x, b.y + 17, 0, 1); run(s, 8); assert.equal(s.players[1].lives, 3);
});
test('death resets upgrade, respawn grants shield, and a surviving teammate keeps playing', () => {
  const s = arena(2); const a = s.tanks[0]; a.level = 3; s.players[0].level = 3;
  bullet(s, a.x, a.y - 16, 2, 0); run(s, 2); assert.equal(s.players[0].lives, 2); assert.equal(s.players[0].level, 0);
  run(s, 91); assert.ok(s.tanks.find(t => t.player === 1).shield > 0);
  const revived = s.tanks.find(t => t.player === 1); revived.shield = 0; s.players[0].lives = 1;
  bullet(s, revived.x, revived.y - 16, 2, 0); run(s, 2); assert.equal(s.players[0].lives, 0); assert.equal(s.phase, 'playing');
});
test('base destruction and loss of the final tank end the game; paused state does not advance', () => {
  const s = arena(); bullet(s, 208, 379, 2, 0); run(s, 3); assert.equal(s.baseAlive, false); assert.equal(s.phase, 'gameover');
  const last = arena(); last.players[0].lives = 1; bullet(last, 144, 383, 2, 0); run(last, 3); assert.equal(last.phase, 'gameover');
  const paused = createGame(); paused.phase = 'paused'; paused.sounds = []; const snapshot = structuredClone(paused); run(paused, 100); assert.deepEqual(paused, snapshot);
});
test('level completion advances through all five maps and ends in victory', () => {
  const s = createGame(2); s.players[1].lives = 0;
  for (let stage = 1; stage <= 5; stage++) {
    s.queue = 0; s.spawned = s.total; s.killed = s.total; s.tanks = s.tanks.filter(t => t.player);
    run(s); assert.equal(s.phase, 'cleared'); run(s, 180);
    if (stage < 5) { assert.equal(s.stage, stage + 1); assert.equal(s.phase, 'playing'); assert.equal(s.players[1].lives, 1); }
  }
  assert.equal(s.phase, 'victory'); assert.equal(s.players[0].score, 5000);
});
test('saved simulations round-trip and resume deterministically; malformed saves are rejected', () => {
  const original = createGame(2, 311); run(original, 290, [{ direction: 0, fire: true }]);
  assert.ok(isGameState(original)); const restored = JSON.parse(JSON.stringify(original)); assert.ok(isGameState(restored));
  run(original, 200); run(restored, 200); assert.deepEqual(restored, original);
  for (const mutate of [s => { s.tiles = []; }, s => { s.seed = NaN; }, s => { s.tanks[0].direction = 7; }, s => { s.players[0].lives = -2; }, s => { s.mode = 4; }, s => { s.pickups = [null]; }, s => { s.spawned = 100; }]) {
    const invalid = createGame(); mutate(invalid); assert.equal(isGameState(invalid), false);
  }
  for (const invalid of [null, {}, [], 'no']) assert.equal(isGameState(invalid), false);
});
test('seeded loot covers all six types and never lands inside impassable terrain', () => {
  const s = createGame(); const kinds = new Set();
  for (let i = 0; i < 150; i++) { dropPowerup(s); const p = s.pickups.at(-1); kinds.add(p.kind); assert.ok(canMove({ ...s, tanks: [] }, { id: -1 }, p.x, p.y)); }
  assert.equal(kinds.size, POWERUPS.length);
  const pending = s.pickups[0]; pending.ttl = 1; run(s); assert.equal(s.pickups.includes(pending), false);
});
test('upgraded double shot allows two shells, while basic gun allows one', () => {
  for (const [level, expected] of [[0, 1], [2, 2]]) {
    const s = arena(); s.tanks[0].level = level; run(s, 20, [{ direction: null, fire: true }]);
    assert.equal(s.bullets.filter(b => b.player === 1).length, expected);
  }
});
test('next stage preserves firepower and score, clearing transient effects', () => {
  const s = createGame(); s.players[0].level = 3; s.players[0].score = 2400; s.freeze = 100; s.fortify = 100; nextStage(s);
  assert.equal(s.tanks[0].level, 3); assert.equal(s.players[0].score, 2400); assert.equal(s.freeze, 0); assert.equal(s.fortify, 0); assert.ok(isGameState(s));
});
