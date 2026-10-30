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
export default process.env.GAME_FILTER ? [...terrainWorkers, ...configs] : [...lobby, ...terrainWorkers, ...configs];
