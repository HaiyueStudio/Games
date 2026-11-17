import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { join, resolve } from 'node:path';

const worldsPath = process.argv[2];
if (!worldsPath) throw Error('Usage: node games/dafeiyu/levels/install-official.mjs "<Steam>/Baba Is You/Data/Worlds"');
const source = resolve(worldsPath);
const target = new URL('./local-official/', import.meta.url);
const hook = registerHooks({ resolve(specifier, context, next) {
  return next(/^\.{1,2}\//.test(specifier) && !/\.[a-z0-9]+$/i.test(specifier) ? specifier + '.ts' : specifier, context);
} });
const { localPacks } = await import('./pack.ts');
hook.deregister();

const catalog = [];
for (const id of ['baba', 'new_adv', 'museum']) {
  const names = readdirSync(join(source, id), { withFileTypes: true }).filter(file => file.isFile() &&
    (/\.ld?$/i.test(file.name) || file.name.toLowerCase() === 'world_data.txt')).map(file => file.name);
  assert.ok(names.some(name => name.toLowerCase() === 'world_data.txt'), `Missing world_data.txt in ${id}`);
  const files = names.map(name => ({ name, webkitRelativePath: `${id}/${name}`, async arrayBuffer() {
    return Uint8Array.from(readFileSync(join(source, id, name))).buffer;
  } }));
  const [pack] = await localPacks(files);
  assert.ok(pack?.entries.length && pack.first !== undefined && pack.entries[pack.initial].map, `Invalid story entry or map in ${id}`);
  assert.equal(pack.entries.length, names.filter(name => /\.ld?$/i.test(name)).length / 2, `Incomplete room pairs in ${id}`);
  const folder = new URL(`${id}/`, target);
  mkdirSync(folder, { recursive: true });
  for (const name of names) copyFileSync(join(source, id, name), new URL(encodeURIComponent(name.toLowerCase()), folder));
  catalog.push({ id, title: pack.title, initial: pack.initial, first: pack.first,
    entries: pack.entries.map(({ read, ...entry }) => entry) });
  console.log(`${pack.title}: ${pack.entries.length} rooms, starts at ${pack.entries[pack.first].id}`);
}
const draft = new URL('catalog.json.tmp', target);
writeFileSync(draft, JSON.stringify(catalog) + '\n');
renameSync(draft, new URL('catalog.json', target));
