import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runRollupOnce } from './shared-rollup-runner.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const gamesDirectory = resolve(repositoryRoot, 'games');
const manifest = JSON.parse(readFileSync(resolve(gamesDirectory, 'manifest.json'), 'utf8'));
const allGames = manifest.entries.map(entry => entry.id);
const requestedGames = parseFilter(process.env.GAME_FILTER);
const games = requestedGames.length > 0
  ? allGames.filter(name => requestedGames.includes(name))
  : allGames;

const missingGames = requestedGames.filter(name => !allGames.includes(name));
if (missingGames.length > 0) {
  console.error(`Unknown game${missingGames.length === 1 ? '' : 's'} "${missingGames.join(', ')}".`);
  process.exit(1);
}

for (const game of games) await buildGame(game);

async function buildGame(game) {
  console.log(`\n> rollup game ${game}`);
  try {
    await runRollupOnce({
      cwd: repositoryRoot,
      config: 'rollup.config.js',
      expectedOutputs: [`games/${game}/bundle.js`],
      label: `game ${game}`,
      timeoutMs: environmentDuration('GAME_BUILD_TIMEOUT_MS', 60_000),
      exitGraceMs: environmentDuration('GAME_EXIT_GRACE_MS', 1_500, true),
      terminateGraceMs: environmentDuration('GAME_TERM_GRACE_MS', 1_000),
      killGraceMs: environmentDuration('GAME_KILL_GRACE_MS', 1_000),
      environment: { GAME_FILTER: game },
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    throw error;
  }
}

function parseFilter(value) {
  if (!value) return [];
  return [...new Set(value.split(',').map(name => name.trim()).filter(Boolean))];
}

function environmentDuration(name, fallback, allowZero = false) {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < (allowZero ? 0 : 1)) {
    throw new Error(`${name} must be ${allowZero ? 'zero or a positive integer' : 'a positive integer'}.`);
  }
  return value;
}
