// Run from Games: node --experimental-strip-types games/led-sudoku/benchmark.mjs [rules.ts] [output.json]
// Use a separate process per version so JIT and skyscraper caches start cold.
import { registerHooks } from 'node:module';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
registerHooks({ resolve(s, c, next) { return next(s.startsWith('.') && !/\.[a-z]+$/i.test(s) ? `${s}.ts` : s, c); } });
const source = process.argv[2] ? pathToFileURL(resolve(process.argv[2])).href : new URL('./rules.ts', import.meta.url).href;
const { generate, DEFAULT_OPTIONS, search, analyzeSingles, meetsChallenge } = await import(source);
const cases = [
  ['normal', {}], ['LED challenge', { difficulty: 'hard' }], ['classic challenge', { difficulty: 'hard', led: false }],
  ['advanced challenge', { difficulty: 'hard', thermometer: true, skyscraper: true, xv: true, quadruple: true }],
  ['killer challenge', { difficulty: 'hard', killer: true }],
  ['multi-rule challenge', { difficulty: 'hard', diagonal: true, missing: true, killer: true, renban: true, consecutive: true, inequality: true, multiDiagonal: true, exclusion: true, parity: true }],
];
const samples = [];
for (const [name, flags] of cases) for (const seed of [39, 20260920, 20260921]) {
  const start = performance.now();
  const generated = generate({ ...DEFAULT_OPTIONS, ...flags }, seed), ms = performance.now() - start;
  // Verification is outside the measured generation interval.
  const proof = search(generated.puzzle), rating = analyzeSingles(generated.puzzle);
  if (proof.count !== 1 || proof.exhausted || (flags.difficulty === 'hard' && !meetsChallenge(rating))) throw Error(`${name}/${seed}: invalid output`);
  const sample = { name, seed, ms: Math.round(ms * 100) / 100, nodes: proof.nodes,
    sha256: createHash('sha256').update(JSON.stringify(generated)).digest('hex') };
  samples.push(sample); console.log(JSON.stringify(sample));
}
if (process.argv[3]) writeFileSync(process.argv[3], JSON.stringify({ node: process.version, platform: process.platform, arch: process.arch, samples }, null, 2) + '\n');
