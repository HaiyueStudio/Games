import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { selectTests } from './test-selection.mjs';

const root = resolve(import.meta.dirname, '..');
const profile = process.argv[2] ?? 'default';
const files = selectTests(readdirSync(resolve(root, 'games/test'), { recursive: true }).map(file => `games/test/${file}`), profile);
if (!files.length) throw new Error(`No tests selected: ${profile}`);
console.log(`Test profile: ${profile}; ${files.length} files${profile === 'default' ? '; unfinished MUGEN excluded (npm run test:mugen / test:all)' : ''}`);
const result = spawnSync(process.execPath, ['--experimental-strip-types', '--test', ...files], { cwd: root, stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
