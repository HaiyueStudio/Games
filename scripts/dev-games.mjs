import { mkdirSync, readFileSync, readdirSync, statSync, watch } from 'node:fs';
import { resolve, relative } from 'node:path';
import { runRollupOnce } from './shared-rollup-runner.mjs';
import { affectedDevTargets, isDevSource, selectDevGames, SerialBuildQueue } from './dev-build-policy.mjs';

const root = resolve(import.meta.dirname, '..');
const entries = JSON.parse(readFileSync(resolve(root, 'games/manifest.json'), 'utf8')).entries;
const { once, games } = selectDevGames(entries, process.argv.slice(2), process.env.GAME_FILTER);
const abort = new AbortController(), dependencies = new Map(), watchers = [], changed = new Set();
const sourceStamps = new Map();
const watchDirectories = [['', false], ['games', true], ['config', true], ['scripts', true], ['node_modules/@haiyue', true]];
const output = resolve(root, 'artifacts/dev');
mkdirSync(output, { recursive: true });
let debounce, stopping = false;
const queue = new SerialBuildQueue(async id => {
  const file = resolve(output, `${id}.json`);
  console.log(`[dev] Building ${id} in an isolated process (${queue.pending.size} queued).`);
  const result = await runRollupOnce({
    cwd: root, label: id, signal: abort.signal,
    config: id === 'lobby' ? 'rollup.gamepad.config.js' : 'rollup.config.js',
    expectedOutputs: id === 'lobby' ? ['site/gamepad.js'] : [id === 'mugen' || id === 'gravity-maze' ? `games/${id}/dist` : `games/${id}/bundle.js`],
    timeoutMs: Number(process.env.GAME_BUILD_TIMEOUT_MS ?? 180_000),
    environment: { GAME_FILTER: id === 'lobby' ? '' : id, GAME_DEV_DEPENDENCIES_FILE: file },
  });
  dependencies.set(id, new Set(JSON.parse(readFileSync(file, 'utf8')).map(path => relative(root, path).replaceAll('\\', '/'))));
  console.log(`[dev] Ready ${id}; child ${result.pid} closed; watcher RSS ${Math.round(process.memoryUsage().rss / 1048576)} MiB.`);
}, (id, error) => {
  dependencies.delete(id);
  if (!stopping) console.error(`[dev] ${id}: ${error.message}\n[dev] Watching for the next correction.`);
});

async function stop() {
  if (stopping) return;
  stopping = true;
  clearTimeout(debounce);
  for (const watcher of watchers) watcher.close();
  abort.abort();
  await queue.stop();
  console.log('[dev] Stopped; build process and file watchers closed.');
}
process.once('SIGINT', stop);
process.once('SIGTERM', stop);

function changedFile(path) {
  if (!isDevSource(path) || stopping) return;
  // Windows can report attribute/access events for unchanged source files.
  // Only writes, additions and deletions should invalidate a build.
  const stamp = sourceStamp(path);
  if (sourceStamps.get(path) === stamp) return;
  sourceStamps.set(path, stamp);
  if (path === 'games/manifest.json') {
    console.log('[dev] Game catalog changed. Restart npm run dev to load the new target list.');
    return;
  }
  changed.add(path);
  clearTimeout(debounce);
  debounce = setTimeout(() => {
    const targets = new Set();
    for (const path of changed) for (const id of affectedDevTargets(path, games, dependencies, entries.map(entry => entry.id))) targets.add(id);
    if (targets.size) {
      const paths = [...changed];
      console.log(`[dev] Changed ${paths.slice(0, 5).join(', ')}${paths.length > 5 ? ` (+${paths.length - 5} more)` : ''}; queued ${[...targets].join(', ')}.`);
    }
    changed.clear();
    if (targets.size) queue.enqueue(targets);
  }, 200);
}

function sourceStamp(path) {
  try { const stat = statSync(resolve(root, path)); return `${stat.mtimeMs}:${stat.size}`; }
  catch (error) { if (error.code === 'ENOENT') return undefined; throw error; }
}

function snapshotSources(directory, recursive) {
  for (const entry of readdirSync(resolve(root, directory), { withFileTypes: true })) {
    const path = [directory, entry.name].filter(Boolean).join('/');
    if (recursive && entry.isDirectory()) snapshotSources(path, true);
    else if (entry.isFile() && isDevSource(path)) sourceStamps.set(path, sourceStamp(path));
  }
}

try {
  if (!once) {
    for (const [directory, recursive] of watchDirectories) {
      const watcher = watch(resolve(root, directory), { recursive }, (_event, filename) => {
        if (filename) changedFile([directory, String(filename)].filter(Boolean).join('/').replaceAll('\\', '/'));
      });
      watcher.on('error', error => { console.error(`[dev] Watch failed: ${error.message}`); process.exitCode = 1; void stop(); });
      watchers.push(watcher);
      snapshotSources(directory, recursive);
    }
  }
  console.log(`[dev] ${games.length} games + lobby; one build process at a time; child heap limit 2048 MiB.`);
  queue.enqueue(['lobby', ...games]);
  await queue.idle();
  if (once) { process.exitCode = queue.failures.size ? 1 : 0; await stop(); }
  else if (!stopping) console.log('[dev] Initial builds finished. Watching source files (Ctrl+C to stop).');
} catch (error) {
  console.error(error); process.exitCode = 1; await stop();
}
