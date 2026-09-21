import { HaiyueEngine } from '@haiyue/engine';
import { MemorySaveBackend } from '@haiyue/engine/save';
import { createGame, resetLevel } from './levels';
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
  type Action,
  type State,
  type Vec,
} from './model';
import { BoxboundSaves } from './saves';
import { BoxboundScene } from './scene';
import { remember, type UndoEntry } from './history';
import { profileBoxbound } from './performance';
import { installWorldMap, loadWorldMap } from './world-map';
import { BoxboundAudio } from './audio';
import { finishedLevel, returnFromCompletedLevel } from './completion';
import { soundCues, SOUND_NAMES } from './sound-events';
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
    renderProfile: 'simple',
    devicePixelRatio: () => Math.min(devicePixelRatio, 2),
  });
  await engine.init();
  let visualTime = 0;
  const clock = () => (testing ? visualTime : performance.now());
  const audio = new BoxboundAudio(clock);
  const unlockAudio = (event: Event) => { if (event.isTrusted) void audio.unlock(); };
  window.addEventListener('pointerdown', unlockAudio, { capture: true });
  window.addEventListener('keydown', unlockAudio, { capture: true });
  const scene = new BoxboundScene(engine, $('canvas'), $('labels'), clock),
    saves = new BoxboundSaves(testing ? new MemorySaveBackend() : undefined);
  let state = createGame(),
    history: UndoEntry[] = [],
    slot = 1,
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
    $('crate-legend').textContent = neutralGoals ? '任意箱 → 白色框' : '同色箱 → 同色框';
    $('goal-key').style.borderColor = neutralGoals ? '#b6bbaa' : '';
    $('goal-key').style.background = neutralGoals ? '#fffef5' : '';
    $('moves').textContent = String(state.moves);
    $('completed').textContent =
      `${String(state.completed.length).padStart(2, '0')} / ${levelIds(state).length}`;
    $('progress-bar').style.width = `${state.completed.length / levelIds(state).length * 100}%`;
    $('breadcrumb').textContent = [
      '口袋群岛',
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
  ) {
    if (!previous) clearDirections();
    scene.mood = state.message.startsWith('这里')
      ? 'confused'
      : state.moves > 0 && state.moves % 40 === 0
        ? 'tired'
        : 'smile';
    scene.show(state, previous, jump, transfers, restoring, reset, recoil);
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
    const result = transition(state, action);
    state = result.state;
    if (result.changed) {
      audio.schedule(soundCues(old, state, action, result.recoil, scene.airborne));
      if (result.recoil) pendingAction = null;
      const completed = state.completed.find((n) => !old.completed.includes(n));
      if (completed !== undefined) {
        clearDirections();
        pendingCompletion = { level: completed, state };
      }
      remember(history, old, action.type === 'move' && !!action.jump, result.transfers);
      void persist();
    }
    render(
      old,
      result.changed && action.type === 'move' && !!action.jump,
      result.transfers,
      false, false, result.recoil,
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
    audio.schedule(soundCues(previous, state));
    render(
      previous,
      entry.jump,
      reverseTransfers(entry.transfers),
      true,
      !!entry.reset,
    );
    void persist();
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
    void persist();
  }
  function help() {
    clearDirections();
    $('dialog-content').innerHTML =
      `<div class="eyebrow">A SMALL GUIDE</div><h2>世界，藏在盒子里。</h2><p>将彩色箱子推到相同颜色的方框，再让小方站上笑脸终点。蓝箱、珊瑚红箱与金箱不能互相替代。内层房间的箱子也要全部归位。</p><div class="help-grid"><b>方向键 / WASD</b><span>沿格点移动、推动箱子。</span><b>J</b><span>单按原地起跳；按住方向再按 J，或起跳后按方向，可跳上一级台阶或盒顶。</span><b>K</b><span>从盒顶下钻，或进入面前的盒子。</span><b>E / 边缘开口</b><span>离开当前盒子，回到外层。出口平坦，无需跳跃。</span><b>Z / R</b><span>撤销一步 / 重玩当前小世界及其内层房间，留在当前入口。</span></div><p>带小房间的盒子拥有独立的立方体空间。盒子可以比外观看起来更大！紫色盒子包含自身的引用，进入和离开时会提示 ∞− 与 ∞+。石质基座的房间不能推动；带白色绑带的彩色箱子可以推动。门洞显示每个可进入的方向。围墙统一一格高，顶部九宫格圆点表示不可攀上；光滑台阶和盒顶可以跳上。窄门净宽 0.82 格，只允许角色通过；整格宽门可运输箱子。进入盒子时镜头会靠近入口，带你走进小世界。</p><p>圆形压力按钮可以由角色或箱子压住，压住时铁栅栏降下，离开后升起。箱子留在门洞时会卡住栅栏；推开箱子后若没有压住按钮，栅栏会升起并把角色弹回。通关庆祝结束后会自动转场回到入口所在的大场景。盒内边缘显示外层周围一格的环境。右上角可开关音效。</p><div class="face-row"><img src="assets/smile.svg" alt="笑脸"><img src="assets/confused.svg" alt="困惑脸"><img src="assets/tired.svg" alt="疲惫脸"></div><p>五个存档互相独立，每一步自动保存。首页选存档后继续；世界地图就是关卡入口，没有关卡选择页。</p>`;
    dialog.showModal();
  }
  async function start(fresh: boolean) {
    if (busy) return;
    busy = true;
    try {
      await saves.service.flush();
      state = fresh ? createGame() : ((await saves.load(slot)) ?? createGame());
      home = false;
      const completed = finishedLevel(state);
      pendingCompletion = completed === null ? null : { level: completed, state };
      history = [];
      render();
      await persist();
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
      if (k === 'escape') $('home-button').click();
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
    if (!pendingAction || scene.moving || home || busy || dialog.open) return;
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
    await advance(160);
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
    for (const k of ['a', 'a', 'w', 'd', 'w', 'd', 'w', 'w']) {
      tap(k);
      await wait();
    }
    // Walk into gate 8 at (8, 10); this exercises real keyboard input and nested rendering.
    const outerRadius = scene.orbit.radius;
    tap('w');
    await advance(190);
    assert(
      scene.transitioning &&
        scene.diagnostics.displayedRoom === 'world' &&
        scene.orbit.radius < outerRadius,
      'entry keeps outer scene while camera approaches the box',
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
        scene.diagnostics.studs ===
          state.rooms[state.player.room]!.barriers!.length * 9,
      'opaque one-high walls have nine studs per forbidden top',
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
    if (params.get('view')?.startsWith('parabox-')) {
      state = createGame();
      state.player.pos = [8, 0, 3];
      history = [];
      scene.cancelMotion();
      render();
      await wait();
      tap('w'); await wait();
      assert(state.player.room === 'pp-hub' && state.player.route.length === 1, 'museum doorway enters the separate nested hub');
      assert(scene.diagnostics.decorations.some((d) => d.type === 5), 'red cubic NPC is rendered in the museum');
      tap('w'); await wait(); tap('w'); await wait();
      assert(state.message.includes('红方') && state.player.pos[2] === 14, 'walking up to red friend shows its homage greeting without overlap');
      for (const key of 'aaaaaaawwwwwwwwdw') { tap(key); await wait(); }
      assert(state.player.room === 'pp-intro1-lr' && state.player.pos[0] === 2 && state.player.pos[2] === 4, 'hub gateway uses the original first puzzle spawn');
      assert($('completed').textContent?.endsWith('/ 20'), 'progress includes all twenty playable levels');
      for (const key of 'wwdddsswwwaaaa') { tap(key); await wait(); }
      assert(state.completed.includes(11), 'original first puzzle solves through actual keyboard movement');
      tap('r'); await wait();
      assert(!state.completed.includes(11) && state.player.pos[0] === 2 && state.player.pos[2] === 4, 'R restores the original puzzle and its spawn');
      tap('e'); await wait();
      assert(state.player.room === 'pp-hub' && state.player.route.length === 1, 'E returns from puzzle to museum without leaving the island');
      if (params.get('view') !== 'parabox-hub') {
        state.player.pos = params.get('view') === 'parabox-nested' ? [11, 0, 11] : [8, 0, 11];
        scene.cancelMotion(); render(); await wait();
        tap('w'); await wait();
        if (params.get('view') === 'parabox-nested') {
          for (const key of 'waassasddddwddsaaaddd') {
            tap(key); await wait();
            if (state.player.room === 'pp-intro9-la') break;
          }
        }
      }
      assert(scene.diagnostics.displayedRoom === (params.get('view') === 'parabox-hub' ? 'pp-hub' : params.get('view') === 'parabox-nested' ? 'pp-intro9-la' : 'pp-intro8-lr'), 'capture the requested museum, original puzzle or nested interior');
    }
    if (params.get('view')?.startsWith('completion-')) {
      await audio.unlock();
      state = createGame();
      state.player = { room: 'pp-intro9-lr', pos: [...state.rooms['pp-intro9-lr']!.spawn!], facing: [0, 0, -1], route: [
        { box: 'pp-museum', from: 'world', entry: [8, 0, 3] },
        { box: 'pp-gateway-9', from: 'pp-hub', entry: [11, 0, 11] },
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
      assert(state.player.room === 'pp-hub' && state.player.route.length === 1 && scene.transitioning, 'automatic return exits the entire completed puzzle to its world');
      assert(audio.recent.includes('exit'), 'automatic outward transition plays the exit cue');
      if (params.get('view') === 'completion-outro') {
        await advance(230);
        assert(scene.transitioning && scene.diagnostics.displayedRoom === 'pp-intro9-la', 'capture outward camera motion before switching to the museum');
        engine.stop();
      } else {
        await wait();
        assert(!scene.transitioning && scene.diagnostics.displayedRoom === 'pp-hub', 'return transition settles in the museum with its completed gateway');
        await saves.service.flush();
        const saved = await saves.load(slot);
        assert(saved?.player.room === 'pp-hub' && saved.completed.includes(19), 'automatic return and completion persist together');
        tap('z'); await wait();
        assert(state.player.room === 'pp-intro9-la' && !state.completed.includes(19), 'one undo reverses both the winning move and automatic return');
        tap('d'); await wait(); tap('r'); await wait(); await advance(1800);
        assert(state.player.room === 'pp-intro9-lr' && !state.completed.includes(19) && !scene.transitioning, 'reset during celebration cancels a queued return');
      }
    }
    if (params.get('view') === 'outer-context') {
      state = createGame();
      const parent = state.rooms['pp-hub']!;
      state.player = { room: 'pp-intro1-lr', pos: [...state.rooms['pp-intro1-lr']!.spawn!], facing: [0, 0, -1], route: [
        { box: 'pp-museum', from: 'world', entry: [8, 0, 3] },
        { box: 'pp-gateway-1', from: 'pp-hub', entry: [2, 0, 6] },
      ] };
      parent.walls.push([3, 0, 5]); parent.barriers!.push([3, 0, 5]);
      parent.decorations!.push({ id: 'context-tree', type: 3, pos: [1, 0, 5] });
      const crate = state.boxes.find((b) => b.id === 'crate-1')!;
      crate.room = parent.id; crate.pos = [2, 0, 4];
      parent.buttons = [{ id: 'context-button', pos: [2, 0, 6], channel: 'context' }];
      parent.gates = [{ id: 'context-gate', pos: [3, 0, 4], channel: 'context', axis: 'x' }];
      parent.goals = [[1, 0, 4]]; parent.goalColors = ['gold']; parent.home = [3, 0, 6];
      history = []; scene.cancelMotion(); render(); await wait();
      const context = scene.diagnostics.outerContext!;
      assert(context.parent === 'pp-hub' && context.owner === 'pp-gateway-1' && context.cells.length === 8, 'frame samples exactly the immediate parent neighborhood');
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
      state = createGame();
      state.boxes.find((b) => b.id === 'island-weight')!.pos = [8, 0, 12];
      state.player.pos = [8, 0, 13];
      history = [];
      scene.cancelMotion(); render(); await wait();
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
      assert(saved?.player.pos[2] === 13 && !gateOpen(saved, 'world', gate), 'autosave contains the safe post-recoil position');
      tap('w'); await wait();
      assert(state.player.pos[2] === 13 && state.boxes.find((b) => b.id === 'island-weight')!.pos[2] === 11, 'further input cannot walk through the raised bars');
      tap('z'); await wait();
      assert(gateOpen(state, 'world', gate) && state.boxes.find((b) => b.id === 'island-weight')!.pos[2] === 12, 'one undo restores the crate-held gate');
      tap('w'); await advance(300);
      assert(scene.diagnostics.motionPhase === 'recoil', 'capture the bounce at its deterministic middle frame');
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
        scene.transitioning && scene.diagnostics.displayedRoom === 'deep-6',
        'undo leaves a nested room through a camera transition instead of an instant cut',
      );
      await wait();
      assert(
        state.player.room === 'inner-6' && !scene.transitioning,
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
      ['box-entry', 'box-exit', 'box-outside'].includes(
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
      tap('d');
      await advance(180);
      const shrinking = scene.diagnostics.boxTransfers[0]!;
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
        !scene.moving && scene.diagnostics.boxTransfers[0]!.opacity === 0,
        'incoming crate leaves no visible duplicate in its source room',
      );
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
      const exported = clone(state);
      tap('d');
      assert(
        state.player.room === 'level-7' &&
          state.boxes.find((b) => b.id === 'gift-7')!.pos[0] === 5,
        'walking out pushes the previously exported crate one more cell',
      );
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
        scene.transitioning && scene.diagnostics.displayedRoom === 'world',
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
