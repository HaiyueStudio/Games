# HaiyueStudio Games

Runnable games and product-level integration scenarios built only from public Engine and Extensions packages.

Until the `0.1.x` packages are published, run `npm run pack:candidates` in the sibling `Engine` repository and
then `npm run deps:local` here. The game manifest keeps the supported `>=0.1.0 <0.2.0` package window while
local validation uses exact `0.1.0` tarballs.

Repository-wide build, TypeScript, and dependency configuration lives at the repository root. The `games/`
directory contains only game sources, game-facing shared code, the game manifest, and deterministic game tests.

Every manifest game has one LocalStorage-backed `autosave` slot through `@haiyue/engine/save`. Games persist
only serializable gameplay state; renderer resources, physics handles, DOM nodes, and listeners are rebuilt at
startup. Shared queueing, validation failure handling, and the one-slot policy live in
`games/save/SingleSlotGameSave.ts`.

```bash
npm run typecheck
npm test
npm run build:target -- game:minecraft-lite
```
