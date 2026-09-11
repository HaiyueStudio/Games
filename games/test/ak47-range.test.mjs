import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { RangeRules, MAGAZINE, resolvePlayerHeading } from '../ak47-range/rules.ts';
const muzzle = { x: 0, y: 1.2, z: 0 };
test('held trigger fires at 600 rpm; releasing immediately stops', () => {
  const game = new RangeRules(); game.setFiring(true);
  for (let i = 0; i < 60; i++) game.step(1 / 60, muzzle, 0);
  assert.equal(game.shots, 10); assert.equal(game.ammo, 20);
  game.cancel(); game.step(0.1, muzzle, 0); assert.equal(game.shots, 10);
});
test('cadence is stable at 30, 60 and 120 FPS', () => {
  for (const fps of [30, 60, 120]) {
    const game = new RangeRules(); game.setFiring(true);
    for (let i = 0; i < fps * 2; i++) game.step(1 / fps, muzzle, 0);
    assert.equal(game.shots, 20); assert.equal(game.ammo, 10);
  }
});
test('empty magazine never fires; reload blocks firing and completes exactly once', () => {
  const game = new RangeRules(); assert.equal(game.reload(), false); game.setFiring(true);
  for (let i = 0; i < 250; i++) game.step(1 / 60, muzzle, 0);
  assert.equal(game.shots, MAGAZINE); assert.equal(game.ammo, 0);
  assert.equal(game.reload(), true); assert.equal(game.reload(), false);
  for (let i = 0; i < 120; i++) game.step(1 / 60, muzzle, 0);
  assert.equal(game.shots, MAGAZINE); game.cancel();
  for (let i = 0; i < 15; i++) game.step(1 / 60, muzzle, 0);
  assert.equal(game.ammo, MAGAZINE); assert.equal(game.reloadRemaining, 0);
});
test('bullets originate at muzzle and preserve the facing at emission', () => {
  const game = new RangeRules(); game.setFiring(true); game.step(1 / 120, muzzle, Math.PI / 2);
  const bullet = game.bullets[0]; assert.ok(bullet.dx < -0.999); assert.ok(Math.abs(bullet.dz) < 1e-6);
  assert.equal(bullet.y, muzzle.y); const x = bullet.x;
  game.cancel(); game.step(1 / 60, muzzle, Math.PI);
  assert.ok(bullet.x < x); assert.ok(Math.abs(bullet.z) < 1e-6);
});
test('swept enemy hits score once; cover absorbs bullets before a body', () => {
  const game = new RangeRules(); const enemy = game.spawnEnemy({ x: 0, z: -2 });
  enemy.health = 1; game.setFiring(true); game.step(0.1, muzzle, 0); game.cancel();
  assert.equal(game.hits, 1); assert.equal(game.kills, 1); assert.equal(game.enemies.length, 0);
  const blocked = new RangeRules(); blocked.spawnEnemy({ x: 5, z: -7 });
  blocked.setFiring(true);
  for (let i = 0; i < 30; i++) blocked.step(1 / 60, { x: 5, y: 1.2, z: 1 }, 0);
  assert.equal(blocked.hits, 0);
});
test('suspension cannot discharge a backlog on resume; invalid time rejected', () => {
  const game = new RangeRules(); game.setFiring(true); game.step(60, muzzle, 0);
  assert.equal(game.shots, 1); game.cancel(); game.step(60, muzzle, 0); assert.equal(game.shots, 1);
  for (const dt of [-1, NaN, Infinity]) assert.throws(() => game.step(dt, muzzle, 0));
});
test('source GLBs match provenance; rifle runtime excludes first-person arms', () => {
  const base = new URL('../ak47-range/assets/', import.meta.url);
  const provenance = JSON.parse(readFileSync(new URL('provenance.json', base)));
  for (const [name, model] of Object.entries(provenance.models)) {
    const bytes = readFileSync(new URL(model.source, base));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), model.sourceSha256);
    const gltf = JSON.parse(readFileSync(new URL(`${name}/model.gltf`, base)));
    if (name === 'qiang_ak47') {
      assert.equal(gltf.scenes[0].nodes.length, 7);
      for (const index of gltf.scenes[0].nodes) {
        const node = gltf.nodes[index]; assert.equal(node.skin, undefined);
        assert.ok(gltf.meshes[node.mesh].name.startsWith('ak_47_reference'));
      }
    } else {
      assert.ok(gltf.nodes.some(n => n.name === '1seal_skeleton_Bip01 R Hand'));
      for (const clip of ['run_bottom', 'run_top1', 'idle_bottom', 'reload_top']) assert.ok(gltf.animations.some(a => a.name === clip));
    }
  }
});

const advance = (game, seconds, body = { x: 0, z: 3 }, heading = 0) => {
  for (let i = 0; i < Math.round(seconds * 120); i++) game.step(1 / 120, { ...body, y: 1.2 }, heading, body);
};
test('one seeded enemy appears at an arena edge every three simulation seconds', () => {
  const a = new RangeRules(123), b = new RangeRules(123);
  advance(a, 2.99); assert.equal(a.spawned, 0);
  advance(a, 0.01); assert.equal(a.spawned, 1);
  assert.ok(Math.max(Math.abs(a.enemies[0].x), Math.abs(a.enemies[0].z)) > 17.4);
  advance(a, 3); advance(b, 6); assert.equal(a.spawned, 2);
  assert.deepEqual(a.enemies.map(e => [e.x, e.z]), b.enemies.map(e => [e.x, e.z]));
});
test('both teams have exactly a forward 90-degree cone with solid cover occlusion', () => {
  const game = new RangeRules(), observer = { x: 0, z: 3, heading: 0 };
  assert.equal(game.canSee(observer, { x: 2, z: 1 }), true);
  assert.equal(game.canSee(observer, { x: 2.01, z: 1 }), false);
  assert.equal(game.canSee(observer, { x: 0, z: 4 }), false);
  assert.equal(game.canSee(observer, { x: 0, z: -2 }), true);
  assert.equal(game.canSee(observer, { x: 5, z: -6 }), false);
  assert.equal(game.canSee({ x: 5, z: -6, heading: Math.atan2(5, -9) }, observer), false);
});
test('actors slide along cover and cannot tunnel through it or leave the arena', () => {
  const game = new RangeRules();
  const moved = game.move({ x: 0, z: 0 }, { x: -12, z: 2 });
  assert.ok(moved.x > -3.5); assert.ok(moved.z > 1.9);
  const edge = game.move({ x: 0, z: 16 }, { x: 200, z: 200 });
  assert.ok(Math.abs(edge.x) <= 18 && Math.abs(edge.z) <= 18);
});
test('Engine navigation routes around cover with body clearance', () => {
  const game = new RangeRules();
  const path = game.navigation.findPath([-9, 0, 0], [0, 0, 0], { radius: 0.35 });
  assert.equal(path.status, 'complete'); assert.ok(path.pointCount > 2);
  for (let i = 1; i < path.pointCount; i++) {
    const a = { x: path.points[(i - 1) * 3], z: path.points[(i - 1) * 3 + 2] };
    const b = { x: path.points[i * 3], z: path.points[i * 3 + 2] };
    assert.ok(game.coverFraction(a, b) > 1);
  }
});
test('an unaware enemy cannot track a player behind its back or through cover', () => {
  const game = new RangeRules(); const enemy = game.spawnEnemy({ x: 0, z: -2 });
  enemy.heading = 0;
  advance(game, 0.1, { x: 0, z: 4 });
  assert.equal(enemy.alert, false); assert.notDeepEqual(enemy.goal, { x: 0, z: 4 });
  const covered = new RangeRules(); const e = covered.spawnEnemy({ x: 5, z: -6 });
  e.heading = Math.PI; advance(covered, 0.1, { x: 5, z: 3 });
  assert.equal(e.alert, false); assert.equal(covered.bullets.length, 0);
});
test('acquired targets are shot after a reaction delay; death stops simulation; restart clears combat', () => {
  const game = new RangeRules(); const enemy = game.spawnEnemy({ x: 0, z: -2 });
  enemy.heading = Math.PI;
  advance(game, 0.3); assert.equal(game.health, 100); assert.equal(enemy.alert, true);
  advance(game, 0.7); assert.ok(game.health < 100); assert.equal(game.damageEvents, 1);
  game.health = 1; advance(game, 1); assert.equal(game.alive, false);
  const time = game.time; advance(game, 5); assert.equal(game.time, time); assert.equal(game.firing, false);
  assert.equal(game.reload(), false);
  game.restart(); assert.equal(game.health, 100); assert.equal(game.time, 0);
  assert.equal(game.enemies.length, 0); assert.equal(game.bullets.length, 0); assert.equal(game.ammo, 30);
});
test('a hand socket extending through cover cannot shoot from its far side', () => {
  const game = new RangeRules(); game.setFiring(true);
  game.step(0.1, { x: 5, y: 1.1, z: -6 }, 0, { x: 5, z: 0 });
  assert.equal(game.shots, 1); assert.equal(game.bullets.length, 0);
});

test('right aim owns facing independently of movement, including center hold and return to center', () => {
  const right = { strength: 1, direction: { x: 1, y: 0 } };
  const leftAim = { active: true, strength: 1, direction: { x: -1, y: 0 } };
  const heading = resolvePlayerHeading(0, right, leftAim, 1 / 60);
  assert.equal(heading, Math.PI / 2);
  const centered = { active: true, strength: 0, direction: { x: 0, y: 0 } };
  assert.equal(resolvePlayerHeading(heading, right, centered, 1 / 60), heading);
  assert.equal(resolvePlayerHeading(0.7, right, centered, 1 / 60), 0.7);
  const released = resolvePlayerHeading(heading, right, { ...centered, active: false }, 1 / 60);
  assert.ok(Math.abs(released - heading) > 0.1);
});
test('screen aim cardinal directions map to world bullet directions, regardless of movement', () => {
  for (const [x, y] of [[1, 0], [-1, 0], [0, -1], [0, 1]]) {
    const heading = resolvePlayerHeading(0, { strength: 1, direction: { x: -x, y: -y } }, { active: true, strength: 1, direction: { x, y } }, 1 / 60);
    const game = new RangeRules(); game.setFiring(true); game.step(1 / 120, muzzle, heading);
    assert.ok(Math.abs(game.bullets[0].dx - x) < 1e-6);
    assert.ok(Math.abs(game.bullets[0].dz - y) < 1e-6);
  }
});
