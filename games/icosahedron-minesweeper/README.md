# Icosahedron Minesweeper

162 pentagonal/hexagonal cells on a rotating sphere. Left click reveals a cell; right click plants/removes a flag or chords a revealed number. Drag to orbit, wheel to zoom, R to restart.

The tile mesh uses a flat top, narrow bevel and tangent-plane UVs. Numbers 1–6, mines and wrong-flag crosses are baked into shared 256×256 PBR albedo textures; there are no projected labels or separate digit billboards. Hidden tiles use blue titanium, revealed tiles use pearl silver. A dark inner shell closes the gaps between tiles.

Flags consist of a planted collar, eight-sided metal pole and folded red pennant, constructed in each cell's tangent frame. Mesh pairs are allocated on first use and reused across flag toggles, restart and save restoration. Wrong flags retain a muted pennant above a crossed-out tile after a loss.

`assets/titanium-albedo.png` was generated with the built-in OpenAI image generator. The complete generation prompt is recorded in `assets/source.json` (pearl silver ceramic-coated brushed titanium, fine grain, uniform lighting, no text or borders). The renderer composes the state colors and crisp glyphs at startup, sharing materials across cells.

Validation from the Games directory:

```sh
npm run typecheck
npm test
npm run build:target -- game:icosahedron-minesweeper
node scripts/verify-icosahedron-minesweeper.mjs
```

The browser gate uses `?verify=1` with a deterministic board, real pointer picking and isolated browser storage. It checks reveal materials, flag placement/reuse, reset, orbit/zoom, restored states and loss visuals on desktop and mobile. Screenshots and source/asset fingerprints are saved under `.artifacts/icosahedron-minesweeper/`; screenshots require visual review and do not replace existing baselines.

The matching GUI atlas is `assets/orbit-gui.png`, generated with the built-in image generator; its complete prompt is in `assets/gui-source.json`. Native Engine GUI widgets use nine-slice crops for the header, counters, buttons and notification. Saved-game notifications last 2.8 seconds including a 400 ms fade; the `?` button opens the controls reminder. Win/loss messages stay visible until restart.

Mouse chording tracks `buttons` plus compatibility mouse events, since native pointer events only fire for the first button down and last button up. Left/right press and release orders all trigger exactly one chord; dragging, cancellation and changing cells suppress clicks. Picking refreshes the camera matrix immediately. Orbiting does not switch hover materials, and every tile albedo is uploaded before gameplay, preventing temporary white material placeholders.

The browser gate also samples hidden tile colors over a 23-frame orbit sweep and compares the returned camera view, checking for abrupt material/lighting changes. Focused input regression tests: `node --experimental-strip-types --test games/test/icosahedron-input.test.mjs`.

Controller input stays in pointer mode: sticks/D-pad move the crosshair, A reveals or drags to orbit, B toggles flags, LB/RB zoom and Y restarts. R3 alone leaves this mode unchanged; host return/switch chords still work. The crosshair and mouse share client coordinates, and the hover ray is refreshed before rendering whenever the pointer or camera changes. This also updates stationary selection after zoom, drag release and resize. Controller integration cases: `GAMEPAD_CASE=icosahedron-pointer,icosahedron-pointer-mobile,icosahedron-pointer-host node scripts/verify-gamepad.mjs` (set the environment variable separately in PowerShell).

Both minefields share four original WAV effects: a metal tile click, fabric/brass flag placement (lower pitch on removal), a bass/debris explosion and a short GUI confirmation. `SFX` / `OFF` toggles audio and survives restart. Flood opening and dual-button chords emit one cue per accepted gesture; restoring saves stays silent. Audio unlocks on input and stops on session pause or scene teardown. This adapter intentionally uses the Engine's experimental `OwnerSafeAudioMixer` with at most four voices. Regenerate assets with `node --experimental-strip-types scripts/generate-minesweeper-audio.mjs`; exact hashes and synthesis provenance are in `assets/audio/generation.json`. Focused tests: `node --experimental-strip-types --test games/test/minesweeper-audio.test.mjs`. Browser coverage includes real decoded buffers, cue counts, mute and GUI/keyboard restart.
