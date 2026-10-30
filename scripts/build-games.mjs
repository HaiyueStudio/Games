import { resolve } from 'node:path';
import { readJson, selectedGameIds } from './workspace-policy.mjs';
import { runWorkspaces } from './run-workspaces.mjs';

const manifest = readJson(resolve(import.meta.dirname, '../games/manifest.json'));
const games = selectedGameIds(manifest, process.env.GAME_FILTER);
console.log(`Build ${games.length} manifest game workspaces and their platform dependencies.`);
runWorkspaces('build', games);
