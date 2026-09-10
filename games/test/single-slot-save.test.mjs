import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import {
  SINGLE_SLOT_SAVE_DATA_VERSION,
  SINGLE_SLOT_SAVE_ID,
  isFiniteNumber,
  isIntegerArray,
  isNonNegativeInteger,
  isRecord,
} from '../save/SingleSlotGameSave.ts';

test('shared game persistence has one stable autosave slot', () => {
  assert.equal(SINGLE_SLOT_SAVE_ID, 'autosave');
  assert.equal(SINGLE_SLOT_SAVE_DATA_VERSION, 1);
});

test('shared validation primitives reject incomplete values', () => {
  assert.equal(isRecord({ value: 1 }), true);
  assert.equal(isRecord(null), false);
  assert.equal(isRecord([]), false);
  assert.equal(isFiniteNumber(1.5), true);
  assert.equal(isFiniteNumber(Number.NaN), false);
  assert.equal(isNonNegativeInteger(0), true);
  assert.equal(isNonNegativeInteger(-1), false);
  assert.equal(isIntegerArray([0, -2, 4]), true);
  assert.equal(isIntegerArray([1.5]), false);
});

test('shared persistence delegates storage and slot limits to the engine save facade', async () => {
  const source = await readFile(new URL('../save/SingleSlotGameSave.ts', import.meta.url), 'utf8');
  assert.match(source, /from '@haiyue\/engine\/save'/);
  assert.match(source, /maxSlots:\s*1/);
  assert.match(source, /SINGLE_SLOT_SAVE_ID/);
  assert.doesNotMatch(source, /localStorage\.(getItem|setItem|removeItem)/);
});

test('shared autosaves are serialized and the newest state is restored', async () => {
  const values = new Map();
  const storage = {
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    clear() { values.clear(); },
  };
  const previous = globalThis.localStorage;
  globalThis.localStorage = storage;
  try {
    const saves = new (await import('../save/SingleSlotGameSave.ts')).SingleSlotGameSave({
      gameId: 'single-slot-test',
      name: 'test autosave',
      validateData: value => isRecord(value) && isNonNegativeInteger(value.turn),
    });
    saves.save({ turn: 1 });
    saves.save({ turn: 2 });
    await saves.flush();
    assert.deepEqual(await saves.load(), { turn: 2 });
  } finally {
    if (previous === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previous;
  }
});

test('every manifest game uses the engine save facade with no direct storage access', async () => {
  const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
  assert.ok(Array.isArray(manifest.entries));
  assert.ok(manifest.entries.length > 1);
  for (const entry of manifest.entries) {
    const directory = new URL(`../${entry.entry.replace(/[^/]+$/, '')}`, import.meta.url);
    const sourceFiles = (await readdir(directory, { recursive: true }))
      .filter(file => file.endsWith('.ts'));
    const source = (await Promise.all(sourceFiles.map(file => (
      readFile(new URL(file.replaceAll('\\', '/'), directory), 'utf8')
    )))).join('\n');
    assert.match(
      source,
      /SingleSlotGameSave|from '@haiyue\/engine\/save'/,
      `${entry.id} must use the shared single-slot policy or the engine save facade`,
    );
    assert.doesNotMatch(
      source,
      /localStorage\.(getItem|setItem|removeItem)/,
      `${entry.id} must not maintain a private storage format`,
    );
  }
});

test('autosave status follows the newest queued write and recovers after a storage failure', async () => {
  const { MemorySaveBackend } = await import('@haiyue/engine/save');
  const { SingleSlotGameSave } = await import('../save/SingleSlotGameSave.ts');
  const backend = new MemorySaveBackend();
  const write = backend.write.bind(backend);
  let fail = true;
  backend.write = async data => { if (fail) throw new Error('storage unavailable'); await write(data); };
  const statuses = [];
  const save = new SingleSlotGameSave({ gameId: 'autosave-status', name: 'test', backend,
    validateData: value => isRecord(value) && isNonNegativeInteger(value.turn), onStatus: status => statuses.push(status) });
  await assert.rejects(save.saveNow({ turn: 1 }), /storage unavailable/);
  await save.flush();
  assert.deepEqual(statuses, ['saving', 'error']);
  fail = false; statuses.length = 0;
  save.save({ turn: 2 }); save.save({ turn: 3 });
  await save.flush();
  assert.deepEqual(statuses, ['saving', 'saving', 'saved']);
  const reopened = new SingleSlotGameSave({ gameId: 'autosave-status', name: 'test', backend,
    validateData: value => isRecord(value) && isNonNegativeInteger(value.turn) });
  assert.deepEqual(await reopened.load(), { turn: 3 });
});
