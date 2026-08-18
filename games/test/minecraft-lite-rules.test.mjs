import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_WORLD_SIZE,
  MINECRAFT_BLOCK_COLORS,
  PLAYER_JUMP_HEIGHT,
  PLAYER_JUMP_SPEED,
  PLAYER_GRAVITY,
  PLAYER_STEP_HEIGHT,
  jumpApexHeight,
  paletteIndexForDigit,
} from '../minecraft-lite/MinecraftRules.ts';
import { MinecraftWorld } from '../minecraft-lite/MinecraftWorld.ts';

test('minecraft palette maps every digit key to one of ten colors', () => {
  assert.equal(MINECRAFT_BLOCK_COLORS.length, 10);
  for (let digit = 0; digit <= 9; digit += 1) {
    assert.equal(paletteIndexForDigit(`Digit${digit}`), digit);
    assert.equal(paletteIndexForDigit(`Numpad${digit}`), digit);
    assert.equal(MINECRAFT_BLOCK_COLORS[digit].digit, digit);
  }
  assert.equal(paletteIndexForDigit('KeyA'), null);
});

test('configured jump velocity reaches exactly 5.5 block heights', () => {
  assert.equal(PLAYER_JUMP_HEIGHT, 5.5);
  assert.ok(Math.abs(jumpApexHeight(PLAYER_JUMP_SPEED, PLAYER_GRAVITY) - 5.5) < 1e-12);
  assert.ok(PLAYER_STEP_HEIGHT >= 1 && PLAYER_STEP_HEIGHT < 1.1);
});

test('terrain generation is seeded, bounded, and undulating', () => {
  const first = new MinecraftWorld({ size: 32, seed: 1337 });
  const second = new MinecraftWorld({ size: 32, seed: 1337 });
  const third = new MinecraftWorld({ size: 32, seed: 7331 });
  const heights = [];
  const otherSeedHeights = [];
  for (let z = 0; z < 32; z += 1) {
    for (let x = 0; x < 32; x += 1) {
      const height = first.surfaceHeight(x, z);
      assert.equal(height, second.surfaceHeight(x, z));
      assert.ok(height >= 3 && height < first.maxHeight);
      heights.push(height);
      otherSeedHeights.push(third.surfaceHeight(x, z));
    }
  }
  assert.ok(new Set(heights).size >= 4, 'terrain should contain several elevations');
  assert.notDeepEqual(heights, otherSeedHeights, 'changing the seed should change the terrain');
});

test('world enforces a maximum 200 by 200 footprint', () => {
  assert.equal(new MinecraftWorld({ size: MAX_WORLD_SIZE, generateTerrain: false }).size, 200);
  assert.throws(() => new MinecraftWorld({ size: 201 }), /between 1 and 200/);
});

test('block edits update the column surface and exposed neighbors', () => {
  const world = new MinecraftWorld({ size: 8, maxHeight: 12, generateTerrain: false });
  assert.equal(world.setBlock({ x: 3, y: 1, z: 3 }, 3), true);
  assert.equal(world.surfaceHeight(3, 3), 2);
  assert.equal(world.blockCount, 1);
  assert.equal(world.setBlock({ x: 3, y: 2, z: 3 }, 5), true);
  assert.equal(world.surfaceHeight(3, 3), 3);
  assert.equal(world.affectedVisibilityCells({ x: 3, y: 2, z: 3 }).length, 7);
  assert.equal(world.removeBlock({ x: 3, y: 2, z: 3 }), true);
  assert.equal(world.surfaceHeight(3, 3), 2);
  assert.equal(world.getBlock(3, 1, 3), 3);
});

test('voxel DDA returns both the hit block and adjacent placement cell', () => {
  const world = new MinecraftWorld({ size: 8, maxHeight: 12, generateTerrain: false });
  world.setBlock({ x: 4, y: 2, z: 3 }, 6);
  const target = world.worldCenter({ x: 4, y: 2, z: 3 });
  const hit = world.raycast([target[0], target[1], target[2] + 4], [0, 0, -1], 6);
  assert.deepEqual(hit?.block, { x: 4, y: 2, z: 3 });
  assert.deepEqual(hit?.adjacent, { x: 4, y: 2, z: 4 });
});
