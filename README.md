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
| 鲸屿制造 / Whale Maker | 2D 平台跳跃 · 鲸鱼娘 / 粉团 · 关卡编辑器 / Engine GUI | [Local build](games/whale-maker/README.md) |
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
| Device Simulator | Phone / tablet icon desktop and game RTT | [Open](simulator/index.html) |
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

## Game OS and device simulator

The launcher UI (including loading and cards) uses Haiyue Engine GUI; device chassis use real 3D meshes.
Native buttons share rounded dark-glass, mint-primary and selected-chip styles, with 160 ms hover
color transitions, visible keyboard focus, pressed feedback and muted disabled states. Reduced motion
makes hover immediate. Mouse hover also maps into in-device loading/retry controls in either orientation.
Top-bar buttons use centered icons with transparent backgrounds and borders; tint distinguishes
normal, hover, selected, keyboard-focus and pressed states.
Button theme states are immutable cached values, including nested insets, so unchanged controls do not
invalidate the entire GUI. Catalog selection retains existing card visibility, and the clock updates once per minute.
For local CPU/frame diagnostics, run `node scripts/profile-game-os.mjs` (`GAME_OS_PROFILE` names the artifact folder).
Cards use vivid genre tags and controller/touch/keyboard icons. Games mount in the current
document through a route component, not an iframe. Browser back/forward and direct links
select the same route; `?game=2048&device=phone` and `?game=2048&device=pad` open a device screen.

Choose **设备模拟器** for a swipeable icon desktop, or open `simulator/index.html` independently.
Phone and tablet screens render a live game texture with mapped touch/drag, keyboard and gamepad
input. Drag outside the screen to orbit the camera, scroll to zoom, and use **相机复位** to reset.
The thin tablet Home key and the phone's on-screen Home bar return to the device desktop and cancel pending launches.
Both chassis are 25% thinner. The phone uses edge-to-edge rounded glass with a small camera cutout.
Rounded-rectangle icons form a 5-row, 4-column portrait grid on tablet and a 7-row, 4-column grid on phone.
Landscape transposes those grids without changing page capacity (20 and 28 games respectively).
Orbit the camera around the chassis to switch orientation automatically; there is no rotation button.
Projected screen direction selects all four quarter-turns with hysteresis and a short stability delay.
The screen rotates with an eased, fitted transition while the same game retains its progress.
The icon desktop, loading and perspective touch mapping reflow together; the phone Home bar follows the screen rotation.
An independent liquid-prism shader animates the device wallpaper; the launcher uses the selected game's image.
Reduced-motion preferences freeze the wallpaper and skip the rotation tween.
Click the upper/lower side volume keys to raise/lower game output by 10%. A transient Engine GUI
volume bar appears at the top of the device screen, including during loading and in landscape.
Device volume persists across Home, game changes and device changes, independently of each game's mute setting.
The Game OS includes an original 32-second calm ambient loop and ethereal glass click, selection,
launch, return and volume cues. Audio loads only after a user gesture, fades out during gameplay,
and suspends while hidden. The top-right gear opens a native settings modal with independent,
persisted sound-effect and background-music switches. The simulator retains its combined sound toggle.
Regenerate PCM assets with `node --experimental-strip-types scripts/generate-launcher-audio.mjs`;
run `node scripts/verify-launcher-audio.mjs` and `node scripts/verify-simulator-volume.mjs` for real output-sample checks.
Games retain their original `games/<id>/index.html` standalone entrypoints.

Game code is imported only when selected; Gravity Maze also retains its internal lazy
chunks. A shared Engine loading screen covers code, resource bytes and initialization, with
cancel/retry. Returning or switching aborts pending work and disposes game listeners, timers,
workers, audio and graphics resources. In device mode, loading, progress, errors and retry are
drawn inside the device screen; the chassis and camera persist across game/home transitions.
The simulator itself is a separate lazy module.

Every built game exports the same API:

```js
const { mountGame } = await import('./games/2048/bundle.js');
const controller = new AbortController();
const game = await mountGame({
  root: document.querySelector('#game'),
  signal: controller.signal,
  mode: 'screen',
  onProgress: progress => console.log(progress.phase, progress.loaded, progress.bytes),
  onHome: () => controller.abort(),
});
game.pause();
game.resume();
game.setVolume(0.5);
game.dispose();
```

Give the host element an explicit size. Dispose with `game.dispose()` or `controller.abort()`.
Texture mode accepts `width`/`height` in CSS pixels and uses DPR 1. `game.engine` owns
`game.texture`; sample it on the same GPU device. `game.layers` exposes auxiliary canvases
for older multi-canvas games, composited behind the main texture by the device presenter.
Legacy image/SVG/background decorations are included as a separate layer. Multi-pass RTTs retain
MSAA scene samples so later HUD passes do not erase the scene. For a separate GPU device,
`game.presentFrame()` copies the RTT to its browser canvas; copy that canvas with
`copyExternalImageToTexture` rather than sharing a GPUTexture across devices. The device presenter
uses this GPU-backed bridge without per-frame CPU readback and preserves screen color space.
`game.resize(width, height)` updates the mounted viewport and render target while retaining game state.
`game.pointer(type, x, y, id)` accepts normalized screen coordinates; `game.key(code, down)`
and `game.wheel(x, y, deltaX, deltaY)` forward other input. Do not destroy borrowed GPU resources.
The mount promise resolves after asynchronous bootstrap, initial resources and the first frame.

Build selected modules with `npm run build:target -- game:2048` (the host and simulator are
included). Run `node scripts/verify-game-host.mjs` for screen/RTT lifecycle verification and
`node scripts/verify-game-os.mjs --simulator` for native device navigation and touch coverage.
Run `node scripts/verify-simulator.mjs` for all manifest games in both real device screens,
including in-screen loading/cancel, camera orbit, physical Home and final-composite pixel checks.
Each game rotates in place between portrait and landscape in both device modes; browser checks
also cover preserved game state, perspective touch input and rotated mobile viewport fitting.
Camera checks use real pointer drags, verify intermediate animation frames and compare wallpaper
pixels over time. Separate game/auxiliary-layer pixel checks prevent wallpaper colors from hiding blank games.

## Gamepad controls

Manifest games and the lobby support standard browser gamepads. Use the D-pad/stick to
select a game, A to enter, and LB/RB to change categories. In games, Back toggles the
return confirmation dialog and pauses gameplay. R3 switches the virtual pointer;
R3+LB/RB switches games.
See [controller mappings and verification](games/gamepad/README.md) and
[unpublished package provenance](vendor/README.md).

## Local development

Use Node.js 22.22.2, a compatible Node 24 (24.15+), or Node 26. Local Haiyue dependencies are packed from source and included
in `vendor/`, so installing Games does not require sibling repositories:

```bash
npm ci
npm run workspaces:check
npm run typecheck
npm test
npm run build
```

The repository uses **npm workspaces + Lerna 10 / Nx task caching**. Each of the 31
manifest games is a private package; the lobby, host and shared runtime form the
platform package. Source and published URLs remain under `games/<id>`.

```bash
# Build one game and its shared platform dependency:
npm run build:target -- game:2048
# Work on only the two migration pilot games:
node scripts/run-workspaces.mjs build 2048 whale-maker
node scripts/run-workspaces.mjs test 2048 whale-maker
node scripts/run-workspaces.mjs typecheck 2048 whale-maker
# Standard Lerna and npm workspace commands also work:
npx lerna run build --scope @haiyue/game-whale-maker
npm test --workspace @haiyue/game-2048
```

See [workspace layout, cache rules and migration verification](MONOREPO.md).

To build and temporarily install fresh candidates from sibling `Engine` and `UI`
repositories during development:

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

MUGEN is maintained separately in the sibling `../mugen` repository. Its source, local characters,
viewer, tests and verification commands no longer participate in Games builds or deployment.
Run `npm ci`, `npm run build` and `npm run dev` in `../mugen`; see its README for standalone usage.
`npm test` and `npm run test:all` run all remaining Games suites.

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
MUGEN retains its import/runtime/game/viewer boundaries in the independent sibling repository.

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
and recent launches. `catalog/` owns presentation metadata, URL resolution and filtering;
`state/` owns local launcher preferences, and `games/launcher/` owns native Engine GUI controls.
Game entries and screenshots still come from `games/manifest.json`.

Use arrow keys to select a cover, Enter to launch, F to favorite, and `/` to search.
Escape returns from the embedded game to its selected cover. On a controller, A launches,
X favorites, Y cycles library views, and LB/RB change categories. In-game Back pauses
and asks whether to return home; R3+LB/RB switches games and R3+Start opens the same confirmation. Favorites and launch history are
local to this browser and do not replace gameplay saves. The launcher adapts to phone
portrait/landscape screens and respects reduced-motion preferences.

Open `index.html` or `site/index.html` with Live Server after `npm run build`.
Both source entrypoints resolve game URLs independently of the server's root folder;
`npm run preview:build` also configures the published entrypoint for its own `games/` folder.

The Game OS desktop uses one Haiyue Engine canvas. A pale-blue crescent logo and glass
wordmark sit beside three top-bar icons for the library, favorites and simulator. The logo and
browser favicon share the user-supplied `site/assets/haiyue-logo.png`. Search lives in the top-right
bar; compact screens expand it from a search icon. Settings remain modal for keyboard and controller input.
The selected or mouse-hovered game's image covers the viewport behind native GUI panels, images,
buttons, search, scroll view and connection notifications. Images crossfade over 650 ms
after loading; rapid selection keeps the latest requested picture, and idle backgrounds
remain still. No hidden DOM interface
supplies layout or interaction. Engine's invisible browser text responder provides IME
only while the native GUI search field is focused. The selected game's module mounts
in the current document; its own Engine owns all gameplay UI.
`games/launcher/` owns the renderer and its activity lifecycle; its public entry is
exported by the existing lobby bundle. Opening or switching embedded games stops the
desktop Engine loop; returning resumes it. Hidden tabs and back/forward cache suspension
also stop rendering. Direct game links initialize without rendering desktop frames.
Reduced motion switches background images immediately.
The smaller single-row carousel sits near the bottom edge, without a list heading, count or category
filter chips. It supports mouse/trackpad wheels, horizontal dragging, touch inertia and previous/next
buttons. Direction keys and LB/RB reveal the selected card; search starts at the first result.
Mouse hover previews a game's wallpaper through the same crossfade, and leaving restores the
selected game's wallpaper without changing selection or launching a game. Cards show only their
covers until hovered or selected, then reveal their title and genre/2D-or-3D/controller
tags over the image. Keyboard and controller selection adds a soft mint bloom border.
Mouse hover gently enlarges cards by 4.5%, tilts them by 1.2 degrees and lifts them
by two pixels, easing back on exit without moving their native hit regions.
Reduced motion makes scrolling and card information transitions immediate and disables card movement.

Run `node scripts/verify-game-os.mjs` (`--cards`, `--portrait`, `--direct`, `--root` or `--published`) for browser checks
covering native pointer launch, search/favorites, paused frame counts, and repeated
launch/return. Screenshots and WebGPU diagnostics are written to `artifacts/gamepad/`.

## Publishing

Pushes to `master` or `main` deploy the lobby through GitHub Actions. The workflow can also be started manually
from the Actions tab. The repository's Pages source must be set to **GitHub Actions** once in repository settings.

When adding a game, add its entry to `games/manifest.json`, provide `games/<id>/index.html`, and add the target to
the Rollup configuration. The Pages build fails if a manifest entry is missing its HTML page or JavaScript bundle.

Moonlight Sudoku (LED Sudoku) is maintained in the private [MoonlightSudoku repository](https://github.com/HaiyueStudio/MoonlightSudoku).
