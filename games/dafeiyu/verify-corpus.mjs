import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { join, resolve } from 'node:path';

const source = process.argv[2];
if (!source) throw new Error('Usage: node games/dafeiyu/verify-corpus.mjs <Baba Is You/Data/Worlds>');
const hook = registerHooks({ resolve(specifier, context, next) {
  return next(/^\.{1,2}\//.test(specifier) && !/\.[a-z0-9]+$/i.test(specifier) ? specifier + '.ts' : specifier, context);
} });
const { readBabaLevel, decodeMetadata } = await import('./levels/baba-format.ts');
const { Puzzle } = await import('./rules/game.ts');
hook.deregister();

const worlds = resolve(source);
let total = 0;
for (const folder of (await readdir(worlds, { withFileTypes: true })).filter(entry => entry.isDirectory())) {
  const directory = join(worlds, folder.name);
  const files = (await readdir(directory)).filter(file => file.toLowerCase().endsWith('.l'));
  for (const file of files) {
    const id = file.slice(0, -2);
    const [binary, metadata] = await Promise.all([readFile(join(directory, file)), readFile(join(directory, id + '.ld'))]);
    const level = await readBabaLevel(Uint8Array.from(binary).buffer, decodeMetadata(Uint8Array.from(metadata).buffer), id);
    assert.deepEqual(level.unknown, [], folder.name + '/' + file);
    assert.ok(level.tiles.every(unit => unit.x < level.width && unit.y < level.height && unit.dir >= 0 && unit.dir < 4), folder.name + '/' + file);
    const smoke = new Puzzle(level);
    smoke.move('wait');
    assert.equal(smoke.state.turn, 1, folder.name + '/' + file);
    if (folder.name === 'baba' && id === '0level') {
      const puzzle = new Puzzle(level);
      for (let step = 0; step < 8; step++) puzzle.move(0);
      assert.equal(puzzle.state.won, true);
    }
  }
  if (files.length) console.log(folder.name + ': ' + files.length);
  total += files.length;
}
assert.ok(total, 'No original .l/.ld pairs found');
console.log('Decoded ' + total + ' original level pairs with no unresolved object codes and advanced one turn in each.');
