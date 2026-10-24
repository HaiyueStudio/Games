import { cleanOutputDirectory, haiyuePlugins } from './config/rollup.shared.js';
import host from './rollup.host.config.js';
export default [host, {
  input: { gamepad: 'games/gamepad/lobby.ts', simulator: 'games/simulator/index.ts' },
  output: { dir: 'site', entryFileNames: '[name].js', chunkFileNames: 'core/[name]-[hash].js', format: 'es', sourcemap: true },
  plugins: [process.env.GAME_DEV_DEPENDENCIES_FILE ? null : cleanOutputDirectory('site/core'), ...haiyuePlugins({ declaration: false, tsconfig: './games/gamepad/tsconfig.json' }), {
    name: 'haiyue-launcher-entry-contract', generateBundle(_options, bundle) {
      for (const name of ['gamepad.js', 'simulator.js']) if (bundle[name]?.type !== 'chunk' || !bundle[name].isEntry) this.error(`Missing launcher entry ${name}.`);
    },
  }],
}];
