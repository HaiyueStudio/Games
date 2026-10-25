# Classic Minesweeper

The classic configurable rectangular minefield uses the same blue titanium, pearl silver and brass visual theme as Icosahedron Minesweeper. `config.json` controls rows, columns and mine count (default 9×9 with 10 mines).

The board has a PBR metal tray, rounded tile bodies and beveled top faces. Numbers 1–8 are baked into shared PBR albedo textures on the actual tile tops; revealed tiles sink slightly. Flags have a planted brass collar/pole and folded pennant mesh. PBR mine spheres appear on loss; incorrect flags get a crossed tile face and muted pennant. Cached tile/flag/mine objects are reused on restart.

The existing generated `titanium-albedo.png` and `orbit-gui.png` assets are reused from the spherical game. Their original image-generation prompts are preserved in `assets/source.json` and `assets/gui-source.json`. No new image generation was needed. Both games share `games/shared/minesweeper/Theme.ts`, `MinesHud.ts` and `BoardGesture.ts`.

Left click reveals, right click flags or chords a revealed number, and left+right also chords. Drag to orbit and wheel/pinch to zoom. The `?` button shows controls. Notifications fade automatically; win/loss results stay until restart. The existing save-data shape and deferred mine placement (protecting the first click's 3×3 area) are preserved.

Validation from the Games directory:

```sh
npm run typecheck
npm test
npm run build:target -- game:minesweeper game:icosahedron-minesweeper
node scripts/verify-minesweeper.mjs
node scripts/verify-icosahedron-minesweeper.mjs
```

The deterministic `?verify=1` browser fixture checks real pointer picking, surface materials, first-click safety/flooding, planted mesh flags, object reuse, existing saves/timer, native mouse chord sequences, loss/win handling and the skinned restart button on desktop and mobile. Evidence and reviewed screenshots are saved under `.artifacts/minesweeper/`.

Both minefields share four original WAV effects: a metal tile click, fabric/brass flag placement (lower pitch on removal), a bass/debris explosion and a short GUI confirmation. `SFX` / `OFF` toggles audio and survives restart. Flood opening and dual-button chords emit one cue per accepted gesture; restoring saves stays silent. Audio unlocks on input and stops on session pause or scene teardown. This adapter intentionally uses the Engine's experimental `OwnerSafeAudioMixer` with at most four voices. Assets are synthesized offline with `node --experimental-strip-types scripts/generate-minesweeper-audio.mjs`; exact hashes and synthesis provenance are in `assets/audio/generation.json`. Focused regression tests: `node --experimental-strip-types --test games/test/minesweeper-audio.test.mjs`. The desktop/mobile browser fixture also checks real decoded buffers, cue counts, mute and GUI/keyboard restart.
