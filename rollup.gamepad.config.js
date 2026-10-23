import { haiyuePlugins } from './config/rollup.shared.js';
export default {
  input: 'games/gamepad/lobby.ts',
  output: { file: 'site/gamepad.js', format: 'es', sourcemap: true },
  plugins: haiyuePlugins({ declaration: false, tsconfig: './games/gamepad/tsconfig.json' }),
};
