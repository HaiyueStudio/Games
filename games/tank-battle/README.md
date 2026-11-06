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
- Menu: WASD / arrows or controller stick / D-pad selects; Enter / Space / J or A / X confirms.
  The highlighted choice starts 1P or 2P; paused games also offer Continue.
- Controller: A / X fires, Start pauses/resumes; a second controller operates 2P.
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
- The first sector has a 64-pixel-deep central brick barricade and a double-layer base roof;
  both player exit lanes remain open. Start a new game to use the revised map; saved terrain is preserved.
- Enemies probe aligned routes before turning, avoid immediate reversals when a clear route exists,
  and wait briefly when blocked instead of changing direction every frame.
- One Engine-backed autosave preserves the complete simulation, seed, players, timers and high
  score every five seconds, on pause, and at stage transitions. Continue explicitly after reload.

## Architecture and assets

`rules/rules.ts` is a deterministic 60 Hz simulation with no DOM, audio or rendering dependency.
`rendering/render.ts` renders pooled battlefield sprites and effects with public Engine GUI,
using the existing four-direction atlas. Five ordered GUI roots preserve terrain, tanks, forest, pickups
and effect layering before the HUD root. One WebGPU canvas and one GUI system render both
the battlefield and interface; no Canvas 2D battlefield or per-frame texture upload is used.
The atlas is expanded once with pixelated sampling to retain crisp edges with the installed GUI sampler.
`ui/TankBattleHud.ts` renders the complete interface with public Engine `GuiRoot`, `GuiLabel`, `GuiButton` and
`GuiImage` components, through `GuiSystem` and `RenderIntegration`. Menus, player status,
terrain/supply legends and touch controls are engine GUI elements, not DOM widgets.
`game/TankBattle.ts` runs the fixed simulation from the Engine update event and owns removable input,
audio and autosave. The GUI now requires a WebGPU-capable browser. The GUI world,
engine and expanded bitmap are destroyed on teardown; resize changes the existing elements rather than recreating them.
Menu selection uses Engine `GuiFocusManager`. The HUD disables automatic GUI keyboard navigation
with an explicit `InputMap`, routing shared movement/fire keys to menu controls only while the menu is open.
`RenderIntegration` remains an intentional experimental dependency.
`input/pointerCapture.ts` guards stale native capture calls from the installed GUI's deferred touch
dispatch, preserving concurrent live touches and restoring the canvas methods on teardown.

`rendering/sprites.ts` contains original 16×16 artwork. Regenerate the transparent PNG atlas, independent
terrain/tank/item PNGs, metadata and browsable asset gallery with Node 22.6+:

```sh
node --experimental-strip-types games/tank-battle/generate-assets.mjs
```

Open `assets/index.html` for the gallery. Player tanks have two colors, four upgrade forms and
two tread frames; enemies have four silhouettes plus a flashing palette. No external artwork,
fonts, CDN requests or image-generation service is required.

## Verification

```sh
node --experimental-strip-types --test games/test/tank-battle.test.mjs games/test/tank-battle-gui.test.mjs
npm run typecheck
npm test
npm run build
```

The browser smoke script `verify-browser.mjs` checks the actual single-player and cooperative
controls, pause/resume, mute, reload/continue, asset requests and responsive layout. It writes
reviewable screenshots under `artifacts/tank-battle/`. It uses the installed Chrome browser
through its DevTools protocol with no additional dependencies. Set `CHROME_PATH` when needed.
The checks click actual Engine GUI rectangles (no DOM button proxies), validate atlas glyph
coverage and CSS/GUI viewport agreement, and exercise high-DPI resizing and two-finger controls.

## 手机 / Native

手机打开时使用独立 1P 界面，左侧虚拟摇杆、右侧长按开火，可双指操作。
摇杆有中心死区、四方向判定、移动范围限制和松手回中。手机采用横屏，无需滚动；竖屏时暂停并提示旋转。标准手柄支持 1P：摇杆移动，A 开始/开火，Start 暂停。
`mobile/MobileTankGame.ts` 的战场与 HUD 全部由 Engine GUI 绘制；桌面保留单人/双人模式。
手机单独保存 1P 进度，不会把桌面双人存档加载到手机。切后台会暂停并清除输入。
按钮贴图是已随项目保存的生成素材，来源见 `assets/controls-art.md`；不需要在线生成。

Native 独立副本在 `Native/games/tank-battle`，原生工程在 `Native/examples/tank-battle`，
遵循该仓现有 NativeScript / 原生 WebGPU 方案。原生版不依赖本 Games 仓运行。
新增手机输入测试：`node --experimental-strip-types --test games/test/tank-battle-mobile.test.mjs`。
