import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const targets = process.argv.slice(2);
if (targets.length === 0) {
  console.error('Usage: npm run build:target -- game:<name> [game:<name> ...]');
  process.exit(2);
}

const manifest = JSON.parse(readFileSync(resolve(repositoryRoot, 'games/manifest.json'), 'utf8'));
const availableGames = new Set(manifest.entries.map(entry => entry.id));
const requestedGames = [];
for (const target of targets) {
  const match = /^game:(.+)$/.exec(target);
  const name = match?.[1];
  if (!name) {
    console.error(`Invalid target "${target}". Expected game:<name>.`);
    process.exit(2);
  }
  if (!availableGames.has(name)) {
    console.error(`Unknown game target "${name}".`);
    process.exit(1);
  }
  if (!requestedGames.includes(name)) requestedGames.push(name);
}

process.env.GAME_FILTER = requestedGames.join(',');
await import('./build-games.mjs');
