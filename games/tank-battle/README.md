# 铁甲前线 · Iron Outpost

An original Battle City-inspired pixel tank game for one player or two local cooperative players.
Five authored sectors, independent lives and upgrades, four enemy classes, destructible brick
quadrants, armored walls, slippery snow, water, forest cover, and a shared vulnerable base.

## Play

```sh
npm run build:target -- game:tank-battle
```

Serve the Games repository over HTTP and open `games/tank-battle/index.html`.
The manifest also adds the game to the generated Pages lobby.

- Player 1: WASD to move, J or Space to fire.
- Player 2: arrow keys to move, Enter or / to fire.
- P or Escape pauses/resumes. Losing focus pauses automatically. Touch controls operate player 1.
- Teammates cannot damage each other; either side's shots can destroy the base.
- Each player starts with three lives and receives a three-second shield when spawning.
- Clear all five sectors to win. An eliminated teammate rejoins with one life at the next sector.
- Enemy scouts are standard, runners are fast, gunners have two armor points and faster shells,
  and heavy tanks have four armor points. Every fourth enemy (starting with the third) flashes
  and drops a pickup when destroyed, including destruction by a bomb.
- Stars upgrade through four visible tank forms: standard, fast shells, two concurrent shells,
  and steel-breaking shells. Death resets the player's upgrade.
- Pickups: star, 10-second shield, enemy-clearing bomb, 10-second freeze, 20-second steel base
  fortification, or one extra life. All pickups award 500 points and expire after 15 seconds.
- Water blocks tanks but not shots. Forest hides tanks and shots. Snow retains momentum briefly.
- One Engine-backed autosave preserves the complete simulation, seed, players, timers and high
  score every five seconds, on pause, and at stage transitions. Continue explicitly after reload.

## Architecture and assets

`rules.ts` is a deterministic 60 Hz simulation with no DOM, audio or rendering dependency.
`render.ts` is a Canvas 2D sprite adapter with nearest-neighbor scaling. `main.ts` owns frame
timing, removable input listeners, sound, UI and the public Engine save integration.
Canvas 2D keeps this strictly pixel-based game playable without requiring a WebGPU adapter.

`sprites.ts` contains original 16×16 artwork. Regenerate the transparent PNG atlas, independent
terrain/tank/item PNGs, metadata and browsable asset gallery with Node 22.6+:

```sh
node --experimental-strip-types games/tank-battle/generate-assets.mjs
```

Open `assets/index.html` for the gallery. Player tanks have two colors, four upgrade forms and
two tread frames; enemies have four silhouettes plus a flashing palette. No external artwork,
fonts, CDN requests or image-generation service is required.

## Verification

```sh
node --experimental-strip-types --test games/test/tank-battle.test.mjs
npm run typecheck
npm test
npm run build
```

The browser smoke script `verify-browser.mjs` checks the actual single-player and cooperative
controls, pause/resume, mute, reload/continue, asset requests and responsive layout. It writes
reviewable screenshots under `artifacts/tank-battle/`. It uses the installed Chrome browser
through its DevTools protocol with no additional dependencies. Set `CHROME_PATH` when needed.
