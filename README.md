# HaiyueStudio Games

[![Deploy GitHub Pages](https://github.com/HaiyueStudio/Games/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/HaiyueStudio/Games/actions/workflows/deploy-pages.yml)
[![Play online](https://img.shields.io/badge/play-online-22d3a7)](https://haiyuestudio.github.io/Games/)

Runnable games and product-level integration scenarios built with the public APIs of
[HaiyueStudio Engine](https://github.com/HaiyueStudio/Engine). The collection covers WebGPU rendering,
physics, audio, procedural generation, input, and the engine's shared save system.

## Play online

Open the [GitHub Pages game lobby](https://haiyuestudio.github.io/Games/) to search, filter, and run any game
without a local build. A modern desktop browser with WebGPU enabled is recommended for 3D games.

| Game | Type | Online preview |
| --- | --- | --- |
| 玻璃疾驰 / Glass Rush | 霓虹弯曲隧道生存 · 玻璃球 / Engine GUI / 本机 TOP 5 | [Local build](games/glass-rush/README.md) |
| 谷外之光 · Beyond the Valley | 3D orthographic illusion puzzle | [Play](https://haiyuestudio.github.io/Games/?game=valley-of-light) |
| 铁甲前线 · Tank Battle | 2D pixel arcade, 1–2 players | [Play](https://haiyuestudio.github.io/Games/?game=tank-battle) |
| 2048 | 2D puzzle | [Play](https://haiyuestudio.github.io/Games/?game=2048) |
| 水果忍者 · Fruit Ninja | 2D arcade · blade trail, juice particles, bombs and time bonuses | [Local build](games/fruit-ninja/README.md) |
| 3D Billiards | 3D physics | [Play](https://haiyuestudio.github.io/Games/?game=billiards-3d) |
| Billiards | 2D physics | [Play](https://haiyuestudio.github.io/Games/?game=billiards) |
| Triangle Calendar Puzzle | 2D puzzle | [Play](https://haiyuestudio.github.io/Games/?game=triangle-calendar-puzzle) |
| Entanglement Path | 2D puzzle | [Play](https://haiyuestudio.github.io/Games/?game=entanglement-path) |
| Icosahedron Minesweeper | 3D puzzle | [Play](https://haiyuestudio.github.io/Games/?game=icosahedron-minesweeper) |
| Gravity Maze | 3D physics | [Play](https://haiyuestudio.github.io/Games/?game=gravity-maze) |
| Match 3 | 2D puzzle | [Play](https://haiyuestudio.github.io/Games/?game=match-3) |
| Minesweeper | 2D puzzle | [Play](https://haiyuestudio.github.io/Games/?game=minesweeper) |
| Minecraft Lite | 3D sandbox | [Play](https://haiyuestudio.github.io/Games/?game=minecraft-lite) |
| Pad Simulator | Audio and input | [Play](https://haiyuestudio.github.io/Games/?game=pad-simulator) |
| Pac-Man | 2D arcade | [Play](https://haiyuestudio.github.io/Games/?game=pacman) |
| Piano | Audio and input | [Play](https://haiyuestudio.github.io/Games/?game=piano) |
| 墨游 · 龙鲤 / Ink Pinball | 2D physics · 水墨山水 / WGSL 墨迹扩散 / WASD | [Local build](games/ink-pinball/README.md) |
| 纸上弹球 / Notebook Pinball | 2D physics · 手绘素描 / 练习本格子 / WASD | [Local build](games/pinball/README.md) |
| Pong | 3D arcade | [Play](https://haiyuestudio.github.io/Games/?game=pong) |
| AK47 Range / 前线训练场 | 横屏生存射击 · 掩体寻路 / 90° 迷雾 / 骨骼持枪 | [Local build](games/ak47-range/README.md) |
| Rubiks Cube / 魔方实验室 | 3D puzzle · 2×2 / 3×3 / 4×4 / mirror | [Local build](games/rubiks-cube/README.md) |
| Sky Strike | 2D bullet hell | [Play](https://haiyuestudio.github.io/Games/?game=sky-strike) |
| Sokoban 3D | 3D puzzle | [Play](https://haiyuestudio.github.io/Games/?game=sokoban-3d) |
| Spider Solitaire | 2D card game | [Play](https://haiyuestudio.github.io/Games/?game=spider-solitaire) |
| Sudoku | 2D puzzle | [Play](https://haiyuestudio.github.io/Games/?game=sudoku) |
| Tetris | 2D arcade | [Play](https://haiyuestudio.github.io/Games/?game=tetris) |
| WFC Map | Procedural generation | [Play](https://haiyuestudio.github.io/Games/?game=wfc-map) |

The lobby is generated from `games/manifest.json`, so the manifest remains the source of truth for the published
game list. Direct links use `?game=<id>` and open the selected game automatically.

## Gamepad controls

All manifest games and the lobby support standard browser gamepads. Use the D-pad/stick to
select a game, A to enter, and LB/RB to change categories. In games, Back toggles the
return confirmation dialog and pauses gameplay. R3 switches the virtual pointer;
R3+LB/RB switches games.
See [controller mappings and verification](games/gamepad/README.md) and
[unpublished package provenance](vendor/README.md).

## Local development

Use Node.js 22 or newer. Until the `0.1.x` packages are published, keep the `Engine`, `UI`, and `Games`
repositories in the same parent directory and install local package candidates:

```bash
cd ../Engine
npm ci
npm run pack:candidates

cd ../UI
npm ci
npm run pack:candidate

cd ../Games
npm run deps:local
npm run typecheck
npm test
npm run build
```

`npm test` temporarily excludes the unfinished MUGEN tests. Use `npm run test:mugen`
to run only MUGEN, or `npm run test:all` to include it. Other tests retain their normal
failure behavior. The browser controller runner also skips MUGEN by default; select
its cases explicitly through `GAMEPAD_CASE` when needed.

Watch all games and the lobby while iterating:

```bash
npm run dev
# Limit initial builds and watching to selected games (the lobby is always included):
npm run dev -- game:tank-battle
npm run dev -- game:2048 game:tank-battle
# Build the same selection once, then exit with a failure status if any target failed:
npm run dev -- --once game:tank-battle
```

The watcher queues one isolated Rollup process at a time and closes it after each build,
so TypeScript/Rollup state cannot accumulate across games or repeated rebuilds. Each child
keeps the existing 2048 MiB heap limit. Source changes rebuild the owning game and any
known importers; shared/configuration changes rebuild affected targets. Generated bundles
and chunks do not trigger rebuilds. Failed builds stay watchable; Ctrl+C closes the watcher
and its active build. Restart the command after changing `games/manifest.json`.
`GAME_FILTER` also accepts comma-separated game IDs when no IDs are passed on the command line.
This command builds/watches files; serve the repository with your usual local HTTP server.

Build a single game without watching:

```bash
npm run build:target -- game:minecraft-lite
```

Build the complete static preview after the game bundles exist:

```bash
npm run preview:build
npx serve artifacts/pages
```

The preview command writes only generated files under `artifacts/pages`; the directory is ignored by Git.

## Save behavior

Most manifest games have one LocalStorage-backed `autosave` slot through `@haiyue/engine/save`. Games persist
only serializable gameplay state; renderer resources, physics handles, DOM nodes, and listeners are rebuilt at
startup. Shared queueing, validation failure handling, and the default one-slot policy live in
`games/save/SingleSlotGameSave.ts`.

## Repository layout

Game source is grouped by responsibility. Keep the manifest `main.ts` entry stable;
large browser bootstraps live in `app/`, controllers in `game/`, deterministic state
and rules in `rules/`, input adapters in `input/`, and presentation in `rendering/`,
`effects/`, `textures/` and `ui/`. Audio, saves, generation and navigation use their
own folders where needed. Shared collection/rendering helpers live in `games/shared/`.
MUGEN retains its existing import/runtime/game/viewer boundaries and public preview entry.

Use Engine's public `FixedStepClock` for fixed-rate scheduling and `GameSaveService`
for persistence/integrity/write ordering. Tank desktop/mobile share one game-specific
simulation adapter; phase changes stop the current tick batch. The map player migrates
legacy checkpoints only after a successful Engine save. Game rules, authored shaders,
pixel artwork, synthesis and presentation policy remain game-owned. Existing seeded
algorithms are retained where changing the generator would invalidate saved/replay state.

The gamepad adapter deliberately uses the vendored unpublished Engine input candidate;
it must not deep-import the sibling Engine source tree. Browser/native audio adapters
that already use `OwnerSafeAudioMixer` retain their public API boundary.

- `games/`: game sources, HTML entry points, game-facing shared code, manifest, and deterministic tests.
- `scripts/`: repository build, local dependency, target selection, and preview-site tooling.
- `site/`: source files for the GitHub Pages game lobby.
- `.github/workflows/deploy-pages.yml`: builds Engine package candidates, all games, and the Pages artifact.

## Game launcher

The launcher in `site/` provides a focused game preview, searchable catalog, favorites,
and recent launches. `catalog/` owns presentation metadata and filtering, `state/` owns
local launcher preferences, and `ui/` owns cards and the embedded player presentation.
Game entries and screenshots still come from `games/manifest.json`.

Use arrow keys to select a cover, Enter to launch, F to favorite, and `/` to search.
Escape returns from the embedded game to its selected cover. On a controller, A launches,
X favorites, Y cycles library views, and LB/RB change categories. In-game Back pauses
and asks whether to return home; R3+LB/RB switches games and R3+Start opens the same confirmation. Favorites and launch history are
local to this browser and do not replace gameplay saves. The launcher adapts to phone
portrait/landscape screens and respects reduced-motion preferences.

The Game OS desktop is rendered through Haiyue Engine: a WGSL aurora/grid wallpaper
and three GUI layers for panels, covers, and foreground controls. The DOM supplies
responsive layout, accessible controls, native search/IME, and keyboard/gamepad focus.
`games/launcher/` owns the renderer and its activity lifecycle; its public entry is
exported by the existing lobby bundle. Opening or switching embedded games stops the
desktop Engine loop; returning resumes it. Hidden tabs and back/forward cache suspension
also stop rendering. Direct game links initialize without rendering desktop frames.
Without WebGPU, the semantic HTML remains usable. Reduced motion freezes the wallpaper.

Run `node scripts/verify-game-os.mjs` (`--portrait` or `--direct`) for browser checks
covering native pointer launch, search/favorites, paused frame counts, and repeated
launch/return. Screenshots and WebGPU diagnostics are written to `.artifacts/game-os/`.

## Publishing

Pushes to `master` or `main` deploy the lobby through GitHub Actions. The workflow can also be started manually
from the Actions tab. The repository's Pages source must be set to **GitHub Actions** once in repository settings.

When adding a game, add its entry to `games/manifest.json`, provide `games/<id>/index.html`, and add the target to
the Rollup configuration. The Pages build fails if a manifest entry is missing its HTML page or JavaScript bundle.

Moonlight Sudoku (LED Sudoku) is maintained in the private [MoonlightSudoku repository](https://github.com/HaiyueStudio/MoonlightSudoku).
