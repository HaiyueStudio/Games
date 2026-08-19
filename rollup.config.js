import { resolve } from 'node:path';
import { haiyuePlugins, loadContentManifest, selectContentEntries, toGlobalName } from './config/rollup.shared.js';

const gamesDirectory = resolve(process.cwd(), 'games');
const manifest = loadContentManifest('games', gamesDirectory);
const games = selectContentEntries(manifest, process.env.GAME_FILTER);

export default games.map(entry => ({
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
