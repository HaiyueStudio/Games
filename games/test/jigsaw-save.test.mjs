import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { MemorySaveBackend } from '@haiyue/engine/save';
import { SingleSlotGameSave } from '../save/SingleSlotGameSave.ts';

registerHooks({ resolve(specifier, context, next) {
  return next(/^\.{1,2}\//.test(specifier) && !/\.[a-z0-9]+$/i.test(specifier) ? `${specifier}.ts` : specifier, context);
} });
const { createPuzzle, snapGroup, rotateGroup } = await import('../jigsaw-puzzle/rules/model.ts');
const { captureJigsawSave, isJigsawSaveData, restoreJigsawPuzzle } = await import('../jigsaw-puzzle/save/saveState.ts');
const image = { width: 900, height: 600, dataUrl: 'data:image/png;base64,aGVsbG8=' };
const fixture = () => createPuzzle(2, 3, image.width / image.height, true, 1042);
const save = () => captureJigsawSave(fixture(), 1042, image);

test('save restores identical seeded cuts, joined groups, position, rotation, stacking and moves', () => {
  const p = fixture();
  p.groups.forEach((g, i) => Object.assign(g, { x: 1000 + i * 1000, y: 300, angle: 0 }));
  const a = p.groups.find(g => g.pieces.includes(0)), b = p.groups.find(g => g.pieces.includes(1));
  Object.assign(a, { x: b.x, y: b.y });
  assert.equal(snapGroup(p, a, 10), 1);
  rotateGroup(p, a, 1); a.x += 47; a.order = 100;
  const data = captureJigsawSave(p, 1042, image);
  assert.ok(isJigsawSaveData(data));
  const restored = restoreJigsawPuzzle(data);
  assert.deepEqual(restored, p);
  a.x += 123; a.pieces.reverse();
  assert.notDeepEqual(data.groups, p.groups, 'queued writes must hold committed snapshots');
  restored.groups[0].y += 10;
  assert.notDeepEqual(restored.groups, data.groups, 'restored state must not mutate stored data');
});

test('save supports single pieces, completed puzzles, portrait uploads and 144 pieces', () => {
  for (const [rows, cols, width, height] of [[1, 1, 900, 600], [12, 12, 500, 900], [1, 12, 1400, 1]]) {
    const p = createPuzzle(rows, cols, width / height, false, 0xffffffff);
    p.groups.forEach(g => Object.assign(g, { x: 0, y: 0 }));
    snapGroup(p, p.groups[0], 1);
    const data = captureJigsawSave(p, 0xffffffff, { ...image, width, height });
    assert.ok(isJigsawSaveData(data));
    assert.deepEqual(restoreJigsawPuzzle(data), p);
    assert.equal(restoreJigsawPuzzle(data).groups.length, 1);
  }
});

test('save validation rejects corrupt settings, images, transforms and partitions', () => {
  for (const mutate of [
    d => { d.rows = 0; }, d => { d.cols = 13; }, d => { d.seed = -1; }, d => { d.seed = 2 ** 32; },
    d => { d.moves = NaN; }, d => { d.image = null; }, d => { d.image.width = 0; },
    d => { d.image.height = 1401; }, d => { d.image.dataUrl = 'https://example.com/image.png'; },
    d => { d.image.dataUrl = 'data:image/png;base64,'; }, d => { d.groups = []; },
    d => { d.groups.pop(); }, d => { d.groups[0].x = Infinity; }, d => { d.groups[0].y = NaN; },
    d => { d.groups[0].angle = 4; }, d => { d.groups[0].angle = .5; },
    d => { d.allowRotation = false; d.groups[0].angle = 1; },
    d => { d.groups[0].id = 42; }, d => { d.groups[0].order = d.groups[1].order; },
    d => { d.groups[0].pieces.push(d.groups[1].pieces[0]); },
    d => { d.groups[0].pieces.push(d.groups[0].pieces[0]); },
    d => { d.groups[0].pieces[0] = -1; },
    d => { // Row wrapping is not adjacency: 2 and 3 are disconnected in a 2x3 puzzle.
      d.groups = d.groups.filter(g => ![2, 3].includes(g.id));
      d.groups.push({ id: 2, pieces: [2, 3], angle: 0, x: 0, y: 0, order: 100 });
    },
  ]) {
    const data = save(); mutate(data); assert.equal(isJigsawSaveData(data), false, mutate.toString());
  }
  for (const data of [null, {}, { rows: 2, cols: 3, allowRotation: false }]) assert.equal(isJigsawSaveData(data), false);
});

test('engine autosave persists the latest independent snapshot and replaces the previous game', async () => {
  const backend = new MemorySaveBackend();
  const options = { gameId: 'jigsaw-puzzle', name: '拼图测试', backend, validateData: isJigsawSaveData };
  const saves = new SingleSlotGameSave(options);
  const first = save(); saves.save(first);
  const next = save(); next.groups[0].x += 50; next.moves = 8; saves.save(next);
  await saves.flush();
  assert.deepEqual(await new SingleSlotGameSave(options).load(), next);
  const replacement = captureJigsawSave(createPuzzle(1, 1, .5, false, 9), 9, { ...image, width: 450, height: 900 });
  await saves.saveNow(replacement);
  assert.deepEqual(await new SingleSlotGameSave(options).load(), replacement);
  assert.equal((await backend.list('jigsaw-puzzle')).length, 1);
});

test('engine rejects and clears an invalid saved partition instead of restoring a broken board', async () => {
  const backend = new MemorySaveBackend();
  const options = { gameId: 'jigsaw-puzzle', name: '拼图测试', backend, validateData: isJigsawSaveData };
  const bad = save(); bad.groups.pop();
  await new SingleSlotGameSave({ ...options, validateData: () => true }).saveNow(bad);
  assert.equal(await new SingleSlotGameSave(options).load(), null);
  assert.equal((await backend.list('jigsaw-puzzle')).length, 0);
});
