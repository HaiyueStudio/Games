import { haiyuePlugins } from './config/rollup.shared.js';
export default { input: 'games/host/index.ts', output: { file: 'site/game-host.js', format: 'es', sourcemap: true }, plugins: haiyuePlugins({ declaration: false, tsconfig: './tsconfig.rollup.json' }) };
