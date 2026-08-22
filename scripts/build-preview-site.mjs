import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = join(repositoryRoot, 'games', 'manifest.json');
const siteSource = join(repositoryRoot, 'site');
const outputRoot = join(repositoryRoot, 'artifacts', 'pages');

function fail(message) {
  throw new Error(`[preview] ${message}`);
}

function copyDirectory(source, destination, filter) {
  cpSync(source, destination, {
    recursive: true,
    filter: (entry) => filter(relative(source, entry).replaceAll('\\', '/')),
  });
}

if (!existsSync(siteSource)) fail(`Missing site source: ${siteSource}`);
if (!existsSync(manifestPath)) fail(`Missing game manifest: ${manifestPath}`);

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (!Array.isArray(manifest.entries) || manifest.entries.length === 0) {
  fail('games/manifest.json must contain a non-empty entries array.');
}

rmSync(outputRoot, { force: true, recursive: true });
mkdirSync(outputRoot, { recursive: true });
copyDirectory(siteSource, outputRoot, () => true);

const outputGames = join(outputRoot, 'games');
mkdirSync(outputGames, { recursive: true });
writeFileSync(join(outputGames, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

const omittedSourceFile = /(?:^|\/)(?:[^/]+\.ts|tsconfig[^/]*\.json|bundle\.meta\.json)$/i;
const sourceMap = /\.map$/i;

for (const game of manifest.entries) {
  if (!game || typeof game.id !== 'string' || !game.id) fail('Every manifest entry must have a non-empty id.');

  const source = join(repositoryRoot, 'games', game.id);
  const htmlEntry = join(source, 'index.html');
  const bundle = game.id === 'gravity-maze'
    ? join(source, 'dist', 'bundle.js')
    : join(source, 'bundle.js');

  if (!existsSync(htmlEntry)) fail(`Game ${game.id} is missing games/${game.id}/index.html.`);
  if (!existsSync(bundle)) {
    fail(`Game ${game.id} has no built bundle. Run npm run build before npm run preview:build.`);
  }

  copyDirectory(source, join(outputGames, game.id), (entry) => {
    if (!entry) return true;
    return !omittedSourceFile.test(entry) && !sourceMap.test(entry);
  });
}

writeFileSync(join(outputRoot, '.nojekyll'), '');
console.log(`[preview] Published ${manifest.entries.length} games to ${outputRoot}`);
