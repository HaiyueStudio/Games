// Run with Node >=22: node --experimental-strip-types scripts/import-sokoban-sasquatch.mjs
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseSasquatch } from '../games/sokoban-3d/rules/levels.ts';

const root = resolve(import.meta.dirname, '../games/sokoban-3d');
const source = 'assets/levels/sasquatch-iii.txt';
const bytes = readFileSync(resolve(root, source));
const parsed = parseSasquatch(bytes.toString('utf8'));
if (parsed.length !== 50) throw new Error('Sasquatch III must contain all fifty original levels');
const file = resolve(root, 'levels.json'), data = JSON.parse(readFileSync(file, 'utf8'));
data.expansion = { name: 'Sasquatch III', author: 'David W. Skinner', email: 'sasquatch@bentonrea.com',
  url: 'https://www.onlinespiele-sammlung.de/sokoban/sokobangames/skinner/',
  sourceUrl: 'https://www.onlinespiele-sammlung.de/sokoban/sokobangames/skinner/s3.txt',
  sourceFile: source, sha256: createHash('sha256').update(bytes).digest('hex'),
  license: 'Author permits free distribution with proper credit. Original maps are unchanged.',
  notice: 'Levels 17–66 reproduce the complete 50-level Sasquatch III collection, released June 2000. The source file and map rows are preserved unchanged, including exterior spaces and original order.' };
data.levels = [...data.levels.slice(0, 16), ...parsed.map(level => ({
  name: `Sasquatch III ${String(level.number).padStart(2, '0')}`, difficulty: 'hard',
  source: { file: source, level: level.number, collection: 'Sasquatch III', author: data.expansion.author }, map: level.map,
}))];
writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
console.log(`Imported ${parsed.length} Sasquatch III levels; ${data.levels.length} total. SHA-256 ${data.expansion.sha256}`);
