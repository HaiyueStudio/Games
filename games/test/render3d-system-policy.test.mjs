import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

async function collectProductionTypeScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    if (entry.isDirectory() && entry.name === 'test') return [];
    const url = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, directory);
    if (entry.isDirectory()) return collectProductionTypeScriptFiles(url);
    return entry.name.endsWith('.ts') ? [url] : [];
  }));
  return nested.flat();
}

test('games use Render3DSystem instead of the deprecated BlinnPhongRenderSystem', async () => {
  const gamesDirectory = new URL('../', import.meta.url);
  const files = await collectProductionTypeScriptFiles(gamesDirectory);
  const offenders = [];

  for (const file of files) {
    const source = await readFile(file, 'utf8');
    if (source.includes('BlinnPhongRenderSystem')) {
      offenders.push(file.pathname);
    }
  }

  assert.deepEqual(offenders, [], 'Render3DSystem dispatches BlinnPhongMaterial automatically');
});
