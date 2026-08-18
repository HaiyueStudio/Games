import { haiyuePlugins, loadContentManifest, selectContentEntries, toGlobalName } from '../config/rollup.shared.js';

const manifest = loadContentManifest('games');
const games = selectContentEntries(manifest, process.env.GAME_FILTER);

export default games.map(entry => ({
  input: entry.entry,
  output: {
    file: `${entry.id}/bundle.js`,
    format: 'iife',
    name: toGlobalName(entry.id, 'Game'),
    sourcemap: true,
  },
  plugins: haiyuePlugins({ declaration: false, tsconfig: './tsconfig.rollup.json' }),
}));
