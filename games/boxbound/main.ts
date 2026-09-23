import {reversePlayerCrossing, viewAction, playerMirrored} from './model';
import { HaiyueEngine } from '@haiyue/engine';
import { MemorySaveBackend } from '@haiyue/engine/save';
import { createGame, resetLevel, advanceGame } from './levels';
import {
  clone,
  levelIds,
  transition,
  canJump,
  reverseTransfers,
  outerExitBarriers,
  gateOpen,
  gatePowered,
  type GateRecoil,
  type BoxTransfer,
  type PlayerCrossing,
  type Action,
  type State,
  type Vec,
} from './model';
import { BoxboundSaves } from './saves';
import { BoxboundScene } from './scene';
import { MAP_TOP_PHI } from './camera-view';
import { WALK_MS } from './visuals';
import { remember, type UndoEntry } from './history';
import { profileBoxbound } from './performance';
import { installWorldMap, loadWorldMap } from './world-map';
import { BoxboundAudio } from './audio';
import { finishedLevel, returnFromCompletedLevel } from './completion';
import { soundCues, SOUND_NAMES } from './sound-events';
import { containmentTransform, transformPoint } from './space-view';
import { mat4 } from 'wgpu-matrix';
const $ = <T extends HTMLElement = HTMLElement>(id: string): T =>
  document.getElementById(id) as T;
const params = new URLSearchParams(location.search),
  testing = params.has('verify');
const directions: Record<string, Vec> = {
  w: [0, 0, -1],
  arrowup: [0, 0, -1],
  s: [0, 0, 1],
  arrowdown: [0, 0, 1],
  a: [-1, 0, 0],
  arrowleft: [-1, 0, 0],
  d: [1, 0, 0],
  arrowright: [1, 0, 0],
};
async function main() {
  installWorldMap(await loadWorldMap(new URL('./levels/index.json', location.href), async (url) => {
    const response = await fetch(url, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`无法加载地图 ${url.pathname}：HTTP ${response.status}`);
    return response.json();
  }));
  const engine = new HaiyueEngine({
    canvas: $<HTMLCanvasElement>('canvas'),
    clearColor: { r: 0.9294, g: 0.9412, b: 0.8745, a: 1 },
    msaaSamples: 4,
    renderProfile: 'batched',
    devicePixelRatio: () => Math.min(devicePixelRatio, 2),
  });
  await engine.init();
  let visualTime = 0;
  const clock = () => (testing ? visualTime : performance.now());
  const audio = new BoxboundAudio(clock);
  const unlockAudio = (event: Event) => { if (event.isTrusted) void audio.unlock(); };
  window.addEventListener('pointerdown', unlockAudio, { capture: true });
  window.addEventListener('keydown', unlockAudio, { capture: true });
  const scene = new BoxboundScene(engine, $<HTMLCanvasElement>('canvas'), $('labels'), clock),
    saves = new BoxboundSaves(testing ? new MemorySaveBackend() : undefined);
  let state = createGame(),
    history: UndoEntry[] = [],
    slot = 1,
    activeSlot: number | null = null,
    home = true,
    busy = false,
    lastInput = 0,
    disposed = false;
  let summaries = await saves.summaries().catch(() => {
    $('slot-summary').textContent = '存档暂时不可用';
    return [];
  });
  let pendingAction: Action | { type: 'hop' } | null = null;
  let pendingUndo = 0;
  let pendingCompletion: { level: number; state: State } | null = null;
  const heldDirections = new Map<string, Vec>();
  const clearDirections = () => {
    heldDirections.clear();
    pendingAction = null;
    pendingUndo = 0;
  };
  const dialog = $<HTMLDialogElement>('dialog');
  const errors: string[] = [];
  engine.device.addEventListener('uncapturederror', (event) => {
    errors.push(event.error.message);
    fail(event.error);
  });
  function paint() {
    scene.home = home;
    document.body.classList.toggle('playing', !home);
    $('home').hidden = !home;
    $('hud').hidden = home;
    const room = state.rooms[state.player.room]!;
    $('room-name').textContent = room.name;
    $('chapter').textContent = room.level
      ? `LITTLE WORLD / ${String(room.level).padStart(2, '0')}`
      : 'THE POCKET ISLANDS';
    $('hint').textContent = room.hint;
    const neutralGoals = room.anyGoalColor || room.id === 'pp-hub';
    $('crate-legend').textContent = neutralGoals ? '任意箱 → 深灰框' : '同色箱 → 同色框';
    $('goal-key').style.borderColor = neutralGoals ? '#40474a' : '';
    $('goal-key').style.background = neutralGoals ? '#fffef5' : '';
    $('moves').textContent = String(state.moves);
    $('completed').textContent =
      `${String(state.completed.length).padStart(2, '0')} / ${levelIds(state).length}`;
    $('progress-bar').style.width = `${state.completed.length / levelIds(state).length * 100}%`;
    $('breadcrumb').textContent = [
      state.rooms.world!.name,
      ...state.player.route.map(
        (f) =>
          state.rooms[state.boxes.find((b) => b.id === f.box)!.inside!]!.name,
      ),
    ].join(' / ');
    $('toast').textContent = state.message;
    $<HTMLButtonElement>('undo').disabled = !history.length;
    $<HTMLButtonElement>('leave').disabled = !state.player.route.length;
    $<HTMLButtonElement>('reset').disabled = !room.level;
    const selected = summaries.find((s) => s.saveId === `journey-${slot}`);
    $('slot-summary').textContent = selected
      ? `已完成 ${selected.metadata?.completed ?? 0} / ${levelIds(state).length}`
      : '一段全新的旅程';
    $<HTMLButtonElement>('continue').disabled = !selected;
    for (let i = 1; i <= 5; i++) {
      let b = $('slots').children.item(i - 1) as HTMLButtonElement | null;
      if (!b) {
        b = document.createElement('button');
        b.onclick = () => {
          slot = i;
          paint();
        };
        $('slots').append(b);
      }
      b.className =
        'slot' +
        (i === slot ? ' active' : '') +
        (summaries.some((s) => s.saveId === `journey-${i}`) ? ' filled' : '');
      b.textContent = String(i).padStart(2, '0');
      b.setAttribute('aria-label', `存档 ${i}`);
      b.setAttribute('aria-pressed', String(i === slot));
    }
  }
  async function persist() {
    const currentSlot = slot;
    const snapshot = state;
    $('save-status').textContent = '保存中…';
    try {
      await saves.save(currentSlot, snapshot);
      $('save-status').textContent = '已自动保存';
      // Slot summaries are refreshed on entering the menu, not by rereading all five saves after every step.
    } catch {
      $('save-status').textContent = '保存失败';
      state.message = '暂时无法保存。请保留当前页面，稍后重试。';
      $('toast').textContent = state.message;
    }
  }
  function render(
    previous?: State,
    jump = false,
    transfers: BoxTransfer[] = [],
    restoring = false,
    reset = false,
    recoil?: GateRecoil,
    playerCrossing?: PlayerCrossing,
  ) {
    if (!previous) clearDirections();
    scene.mood = state.message.startsWith('这里')
      ? 'confused'
      : state.moves > 0 && state.moves % 40 === 0
        ? 'tired'
        : 'smile';
    scene.show(state, previous, jump, transfers, restoring, reset, recoil, playerCrossing);
    paint();
  }
  function act(action: Action, throttle = true) {
    if (
      home ||
      dialog.open ||
      busy ||
      pendingUndo ||
      scene.celebrating ||
      scene.transitioning
    )
      return;
    if (scene.moving) {
      // Keep one next intent; repeated keys cannot cut through an unfinished landing.
      if (!(
        pendingAction?.type === 'move' &&
        pendingAction.jump &&
        action.type === 'move' &&
        !action.jump
      ))
        pendingAction = action;
      return;
    }
    const now = clock();
    if (throttle && now - lastInput < 145) return;
    lastInput = now;
    const old = state;
    const result = advanceGame(state, viewAction(state, action));
    state = result.state;
    if (result.changed) {
      audio.schedule(soundCues(old, state, action, result.recoil, scene.airborne, result.playerCrossing));
      if (result.recoil) pendingAction = null;
      const completed = finishedLevel(state) !== finishedLevel(old) ? finishedLevel(state) ?? undefined : undefined;
      if (completed !== undefined) {
        clearDirections();
        pendingCompletion = { level: completed, state };
      }
      remember(history, old, action.type === 'move' && !!action.jump, result.transfers, false, result.playerCrossing);
    }
    render(
      old,
      result.changed && action.type === 'move' && !!action.jump,
      result.transfers,
      false, false, result.recoil, result.playerCrossing,
    );
  }
  function jump() {
    if (
      home ||
      dialog.open ||
      busy ||
      scene.celebrating ||
      scene.transitioning ||
      scene.airborne ||
      pendingUndo
    )
      return;
    if (!canJump(state)) {
      state.message = '头顶空间不足，暂时不能起跳。';
      paint();
      return;
    }
    const direction = [...heldDirections.values()].at(-1);
    if (scene.moving) {
      pendingAction = direction
        ? { type: 'move', dir: direction, jump: true }
        : { type: 'hop' };
      return;
    }
    scene.jumpInPlace();
    audio.schedule([{ name: 'jump', delay: 0 }]);
    if (direction) {
      act({ type: 'move', dir: direction, jump: true }, false);
      return;
    }
    state.message = state.rooms[state.player.room]!.planar ? '跳！致敬关保持平面推箱规则，不能跳过箱子。' : '跳！腾空时按方向可以登上台阶或盒顶。';
    paint();
  }
  function performUndo() {
    pendingCompletion = null;
    const entry = history.pop();
    if (!entry) return;
    audio.stop();
    const previous = state;
    state = entry.state;
    state.message = '退回上一步。慢慢来，世界不会着急。';
    scene.cancelMotion();
    const crossing = entry.playerCrossing ? reversePlayerCrossing(entry.playerCrossing) : undefined;
    audio.schedule(soundCues(previous, state, undefined, undefined, false, crossing));
    render(
      previous,
      entry.jump,
      reverseTransfers(entry.transfers),
      true,
      !!entry.reset,
      undefined, crossing,
    );
  }
  function undo() {
    if (home || busy || dialog.open || !history.length) return;
    heldDirections.clear();
    pendingAction = null;
    if (scene.moving || scene.transitioning || pendingUndo) {
      pendingUndo = Math.min(history.length, pendingUndo + 1);
    } else performUndo();
  }
  function restart() {
    pendingCompletion = null;
    audio.stop();
    if (home || busy || !state.rooms[state.player.room]!.level) return;
    remember(history, state, false, [], true);
    state = resetLevel(state);
    render();
  }
  function help() {
    clearDirections();
    $('dialog-content').innerHTML =
      `<div class="eyebrow">A SMALL GUIDE</div><h2>世界，藏在盒子里。</h2><p>将彩色箱子推到相同颜色的方框，再让小方站上笑脸终点。蓝箱、珊瑚红箱与金箱不能互相替代。内层房间的箱子也要全部归位。</p><div class="help-grid"><b>方向键 / WASD</b><span>沿格点移动、推动箱子。</span><b>J</b><span>单按原地起跳；按住方向再按 J，或起跳后按方向，可跳上一级台阶或盒顶。</span><b>K</b><span>从盒顶下钻，或从面前盒子有开口的一侧进入。四周封闭的关卡先跳上盒顶再下钻。</span><b>Esc</b><span>退出当前独立关卡，回到关卡盒子外，保留探索与通关进度。</span><b>E / 边缘开口</b><span>离开当前盒子，回到外层。出口平坦，无需跳跃。</span><b>Z / R</b><span>撤销一步 / 重玩当前小世界及其内层房间，留在当前入口。</span></div><p>带小房间的盒子拥有独立的立方体空间。盒子可以比外观看起来更大！紫色盒子包含自身的引用，进入和离开时会提示 ∞− 与 ∞+。石质基座的房间不能推动；顶部有白色方框的纯色箱子可以推动。关卡盒子封闭的侧面同样可以推动，有开口的一侧才允许进入。门洞显示每个可进入的方向。围墙统一一格高，圆弧墙顶表示不可攀上；光滑台阶和盒顶可以跳上。窄门净宽 0.82 格，只允许角色通过；整格宽门可运输箱子。进入盒子时镜头会靠近入口，带你走进小世界。</p><p>圆形压力按钮可以由角色或箱子压住，压住时铁栅栏降下，离开后升起。箱子留在门洞时会卡住栅栏；推开箱子后若没有压住按钮，栅栏会升起并把角色弹回。通关庆祝结束后会自动转场回到入口所在的大场景。盒内始终保留完整父场景，视野外的物件由渲染器剔除。通关过的关卡盒子会插上小红旗。右上角可开关音效。</p><div class="face-row"><img src="assets/smile.svg" alt="笑脸"><img src="assets/confused.svg" alt="困惑脸"><img src="assets/tired.svg" alt="疲惫脸"></div><p>五个存档互相独立，通关小关卡后自动保存。首页选存档后继续；世界地图就是关卡入口，没有关卡选择页。</p>`;
    dialog.showModal();
  }
  async function start(fresh: boolean) {
    if (busy) return;
    busy = true;
    try {
      await saves.service.flush();
      const resume = !fresh && activeSlot === slot;
      const loaded = resume ? state : fresh ? null : await saves.load(slot);
      state = loaded ?? createGame();
      activeSlot = slot;
      home = false;
      const completed = finishedLevel(state);
      pendingCompletion = completed === null ? null : { level: completed, state };
      if (!resume) history = [];
      render();
      if (!loaded) await persist();
    } catch (error) {
      $('dialog-content').textContent =
        `无法读取这段旅程：${String(error)}。原存档已保留。`;
      dialog.showModal();
    } finally {
      busy = false;
    }
  }
  function newGame() {
    if (summaries.some((s) => s.saveId === `journey-${slot}`)) {
      $('dialog-content').innerHTML =
        `<div class="eyebrow">A NEW JOURNEY</div><h2>重新开始旅程 ${slot}？</h2><p>这会替换该位置的存档。其他四段旅程不会受到影响。</p><button class="primary" id="overwrite">重新开始</button><button class="secondary" id="cancel">保留存档</button>`;
      dialog.showModal();
      $('overwrite').onclick = () => {
        dialog.close();
        void start(true);
      };
      $('cancel').onclick = () => dialog.close();
    } else void start(true);
  }
  $('sound').onclick = () => {
    audio.setMuted(!audio.muted);
    $('sound').textContent = audio.muted ? '音效 关' : '音效 开';
    $('sound').setAttribute('aria-pressed', String(!audio.muted));
    if (!audio.muted) void audio.unlock();
  };
  $('new').onclick = newGame;
  $('continue').onclick = () => void start(false);
  $('help').onclick = help;
  $('help-game').onclick = help;
  $('close-dialog').onclick = () => dialog.close();
  $('home-button').onclick = async () => {
    pendingCompletion = null;
    audio.stop();
    home = true;
    clearDirections();
    await saves.service.flush();
    summaries = await saves.summaries();
    scene.show(createGame());
    paint();
  };
  $('jump').onclick = jump;
  $('dive').onclick = () => act({ type: 'dive' });
  $('undo').onclick = undo;
  $('leave').onclick = () => act({ type: 'leave' });
  $('reset').onclick = restart;
  $('exit').onclick = () => {
    audio.suspend();
    engine.stop();
    $('dialog-content').innerHTML =
      '<div class="eyebrow">SEE YOU IN A LITTLE WHILE</div><h2>下次再见，小小探险家。</h2><p>你的旅程已保留。可以关闭这个页面，或回到游戏首页。</p><button class="primary" id="return-home">回到首页</button>';
    dialog.showModal();
    $('return-home').onclick = () => dialog.close();
  };
  dialog.addEventListener('close', () => engine.run());
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-dir]'))
    b.onclick = () => {
      const d = directions[b.dataset.dir!]!;
      act({ type: 'move', dir: d, jump: scene.airborne }, !scene.airborne);
      paint();
    };
  const key = (e: KeyboardEvent) => {
    if (home || dialog.open || busy || e.ctrlKey || e.metaKey || e.altKey)
      return;
    const k = e.key.toLowerCase();
    if (directions[k]) {
      e.preventDefault();
      if (!e.repeat) heldDirections.set(k, directions[k]!);
      act(
        { type: 'move', dir: directions[k]!, jump: scene.airborne },
        e.repeat && !scene.airborne,
      );
      paint();
    } else if (['j', 'k', 'z', 'r', 'e', 'escape'].includes(k)) {
      e.preventDefault();
      if (e.repeat) return;
      if (k === 'j') jump();
      if (k === 'k') act({ type: 'dive' });
      if (k === 'z') undo();
      if (k === 'r') restart();
      if (k === 'e') act({ type: 'leave' });
      if (k === 'escape') {
        clearDirections();
        if (state.rooms[state.player.room]!.level) {
          pendingCompletion = null;
          if (scene.moving || scene.transitioning || scene.celebrating) pendingAction = { type: 'exit-level' };
          else act({ type: 'exit-level' });
        } else if (state.player.route.length) act({ type: 'leave' });
        else $('home-button').click();
      }
    }
  };
  const keyup = (e: KeyboardEvent) =>
    heldDirections.delete(e.key.toLowerCase());
  const flushMotion = () => {
    audio.tick();
    if (
      pendingUndo &&
      !home &&
      !busy &&
      !dialog.open &&
      !scene.moving &&
      !scene.transitioning
    ) {
      pendingUndo--;
      performUndo();
      return;
    }
    if (pendingCompletion && pendingCompletion.state !== state) pendingCompletion = null;
    if (pendingCompletion && !home && !busy && !dialog.open &&
        !scene.moving && !scene.transitioning && !scene.celebrating) {
      const next = returnFromCompletedLevel(state, pendingCompletion.level);
      pendingCompletion = null;
      if (next) {
        const old = state;
        state = next;
        clearDirections();
        audio.schedule(soundCues(old, state, { type: 'leave' }));
        render(old);
        void persist();
        return;
      }
    }
    if (!pendingAction || scene.moving || scene.transitioning || scene.celebrating || home || busy || dialog.open) return;
    const action = pendingAction;
    pendingAction = null;
    if (scene.transitioning || scene.celebrating) return;
    if (action.type === 'hop') {
      if (canJump(state)) { scene.jumpInPlace(); audio.schedule([{ name: 'jump', delay: 0 }]); }
    } else act(action, false);
  };
  engine.on('update', flushMotion);
  window.addEventListener('keydown', key);
  window.addEventListener('keyup', keyup);
  const blur = () => { clearDirections(); audio.suspend(); };
  window.addEventListener('blur', blur);
  const visibility = () => {
    if (document.hidden) {
      audio.suspend();
      clearDirections();
      engine.stop();
      void saves.service.flush();
    } else {
      scene.invalidate();
      engine.run();
    }
  };
  document.addEventListener('visibilitychange', visibility);
  const show = () => {
    scene.invalidate();
    engine.run();
  };
  window.addEventListener('pageshow', show);
  const dispose = (e: PageTransitionEvent) => {
    audio.suspend();
    engine.stop();
    void saves.service.flush();
    if (e.persisted || disposed) return;
    disposed = true;
    window.removeEventListener('keydown', key);
    window.removeEventListener('keyup', keyup);
    window.removeEventListener('blur', blur);
    window.removeEventListener('pointerdown', unlockAudio, { capture: true });
    window.removeEventListener('keydown', unlockAudio, { capture: true });
    audio.dispose();
    window.removeEventListener('pagehide', dispose);
    window.removeEventListener('pageshow', show);
    document.removeEventListener('visibilitychange', visibility);
    engine.off('update', flushMotion);
    scene.dispose();
    engine.destroy();
    void saves.service.dispose();
  };
  window.addEventListener('pagehide', dispose);
  render();
  $('loading').hidden = true;
  engine.run();
  if (testing && params.get('view') === 'performance') {
    home = false;
    paint();
    const advance = async (ms: number) => {
      visualTime += ms;
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    };
    const { finalScene, ...profile } = await profileBoxbound(engine, scene, advance, clock);
    window.addEventListener('pagehide', () => finalScene.dispose(), { once: true });
    $('result').textContent = JSON.stringify({ status: errors.length ? 'failed' : 'passed', suite: 'boxbound-performance', errors, profile });
    $('result').dataset.status = errors.length ? 'failed' : 'passed';
    document.body.dataset.renderStatus = errors.length ? 'failed' : 'passed';
    return;
  }
  if (testing) {
    const cases: string[] = [];
    const tap = (key: string) => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key }));
      window.dispatchEvent(new KeyboardEvent('keyup', { key }));
    };
    const advance = async (ms: number) => {
      visualTime += ms;
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
    };
    const wait = async () => {
      await advance(230);
      for (
        let i = 0;
        i < 12 &&
        (scene.transitioning || scene.moving || pendingAction || pendingUndo);
        i++
      )
        await advance(scene.transitioning ? 1460 : 640);
    };
    const climbToRoof = async () => { tap('j'); tap('w'); await wait(); };
    const assert = (v: unknown, name: string) => {
      if (!v) throw new Error(`Verification: ${name}`);
      cases.push(name);
    };
    $('slots').querySelectorAll<HTMLButtonElement>('button')[2]!.click();
    $('new').click();
    await wait();
    assert(!home && slot === 3, 'home new-game and five-slot selection');
    const grounded = clone(state.player.pos);
    tap('j');
    await wait();
    assert(
      scene.diagnostics.jumping &&
        scene.diagnostics.lift > 0.8 &&
        state.player.pos.every((v, i) => v === grounded[i]),
      'J immediately jumps in place without changing logical position',
    );
    await advance(400);
    assert(
      !scene.airborne && state.player.pos.every((v, i) => v === grounded[i]),
      'standing jump lands and does not arm a later move',
    );
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    const beforeHeldJump = clone(state.player.pos);
    tap('j');
    await advance(WALK_MS);
    assert(
      state.player.pos[0] === beforeHeldJump[0] + 1,
      'held direction then J continues forward after the current step without waiting for repeat',
    );
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight' }));
    tap('z');
    tap('z');
    await wait();
    tap('j');
    tap('d');
    assert(
      state.player.pos[0] === grounded[0] + 1,
      'J then direction also jumps forward within the input throttle window',
    );
    tap('z');
    await wait();
    for (const k of 'ddddwaaaaaaddwww') {
      tap(k);
      await wait();
    }
    // Walk into gate 8 at (8, 10); this exercises real keyboard input and nested rendering.
    const outerRadius = scene.orbit.radius;
    tap('w');
    await advance(190);
    assert(
      scene.transitioning &&
        scene.diagnostics.displayedRoom === 'level-8' &&
        scene.orbit.radius < outerRadius * 7 && $('canvas').style.opacity === '1',
      'entry promotes child geometry and continuously zooms at full visibility',
    );
    const enteringPosition = clone(state.player);
    tap('d');
    assert(
      JSON.stringify(state.player) === JSON.stringify(enteringPosition),
      'transition blocks stray movement',
    );
    await wait();
    assert(
      !scene.transitioning && scene.diagnostics.displayedRoom === 'level-8',
      'entry reveals the inner scene and releases input',
    );
    assert(
      state.player.room === 'level-8',
      'world gate entered using keyboard',
    );
    $('leave').click();
    await advance(190);
    $('undo').click();
    await wait();
    assert(
      !scene.transitioning &&
        state.player.room === 'level-8' &&
        $('canvas').style.opacity === '1',
      'queued undo reverses an active scene transition and restores visibility',
    );
    $('home-button').click();
    await wait();
    $('continue').click();
    await wait();
    assert(
      state.player.room === 'level-8',
      'save and continue restore inner space',
    );
    $('leave').click();
    await wait();
    assert(state.player.room === 'world', 'return to world through live UI');
    $('undo').click();
    await wait();
    assert(state.player.room === 'level-8', 'undo restores graph traversal');
    $('leave').click();
    await wait();
    for (const key of ['d', 'w', 'w', 'w', 'w', 'w', 'd', 'd', 'w']) {
      tap(key);
      await wait();
    }
    assert(
      state.player.room === 'level-4',
      'walk between independent world gates',
    );
    for (const key of ['w', 'w']) {
      tap(key);
      await wait();
    }
    tap('j');
    tap('w');
    await advance(80);
    assert(
      scene.diagnostics.playerPosition[2] === 4 &&
        scene.diagnostics.playerPosition[1] > 0,
      'climb lifts vertically before approaching the ledge',
    );
    await advance(130);
    assert(
      scene.diagnostics.playerPosition[1] >= 1 && scene.moving,
      'climb crosses the edge above the complete box height',
    );
    const roof = clone(state.player.pos);
    tap('s');
    assert(
      state.player.pos.every((v, i) => v === roof[i]),
      'rapid input waits for the current landing',
    );
    await advance(210);
    await advance(100);
    assert(
      scene.diagnostics.playerPosition[1] >= 1 &&
        scene.diagnostics.playerPosition[2] < 4,
      'descent keeps its height until the body clears the ledge',
    );
    await advance(180);
    assert(
      scene.diagnostics.playerPosition[2] === 4 &&
        scene.diagnostics.playerPosition[1] < 1,
      'descent falls vertically after clearing the ledge',
    );
    await advance(140);
    assert(
      !scene.moving && state.player.pos[1] === 0,
      'descent lands at the logical destination',
    );
    // Restore both traversals and the two approach steps through the real undo path.
    for (let i = 0; i < 4; i++) tap('z');
    await wait();
    for (const key of ['w', 'w', 'j', 'w', 'k', 'a', 'w', 'd', 'e', 'd']) {
      tap(key);
      await wait();
      if (key === 'k') {
        const innerRoute = JSON.stringify(state.player.route);
        tap('r');
        await wait();
        assert(
          state.player.room === 'inner-4' &&
            JSON.stringify(state.player.route) === innerRoute,
          'R restarts an inner challenge in its own space',
        );
      }
    }
    assert(
      state.completed.includes(4),
      'jump onto roof, drill in, push inner crate and finish outside',
    );
    await advance(380);
    assert(
      scene.diagnostics.celebrating &&
        scene.diagnostics.laugh &&
        scene.diagnostics.lift > 0 &&
        scene.diagnostics.yaw > 0,
      'completion jumps, spins and changes smile to laughter',
    );
    assert(
      scene.diagnostics.doorCount === 4,
      'four visible door openings match four traversable directions',
    );
    assert(
      scene.diagnostics.fadedWalls === 0 &&
        scene.diagnostics.wallHeight === 1 &&
        scene.diagnostics.archedWallCells ===
          state.rooms[state.player.room]!.barriers!.length,
      'opaque one-high barriers have continuous arched tops',
    );
    if (params.get('view') === 'celebration') engine.stop();
    await advance(1100);
    if (params.get('view') !== 'celebration')
      assert(
        !scene.celebrating && state.player.room === 'world' && scene.transitioning,
        'celebration finishes before automatic outward transition',
      );
    else assert(!scene.celebrating, 'celebration has bounded duration');
    await saves.service.flush();
    assert(
      (await saves.load(3))?.completed.includes(4),
      'completed nested level persists',
    );
    if (params.get('view') !== 'celebration') {
      await wait();
      tap('z'); await wait(); // Undo the winning move and its automatic return as one action.
      tap('d'); await wait();
      tap('r');
      await wait();
      assert(
        state.player.room === 'level-4' && !state.completed.includes(4),
        'R reopens the completed current challenge for replay',
      );
      tap('z');
      await wait();
    } else
      assert(
        state.completed.includes(4) && !scene.celebrating,
        'frozen celebration preserves completion after its duration',
      );
    if (params.get('view') === 'home') {
      $('home-button').click();
      await wait();
    } else if (params.get('view') === 'world') {
      $('leave').click();
      await wait();
    }
    if (params.get('view') === 'wall-corners') {
      state=createGame();
      const walls:Vec[]=[[1,0,1],[3,0,1],[4,0,1],[3,0,2],[1,0,4],[2,0,4],[3,0,4],[2,0,5]];
      state.rooms['wall-corners']={id:'wall-corners',name:'墙顶圆角检查',size:7,walls,barriers:walls,
        goals:[],home:null,level:0,hint:'独立墙、L 型墙、T 型墙',doorWidths:[1,1,1,1]};
      state.player={room:'wall-corners',pos:[5,0,5],facing:[0,0,-1],route:[]};
      scene.cancelMotion();render();await wait();
      assert(scene.diagnostics.archedWallCells===walls.length,'isolated, L and T roofs use the shared arched geometry');
      engine.stop();
    }
    if (params.get('view')?.startsWith('exit-')) {
      state = createGame(); state.player.pos = [8, 0, 3]; history = [];
      scene.cancelMotion(); render(); await wait(); tap('w'); await wait();
      assert(state.player.room === 'pp-hub', 'enter the museum from the island');
      for (const chapter of ['intro', 'enter', 'empty']) {
        const gate = state.boxes.find((b) => b.id === 'pp-chapter-' + chapter)!;
        state.player.pos = [gate.pos[0], 0, gate.pos[2] + 1];
        scene.cancelMotion(); render(); await wait(); tap('w'); await wait();
        assert(state.player.room === 'pp-' + chapter, 'enter chapter ' + chapter);
        tap('s'); await wait();
        assert(state.player.room === 'pp-' + chapter && state.player.pos[2] === state.rooms[state.player.room]!.size - 1,
          chapter + ' has an accessible boundary exit tile');
        tap('s'); await advance(180);
        assert(state.player.room === 'pp-hub' && state.player.route.length === 1 && scene.transitioning,
          chapter + ' walks out with the existing growth and zoom animation');
        await wait();
      }
      state.player.pos = [...state.rooms['pp-hub']!.spawn!]; scene.cancelMotion(); render(); await wait();
      tap('s'); await wait(); tap('s'); await wait();
      assert(state.player.room === 'world' && state.player.route.length === 0, 'museum south exit returns to the island by walking');
      state.player.pos = [8, 0, 3]; scene.cancelMotion(); render(); await wait(); tap('w'); await wait();
      if (params.get('view') === 'exit-chapter') {
        state.player.pos = [3, 0, 6]; scene.cancelMotion(); render(); await wait(); tap('w'); await wait();
      }
      assert(Array.from(document.querySelectorAll('.map-label')).some((label) => label.textContent === state.rooms[state.player.room]!.exitLabel),
        'visible return sign identifies the walkable exit');
      engine.stop();
    }
    if (params.get('view')?.startsWith('parabox-')) {
      state = createGame(); state.player.pos = [8, 0, 3]; history = [];
      scene.cancelMotion(); render(); await wait(); tap('w'); await wait();
      assert(state.player.room === 'pp-hub' && state.player.route.length === 1, 'museum remains a box in the island');
      assert(state.boxes.filter((b) => b.room === 'pp-hub' && b.inside).length === 11, 'museum contains eleven chapter boxes');
      tap('w'); await wait(); tap('w'); await wait();
      assert(state.message.includes('红方'), 'red friend greets the player');
      state.player.pos = [3, 0, 6]; scene.cancelMotion(); render(); await wait(); tap('w'); await wait();
      assert(state.player.room === 'pp-intro' && state.player.route.length === 2, 'enter the Intro chapter box');
      assert(state.boxes.filter((b) => b.room === state.player.room && b.levelEntry).length === 9, 'Intro chapter contains nine independent puzzles');
      const gateway = state.boxes.find((b) => b.id === 'pp-gateway-1')!;
      state.player.pos = [gateway.pos[0], 0, gateway.pos[2] + 1]; scene.cancelMotion(); render(); await wait();
      await climbToRoof(); tap('k'); await wait();
      assert(state.player.room === 'pp-intro1-lr' && gateway.pos[2] === 2, 'closed level entry requires climbing and diving without pushing the box');
      assert($('completed').textContent?.endsWith('/ 165'), 'progress includes originals and 155 tribute puzzles');
      for (const key of 'wwdddsswwwaaaa') { tap(key); await wait(); }
      assert(state.completed.includes(11) && scene.celebrating, 'first completion celebrates');
      await advance(2500); await wait();
      assert(state.player.room === 'pp-intro' && state.player.route.length === 2, 'completion returns one level boundary to its chapter');
      state.player.pos = [gateway.pos[0], 0, gateway.pos[2] + 1]; scene.cancelMotion(); render(); await wait(); await climbToRoof(); tap('k'); await wait();
      assert(state.completed.includes(11) && !finishedLevel(state) && state.boxes.find((b) => b.id === 'pp-intro1-lr-1')!.pos[2] === 3, 're-entry restores interior while keeping earned completion');
      for (const key of 'wwdddsswwwaaaa') { tap(key); await wait(); }
      assert(scene.celebrating, 'replayed puzzle celebrates again');
      await advance(2500); await wait();
      assert(state.player.room === 'pp-intro', 'replayed puzzle automatically returns again');
      if (params.get('view') === 'parabox-hub') { tap('e'); await wait(); }
      else if (params.get('view') !== 'parabox-chapter') {
        const recursive = params.get('view') === 'parabox-recursive';
        if (recursive) {
          tap('e'); await wait(); state.player.pos = [6, 0, 6];
          scene.cancelMotion(); render(); await wait(); tap('w'); await wait();
        }
        const id = recursive ? 'pp-gateway-21' : params.get('view') === 'parabox-nested' ? 'pp-gateway-9' : 'pp-gateway-8';
        const g = state.boxes.find((b) => b.id === id)!;
        state.player.pos = [g.pos[0], 0, g.pos[2] + 1]; scene.cancelMotion(); render(); await wait(); await climbToRoof(); tap('k');
        if (params.get('view') === 'parabox-zoom') { await advance(300); engine.stop(); }
        else {
          await wait();
          if (recursive || params.get('view') === 'parabox-nested') {
            if (recursive) assert(scene.diagnostics.outerContext?.parent === state.player.room && scene.diagnostics.playerInstances.length === 3,
              'a recursive root displays parent, current and child players before the first self entry');
            for (const key of recursive ? 'ssdddd' : 'waassasddd') { tap(key); await wait(); }
            assert(state.player.route.length === 4 && state.player.room === (recursive ? 'pp-enter12-la' : 'pp-intro9-la'),
              'actual nested or self-referential entry expands one child without unbounded recursion');
            if (recursive) {
              assert(scene.orbit.theta === 0 && scene.orbit.phi === MAP_TOP_PHI && scene.camera.projectionType === 'perspective',
                'self entry preserves the planar top-down perspective');
              state.player.pos = [5, 0, 5]; scene.cancelMotion(); render(); await wait();
              const originalEntities = scene.diagnostics.actorEntities.find((a) => a.id === 'player')!.entities.join();
              const resources = scene.resourceSnapshot();
              const sharedPose = () => {
                const copies = scene.diagnostics.playerInstances, current = copies.find((p) => p.layer === 'current')!;
                return copies.length === 3 && copies.filter((p) => p.owner).every((copy) => {
                  const t = containmentTransform(state, copy.owner!, copy.layer === 'child');
                  const expected = transformPoint(current.position, t);
                  return copy.position.every((v, i) => Math.abs(v - expected[i]!) < 1e-6) && Math.abs(copy.scale - current.scale * t.scale) < 1e-6;
                });
              };
              assert(sharedPose(), 'all three player occurrences use the actual container size and same position');
              const idleHeight = scene.diagnostics.playerInstances[0]!.position[1];
              tap('j'); await advance(140);
              assert(sharedPose() && scene.diagnostics.playerInstances[0]!.position[1] > idleHeight,
                'parent and child copies follow the original player jump and squash');
              await wait();
              assert(originalEntities === scene.diagnostics.actorEntities.find((a) => a.id === 'player')!.entities.join(),
                'recursive copies preserve the controllable player entity identity');
              assert(resources.createdParts === scene.resourceSnapshot().createdParts && resources.destroyedParts === scene.resourceSnapshot().destroyedParts,
                'recursive player animation allocates and destroys no render entities');
              const self = state.boxes.find((b) => b.room === state.player.room && b.inside === state.player.room)!;
              // Additional occurrence depth must not create an additional LOD layer.
              state.player.route.push({ box: self.id, from: self.room, entry: [...state.player.pos] });
              scene.cancelMotion(); render(); await wait();
              assert(scene.resourceSnapshot().parts === resources.parts && scene.diagnostics.playerInstances.length === 3,
                'another recursive route edge keeps the same bounded number of parts and player copies');
              state.player.route.pop(); scene.cancelMotion(); render(); await wait();
              assert(sharedPose() && scene.orbit.phi === MAP_TOP_PHI, 'leaving an occurrence preserves the same shared pose and view angle');
            }
          }
        }
      }
      assert($('canvas').style.opacity === '1', 'zoom never fades the canvas');
    }
    if (params.get('view')?.startsWith('completion-')) {
      await audio.unlock();
      state = createGame();
      state.player = { room: 'pp-intro9-lr', pos: [...state.rooms['pp-intro9-lr']!.spawn!], facing: [0, 0, -1], route: [
        { box: 'pp-museum', from: 'world', entry: [8, 0, 3] },
        { box: 'pp-chapter-intro', from: 'pp-hub', entry: [3, 0, 6] },
        { box: 'pp-gateway-9', from: 'pp-intro', entry: [11, 0, 6] },
      ] };
      history = [];
      scene.cancelMotion(); render(); await wait();
      for (const key of 'waassasddddwddsaaaddd') { tap(key); await wait(); }
      assert(state.completed.includes(19) && state.player.room === 'pp-intro9-la' && scene.celebrating, 'nested goal completes inside the box and waits for celebration');
      assert(audio.recent.includes('complete') && audio.recent.includes('enter'), 'winning and inward travel play their distinct MIDI cues');
      const frozen = JSON.stringify(state.player);
      tap('w');
      assert(JSON.stringify(state.player) === frozen, 'input cannot interrupt the winning celebration');
      await advance(1500);
      assert(state.player.room === 'pp-intro' && state.player.route.length === 2 && scene.transitioning, 'automatic return exits the entire completed puzzle to its world');
      assert(audio.recent.includes('exit'), 'automatic outward transition plays the exit cue');
      if (params.get('view') === 'completion-outro') {
        await advance(230);
        assert(scene.transitioning && scene.diagnostics.displayedRoom === 'pp-intro' && $('canvas').style.opacity === '1', 'capture outward camera motion before switching to the museum');
        engine.stop();
      } else {
        await wait();
        assert(!scene.transitioning && scene.diagnostics.displayedRoom === 'pp-intro', 'return transition settles in the museum with its completed gateway');
        await saves.service.flush();
        const saved = await saves.load(slot);
        assert(saved?.player.room === 'pp-intro' && saved.completed.includes(19), 'automatic return and completion persist together');
        tap('z'); await wait();
        assert(state.player.room === 'pp-intro9-la' && !state.completed.includes(19), 'one undo reverses both the winning move and automatic return');
        tap('d'); await wait(); tap('r'); await wait(); await advance(1800);
        assert(state.player.room === 'pp-intro9-lr' && !state.completed.includes(19) && !scene.transitioning, 'reset during celebration cancels a queued return');
      }
    }
    if (params.get('view') === 'outer-context') {
      state = createGame();
      const parent = state.rooms['pp-intro']!;
      const contextOwner = state.boxes.find((b) => b.id === 'pp-gateway-1')!;
      // Keep this authored-world fixture physically valid: the destination tile
      // belongs to another level box, so exchange their positions first.
      const displaced = state.boxes.find((b) => b.room === parent.id && b.pos.join() === '2,0,5');
      if (displaced) displaced.pos = [...contextOwner.pos];
      contextOwner.pos = [2, 0, 5];
      state.player = { room: 'pp-intro1-lr', pos: [...state.rooms['pp-intro1-lr']!.spawn!], facing: [0, 0, -1], route: [
        { box: 'pp-museum', from: 'world', entry: [8, 0, 3] },
        { box: 'pp-gateway-1', from: 'pp-hub', entry: [2, 0, 6] },
      ] };
      parent.walls.push([3, 0, 5]); parent.barriers!.push([3, 0, 5]);
      (parent.decorations ??= []).push({ id: 'context-tree', type: 3, pos: [1, 0, 5] });
      const crate = state.boxes.find((b) => b.id === 'crate-1')!;
      crate.room = parent.id; crate.pos = [2, 0, 4];
      parent.buttons = [{ id: 'context-button', pos: [2, 0, 6], channel: 'context' }];
      parent.gates = [{ id: 'context-gate', pos: [3, 0, 4], channel: 'context', axis: 'x' }];
      parent.goals = [[1, 0, 4]]; parent.goalColors = ['gold']; parent.home = [3, 0, 6];
      history = []; scene.cancelMotion(); render(); await wait();
      const context = scene.diagnostics.outerContext!;
      assert(context.parent === 'pp-intro' && context.owner === 'pp-gateway-1' && context.cells.length === 8, 'frame samples exactly the immediate parent neighborhood');
      assert(context.scale === 7 && context.cells.every((c) => c.size[0] === 7 && c.size[2] === 7), 'each outside cell is as wide and deep as the entire seven-cell inner room');
      assert(context.cells.some((c) => c.center[0] === -4 && c.center[2] === -4), 'diagonal neighbors remain full square cells at the correct distance');
      assert(context.cells.some((c) => c.wall) && context.cells.some((c) => c.decoration === 3) && context.cells.some((c) => c.box?.id === crate.id), 'outside wall, tree and movable crate are rendered');
      assert(context.cells.some((c) => c.gate && !c.gate.open) && context.cells.some((c) => c.button === false), 'outer mechanism state is visible');
      crate.pos = [2, 0, 6]; render(); await wait();
      assert(scene.diagnostics.outerContext!.cells.some((c) => c.gate?.open) && scene.diagnostics.outerContext!.cells.some((c) => c.button), 'frame updates when an outside crate presses its button');
      crate.pos = [2, 0, 4]; render(); await wait();
      const snapshot = JSON.stringify(state); render(); await wait();
      assert(JSON.stringify(state) === snapshot && state.player.room === 'pp-intro1-lr', 'outside frame is visual only and does not mutate puzzle topology');
    }
    if (params.get('view') === 'decorations') {
      state = createGame();
      state.player.pos = [0, 0, 8];
      history = [];
      scene.cancelMotion();
      render();
      await wait();
      assert(scene.diagnostics.decorations.length === 20, 'all JSON decorations are rendered');
      assert([1, 2, 3, 4].every((type) => scene.diagnostics.decorations.some((d) => d.type === type)), 'rocks, shrubs and both tree shapes are present');
      tap('d');
      await wait();
      assert(state.player.pos[0] === 0, 'keyboard walking is blocked by the rock');
      tap('j');
      tap('d');
      await wait();
      assert(state.player.pos[0] === 0, 'jump cannot land on decoration');
      for (const key of ['w', 'd', 'd', 's']) { tap(key); await wait(); }
      assert(state.player.pos[0] === 2 && state.player.pos[2] === 8, 'player can walk around the rock');
      state = createGame();
      state.player.pos = [3, 0, 1];
      state.boxes.find((b) => b.id === 'island-weight')!.pos = [4, 0, 1];
      scene.cancelMotion();
      history = [];
      render();
      await wait();
      tap('d');
      await wait();
      assert(state.boxes.find((b) => b.id === 'island-weight')!.pos[0] === 4, 'rock blocks a pushed crate');
      state = createGame();
      history = [];
      scene.cancelMotion();
      render();
      await wait();
    }
    if (params.get('view') === 'gate-recoil') {
      await audio.unlock();
      assert(audio.diagnostics.ready && audio.diagnostics.buffers === SOUND_NAMES.length && !audio.error, 'all MIDI-rendered samples decode into the engine mixer');
      audio.schedule(SOUND_NAMES.map((name) => ({ name, delay: 0 })));
      assert(SOUND_NAMES.every((name) => audio.recent.includes(name)), 'each distinct MIDI cue starts a real audio source');
      const audioDeadline = performance.now() + 5000;
      while (audio.diagnostics.voices && performance.now() < audioDeadline)
        await new Promise((resolve) => setTimeout(resolve, 50));
      assert(audio.diagnostics.voices === 0, `short audio sources retire after playback: ${JSON.stringify(audio.diagnostics)}`);
      for (let i = 0; i < 160; i++) audio.schedule([{ name: SOUND_NAMES[i % SOUND_NAMES.length]!, delay: 0 }]);
      assert(audio.diagnostics.voices <= 8 && audio.recent.length <= 32, 'repeated effects reuse bounded channels and diagnostics');
      audio.setMuted(true);
      audio.schedule([{ name: 'step', delay: 100 }]);
      assert(audio.diagnostics.voices === 0 && audio.diagnostics.pending === 0, 'muting stops active and pending effects');
      audio.setMuted(false);
      const probe = new BoxboundAudio(clock);
      await probe.unlock();
      probe.schedule([{ name: 'jump', delay: 0 }]);
      probe.dispose(); probe.dispose();
      assert(probe.diagnostics.disposed && probe.diagnostics.voices === 0 && probe.diagnostics.buffers === 0 && probe.diagnostics.audioNodes === 0, 'audio disposal releases samples, nodes and voices idempotently');
      state = createGame(); scene.cancelMotion(); render(); await wait();
      const beforePlateWalk = scene.resourceSnapshot();
      tap('w'); await advance(160);
      const liveGate = scene.diagnostics.mechanisms.find(m => m.kind === 'gate')!;
      assert(liveGate.powered && liveGate.offset < 0 && liveGate.offset > -1.18, 'walking onto a plate animates the existing gate');
      await wait(); tap('s'); await wait();
      const afterPlateWalk = scene.resourceSnapshot();
      assert(afterPlateWalk.rebuilds === beforePlateWalk.rebuilds && afterPlateWalk.walkUpdates === beforePlateWalk.walkUpdates + 2 && afterPlateWalk.createdParts === beforePlateWalk.createdParts, 'plate press and release update materials and mechanisms without rebuilding the world');
      assert(scene.diagnostics.mechanisms.find(m => m.kind === 'gate')!.offset === 0, 'reused gate closes completely after release');
      state = createGame();
      state.boxes.find((b) => b.id === 'island-weight')!.pos = [8, 0, 12];
      state.player.pos = [8, 0, 13];
      history = [];
      scene.cancelMotion(); render(); await wait();
      const checkpointBeforeRecoil = await saves.load(slot);
      const gate = state.rooms.world!.gates![0]!;
      assert(gateOpen(state, 'world', gate) && !gatePowered(state, 'world', gate), 'a crate alone holds the gate down');
      tap('w');
      assert(state.player.pos[2] === 13 && state.boxes.find((b) => b.id === 'island-weight')!.pos[2] === 11 && !gateOpen(state, 'world', gate), 'push commits the crate but ejects the player and closes the gate');
      await advance(100);
      assert(scene.diagnostics.mechanisms.find((m) => m.kind === 'gate')!.offset === -1.18 && scene.diagnostics.motionPhase === 'approach', 'bars wait until the crate clears during approach');
      await advance(200);
      const bars = scene.diagnostics.mechanisms.find((m) => m.kind === 'gate')!;
      assert(scene.diagnostics.motionPhase === 'recoil' && scene.diagnostics.playerPosition[1] > 0 && bars.offset > -1.18 && bars.offset < 0, 'rising bars and airborne recoil animate together');
      assert(audio.recent.includes('push') && audio.recent.includes('gate-up') && audio.recent.includes('recoil'), 'push, rising bars and recoil dispatch their cues');
      await wait();
      assert(!scene.moving && scene.diagnostics.playerPosition[2] === 13 && scene.diagnostics.mechanisms.find((m) => m.kind === 'gate')!.offset === 0, 'player lands safely outside the fully raised gate');
      await saves.service.flush();
      const saved = await saves.load(slot);
      assert(JSON.stringify(saved) === JSON.stringify(checkpointBeforeRecoil), 'ordinary movement preserves the last completed-level checkpoint');
      tap('w'); await wait();
      assert(state.player.pos[2] === 13 && state.boxes.find((b) => b.id === 'island-weight')!.pos[2] === 11, 'further input cannot walk through the raised bars');
      tap('z'); await wait();
      assert(gateOpen(state, 'world', gate) && state.boxes.find((b) => b.id === 'island-weight')!.pos[2] === 12, 'one undo restores the crate-held gate');
      tap('w'); await advance(300);
      assert(scene.diagnostics.motionPhase === 'recoil', 'capture the bounce at its deterministic middle frame');
      engine.stop();
    }
    if (params.get('view') === 'chapters-eight' || params.get('view') === 'face-top') {
      for (const chapter of ['eat', 'reference', 'swap', 'center', 'clone']) {
        state = createGame();
        const box = state.boxes.find((b) => b.id === `pp-chapter-${chapter}`)!;
        state.player = { room: 'pp-hub', pos: [box.pos[0], 0, box.pos[2] + 1], facing: [0, 0, -1],
          route: [{ box: 'pp-museum', from: 'world', entry: [8, 0, 3] }] };
        scene.cancelMotion(); history = []; render(); await wait(); tap('w'); await wait();
        assert(state.player.room === `pp-${chapter}`, `enter ${chapter} through its chapter box`);
        assert(state.boxes.filter((b) => b.room === state.player.room && b.levelEntry).length ===
          ({ eat: 12, reference: 10, swap: 5, center: 14, clone: 24 } as Record<string, number>)[chapter], `all ${chapter} puzzles are available`);
        tap('s'); await wait(); tap('s'); await wait();
        assert(state.player.room === 'pp-hub', `${chapter} signed boundary returns to museum`);
      }
      state = createGame();
      const gateway = state.boxes.find((b) => b.id === 'pp-gateway-42')!;
      state.player = { room: gateway.room, pos: [gateway.pos[0], 0, gateway.pos[2] + 1], facing: [0, 0, -1],
        route: [{ box: 'pp-museum', from: 'world', entry: [8, 0, 3] },
          { box: 'pp-chapter-eat', from: 'pp-hub', entry: [3, 0, 3] }] };
      scene.cancelMotion(); history = []; render(); await wait(); await climbToRoof(); tap('k'); await wait();
      assert(scene.topExpression().smile === 5 && scene.topExpression().laugh === 0, 'top expression shows the same resting smile');
      for (const key of 'wddwdssdsaaa') { tap(key); await wait(); }
      tap('a'); await advance(260);
      assert(scene.topExpression().laugh === 3 && scene.topExpression().smile === 0, 'completion changes top expression to laughter with the front face');
      assert(state.completed.includes(52), 'Eat 1 completes using swallow rules');
      await wait(); await wait();
      assert(state.player.room === 'pp-eat', 'new puzzle celebration returns to its chapter');
      if (params.get('view') === 'chapters-eight') {
        state = createGame(); state.player = { room: 'pp-hub', pos: [6, 0, 11], facing: [0, 0, -1],
          route: [{ box: 'pp-museum', from: 'world', entry: [8, 0, 3] }] };
      } else {
        state = createGame(); const box = state.boxes.find((b) => b.id === 'pp-gateway-83')!;
        state.player = { room: box.room, pos: [box.pos[0], 0, box.pos[2] + 1], facing: [0, 0, -1],
          route: [{ box: 'pp-museum', from: 'world', entry: [8, 0, 3] }, { box: 'pp-chapter-clone', from: 'pp-hub', entry: [9, 0, 9] }] };
        state = advanceGame(state, { type: 'move', dir: [0, 0, -1], jump: true }).state;
        state = advanceGame(state, {type:'dive'}).state;
      }
      scene.cancelMotion(); history = []; render(); await wait(); engine.stop();
    }
    if (params.get('view') === 'camera-planar' || params.get('view') === 'camera-spatial') {
      state = createGame();
      const room = state.rooms['pp-empty13-la']!, owner = state.boxes.find((b) => b.room === room.id && b.inside === room.id)!;
      owner.pos = [2, 0, 1]; state.boxes.find((b) => b.id === 'pp-empty13-la-2')!.pos = [6, 0, 2];
      state.player = { room: room.id, pos: [4, 0, 5], facing: [0, 0, -1], route: [
        { box: 'pp-museum', from: 'world', entry: [8, 0, 3] },
        { box: 'pp-chapter-empty', from: 'pp-hub', entry: [9, 0, 6] },
        { box: 'pp-gateway-40', from: 'pp-empty', entry: [8, 0, 9] },
      ] };
      history = []; scene.cancelMotion(); render(); await wait();
      const planar = clone(state);
      assert(scene.camera.projectionType === 'perspective' && scene.orbit.phi === MAP_TOP_PHI && scene.orbit.theta === 0,
        'planar Empty 13 uses an aligned top-down perspective camera');
      assert(scene.diagnostics.fadedOuterObjects.length === 0, 'planar parent geometry remains opaque');
      const coverage = () => {
        const vp = mat4.multiply(scene.camera.projectionMatrix, mat4.inverse(scene.orbit.localMatrix));
        const half = (state.rooms[state.player.room]!.size + .3) / 2; let extent = 0;
        for (const x of [-half, half]) for (const z of [-half, half]) for (const y of [-.87, 1.15]) {
          const w = vp[3]! * x + vp[7]! * y + vp[11]! * z + vp[15]!;
          extent = Math.max(extent, Math.abs((vp[0]! * x + vp[4]! * y + vp[8]! * z + vp[12]!) / w),
            Math.abs((vp[1]! * x + vp[5]! * y + vp[9]! * z + vp[13]!) / w));
        }
        return extent;
      };
      assert(Math.abs(coverage() - .85) < .0001, 'top-down perspective retains 85 percent map coverage');
      state = createGame();
      state.player = { room: 'level-1', pos: [3, 0, 5], facing: [0, 0, -1], route: [{ box: 'gate-1', from: 'world', entry: [2, 0, 3] }] };
      const gate = state.boxes.find((b) => b.id === 'gate-1')!;
      state.boxes.push({ id: 'camera-blocker', room: 'world', pos: [gate.pos[0], 0, gate.pos[2] + 1], size: 1, inside: null, fixed: false, required: false, color: 'coral' });
      render(); await wait();
      const spatial = clone(state);
      assert(scene.orbit.phi === Math.PI / 4 && scene.orbit.theta === Math.PI / 18,
        'jump-capable room keeps 45 degree pitch and 10 degree yaw');
      assert(Math.abs(coverage() - .85) < .0001, 'spatial perspective retains 85 percent map coverage');
      assert(scene.diagnostics.fadedOuterObjects.some((g) => g.id === 'outer/camera-blocker') && Math.abs(scene.actorOpacity('outer/camera-blocker') - .15) < 1e-6,
        'parent crate intersecting the sightline uses a real 15 percent opacity material');
      assert(scene.wallPalette('level-1', false).every((rgba) => rgba[3] === 1), 'current-room walls stay opaque');
      const ids = scene.diagnostics.actorEntities.find((a) => a.id === 'outer/camera-blocker')!.entities.join();
      const beforeMove = clone(state); state.boxes.find((b) => b.id === 'camera-blocker')!.pos = [15, 0, 15];
      render(beforeMove); await wait();
      assert(scene.actorOpacity('outer/camera-blocker') === 1 && !scene.diagnostics.fadedOuterObjects.some((g) => g.id === 'outer/camera-blocker'),
        'moving outside the sightline restores the exterior crate material');
      assert(scene.diagnostics.actorEntities.find((a) => a.id === 'outer/camera-blocker')!.entities.join() === ids,
        'fading and restoration reuse original model entities');
      state = createGame();
      state.player = { room: 'pp-intro', pos: [2, 0, 3], facing: [0, 0, -1], route: [
        { box: 'pp-museum', from: 'world', entry: [8, 0, 3] },
        { box: 'pp-chapter-intro', from: 'pp-hub', entry: [3, 0, 6] },
      ] };
      render(); await wait(); tap('w'); await advance(0);
      assert(scene.orbit.phi === Math.PI / 4 && scene.orbit.theta === Math.PI / 18, 'mixed-mode entry preserves the source orientation at takeoff');
      await advance(410);
      assert(scene.orbit.phi > MAP_TOP_PHI && scene.orbit.phi < Math.PI / 4 && scene.orbit.theta > 0 && scene.orbit.theta < Math.PI / 18,
        'mixed-mode entry smoothly rotates from spatial to top-down view');
      await wait();
      assert(scene.orbit.phi === MAP_TOP_PHI && scene.orbit.theta === 0, 'entering a planar puzzle settles at the top');
      tap('e'); await wait();
      assert(scene.orbit.phi === Math.PI / 4 && scene.orbit.theta === Math.PI / 18, 'leaving returns to the parent room camera mode');
      state = params.get('view') === 'camera-planar' ? planar : spatial; scene.cancelMotion(); render(); await wait(); engine.stop();
    }
    if (params.get('view') === 'outer-render' || params.get('view') === 'outer-push') {
      state = createGame();
      const room = state.rooms['pp-enter18-la']!, owner = state.boxes.find((b) => b.room === room.id && b.inside === room.id)!;
      const crate = state.boxes.find((b) => b.id === 'pp-enter18-la-2')!;
      crate.pos = [3, 0, 3];
      state.player = { room: room.id, pos: [3, 0, 4], facing: [0, 0, -1], route: [
        { box: 'pp-museum', from: 'world', entry: [8, 0, 3] },
        { box: 'pp-chapter-enter', from: 'pp-hub', entry: [6, 0, 6] },
        { box: 'pp-gateway-27', from: 'pp-enter', entry: [0, 0, 0] },
      ] };
      history = []; scene.cancelMotion(); render(); await wait();
      assert(scene.sameActorModel(crate.id, `outer/${crate.id}`), 'parent and current crates share every full-detail geometry and material, including side markings');
      const ids = scene.diagnostics.actorEntities.find((a) => a.id === `outer/${crate.id}`)!.entities.join();
      const before = clone(state), initial = scene.diagnostics.outerBoxPositions.find((b) => b.id === crate.id)!.position;
      tap('w'); await advance(0);
      assert(scene.diagnostics.outerBoxPositions.find((b) => b.id === crate.id)!.position.join() === initial.join(),
        'outer crate starts at its previous location on the first pushing frame');
      await advance(90);
      const moving = scene.diagnostics.outerBoxPositions.find((b) => b.id === crate.id)!;
      const current = scene.diagnostics.boxPositions.find((b) => b.id === crate.id)!;
      assert(moving.position[2] < -1 && moving.position[2] > -2 && Math.abs(moving.position[2] - (current.position[2] - 4)) < 1e-6,
        'outer and current boxes use the same intermediate push progress');
      const expected = transformPoint(moving.position, containmentTransform(state, owner.id, false));
      assert(moving.rendered.every((v, i) => Math.abs(v - expected[i]!) < 1e-6), 'outer pushing uses the actual parent coordinate scale');
      assert(scene.diagnostics.actorEntities.find((a) => a.id === `outer/${crate.id}`)!.entities.join() === ids,
        'outer pushing reuses its original model entities');
      await wait();
      assert(scene.diagnostics.outerBoxPositions.find((b) => b.id === crate.id)!.position[2] === -2,
        'outer push settles exactly at its destination');
      tap('z'); await advance(90);
      const undoZ = scene.diagnostics.outerBoxPositions.find((b) => b.id === crate.id)!.position[2];
      assert(undoZ > -2 && undoZ < -1, 'undo animates the outer box back instead of snapping');
      await wait();
      const warm = scene.resourceSnapshot();
      for (let i = 0; i < 3; i++) { tap('w'); await wait(); tap('z'); await wait(); }
      const repeated = scene.resourceSnapshot();
      assert(warm.createdParts === repeated.createdParts && warm.destroyedParts === repeated.destroyedParts &&
        warm.geometries === repeated.geometries && warm.materials === repeated.materials,
        'repeated recursive pushes and undos reuse all live models and asset caches');
      // Also retain boxes beyond the old one-cell parent sampling ring.
      state.boxes.find((b) => b.id === crate.id)!.pos = [6, 0, 3]; render(); await wait();
      assert(scene.diagnostics.outerBoxPositions.some((b) => b.id === crate.id), 'the original complete parent scene survives beyond the old one-cell ring');
      state.player.pos = [3, 0, 3]; render(); await wait();
      const oldOuterX = scene.diagnostics.outerBoxPositions.find((b) => b.id === crate.id)!.rendered[0];
      tap('a'); await advance(0);
      assert(Math.abs(scene.diagnostics.outerBoxPositions.find((b) => b.id === crate.id)!.rendered[0] - oldOuterX) < 1e-6,
        'pushing the containing self box preserves the parent scene position at takeoff');
      await advance(90);
      const parentX = scene.diagnostics.outerBoxPositions.find((b) => b.id === crate.id)!.rendered[0];
      assert(parentX > oldOuterX && parentX < oldOuterX + room.size,
        'the whole parent scene follows its moving container continuously');
      await wait();
      state = before; scene.cancelMotion(); render(); await wait();
      if (params.get('view') === 'outer-push') { tap('w'); await advance(90); engine.stop(); }
    }
    if (params.get('view')?.startsWith('recursive-crate')) {
      state = createGame();
      const room = state.rooms['pp-enter18-la']!, crate = state.boxes.find((b) => b.id === 'pp-enter18-la-2')!;
      const owner = state.boxes.find((b) => b.room === room.id && b.inside === room.id)!;
      const childId = `child/${owner.id}/${crate.id}`, outerId = `outer/${crate.id}`;
      crate.pos = [4, 0, 8];
      state.player = { room: room.id, pos: [4, 0, 7], facing: [0, 0, 1], route: [
        { box: 'pp-museum', from: 'world', entry: [8, 0, 3] },
        { box: 'pp-chapter-enter', from: 'pp-hub', entry: [6, 0, 6] },
        { box: 'pp-gateway-27', from: 'pp-enter', entry: [0, 0, 0] },
      ] };
      history = []; scene.cancelMotion(); render(); await wait();
      const entities = (id: string) => scene.diagnostics.actorEntities.find((a) => a.id === id)!.entities.join();
      const original = entities(crate.id), inner = entities(childId), outside = entities(outerId);
      const before = clone(state), steady = scene.resourceSnapshot();
      tap('s'); await advance(0);
      assert(history.at(-1)!.transfers[0]!.fromRoom === room.id && history.at(-1)!.transfers[0]!.toRoom === room.id,
        'authored Enter 18 crate crosses a self edge with identical room IDs');
      assert(state.boxes.filter((b) => b.id === crate.id).length === 1 && state.boxes.length === before.boxes.length,
        'recursive rendering preserves one logical crate and does not duplicate world state');
      assert(entities(outerId) === original && entities(crate.id) === inner,
        'original current crate becomes the parent occurrence; original inner crate emerges into the current occurrence');
      assert(entities(`departing/${outerId}`) === outside, 'the original outermost occurrence continues outward instead of disappearing at takeoff');
      const arriving = () => scene.diagnostics.boxTransfers.find((b) => b.id === crate.id)!;
      const departure = () => scene.diagnostics.outerBoxPositions.find((b) => b.id === crate.id)!;
      const start = arriving();
      assert(Math.abs(start.position[0] - 2) < 1e-6 && Math.abs(start.position[2] - (3 + 4 / 9)) < 1e-6 && start.scale === 1 / 9,
        'the arriving crate starts inside the small self box at its actual miniature position and scale');
      assert(departure().rendered.every((v, i) => Math.abs(v - [0, 0, 4][i]!) < 1e-6),
        'the outgoing original stays at the south boundary on its first frame');
      await advance(300);
      assert(Math.abs(departure().rendered[0]) < 1e-6 && departure().rendered[2] > 4,
        'outgoing original moves straight out of the board, never diagonally toward the small inner box');
      assert(arriving().position[0] === 2 && arriving().position[2] > 3 + 4 / 9 && arriving().position[2] <= 4 && arriving().scale > 1 / 9 && arriving().scale < 1,
        'inner occurrence emerges at the self box exit and grows continuously');
      await wait();
      assert(entities(crate.id) === inner && entities(outerId) === original && arriving().scale === 1 && arriving().position.join() === '2,0,4',
        'both original models settle in their destination occurrences');
      assert(!scene.diagnostics.actorEntities.some((a) => a.id.startsWith('departing/')) && scene.resourceSnapshot().parts === steady.parts,
        'outgoing horizon occurrence is released and the rendered scene returns to its bounded steady size');
      tap('z'); await advance(0);
      assert(entities(crate.id) === original && entities(childId) === inner,
        'undo returns the same model identities through the opposite containment edge');
      assert(arriving().scale === 9, 'undo starts the outer incoming occurrence at its actual parent scale');
      await advance(180);
      assert(arriving().scale > 1 && arriving().scale < 9, 'undo shrinks continuously back through the outer boundary');
      await wait();
      assert(entities(crate.id) === original && entities(childId) === inner && state.boxes.find((b) => b.id === crate.id)!.pos.join() === '4,0,8',
        'undo restores the original crate at the original boundary');
      const warm = scene.resourceSnapshot();
      for (let i = 0; i < 4; i++) { tap('s'); await wait(); tap('z'); await wait(); }
      const repeated = scene.resourceSnapshot();
      assert(repeated.parts === warm.parts && repeated.geometries === warm.geometries && repeated.materials === warm.materials &&
        repeated.createdParts - warm.createdParts === repeated.destroyedParts - warm.destroyedParts,
        'repeated recursive transports release transient horizon models and keep live objects and asset caches bounded');
      tap('s'); await wait();
      if (params.get('view') === 'recursive-crate-undo') { tap('z'); await advance(180); }
      else { tap('z'); await wait(); tap('s'); await advance(300); }
      engine.stop();
    }
    if (params.get('view')?.startsWith('village-gate')) {
      state=createGame();history=[];pendingCompletion=null;scene.cancelMotion();render();await wait();
      const gate=state.rooms.world!.gates![0]!;
      assert(gate.width===3 && gate.axis==='x','village gate is one configurable three-cell assembly');
      for(const key of 'aaaw'){tap(key);await wait();}
      assert(gateOpen(state,'world',gate),'left pressure plate lowers the gate');
      tap('s');await wait();assert(!gateOpen(state,'world',gate),'leaving the plate raises the gate');
      state=createGame();history=[];scene.cancelMotion();render();await wait();
      for(const key of 'ddddwaaaaaaddwww'){tap(key);await wait();}
      assert(state.player.pos.join()==='8,0,11' && gatePowered(state,'world',gate),'right crate can be pushed onto left plate and player crosses the wide gate');
      assert(state.boxes.find(b=>b.id==='island-weight')!.pos.join()==='5,0,14','crate remains on the left plate');
      if(params.get('view')==='village-gate'){state=createGame();history=[];scene.cancelMotion();render();await wait();}
    }
    if (params.get('view')?.startsWith('compact-grid-')) {
      const chapter=params.get('view')!.slice('compact-grid-'.length), columns=chapter==='transfer'?6:5;
      state=createGame();history=[];pendingCompletion=null;
      const id='pp-'+chapter,room=state.rooms[id]!,owner=state.boxes.find(b=>b.inside===id)!;
      state.player={room:id,pos:[...room.spawn!],facing:[0,0,-1],route:[
        {box:'pp-museum',from:'world',entry:[8,0,3]},
        {box:owner.id,from:owner.room,entry:[owner.pos[0],0,owner.pos[2]+1]},
      ]};
      const gates=state.boxes.filter(b=>b.room===id&&b.levelEntry);
      assert(room.size===columns*2+3 && gates.length===(chapter==='transfer'?29:24),'compact grid preserves every puzzle');
      assert(gates.every((b,i)=>b.pos[0]===2+i%columns*2 && b.pos[2]===2+Math.floor(i/columns)*2),'chapter uses its configured columns and one-cell corridors');
      scene.cancelMotion();render();await wait();
      tap('s');await wait();tap('s');await wait();
      assert(state.player.room==='pp-hub','compact gallery south exit returns to the museum');
      state.player={room:id,pos:[...room.spawn!],facing:[0,0,-1],route:[
        {box:'pp-museum',from:'world',entry:[8,0,3]},
        {box:owner.id,from:owner.room,entry:[owner.pos[0],0,owner.pos[2]+1]},
      ]};scene.cancelMotion();render();await wait();
    }
    if (['mirror-chapters', 'mirror-enter'].includes(params.get('view') ?? '')) {
      state = createGame(); history = []; pendingCompletion = null;
      assert(state.rooms.world!.name === '新手村', 'initial world uses the new name');
      for (const [chapter,count] of [['transfer',29],['open',12],['flip',8]] as const)
        assert(state.boxes.filter(b=>b.room === 'pp-'+chapter && b.levelEntry).length === count, chapter+' chapter keeps every available puzzle');
      const gate=state.boxes.find(b=>b.id==='pp-gateway-148')!;
      state.player={room:gate.room,pos:[gate.pos[0],1,gate.pos[2]],facing:[0,0,-1],route:[]};
      scene.cancelMotion();render();await wait();tap('k');await wait();
      assert(state.player.room==='pp-flip1-la','dive into the mirrored self-reference puzzle');
      let reflectedEntries = 0;
      for(const key of 'aaassswwddddsddddawwaaaasawaawwwwwd'){
        const beforeFlip = playerMirrored(state);
        const screenKey = beforeFlip && (key === 'a' || key === 'd') ? (key === 'a' ? 'd' : 'a') : key;
        tap(screenKey);await wait();
        const snapshot = scene.occurrenceSnapshot(), current = scene.diagnostics.playerInstances.find(p=>p.layer==='current')!;
        assert(snapshot.mirrored === playerMirrored(state), 'active occurrence keeps its mirror orientation');
        assert(snapshot.winding === (snapshot.mirrored ? 'cw' : 'ccw') && snapshot.rootScale === (snapshot.mirrored ? -1 : 1), 'mirror hierarchy keeps visible front faces');
        assert(snapshot.playerWorld.every((v,i)=>Math.abs(v-current.position[i]!*(i===0&&snapshot.mirrored?-1:1))<1e-4), 'engine world transform reflects the player with the map');
        if(!beforeFlip && playerMirrored(state)) {
          reflectedEntries++;
          const mirroredState=clone(state);
          tap('z');await wait();assert(!playerMirrored(state)&&!scene.occurrenceSnapshot().mirrored,'undo restores the previous occurrence orientation');
          tap(screenKey);await wait();assert(playerMirrored(state)&&state.player.pos.join()===mirroredState.player.pos.join(),'re-entering restores the mirrored occurrence');
          if(params.get('view')==='mirror-enter') break;
        }
      }
      assert(reflectedEntries>0,'Flip 1 solution crosses a mirrored occurrence');
      if(params.get('view') !== 'mirror-enter') {
        assert(state.completed.includes(158),'Flip 1 completes using the independently generated reference solution');
        await advance(2500);await wait();
        assert(state.player.room==='pp-flip','mirror completion returns to its chapter');
        state.player.pos=[gate.pos[0],1,gate.pos[2]];scene.cancelMotion();render();await wait();tap('k');await wait();
        const copies=scene.diagnostics.playerInstances;
        assert(copies.length===3,'mirror self-reference renders current, parent and child players');
        const current=copies.find(p=>p.layer==='current')!;
        for(const copy of copies.filter(p=>p.owner)){
          const mapping=containmentTransform(state,copy.owner!,copy.layer==='child');
          const expected=transformPoint(current.position,mapping);
          assert(mapping.flipX===true && copy.position.every((v,i)=>Math.abs(v-expected[i]!)<1e-6),'mirrored player occurrence agrees with its containment transform');
        }
        const self=state.boxes.find(b=>b.id==='pp-flip1-la-1')!;
        self.fixed=true;state.player.pos=[2,0,4];scene.cancelMotion();render();await wait();
        tap('d');await advance(300);
        assert(scene.transitioning && scene.occurrenceSnapshot().mirrored,'mirror orientation is retained throughout the entry zoom');
        await wait();
        assert(state.player.pos.join()==='8,0,4' && scene.occurrenceSnapshot().mirrored,'entering the fixed mirror shows the same reflected layout as its preview');
        tap('d');await wait();assert(state.player.pos[0]===7,'keyboard right moves visually right inside a mirror');
        tap('z');await wait();tap('z');await wait();assert(!scene.occurrenceSnapshot().mirrored,'undoing direct mirror entry restores the outer orientation');
        tap('d');await wait();
      }
    }
    if (['theme-nested','theme-inside','theme-gallery'].includes(params.get('view') ?? '')) {
      const seedTheme = (id: string) => {
        state = createGame();
        if(id==='pp-enter1-lr'){
          state.rooms[id]!.theme='rose';state.rooms['pp-enter1-la']!.theme='ocean';
        }
        const room = state.rooms[id]!, gate = state.boxes.find((b) => b.levelEntry && b.inside === id)!;
        const chapter = state.boxes.find((b) => b.inside === gate.room)!;
        state.player = { room: id, pos: [...room.spawn!], facing: directions.w!, route: [
          { box: 'pp-museum', from: 'world', entry: [8, 0, 3] },
          { box: chapter.id, from: 'pp-hub', entry: [chapter.pos[0], 0, chapter.pos[2] + 1] },
          { box: gate.id, from: gate.room, entry: [gate.pos[0], 0, gate.pos[2] + 1] },
        ] };
        history = []; pendingCompletion = null; scene.cancelMotion(); render();
      };
      seedTheme('pp-enter1-lr'); await wait();
      const rootPalette = scene.themePalette(state.player.room), childPalette = scene.themePalette('pp-enter1-la');
      const childWalls = scene.wallPalette('pp-enter1-la', true);
      assert(rootPalette.theme === 'rose' && childPalette.theme === 'ocean',
        'authored nesting gives the red room a contrasting blue interior');
      assert(rootPalette.colors.floor!.length === 4 && rootPalette.colors.tile!.length === 4 &&
        rootPalette.colors.floor![0]! > rootPalette.colors.floor![2]! && rootPalette.colors.tile![0]! > rootPalette.colors.tile![2]! &&
        rootPalette.colors.floor![0]! < rootPalette.colors.tile![0]!,
        'red room uses two visibly different red checkerboard materials');
      assert(childWalls.every((c) => c.length === 4 && c[2]! > c[0]!), 'miniature blue walls use the interior room palette');
      for (const key of 'aawasddsaawassssdsaawaasdddddwd') {
        tap(key); await advance(0);
        if (state.player.room === 'pp-enter1-la') break;
        await wait();
      }
      assert(scene.transitioning && state.player.room === 'pp-enter1-la', 'real movement enters the blue room through its box');
      await advance(300);
      assert(JSON.stringify(scene.wallPalette('pp-enter1-la', false)) === JSON.stringify(childWalls),
        'promoting the miniature to a full room preserves its wall colors mid-zoom');
      assert(scene.themePalette('pp-enter1-lr').theme === 'rose' && scene.themePalette('pp-enter1-la').theme === 'ocean',
        'complete red parent remains distinct from the blue current map');
      await wait();
      assert(JSON.stringify(scene.themePalette('pp-enter1-la').colors.floor) === JSON.stringify(childPalette.colors.floor) &&
        JSON.stringify(scene.themePalette('pp-enter1-la').colors.tile) === JSON.stringify(childPalette.colors.tile),
        'both floor shades stay identical from LOD through entry and final landing');
      const inside = clone(state);
      tap('z'); await wait();
      assert(state.player.room === 'pp-enter1-lr' && scene.themePalette(state.player.room).theme === rootPalette.theme,
        'undoing entry restores the same authored room palette');
      seedTheme('pp-enter7-lr'); await wait();
      const nested = clone(state);
      assert(new Set(['pp-enter7-lr','pp-enter7-la','pp-enter7-lb'].map((id) => scene.themePalette(id).theme)).size === 3,
        'a room containing two different maps shows three distinct room palettes');
      tap('Escape'); await wait();
      assert(new Set(state.boxes.filter((b) => b.room === state.player.room && b.inside).map((b) => scene.themePalette(b.inside!).theme)).size >= 3,
        'chapter gallery shows varied miniature palettes without changing crate goal colors');
      if (params.get('view') !== 'theme-gallery') {
        state = params.get('view') === 'theme-inside' ? inside : nested; scene.cancelMotion(); render(); await wait();
      }
      engine.stop();
    }
    if (params.get('view') === 'theme-reference6') {
      state=createGame();
      const room=state.rooms['pp-reference6-la']!,gate=state.boxes.find(b=>b.levelEntry&&b.inside===room.id)!;
      state.player={room:room.id,pos:[...room.spawn!],facing:[0,0,-1],route:[{box:gate.id,from:gate.room,entry:[...gate.pos]}]};
      history=[];scene.cancelMotion();render();await wait();
      const self=state.boxes.find(b=>b.room===room.id&&b.inside===room.id)!;
      const other=state.boxes.find(b=>b.room===room.id&&b.inside&&b.inside!==room.id)!;
      const root=scene.themePalette(room.id),child=scene.themePalette(other.inside!);
      assert(root.theme!==child.theme,'Reference 6 different map uses a contrasting palette');
      for(const b of [self,other]){
        const shell=scene.containerPalette(b.id),inner=scene.themePalette(b.inside!);
        assert(shell.length===4&&shell.slice(0,3).every((v,i)=>Math.abs(v-inner.colors.wall![i]!)<1e-6),
          `${b.id} translucent casing matches the actual interior palette`);
      }
      const before=clone(state),lod=scene.wallPalette(other.inside!,true);
      state.player={room:other.inside!,pos:[1,0,3],facing:[0,0,1],route:[...state.player.route,{box:other.id,from:room.id,entry:[...other.pos]}]};
      render(before);await advance(300);
      assert(JSON.stringify(scene.wallPalette(other.inside!,false))===JSON.stringify(lod),'Reference 6 LOD promotion preserves wall colors');
      await wait();state=before;scene.cancelMotion();render();await wait();engine.stop();
    }
    if (params.get('view') === 'readability-motion') {
      state = createGame();
      const gate = state.boxes.find((b) => b.id === 'pp-gateway-1')!, room = state.rooms[gate.inside!]!;
      state.player = { room: room.id, pos: [...room.spawn!], facing: directions.w!, route: [
        { box: 'pp-museum', from: 'world', entry: [8, 0, 3] },
        { box: 'pp-chapter-intro', from: 'pp-hub', entry: [3, 0, 6] },
        { box: gate.id, from: gate.room, entry: [gate.pos[0], 0, gate.pos[2] + 1] },
      ] };
      history = []; pendingCompletion = null; scene.cancelMotion(); render(); await wait();
      const palette = scene.goalMarkerPalette();
      assert(palette.length > 4 && palette.every((c) => c[0]! < .4 && c[1]! < .4 && c[2]! < .4 && c[3] === 1),
        'current targets and parent miniature targets share opaque dark gray markers');
      assert($('crate-legend').textContent === '任意箱 → 深灰框', 'goal legend matches the dark marker');
      const warm = scene.resourceSnapshot();
      tap('w'); tap('w'); await advance(WALK_MS / 2);
      assert(scene.moving && Math.abs(scene.diagnostics.playerPosition[2] - 3.5) < .001 && state.player.pos[2] === 3,
        '300ms step remains visibly halfway through its path before the queued move');
      await advance(WALK_MS / 2); await advance(WALK_MS / 2);
      assert(scene.moving && Math.abs(scene.diagnostics.playerPosition[2] - 2.5) < .001,
        'queued movement starts after landing and also animates continuously');
      await wait();
      const walked = scene.resourceSnapshot();
      assert(walked.rebuilds === warm.rebuilds && walked.walkUpdates >= warm.walkUpdates + 2, 'ordinary walks update original actor poses without rebuilding room models');
      tap('z'); await advance(WALK_MS / 2);
      assert(scene.moving && Math.abs(scene.diagnostics.playerPosition[2] - 2.5) < .001,
        'undo uses the same readable movement speed');
      await wait();
      const repeat = scene.resourceSnapshot();
      assert(repeat.wallLayoutBuilds === warm.wallLayoutBuilds,
        'walking and undo reuse cached current, parent and miniature wall layouts');
      assert(repeat.occlusionPasses === warm.occlusionPasses,
        'planar animation frames do not group or test exterior occluders');
      assert(repeat.createdParts === warm.createdParts && repeat.destroyedParts === warm.destroyedParts,
        'slower walking and undo reuse every existing model entity');
      room.walls.push([3, 0, 3]); render(); await wait();
      assert(scene.resourceSnapshot().wallLayoutBuilds === warm.wallLayoutBuilds + 1,
        'an in-place wall edit invalidates exactly the affected cached room layout');
      room.walls.pop(); render(); await wait();
      state.player.pos = [5, 0, 2]; history = []; render(); await wait();
      tap('s'); await advance(WALK_MS / 2);
      const crate = scene.diagnostics.boxPositions.find((b) => b.id === 'pp-intro1-lr-1')!;
      assert(scene.moving && Math.abs(crate.position[2] - 3.5) < .001 && Math.abs(scene.diagnostics.playerPosition[2] - 2.5) < .001,
        'pushed box and hopping player share the slower 300ms clock');
      engine.stop();
    }
    if (['reference-continuity','chapter-flags'].includes(params.get('view') ?? '')) {
      const startReference = () => {
        state = createGame();
        const gateway = state.boxes.find((b) => b.id === 'pp-gateway-54')!;
        const room = state.rooms[gateway.inside!]!;
        state.player = { room: room.id, pos: [...room.spawn!], facing: directions.a!, route: [
          { box: 'pp-museum', from: 'world', entry: [8, 0, 3] },
          { box: 'pp-chapter-reference', from: 'pp-hub', entry: [6, 0, 3] },
          { box: gateway.id, from: gateway.room, entry: [gateway.pos[0], 0, gateway.pos[2] + 1] },
        ] };
        pendingCompletion = null; pendingAction = null; history = []; scene.cancelMotion(); render();
      };
      startReference(); await wait();
      assert(scene.resourceSnapshot().frustumCulling, 'public batched rendering profile enables engine frustum culling');
      const original = scene.diagnostics.actorEntities.find((a) => a.id === 'player')!.entities.join();
      for (const c of 'aa') { tap(c); await wait(); }
      const before = clone(state), steady = scene.diagnostics.parentSceneParts;
      tap('a'); await advance(0);
      assert(scene.transitioning && state.player.room === before.player.room && state.player.route.length === before.player.route.length + 1,
        'Reference 1 enters its actual self box from the authored start');
      assert(scene.diagnostics.playerInstances.length === 3 && scene.diagnostics.parentSceneParts === steady,
        'entry first frame keeps the full parent and all three recursive player occurrences');
      const large = () => scene.diagnostics.playerInstances.find((p) => p.layer === 'parent')!;
      const largeStart = large().scale;
      assert(scene.diagnostics.actorEntities.find((a) => a.id === 'player')!.entities.join() === original,
        'recursive entry retains the original current player model');
      await advance(300);
      assert(large().scale < largeStart && large().scale > 7 && scene.diagnostics.playerInstances.length === 3,
        'large outside self shrinks continuously alongside the entering original');
      assert(scene.diagnostics.parentSceneParts === steady, 'entry midpoint retains the complete authored parent geometry');
      await wait();
      assert(Math.abs(large().scale - 7) < 1e-8 && scene.diagnostics.parentSceneParts === steady,
        'entry settles without generating a late parent scene');
      tap('d'); await advance(0);
      assert(scene.transitioning && scene.diagnostics.parentSceneParts === steady && scene.diagnostics.playerInstances.length === 3,
        'outward first frame already includes the complete parent scene and outside player');
      const smallStart = large().scale;
      await advance(300);
      assert(large().scale > smallStart && large().scale < 7 && scene.diagnostics.parentSceneParts === steady,
        'outward midpoint grows the same outside self without a white perimeter');
      await wait();
      assert(scene.diagnostics.parentSceneParts === steady && scene.diagnostics.actorEntities.find((a) => a.id === 'player')!.entities.join() === original,
        'exit finishes with the same actor and the already-present parent geometry');
      tap('a'); await advance(100); tap('Escape'); await wait();
      assert(state.player.room === 'pp-reference' && !home && !pendingAction,
        'Esc queued during a recursive transition exits the independent puzzle to its chapter');
      tap('z'); await wait();
      assert(state.player.room === 'pp-reference1-la' && !home, 'undo reverses Esc and restores the recursive interior');
      startReference(); await wait();
      for (const c of 'awwawassswddsawassswwddddwddaa'.slice(0,29)) { tap(c); await wait(); }
      assert(state.player.room === 'pp-reference1-lb' && state.player.route.at(-1)!.box === 'pp-reference1-la-1',
        'live input forms A-B-A and keeps the path box as the current physical parent');
      for (const c of 'www') { tap(c); await wait(); }
      assert(state.player.room === 'pp-reference1-la' && state.player.pos.join() === '1,0,4',
        'walking out of the normal path box remains in Reference 1 instead of leaving the chapter gateway');
      const boxes = JSON.stringify(state.boxes);
      tap('Escape'); await wait();
      assert(state.player.room === 'pp-reference' && JSON.stringify(state.boxes) === boxes && !state.completed.includes(64),
        'Esc returns to the chapter without resetting moved boxes or falsely marking completion');
      state.completed.push(64); scene.cancelMotion(); render(); await wait();
      assert(scene.diagnostics.flags.includes('pp-gateway-54') && !scene.diagnostics.flags.includes('pp-gateway-55'),
        'only the completed independent puzzle carries a red corner flag');
      assert(![...document.querySelectorAll('.map-label')].some((n) => /^Reference \d/.test(n.textContent ?? '')),
        'independent puzzle boxes no longer have floating level labels');
      const resources = scene.resourceSnapshot();
      for (let i = 0; i < 3; i++) { render(); await wait(); }
      assert(scene.resourceSnapshot().parts === resources.parts && scene.resourceSnapshot().materials === resources.materials,
        'repeated flag and chapter redraws reuse bounded scene objects and materials');
      if (params.get('view') === 'reference-continuity') {
        startReference(); await wait(); for (const c of 'aa') { tap(c); await wait(); }
        tap('a'); await advance(300);
      }
      engine.stop();
    }
    if (params.get('view') === 'reference-adjacent') {
      state=createGame();const room='pp-reference5-la';
      state.boxes.find(b=>b.id===room+'-1')!.pos=[3,0,4];
      state.boxes.find(b=>b.id===room+'-2')!.pos=[3,0,3];
      state.boxes.find(b=>b.id===room+'-3')!.pos=[3,0,5];
      const gateway=state.boxes.find(b=>b.levelEntry&&b.inside===room)!;
      state.player={room,pos:[5,0,3],facing:[0,0,-1],route:[
        {box:'pp-museum',from:'world',entry:[8,0,3]},
        {box:'pp-chapter-reference',from:'pp-hub',entry:[6,0,3]},
        {box:gateway.id,from:gateway.room,entry:[...gateway.pos]},
      ]};
      history=[];scene.cancelMotion();render();await wait();
      for(const key of 'wwaw'){tap(key);await wait();}
      const before=clone(state),ids=scene.diagnostics.actorEntities.find(a=>a.id==='player')!.entities.join();
      const project=()=>{
        const p=scene.diagnostics.playerInstances.find(v=>v.layer==='current')!.position;
        const vp=mat4.multiply(scene.camera.projectionMatrix,mat4.inverse(scene.orbit.localMatrix));
        const w=vp[3]!*p[0]+vp[7]!*p[1]+vp[11]!*p[2]+vp[15]!;
        return [0,1].map(i=>(vp[i]!*p[0]+vp[i+4]!*p[1]+vp[i+8]!*p[2]+vp[i+12]!)/w);
      };
      const screenBefore=project();tap('w');await advance(0);
      assert(state.player.room==='pp-reference5-lb'&&history.at(-1)!.playerCrossing?.steps?.length===2,
        'Reference 5 records leaving the recursive red occurrence and entering its blue neighbor');
      assert(state.boxes.every((b,i)=>{const old=before.boxes[i]!;return b.id===old.id&&b.room===old.room&&b.inside===old.inside&&b.pos.join()===old.pos.join()&&!!b.flipped===!!old.flipped;}),'crossing does not move the red box into blue');
      assert(project().every((v,i)=>Math.abs(v-screenBefore[i]!)<.002),'adjacent crossing first frame preserves player screen position');
      assert(scene.diagnostics.actorEntities.find(a=>a.id==='player')!.entities.join()===ids,'adjacent crossing animates the original player entity');
      await advance(500);
      assert(scene.diagnostics.playerScale>1/3&&scene.diagnostics.playerScale<1,'adjacent crossing interpolates original player scale');
      await wait();
      const screenAfter=project();tap('z');await advance(0);
      assert(project().every((v,i)=>Math.abs(v-screenAfter[i]!)<.002),'undo composes the two reversed boundaries without teleporting');
      await wait();assert(state.player.room===room&&state.player.pos.join()===before.player.pos.join(),'undo returns to the actual red exit');
      tap('w');await wait();engine.stop();
    }
    if (params.get('view')?.startsWith('recursive-exit')) {
      state = createGame();
      const room = state.rooms['pp-enter18-la']!;
      const gateway = state.boxes.find((b) => b.levelEntry && b.inside === room.id)!;
      const owner = state.boxes.find((b) => b.room === room.id && b.inside === room.id)!;
      state.player = { room: room.id, pos: [...room.spawn!], facing: [0, 0, 1], route: [
        { box: 'pp-museum', from: 'world', entry: [8, 0, 3] },
        { box: 'pp-chapter-enter', from: 'pp-hub', entry: [6, 0, 6] },
        { box: gateway.id, from: gateway.room, entry: [gateway.pos[0], 0, gateway.pos[2] + 1] },
      ] };
      history = []; scene.cancelMotion(); render(); await wait();
      for (const key of 'dss') { tap(key); await wait(); }
      assert(state.player.pos.join() === '4,0,8', 'Enter 18 walks from its authored spawn to the south boundary');
      const before = clone(state), ids = scene.diagnostics.actorEntities.find((a) => a.id === 'player')!.entities.join();
      const projectPlayer = () => {
        const p = scene.diagnostics.playerInstances.find((v) => v.layer === 'current')!.position;
        const vp = mat4.multiply(scene.camera.projectionMatrix, mat4.inverse(scene.orbit.localMatrix));
        const w = vp[3]! * p[0] + vp[7]! * p[1] + vp[11]! * p[2] + vp[15]!;
        return [0, 1].map((i) => (vp[i]! * p[0] + vp[i + 4]! * p[1] + vp[i + 8]! * p[2] + vp[i + 12]!) / w);
      };
      const screenBefore = projectPlayer();
      tap('s'); await advance(0);
      assert(state.player.room === room.id && JSON.stringify(state.player.route) === JSON.stringify(before.player.route) && scene.transitioning,
        'self-root boundary starts an outward portal despite unchanged room ID and navigation route');
      assert(state.player.pos.join() === [owner.pos[0], 0, owner.pos[2] + owner.size].join(), 'exit destination is beneath the actual containing box');
      assert(scene.diagnostics.actorEntities.find((a) => a.id === 'player')!.entities.join() === ids && Math.abs(scene.diagnostics.playerScale - 1 / room.size) < 1e-9,
        'the original current-layer actor crosses at the real parent ratio');
      assert(projectPlayer().every((v, i) => Math.abs(v - screenBefore[i]!) < 1e-5),
        'the current player stays at the same screen position on the first exit frame, never replaced by its child copy');
      assert(scene.diagnostics.actorEntities.filter((a) => a.id.startsWith(`child/${owner.id}/`)).every((a) => a.entities.length === 0),
        'outward scene transition replaces destination child models with the retained source room without duplicate miniatures');
      const after = clone(state), crossing = history.at(-1)!.playerCrossing!;
      assert(crossing.container === owner.id && !crossing.entering, 'history records the physical edge independently of navigation depth');
      await advance(500);
      assert(scene.diagnostics.playerScale > 1 / room.size && scene.diagnostics.playerScale < 1 && scene.orbit.phi === MAP_TOP_PHI,
        'outgoing original player grows smoothly while the fixed-angle camera zooms out');
      await wait();
      assert(scene.diagnostics.playerPosition.join() === state.player.pos.join() && scene.diagnostics.playerScale === 1 && scene.diagnostics.playerInstances.length === 3,
        'original actor lands at the outside exit and all three recursive occurrences resume');
      tap('z'); await advance(0);
      assert(scene.transitioning && scene.diagnostics.playerScale === room.size && state.player.pos.join() === before.player.pos.join(),
        'undo follows the same physical edge inward instead of walking across the shared room');
      await wait();
      assert(scene.diagnostics.actorEntities.find((a) => a.id === 'player')!.entities.join() === ids && scene.diagnostics.playerScale === 1,
        'undo settles the same original actor back at the previous boundary');
      state = after; render(before, false, [], false, false, undefined, crossing); await wait();
      tap('w'); await wait(); tap('w'); await wait(); tap('w'); await wait();
      assert(state.player.route.length === before.player.route.length + 1 && scene.diagnostics.playerInstances.length === 3,
        'after leaving, pushing against the inner wall enters the same self box normally');
      if (params.get('view') === 'recursive-exit-undo') {
        state = after; scene.cancelMotion(); render(); await wait(); state = before;
        render(after, false, [], true, false, undefined, { ...crossing, entering: true });
      } else {
        state = before; scene.cancelMotion(); render(); await wait(); state = after;
        render(before, false, [], false, false, undefined, crossing);
      }
      await advance(300); engine.stop();
    }
    if (params.get('view')?.startsWith('actor-')) {
      state = createGame();
      const owner = state.boxes.find((b) => b.id === 'gate-1')!;
      state.player.pos = [owner.pos[0], 0, owner.pos[2] + 1];
      history = []; scene.cancelMotion(); render(); await wait();
      const before = clone(state);
      const entities = scene.diagnostics.actorEntities.find((a) => a.id === 'player')!.entities.join();
      const palette = scene.wallPalette('level-1', true);
      tap('w'); await advance(180);
      const startScale = scene.diagnostics.playerScale;
      assert(scene.orbit.theta === Math.PI / 18 && scene.orbit.phi === Math.PI / 4 && scene.camera.projectionType === 'perspective',
        'entering changes scale without rotating the camera or changing its lens');
      assert(startScale > 1 && startScale < 7, 'entering character shrinks continuously in the destination coordinate system');
      assert(scene.diagnostics.actorEntities.find((a) => a.id === 'player')!.entities.join() === entities, 'entry preserves every original character entity');
      assert(palette.every((c) => c.length === 4) && JSON.stringify(scene.wallPalette('level-1', false)) === JSON.stringify(palette), 'LOD and detailed walls share exactly the same body and top material colors');
      await advance(230);
      assert(scene.diagnostics.playerScale < startScale, 'character keeps shrinking as it moves into the box');
      await wait();
      assert(scene.diagnostics.playerScale === 1 && scene.diagnostics.actorEntities.find((a) => a.id === 'player')!.entities.join() === entities, 'entry settles at normal size without replacing the character');
      const vp = mat4.multiply(scene.camera.projectionMatrix, mat4.inverse(scene.orbit.localMatrix));
      const half = (state.rooms[state.player.room]!.size + .3) / 2;
      let extent = 0, fullyVisible = true;
      for (const x of [-half, half]) for (const z of [-half, half]) for (const y of [-.87, 1.15]) {
        const w = vp[3]! * x + vp[7]! * y + vp[11]! * z + vp[15]!;
        const depth = (vp[2]! * x + vp[6]! * y + vp[10]! * z + vp[14]!) / w;
        fullyVisible &&= depth >= 0 && depth <= 1;
        extent = Math.max(extent, Math.abs((vp[0]! * x + vp[4]! * y + vp[8]! * z + vp[12]!) / w),
          Math.abs((vp[1]! * x + vp[5]! * y + vp[9]! * z + vp[13]!) / w));
      }
      assert(fullyVisible && Math.abs(extent - .85) < .0001, 'actual camera matrices fit the entire entered board to 85% without clipping its corners');
      const inside = clone(state);
      tap('e'); await advance(450);
      assert(scene.orbit.theta === Math.PI / 18 && scene.orbit.phi === Math.PI / 4 && scene.camera.projectionType === 'perspective',
        'leaving keeps exactly the same 45 degree pitch and 10 degree yaw and lens');
      assert(scene.diagnostics.playerScale > 1 / 7 && scene.diagnostics.playerScale < 1, 'exiting character grows from the same miniature model');
      await wait();
      assert(scene.diagnostics.playerScale === 1 && scene.diagnostics.actorEntities.find((a) => a.id === 'player')!.entities.join() === entities, 'exit settles the original character at its outside size');
      scene.cancelMotion();
      if (params.get('view') === 'actor-entry') {
        state = before; render(); await wait(); state = inside; render(before); await advance(360);
      } else {
        state = inside; render(); await wait(); state = before; render(inside); await advance(560);
      }
      engine.stop();
    }
    if (params.get('view') === 'colors') {
      $('leave').click();
      await wait();
      for (const key of ['a', 'a', 'a', 'a', 'a', 'a', 'w']) {
        tap(key);
        await wait();
      }
      assert(state.player.room === 'level-2', 'two-color target demonstration');
    }
    if (
      ['undo-step', 'undo-box', 'outer-wall'].includes(params.get('view') ?? '')
    ) {
      const seed = (level: number, pos: Vec) => {
        state = createGame();
        state.player = {
          room: `level-${level}`,
          pos,
          facing: [1, 0, 0],
          route: [{ box: `gate-${level}`, from: 'world', entry: [0, 0, 0] }],
        };
        history = [];
        scene.cancelMotion();
        render();
      };
      seed(1, [2, 0, 3]);
      await wait();
      const stepBefore = clone(state);
      tap('d');
      await wait();
      const stepAfter = clone(state);
      tap('z');
      await advance(80);
      const movingBox = scene.diagnostics.boxPositions.find(
        (b) => b.id === 'crate-1',
      )!;
      assert(
        scene.moving &&
          scene.diagnostics.playerPosition[0] > 2 &&
          scene.diagnostics.playerPosition[0] < 3 &&
          movingBox.position[0] > 3 &&
          movingBox.position[0] < 4 &&
          state.moves === 0,
        'undo interpolates both player and pushed crate while restoring the exact snapshot',
      );
      await wait();
      seed(4, [3, 0, 6]);
      await wait();
      for (const key of ['w', 'w']) {
        tap(key);
        await wait();
      }
      tap('j');
      tap('w');
      await wait();
      tap('z');
      tap('z');
      tap('z');
      await wait();
      assert(
        state.player.pos[2] === 6 &&
          state.player.pos[1] === 0 &&
          history.length === 0 &&
          !pendingUndo &&
          !scene.moving,
        'rapid undo requests reverse each move in order without skipping the height transition',
      );
      seed(8, [1, 0, 3]);
      await wait();
      const boxBefore = clone(state);
      tap('d');
      await wait();
      const boxAfter = clone(state),
        transfers = clone(history.at(-1)!.transfers);
      tap('z');
      await advance(450);
      assert(
        scene.moving &&
          scene.diagnostics.boxTransfers[0]!.phase === 'grow' &&
          scene.diagnostics.boxTransfers[0]!.scale > 0.2 &&
          state.boxes.find((b) => b.id === 'crate-8')!.room === 'level-8',
        'undo brings an imported crate back out through its container with growth animation',
      );
      await wait();
      state = createGame();
      history = [];
      scene.cancelMotion();
      render();
      await wait();
      tap('w');
      await wait();
      tap('z');
      await advance(120);
      const gate = scene.diagnostics.mechanisms.find((m) => m.kind === 'gate')!;
      assert(
        !gate.active && gate.offset < 0 && gate.offset > -1.18,
        'undo animates the pressure button and gate back to their previous state',
      );
      await wait();
      seed(6, [2, 0, 3]);
      state.player.room = 'inner-6';
      state.player.route.push({
        box: 'room-6',
        from: 'level-6',
        entry: [3, 0, 4],
      });
      render();
      await wait();
      tap('k');
      await wait();
      const inner = clone(state),
        barriers = outerExitBarriers(state);
      assert(
        state.player.room === 'deep-6' &&
          barriers.length === 2 &&
          scene.diagnostics.outerBarriers.length === 2 &&
          barriers.some((b) => b.direction[0] === 1) &&
          barriers.some((b) => b.direction[2] === 1),
        'nested room shows the actual east and south walls outside its two blocked exits',
      );
      tap('z');
      await advance(190);
      assert(
        scene.transitioning && scene.diagnostics.displayedRoom === 'inner-6' &&
          scene.diagnostics.portalPhase > 0 && scene.diagnostics.portalPhase < 1 && $('canvas').style.opacity === '1',
        'undo leaves a nested room through a camera transition instead of an instant cut',
      );
      const undoRadius = scene.orbit.radius;
      await wait();
      assert(
        state.player.room === 'inner-6' && !scene.transitioning && scene.orbit.radius > undoRadius,
        'animated portal undo restores the original route and parent room',
      );
      scene.cancelMotion();
      if (params.get('view') === 'outer-wall') {
        state = inner;
        render();
        await wait();
      } else if (params.get('view') === 'undo-step') {
        state = stepBefore;
        render(stepAfter, false, [], true);
        await advance(80);
      } else {
        state = boxBefore;
        render(boxAfter, false, reverseTransfers(transfers), true);
        await advance(450);
      }
      assert(
        scene.moving || scene.diagnostics.outerBarriers.length === 2,
        'capture animated undo or exterior wall occlusion at a deterministic pose',
      );
      engine.stop();
    } else if (
      ['pressure-open', 'pressure-closed'].includes(params.get('view') ?? '')
    ) {
      state = createGame();
      history = [];
      scene.cancelMotion();
      render();
      await wait();
      const gate = state.rooms.world!.gates![0]!;
      assert(
        !gateOpen(state, 'world', gate),
        'pressure demo starts with raised iron bars',
      );
      tap('w');
      await advance(120);
      const opening = scene.diagnostics.mechanisms.find(
        (m) => m.kind === 'gate',
      )!;
      assert(
        opening.active && opening.offset < 0 && opening.offset > -1.18,
        'stepping on the round button animates the gate downward',
      );
      await advance(200);
      tap('s');
      await wait();
      assert(
        !gateOpen(state, 'world', gate) &&
          scene.diagnostics.mechanisms.find((m) => m.kind === 'gate')!
            .offset === 0,
        'walking off the button raises the bars again',
      );
      for (const key of ['a', 'a', 'w', 'd']) {
        tap(key);
        await wait();
      }
      assert(
        gatePowered(state, 'world', gate) && state.player.pos[0] === 7,
        'a pushed crate keeps the pressure button active',
      );
      await saves.service.flush();
      const loaded = await saves.load(slot);
      assert(
        !!loaded && gatePowered(loaded, 'world', gate),
        'saving and continuing preserve the crate-held gate',
      );
      const held = clone(state);
      tap('z');
      await wait();
      assert(
        !gateOpen(state, 'world', gate),
        'undo restores the unpressed button and closed gate',
      );
      state = createGame();
      // Isolate occupancy protection: a restored save can contain a player in the gate.
      state.player.pos = [...gate.pos];
      history = [];
      scene.cancelMotion();
      render();
      await wait();
      assert(
        !gatePowered(state, 'world', gate) && gateOpen(state, 'world', gate),
        'gate waits while the player is in its doorway',
      );
      tap('s');
      await wait();
      assert(
        !gateOpen(state, 'world', gate),
        'gate closes as soon as the doorway is clear',
      );
      tap('w');
      await wait();
      assert(
        state.player.pos[2] === 13,
        'closed iron bars reject walking back through',
      );
      state = params.get('view') === 'pressure-open' ? held : createGame();
      scene.cancelMotion();
      render();
      await wait();
      engine.stop();
    } else if (
      ['box-entry', 'box-exit', 'box-outside', 'box-identity'].includes(
        params.get('view') ?? '',
      )
    ) {
      const seed = (n: number) => {
        state = createGame();
        state.player = {
          room: `level-${n}`,
          pos: [1, 0, 3],
          facing: [1, 0, 0],
          route: [{ box: `gate-${n}`, from: 'world', entry: [8, 0, 11] }],
        };
        history = [];
        scene.cancelMotion();
        render();
      };
      seed(8);
      await wait();
      const entering = clone(state);
      const originalCrateEntities = scene.diagnostics.actorEntities.find((a) => a.id === 'crate-8')!.entities.join();
      tap('d');
      await advance(180);
      const shrinking = scene.diagnostics.boxTransfers[0]!;
      if (params.get('view') === 'box-identity') {
        assert(scene.diagnostics.actorEntities.find((a) => a.id === 'crate-8')!.entities.join() === originalCrateEntities,
          'transport animates the original crate entities');
        assert(scene.diagnostics.boxInstances.find((b) => b.id === 'crate-8')?.count === 1,
          'transported crate is excluded from destination LOD while its original model animates');
      }
      assert(
        state.boxes.find((b) => b.id === 'crate-8')!.room === 'inner-8' &&
          shrinking.scale < 1 &&
          shrinking.scale > 0.2 &&
          shrinking.position[0] === 2,
        'crate shrinks in place before entering the receiving box',
      );
      await advance(230);
      assert(
        scene.diagnostics.boxTransfers[0]!.position[0] > 2 &&
          scene.diagnostics.boxTransfers[0]!.scale <= 0.201,
        'small crate slides through the box opening',
      );
      tap('z');
      await wait();
      assert(
        !scene.moving &&
          state.boxes.find((b) => b.id === 'crate-8')!.room === 'level-8',
        'animated undo restores the transferred crate to its original room',
      );
      await wait();
      tap('d');
      await advance(640);
      assert(
        !scene.moving && scene.diagnostics.boxTransfers[0]!.opacity === 1 &&
          scene.diagnostics.boxInstances.find((b) => b.id === 'crate-8')?.count === 1,
        'incoming crate leaves no visible duplicate in its source room',
      );
      if (params.get('view') === 'box-identity') assert(scene.diagnostics.actorEntities.find((a) => a.id === 'crate-8')!.entities.join() === originalCrateEntities,
        'the same crate remains visible at its true miniature destination without a fade or replacement');
      const imported = clone(state);
      seed(7);
      state.player.room = 'inner-7';
      state.player.pos = [3, 0, 2];
      state.player.route.push({
        box: 'room-7',
        from: 'level-7',
        entry: [3, 0, 4],
      });
      render();
      await wait();
      const exporting = clone(state);
      const originalGiftEntities = scene.diagnostics.actorEntities.find((a) => a.id === 'gift-7')!.entities.join();
      tap('d');
      await advance(180);
      assert(
        scene.diagnostics.boxTransfers[0]!.position[0] > 4 &&
          scene.diagnostics.boxTransfers[0]!.scale === 1,
        'exported crate clears the inner doorway before growing',
      );
      await advance(270);
      assert(
        scene.diagnostics.boxTransfers[0]!.scale > 1 &&
          scene.diagnostics.boxTransfers[0]!.phase === 'grow',
        'exported crate grows on the outside of the doorway',
      );
      await advance(190);
      if (params.get('view') === 'box-identity') assert(scene.diagnostics.actorEntities.find((a) => a.id === 'gift-7')!.entities.join() === originalGiftEntities && scene.diagnostics.boxInstances.find((b) => b.id === 'gift-7')?.count === 1,
        'export keeps the original entity and excludes the exterior duplicate');
      const exported = clone(state);
      tap('d');
      assert(
        state.player.room === 'level-7' &&
          state.boxes.find((b) => b.id === 'gift-7')!.pos[0] === 5,
        'walking out pushes the previously exported crate one more cell',
      );
      if (params.get('view') === 'box-identity') {
        await advance(180);
        assert(!scene.diagnostics.retainedActors.includes('gift-7') && scene.diagnostics.actorEntities.find((a) => a.id === 'gift-7')!.entities.join() === originalGiftEntities,
          'player exit reuses the exterior crate and does not retain a second source-scene copy');
      }
      await wait();
      assert(
        !scene.transitioning && scene.diagnostics.displayedRoom === 'level-7',
        'exterior push and player scene transition finish together',
      );
      tap('z');
      await wait();
      assert(
        state.player.room === 'inner-7' &&
          state.boxes.find((b) => b.id === 'gift-7')!.pos[0] === 4,
        'undo restores the player inside and the crate at the exterior doorway',
      );
      state.rooms['level-7']!.walls.push([5, 0, 3]);
      render();
      await wait();
      tap('d');
      assert(
        state.player.room === 'inner-7' &&
          !scene.moving &&
          !scene.transitioning,
        'blocked exterior push remains atomic and starts no crossing animation',
      );
      const inward = params.get('view') === 'box-entry';
      let before = clone(inward ? entering : exporting);
      state = clone(inward ? imported : exported);
      const transfers = transition(before, {
        type: 'move',
        dir: [1, 0, 0],
      }).transfers;
      if (params.get('view') === 'box-outside') {
        // Render the same recorded crossing from its receiving room for visual coverage.
        const observer = {
          room: 'level-7',
          pos: [2, 0, 4] as Vec,
          facing: [1, 0, 0] as Vec,
          route: [before.player.route[0]!],
        };
        before = { ...before, player: clone(observer) };
        state.player = clone(observer);
      }
      scene.cancelMotion();
      render(before, false, transfers);
      await advance(inward ? 260 : 450);
      assert(
        scene.moving && scene.diagnostics.boxTransfers.length === 1,
        'capture the crossing with a single scaled box and rounded joined walls',
      );
      engine.stop();
    } else if (params.get('view') === 'transition') {
      $('leave').click();
      await wait();
      tap('w');
      await advance(230);
      assert(
        scene.transitioning && scene.diagnostics.displayedRoom === state.player.room && $('canvas').style.opacity === '1',
        'capture the camera moving into a world gate',
      );
      engine.stop();
    } else if (['climb', 'descent'].includes(params.get('view') ?? '')) {
      tap('r');
      await wait();
      tap('w');
      await wait();
      tap('j');
      tap('w');
      if (params.get('view') === 'descent') {
        await advance(420);
        tap('s');
        await advance(280);
      } else await advance(210);
      assert(
        scene.moving && scene.diagnostics.playerPosition[1] > 0,
        'capture collision-free traversal at its intermediate pose',
      );
      engine.stop();
    } else if (params.get('view') === 'jump') {
      tap('j');
      await wait();
      assert(
        scene.diagnostics.jumping && scene.diagnostics.lift > 0.8,
        'capture immediate standing jump',
      );
      engine.stop();
    }
    await engine.device.queue.onSubmittedWorkDone();
    assert(errors.length === 0, 'no WebGPU validation errors');
    $('result').textContent = JSON.stringify({
      status: 'passed',
      suite: 'boxbound',
      cases,
      slot,
      room: state.player.room,
      moves: state.moves,
      errors,
      visual: scene.diagnostics,
      audio: audio.diagnostics,
    });
    $('result').dataset.status = 'passed';
    document.body.dataset.renderStatus = 'passed';
  }
}
function fail(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  $('loading').hidden = false;
  $('loading').textContent =
    `小世界暂时无法打开：${message}。请使用支持 WebGPU 的浏览器。`;
  $('result').textContent = JSON.stringify({
    status: 'failed',
    errors: [message],
  });
  $('result').dataset.status = 'failed';
  console.error(error);
}
main().catch(fail);
