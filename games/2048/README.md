# 2048 Forge

The existing 6 × 6 game and autosave format now use brushed-metal PBR surfaces, rounded tiles, a machined chassis and metallic Engine GUI panels. Steel, oxidized copper and gold identify successive tile ranks. Albedo is sRGB; normal and packed metallic/roughness maps are linear (G = roughness, B = metallic).

A merge preserves both source coordinates from the deterministic rules. Each pair slides together, separates into 384 independent triangles using `subdivideGeometryTriangles` and `separateGeometryTriangles`, then reconstructs the higher-value tile over 480 ms. Sparks, a spawn/settle bounce and a rank-dependent forging sound complete the animation. One geometry batch per simultaneous merge is reused; restarting clears active effects and queued input. Arrow keys, WASD and mouse/touch swipes work, with one buffered move during animation. The OS reduced-motion preference skips disintegration and bounce.

Five original PCM effects provide slide, fracture, forging, new-game and blocked-move feedback. Audio unlocks on interaction, respects session pause, persists the mute preference and caps simultaneous voices at eight. All assets ship locally; no runtime image/audio services are required.

## Engraved tile numerals

Every value uses three cached 256 × 512 atlas images: albedo, tangent-space normal and packed metallic/roughness. The upper half contains the numeral; the lower half is plain metal for side faces. UVs follow physical top-face positions, so numerals remain upright and do not stretch over the rounded edges. The fragment source uses the same atlas mapping, carrying the numeral through disintegration and reassembly. There are no floating GUI tile labels or screen-space text projection.

`rendering/TileTexture.worker.js` rasterizes exact numerals, computes their distance field and bevel height, then derives normal-map gradients. Deep pockets, broad cut edges and 1.7 normal strength create visible engraved relief under the existing PBR lights. Standard values 2–2048 are prepared before rendering; higher ranks and restored values use the same per-value cache. Raster work runs in a dedicated module Worker, which is terminated on disposal. These images are generated locally from the existing metal asset; no network generation service is used.

## Assets

`assets/brushed-metal.png`, `assets/metal-panel.png` and the transparent `assets/metal-title.png` wordmark were generated with the built-in imagegen tool. Only the metallic 2048 wordmark remains at the upper left; decorative subtitles, slogans and instructions have been removed. Exact prompts are in `assets/provenance.json`. `assets/generate-assets.mjs` deterministically creates the two periodic PBR data maps and five original, inharmonic modal-synthesis WAV files:

```sh
node games/2048/assets/generate-assets.mjs
```

## Validation

```sh
npm run build:target -- game:2048
node --experimental-strip-types --test games/test/2048-*.test.mjs
node games/2048/verify-browser.mjs
```

The browser verifier uses installed Chrome (`CHROME_PATH` may override the Windows default), a deterministic board/spawn sequence and controlled animation frames. It checks desktop, phone, high-DPI touch, landscape, triangle pool reuse, reset during a merge, mute, queued input, reduced motion and WebGPU errors. It also exports the actual numeral PBR maps and compares the rendered normal-map-on/off closeups. Screenshots and the report go to `artifacts/2048/`. The `?verify=1` fixture never reads or writes a player's autosave.
