import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const gamesRoot = fileURLToPath(new URL('../', import.meta.url));

async function collectTypeScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectTypeScriptFiles(target));
    else if (entry.isFile() && entry.name.endsWith('.ts')) files.push(target);
  }
  return files;
}

test('every game engine enables four-sample MSAA', async () => {
  const manifest = JSON.parse(await readFile(path.join(gamesRoot, 'manifest.json'), 'utf8'));
  let engineCount = 0;

  for (const entry of manifest.entries) {
    const gameDirectory = path.join(gamesRoot, path.dirname(entry.entry));
    const sourceFiles = await collectTypeScriptFiles(gameDirectory);
    for (const sourceFile of sourceFiles) {
      const source = await readFile(sourceFile, 'utf8');
      assert.doesNotMatch(source, /msaaSamples:\s*1\b/, `${entry.id} must not disable the game MSAA default`);
      for (const engineOptions of source.matchAll(/new HaiyueEngine\(\{([\s\S]*?)\}\);/g)) {
        engineCount++;
        assert.match(
          engineOptions[1],
          /msaaSamples:\s*4\b/,
          `${entry.id} must create HaiyueEngine with four-sample MSAA`,
        );
      }
    }
  }

  assert.ok(engineCount >= 22, `expected all game and embedded engines, found ${engineCount}`);
});

test('game canvases do not use fixed CSS pixel render sizes', async () => {
  const manifest = JSON.parse(await readFile(path.join(gamesRoot, 'manifest.json'), 'utf8'));
  for (const entry of manifest.entries) {
    const htmlPath = path.join(gamesRoot, path.dirname(entry.entry), 'index.html');
    const html = await readFile(htmlPath, 'utf8');
    assert.match(html, /<meta\s+name="viewport"/i, `${entry.id} must declare a responsive viewport`);
    assert.doesNotMatch(
      html,
      /canvas(?:#[\w-]+)?\s*\{[^}]*width:\s*\d+px[^}]*height:\s*\d+px/is,
      `${entry.id} canvas CSS must follow its viewport instead of a fixed pixel size`,
    );
  }
});
