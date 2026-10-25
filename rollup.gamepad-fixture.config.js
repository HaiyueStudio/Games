import { haiyuePlugins } from './config/rollup.shared.js';
export default { input: 'games/test/fixtures/gamepad/main.js', output: { file: 'artifacts/gamepad/fixture.js', format: 'iife', sourcemap: true }, plugins: haiyuePlugins({ declaration: false, tsconfig: './tsconfig.rollup.json' }) };
