import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

registerHooks({ resolve(specifier, context, nextResolve) { const relative = /^\.{1,2}\//u.test(specifier) && !/\.[a-z0-9]+$/iu.test(specifier); return nextResolve(relative ? `${specifier}.ts` : specifier, context); } });

const { MugenEntityAuthority } = await import('../mugen/runtime/entities/MugenEntityAuthority.ts');
const roots = Object.freeze([{ entityId: 'P1', playerId: 1, team: 0 }, { entityId: 'P2', playerId: 2, team: 1 }]);

test('G05 entity authority commits nested helpers in stable identity order and restores bit-exactly', () => {
  const entities = new MugenEntityAuthority(roots);
  entities.beginTick(1);
  const first = entities.spawnHelper({ ownerId: 'P1', helperId: 10, name: 'first' });
  const second = entities.spawnHelper({ ownerId: first, helperId: 11, name: 'nested', playerId: 44 });
  assert.deepEqual(entities.commit().spawned, ['helper:0000000001', 'helper:0000000002']);
  assert.deepEqual(entities.helpers().map(value => ({ id: value.entityId, playerId: value.playerId, parent: value.parentId, root: value.rootId })), [
    { id: first, playerId: 3, parent: 'P1', root: 'P1' },
    { id: second, playerId: 44, parent: first, root: 'P1' },
  ]);
  assert.equal(entities.playerById(44).entityId, second);
  const snapshot = entities.snapshot();
  assert.deepEqual(MugenEntityAuthority.restore(snapshot).snapshot(), snapshot);
});

test('G05 destruction cascades through owner graph and same-tick orphan spawns are rejected', () => {
  const entities = new MugenEntityAuthority(roots);
  entities.beginTick(1);
  const helper = entities.spawnHelper({ ownerId: 'P1' });
  entities.commit();
  entities.beginTick(2);
  const projectile = entities.spawnProjectile({ ownerId: helper, projectileId: 7 });
  entities.spawnExplod({ ownerId: helper, explodId: 8, animationNumber: 100 });
  entities.destroy(helper);
  const result = entities.commit();
  assert.deepEqual(result.spawned, []);
  assert.deepEqual(result.destroyed, [helper]);
  assert.equal(result.diagnostics.filter(value => value.code === 'owner-destroyed').length, 2);
  assert.equal(entities.entity(projectile), null);
  assert.deepEqual(entities.snapshot().entities.map(value => value.entityId), ['P1', 'P2']);
});

test('G05 target ownership belongs to each root/helper player entity and prunes destroyed targets', () => {
  const entities = new MugenEntityAuthority(roots);
  entities.beginTick(1);
  const attacker = entities.spawnHelper({ ownerId: 'P1', helperId: 10 });
  const defender = entities.spawnHelper({ ownerId: 'P2', helperId: 20 });
  entities.commit();
  entities.beginTick(2);
  entities.registerTarget(attacker, defender, 77);
  entities.registerTarget('P1', defender, 88);
  entities.commit();
  assert.deepEqual(entities.targets(attacker), [{ entityId: defender, targetId: 77 }]);
  assert.deepEqual(entities.targets('P1'), [{ entityId: defender, targetId: 88 }]);
  entities.beginTick(3).destroy(defender);
  entities.commit();
  assert.deepEqual(entities.targets(attacker), []);
  assert.deepEqual(entities.targets('P1'), []);
});

test('G05 projectile contact, explod mutation, binding and pause move time are deterministic', () => {
  const entities = new MugenEntityAuthority(roots);
  entities.beginTick(1);
  const projectile = entities.spawnProjectile({ ownerId: 'P1', projectileId: 5, velocity: [2, 0], acceleration: [1, 0], removeTime: 3, pauseMoveTime: 1 });
  const explod = entities.spawnExplod({ ownerId: 'P1', explodId: 9, animationNumber: 20, velocity: [4, 0], bindTime: 1, removeTime: 3 });
  entities.commit();
  entities.beginTick(2).markProjectileContact(projectile, 'hit').modifyExplod(explod, { layer: 'above', spritePriority: 6, velocity: [3, 0] });
  entities.commit();
  entities.advance(true);
  assert.deepEqual({ projectile: entities.entity(projectile), explod: entities.entity(explod) }, {
    projectile: { ...entities.entity(projectile), position: [3, 0], velocity: [3, 0], removeTime: 2, pauseMoveTime: 0, contactTime: 1, age: 1 },
    explod: { ...entities.entity(explod), layer: 'above', spritePriority: 6 },
  });
  entities.advance(true);
  assert.deepEqual(entities.entity(projectile).position, [3, 0]);
});

test('G05 projectile collision cancels ties and decrements the surviving higher priority', () => {
  const entities = new MugenEntityAuthority(roots);
  entities.beginTick(1);
  const high = entities.spawnProjectile({ ownerId: 'P1', projectileId: 1, priority: 3 });
  const low = entities.spawnProjectile({ ownerId: 'P2', projectileId: 2, priority: 1 });
  entities.commit();
  entities.recordProjectileCollision(high, low);
  assert.deepEqual([entities.entity(high).priority, entities.entity(high).remainingHits, entities.entity(low).contact, entities.entity(low).remainingHits], [2, 1, 'cancelled', 0]);
  entities.beginTick(2);
  const tie = entities.spawnProjectile({ ownerId: 'P2', projectileId: 3, priority: 2 });
  entities.commit();
  entities.recordProjectileCollision(high, tie);
  assert.deepEqual([entities.entity(high).contact, entities.entity(tie).contact], ['cancelled', 'cancelled']);
  const snapshot = entities.snapshot();
  assert.deepEqual(entities.latestProjectileContact('P1'), { rootId: 'P1', entityId: high, projectileId: 1, contact: 'cancelled', contactTime: 0, contactTick: 2 });
  assert.deepEqual(MugenEntityAuthority.restore(snapshot).snapshot(), snapshot);
});

test('G05 last projectile contact survives projectile removal for time triggers', () => {
  const entities = new MugenEntityAuthority(roots);
  entities.beginTick(1);
  const projectile = entities.spawnProjectile({ ownerId: 'P1', projectileId: 44, removeTime: 1 });
  entities.commit();
  entities.recordProjectileContact(projectile, 'guarded');
  entities.advance();
  assert.equal(entities.entity(projectile).terminalReason, 'hit');
  assert.deepEqual(entities.latestProjectileContact('P1'), { rootId: 'P1', entityId: projectile, projectileId: 44, contact: 'guarded', contactTime: 1, contactTick: 1 });
  entities.completeProjectileTerminal(projectile); assert.equal(entities.entity(projectile), null);
});

test('G05 projectile hit, timeout and bounds enter their typed terminal animations with removal velocity', () => {
  const entities = new MugenEntityAuthority(roots);
  entities.beginTick(1);
  const hit = entities.spawnProjectile({ ownerId: 'P1', projectileId: 51, hitCount: 1, hitAnimationNumber: 501, removeVelocity: [2, -1] });
  const timeout = entities.spawnProjectile({ ownerId: 'P1', projectileId: 52, removeTime: 1, hitAnimationNumber: 502, removeAnimationNumber: 503 });
  const bounded = entities.spawnProjectile({ ownerId: 'P2', projectileId: 53, position: [1001, 0], stageBound: 0, edgeBound: 1000, removeAnimationNumber: 504 });
  const screenBounded = entities.spawnProjectile({ ownerId: 'P2', projectileId: 54, position: [101, 0], stageBound: 1000, edgeBound: 0, removeAnimationNumber: 505 });
  entities.commit(); entities.recordProjectileContact(hit, 'hit'); entities.removeProjectilesOutsideBounds(-1000, 1000, -100, 100); entities.advance();
  assert.deepEqual([entities.entity(hit).terminalReason, entities.entity(hit).animationNumber, entities.entity(hit).velocity], ['hit', 501, [2, -1]]);
  assert.deepEqual([entities.entity(timeout).terminalReason, entities.entity(timeout).animationNumber], ['removed', 503]);
  assert.deepEqual([entities.entity(bounded).terminalReason, entities.entity(bounded).animationNumber], ['removed', 504]);
  assert.deepEqual([entities.entity(screenBounded).terminalReason, entities.entity(screenBounded).animationNumber], ['removed', 505]);
  const snapshot = entities.snapshot(); assert.deepEqual(MugenEntityAuthority.restore(snapshot).snapshot(), snapshot);
});

test('G05 entity and command budgets reject work with stable diagnostics instead of throwing or leaking', () => {
  const entities = new MugenEntityAuthority(roots, { maxHelpers: 1, maxProjectiles: 0, maxExplods: 0, maxEntities: 3, maxCommandsPerTick: 3 });
  entities.beginTick(1);
  entities.spawnHelper({ ownerId: 'P1', playerId: 9 });
  entities.spawnHelper({ ownerId: 'P1', playerId: 9 });
  entities.spawnProjectile({ ownerId: 'P1' });
  entities.spawnExplod({ ownerId: 'P1', animationNumber: 0 });
  const result = entities.commit();
  assert.deepEqual(result.diagnostics.map(value => value.code), ['id-collision', 'command-budget', 'entity-budget']);
  assert.equal(entities.helpers().length, 1);
  assert.equal(entities.projectiles().length, 0);
  assert.equal(entities.explods().length, 0);
});

test('G05 10,000 round cleanup soak leaves no orphan entity or owner reference', () => {
  const entities = new MugenEntityAuthority(roots, { maxHelpers: 4, maxProjectiles: 4, maxExplods: 4 });
  for (let tick = 1; tick <= 10_000; tick += 1) {
    entities.beginTick(tick);
    const helper = entities.spawnHelper({ ownerId: tick % 2 === 0 ? 'P1' : 'P2', helperId: tick });
    entities.spawnProjectile({ ownerId: helper, projectileId: tick, removeTime: 1 });
    entities.spawnExplod({ ownerId: helper, explodId: tick, animationNumber: tick, removeTime: 1 });
    entities.commit();
    entities.advance();
    entities.clearRoundEntities();
  }
  const snapshot = entities.snapshot();
  assert.equal(snapshot.entities.length, 2);
  assert.deepEqual(snapshot.entities.map(value => value.entityId), ['P1', 'P2']);
});
