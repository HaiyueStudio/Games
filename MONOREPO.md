# Games workspaces

Games uses npm workspaces for installation and Lerna 10.1.1 (Nx task runner) for
dependency ordering, scoped tasks and local caching. Run commands from this
repository root after `npm ci`. Node 22.22.2 is pinned for CI; supported versions
are `^22.22.2 || ^24.15.0 || ^26.0.0`.

## Layout and ownership

| Package | Source | Responsibility |
| --- | --- | --- |
| `@haiyue/game-<id>` | `games/<id>` | One package for every game in `games/manifest.json` |
| `@haiyue/games-platform` | `games/launcher` | Lobby, host, shared runtime, input, save, session and simulator |
| `@haiyue/games-tooling` | `packages/tooling` | Repository policy and infrastructure tests; no build output |

The final workspace set contains 31 games and these two support packages. Shared
sources remain in their original directories: the existing session, input and
launcher references form a single platform task rather than circular packages.
All games depend on that package. Ink Pinball also depends on Pinball, and Pad
Simulator depends on Sudoku because they import those games' sources.

Game runtime dependencies are peers supplied by the root installation. This
keeps one public Engine/Extensions/UI version in use, including after a temporary
`npm run deps:local` candidate install. Game packages are private and are built
inside this repository, not independently published to npm. The opt-in Valley
editor under `tools/valley-editor` and sibling `../mugen` project remain separate.

## Commands

```bash
npm ci
npm run workspaces:check
npm run typecheck
npm test
npm run build
npm run preview:build

# Selected games; shared dependencies are ordered automatically:
npm run build:target -- game:2048 game:whale-maker
node scripts/run-workspaces.mjs test 2048 whale-maker
node scripts/run-workspaces.mjs typecheck whale-maker
npx lerna run build --scope @haiyue/game-2048

# Direct package task; useful for diagnosing one workspace without cache:
npm run build --workspace @haiyue/game-2048
npm test --workspace @haiyue/game-whale-maker
```

Direct npm build runs only that package's Rollup task; use the Lerna/root commands
on a clean checkout to build its platform prerequisites. `GAME_FILTER=2048,whale-maker`
is still accepted by the root build command. `GAME_WORKSPACE_CONCURRENCY` controls
the Lerna task limit (build defaults to 1, tests/type checks to 2). Serial builds
preserve the original memory/timeout bounds after parallel cold builds proved
slower on the local validation machine. The existing one-shot Rollup process, heap bound,
timeouts and exit cleanup remain in use. `GAME_BUILD_TIMEOUT_MS`,
`GAME_EXIT_GRACE_MS`, `GAME_TERM_GRACE_MS` and `GAME_KILL_GRACE_MS` remain supported.

`npm run dev -- game:2048` retains the dependency-aware serial watcher. Watch
processes and browser checks are not cached. Static preview assembly also runs
each time so publication never relies on a stale assembled directory.

## Cache contract

`nx.json` and each package's explicit targets own the cache contract. Builds
depend on dependency builds; type checks depend on dependency type checks.
Tests run exactly once according to `config/workspaces.json`, without requiring
GPU builds. The test runner retains Node's real test exit status.

Inputs include owned source/assets, owned tests, test fixtures, shared runtime,
manifest, build scripts/configuration, lockfile, Node version, vendored archives
and a content fingerprint of installed runtime dependencies. The content hash
catches same-version local candidates that a version or lockfile check would
miss. Imported game dependencies are included through dependency inputs.
Generated bundles, maps, lazy chunks, artifacts and cache files are excluded.

Outputs are per-game `bundle.js` and its map, Entanglement Path's additional
`terrain-raster.worker.js` and its map, Gravity Maze's `dist` directory
(including lazy chunks), and the platform's host, lobby, simulator and shared core
chunks. Repeating a task replays the cached result; deleting these generated
outputs restores them from cache. No source or art is restored over working edits.
Cache storage is `.nx/cache`; the daemon and cloud connection are disabled.
CI reuses npm downloads through the root lockfile cache. Nx task caching stays
local to the checkout; no cross-machine task cache service is configured. Copying
only the artifact directory between fresh runners would lose Nx's database
metadata. The workflow therefore leaves task cache storage local.

To bypass caching for a diagnostic run, use
`npx lerna run build --scope @haiyue/game-2048 --skip-nx-cache`.
After dependency overlays, `npm ci` restores the committed dependency set.

## Adding a game or test

Register the game in `games/manifest.json`, then run `npm run workspaces:sync` and
`npm install` to refresh packages and the root lockfile. Source paths do not move.
The sync command creates package scripts and TypeScript configurations, discovers
cross-game imports and assigns existing central test suites. Inspect its test
ownership changes, particularly tests that exercise several games. The check
command rejects omitted or duplicated suites, missing packages and manifest drift.
Put shared test helpers under `games/test/fixtures` so changes invalidate every
test owner that can consume them.

## Migration verification

Before full rollout, the migration first selected 2048 and Whale Maker with
`node scripts/sync-workspaces.mjs --pilot`. After scoped builds, type checks,
tests, cache restoration and browser checks passed,
`npm run workspaces:sync` extended the same contract to every manifest game.
After full rollout, use scoped tasks to exercise these two games; `--pilot`
refuses to rewrite a complete workspace plan into an incomplete one.

```bash
node --test games/test/workspaces-policy.test.mjs
node scripts/verify-workspaces-cache.mjs
node scripts/verify-workspaces-browser.mjs
node scripts/verify-game-os.mjs --root
```

Browser checks reuse `../Engine/scripts/webgpu-gate/chrome-runner.mjs`; they
require that sibling Engine checkout and a local Chrome/WebGPU environment.

Cache evidence under `artifacts/workspaces-cache` records actual warm/repeat
runs, deleted-output recovery with byte hashes, and a temporary 2048 source edit
that must rebuild only that game. The source is restored in a `finally` path.
Browser evidence under `artifacts/workspaces-browser` clicks both real lobby
cards, checks served layout/bundle bytes against the independent builds, performs
real keyboard gameplay, captures screenshots and returns to the lobby. It records
revision, dirty state, input fingerprints and browser/device diagnostics through
the shared Engine Chrome runner. These are local integration checks, not formal
performance evidence.

Verified locally on 2026-10-30 with Node 24.19.0:

| Check | Result |
| --- | --- |
| Clean lockfile installation | `npm ci --offline --ignore-scripts` passed |
| Workspace coverage | 31 games + platform + tooling; 157 uniquely owned test files |
| Type checking | All 33 packages passed |
| Tests | 1,193 passed; repeated execution hit 33/33 cached tasks |
| Builds | All 31 games and platform passed; repetition hit 32/32 cached tasks |
| Cache recovery | Deleted bundles/maps restored byte for byte |
| Isolated invalidation | A 2048 source edit rebuilt only 2048; its test edit reran only its tests |
| Browser lifecycle | All 31 games passed screen and texture mounting/rendering/disposal (62 cases) |
| Lobby | 13 native lobby/gameplay checks and 4 published-entry checks passed |
| Preview | All 31 games packaged successfully |

The warm task runs reported 3.7 seconds for builds and 3.5 seconds for tests.
`artifacts/lerna-migration-summary.json` binds the results to configuration and
bundle fingerprints; detailed local logs and screenshots remain under `artifacts/`.
