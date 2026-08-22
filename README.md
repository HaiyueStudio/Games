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
| 2048 | 2D puzzle | [Play](https://haiyuestudio.github.io/Games/?game=2048) |
| 3D Billiards | 3D physics | [Play](https://haiyuestudio.github.io/Games/?game=billiards-3d) |
| Billiards | 2D physics | [Play](https://haiyuestudio.github.io/Games/?game=billiards) |
| Calendar Puzzle | 2D puzzle | [Play](https://haiyuestudio.github.io/Games/?game=calendar-puzzle) |
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
| Sky Strike | 2D bullet hell | [Play](https://haiyuestudio.github.io/Games/?game=sky-strike) |
| Sokoban 3D | 3D puzzle | [Play](https://haiyuestudio.github.io/Games/?game=sokoban-3d) |
| Spider Solitaire | 2D card game | [Play](https://haiyuestudio.github.io/Games/?game=spider-solitaire) |
| Sudoku | 2D puzzle | [Play](https://haiyuestudio.github.io/Games/?game=sudoku) |
| Tetris | 2D arcade | [Play](https://haiyuestudio.github.io/Games/?game=tetris) |
| WFC Map | Procedural generation | [Play](https://haiyuestudio.github.io/Games/?game=wfc-map) |

The lobby is generated from `games/manifest.json`, so the manifest remains the source of truth for the published
game list. Direct links use `?game=<id>` and open the selected game automatically.

## Local development

Use Node.js 22 or newer. Until the `0.1.x` packages are published, keep the `Engine` and `Games` repositories in
the same parent directory and install local package candidates:

```bash
cd ../Engine
npm ci
npm run pack:candidates

cd ../Games
npm run deps:local
npm run typecheck
npm test
npm run build
```

Build a single game while iterating:

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

Every manifest game has one LocalStorage-backed `autosave` slot through `@haiyue/engine/save`. Games persist
only serializable gameplay state; renderer resources, physics handles, DOM nodes, and listeners are rebuilt at
startup. Shared queueing, validation failure handling, and the one-slot policy live in
`games/save/SingleSlotGameSave.ts`.

## Repository layout

- `games/`: game sources, HTML entry points, game-facing shared code, manifest, and deterministic tests.
- `scripts/`: repository build, local dependency, target selection, and preview-site tooling.
- `site/`: source files for the GitHub Pages game lobby.
- `.github/workflows/deploy-pages.yml`: builds Engine package candidates, all games, and the Pages artifact.

## Publishing

Pushes to `master` or `main` deploy the lobby through GitHub Actions. The workflow can also be started manually
from the Actions tab. The repository's Pages source must be set to **GitHub Actions** once in repository settings.

When adding a game, add its entry to `games/manifest.json`, provide `games/<id>/index.html`, and add the target to
the Rollup configuration. The Pages build fails if a manifest entry is missing its HTML page or JavaScript bundle.
