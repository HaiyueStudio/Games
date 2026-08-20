import { resolve } from 'node:path';
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
  plugins: [cleanOutputDirectory('games/gravity-maze/dist'), ...haiyuePlugins({ declaration: false, tsconfig: './games/gravity-maze/tsconfig.ray-tracing-rollup.json' })],
}) : ({
    input: `games/${entry.entry}`,
    output: {
      file: `games/${entry.id}/bundle.js`,
      format: 'iife',
      name: toGlobalName(entry.id, 'Game'),
      sourcemap: true,
      inlineDynamicImports: true,
    },
    plugins: haiyuePlugins({ declaration: false, tsconfig: './tsconfig.rollup.json' }),
  }));

export default configs;
