import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import lobby from './rollup.gamepad.config.js';
import { gameModulePlugin } from './scripts/rollup-plugin-game-module.mjs';
import { cleanOutputDirectory, haiyuePlugins, loadContentManifest, selectContentEntries, toGlobalName } from './config/rollup.shared.js';

const gamesDirectory = resolve(process.cwd(), 'games');
const manifest = loadContentManifest('games', gamesDirectory);
const games = selectContentEntries(manifest, process.env.GAME_FILTER);

const configs = games.map(entry => entry.id === 'gravity-maze' ? ({
  input: 'games/gravity-maze/main.ts',
  output: {
    dir: 'games/gravity-maze/dist',
    format: 'es',
    entryFileNames: 'bundle.js',
    chunkFileNames: 'chunks/[name]-[hash].js',
    sourcemap: true,
  },
  plugins: [cleanOutputDirectory('games/gravity-maze/dist'), ...haiyuePlugins({ declaration: false, tsconfig: './games/gravity-maze/tsconfig.ray-tracing-rollup.json' }), gameModulePlugin(entry.id, true)],
}) : ({
    input: `games/${entry.entry}`,
    output: {
      file: `games/${entry.id}/bundle.js`,
      format: 'iife',
      name: toGlobalName(entry.id, 'Game'),
      sourcemap: true,
      inlineDynamicImports: true,
    },
    plugins: [...haiyuePlugins({ declaration: false, tsconfig: existsSync(`games/${entry.id}/tsconfig.build.json`) ? `games/${entry.id}/tsconfig.build.json` : './tsconfig.rollup.json' }), gameModulePlugin(entry.id)],
  }));

// Build the terrain worker first so the game's bundle is published only after its worker exists.
const terrainWorkers = games.filter(entry => entry.id === 'entanglement-path').map(() => ({
  input: 'games/entanglement-path/art/terrainRaster.worker.ts',
  output: { file: 'games/entanglement-path/terrain-raster.worker.js', format: 'iife', sourcemap: true, inlineDynamicImports: true },
  plugins: haiyuePlugins({ declaration: false, tsconfig: existsSync('games/entanglement-path/tsconfig.build.json') ? './games/entanglement-path/tsconfig.build.json' : './tsconfig.rollup.json' }),
}));
// Publish the Mahjong strategy worker before the GUI bundle that creates it.
const mahjongWorkers = games.filter(entry => entry.id === 'guobiao-mahjong').map(() => ({
  input: 'games/guobiao-mahjong/ai/mahjong.worker.ts',
  output: { file: 'games/guobiao-mahjong/ai/mahjong.worker.js', format: 'es', sourcemap: true },
  plugins: haiyuePlugins({ declaration: false, tsconfig: './games/guobiao-mahjong/ai/tsconfig.worker.json' }),
}));
const mahjongModelWorkers = games.filter(entry => entry.id === 'guobiao-mahjong').map(() => ({
  input: 'games/guobiao-mahjong/ai/browser/tfjs.worker.ts',
  output: { file: 'games/guobiao-mahjong/ai/tfjs.worker.js', format: 'iife', sourcemap: true, inlineDynamicImports: true },
  plugins: haiyuePlugins({ declaration: false, tsconfig: './games/guobiao-mahjong/ai/browser/tsconfig.worker.json' }),
}));
const mahjongCoachWorkers = games.filter(entry => entry.id === 'guobiao-mahjong').map(() => ({
  input: 'games/guobiao-mahjong/ai/coach.worker.ts',
  output: { file: 'games/guobiao-mahjong/ai/coach.worker.js', format: 'es', sourcemap: true },
  plugins: haiyuePlugins({ declaration: false, tsconfig: './games/guobiao-mahjong/ai/coaching/tsconfig.worker.json' }),
}));
const selected = process.env.GAME_FILTER ? [...terrainWorkers, ...mahjongWorkers, ...mahjongModelWorkers, ...mahjongCoachWorkers, ...configs] : [...lobby, ...terrainWorkers, ...mahjongWorkers, ...mahjongModelWorkers, ...mahjongCoachWorkers, ...configs];
const stageEntry = process.env.GAME_BUILD_ENTRY;
if(stageEntry&&(!process.env.GAME_FILTER||!selected.some(c=>c.input===stageEntry)))throw Error('Unknown scoped game build entry: '+stageEntry);
export default stageEntry?selected.filter(c=>c.input===stageEntry):selected;
