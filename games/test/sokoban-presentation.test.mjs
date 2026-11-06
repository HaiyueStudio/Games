import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { CartesianTransform3D } from '@haiyue/engine';
import { ActorMotion } from '../sokoban-3d/rendering/ActorMotion.ts';
import { resolveMove } from '../sokoban-3d/rules/move.ts';
import { SOKOBAN_RATE, SOKOBAN_SOUNDS, synthesizeSokobanSound } from '../sokoban-3d/audio/sounds.ts';

test('Sokoban moves are atomic and do not mutate the supplied board', () => {
  const player = { x: 1, y: 1 }, boxes = [{ x: 2, y: 1 }, { x: 4, y: 1 }];
  const floor = new Set(['1,1', '2,1', '3,1', '4,1', '1,2']);
  assert.deepEqual(resolveMove(player, boxes, floor, { x: 1, y: 0 }), { kind: 'push', player: { x: 2, y: 1 }, boxIndex: 0, box: { x: 3, y: 1 } });
  assert.deepEqual(resolveMove(player, boxes, floor, { x: 0, y: 1 }), { kind: 'walk', player: { x: 1, y: 2 }, boxIndex: -1, box: null });
  assert.deepEqual(resolveMove({ x: 2, y: 1 }, [{ x: 3, y: 1 }, boxes[1]], floor, { x: 1, y: 0 }), { kind: 'blocked' });
  for (const direction of [{ x: -1, y: 0 }, { x: 0, y: -1 }, { x: 1, y: 1 }, { x: Infinity, y: 0 }]) assert.equal(resolveMove(player, boxes, floor, direction).kind, 'blocked');
  assert.deepEqual(player, { x: 1, y: 1 }); assert.deepEqual(boxes, [{ x: 2, y: 1 }, { x: 4, y: 1 }]);
});

test('player and pushed crate interpolate together and land exactly on grid centers', () => {
  const motion = new ActorMotion(), player = new CartesianTransform3D({ position: [0, 19, 0] }), crate = new CartesianTransform3D({ position: [42, 18, 0] });
  motion.slide(player, [42, 19, 0], true, false); motion.slide(crate, [84, 18, 0], false, false);
  motion.update(60, 60);
  assert.ok(player.position[0] > 0 && player.position[0] < 42); assert.ok(player.position[1] > 19);
  assert.ok(crate.position[0] > 42 && crate.position[0] < 84); assert.equal(motion.busy, true);
  motion.update(150, 90); assert.deepEqual([...player.position], [42, 19, 0]); assert.equal(motion.busy, true);
  motion.update(180, 30); assert.deepEqual([...crate.position], [84, 18, 0]); assert.equal(motion.busy, false);
});

test('motion is frame independent, bounded on a bump, cancellable, and respects reduced motion', () => {
  const one = new ActorMotion(), two = new ActorMotion(), a = new CartesianTransform3D(), b = new CartesianTransform3D();
  one.slide(a, [42, 0, 0], true, false); two.slide(b, [42, 0, 0], true, false);
  one.update(90, 90); for (let i = 1; i <= 6; i++) two.update(i * 15, 15);
  assert.deepEqual([...a.position], [...b.position]);
  one.clear(); assert.equal(one.busy, false); one.slide(a, [0, 0, 0], true, true); assert.deepEqual([...a.position], [0, 0, 0]);
  one.bump(a, -1, 0, false); one.update(50, 50); assert.ok(a.position[0] < 0 && a.position[0] >= -2.2);
  one.update(105, 55); assert.deepEqual([...a.position], [0, 0, 0]); assert.equal(one.busy, false);
  one.bump(a, 1, 0, true); assert.equal(one.busy, false);
});

test('seven original cues are deterministic, distinct, finite and tapered at both ends', () => {
  const hashes = new Set();
  for (const id of Object.keys(SOKOBAN_SOUNDS)) {
    const pcm = synthesizeSokobanSound(id);
    assert.deepEqual(pcm, synthesizeSokobanSound(id));
    assert.equal(pcm.length, Math.round(SOKOBAN_RATE * SOKOBAN_SOUNDS[id]));
    assert.equal(Math.abs(pcm[0]), 0); assert.ok(Math.abs(pcm.at(-1)) < .000001);
    assert.ok(pcm.every(sample => Number.isFinite(sample) && Math.abs(sample) < .85));
    assert.ok(pcm.some(sample => Math.abs(sample) > .05));
    hashes.add(createHash('sha256').update(new Uint8Array(pcm.buffer)).digest('hex'));
  }
  assert.equal(hashes.size, 7);
});
