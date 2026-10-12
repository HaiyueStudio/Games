import { ArcadeAudio } from './audio';
import { TankBattleHud } from './TankBattleHud';
import { launchMobile } from './mobile';
import { guardQueuedPointerCapture } from './pointerCapture';
import { SingleSlotGameSave, isRecord, isNonNegativeInteger } from '../save/SingleSlotGameSave';
import { BattlefieldRenderer } from './render';
import { createGame, createTank, isGameState, stepGame, STEP, type GameState, type Direction, type Input } from './rules';

interface SaveData { state: GameState; best: number; muted: boolean }
function isSaveData(data: unknown): data is SaveData {
  return isRecord(data) && isGameState(data.state) && isNonNegativeInteger(data.best) && typeof data.muted === 'boolean';
}
function element<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id); if (!el) throw new Error(`Missing game element: ${id}`); return el as T;
}
class TankBattle {
  private readonly abort = new AbortController();
  private readonly canvas = element<HTMLCanvasElement>('gui');
  private readonly restorePointerCapture = guardQueuedPointerCapture(this.canvas);
  private readonly renderer = new BattlefieldRenderer(element<HTMLCanvasElement>('battlefield'));
  private readonly audio = new ArcadeAudio();
  private saveStatus = '进度自动保存';
  private readonly hud = new TankBattleHud(this.canvas, element<HTMLCanvasElement>('battlefield'), element('game'), action => {
    if (action === 'solo') this.start(1);
    if (action === 'duo') this.start(2);
    if (action === 'resume') this.resume();
    if (action === 'pause') this.togglePause();
    if (action === 'menu') { this.pause(); this.menuOpen = true; this.updateHud(); }
    if (action === 'sound') { this.audio.unlock(); this.audio.muted = !this.audio.muted; this.updateHud(); this.save(); }
    this.hud.releaseFocus();
  });
  private readonly saves = new SingleSlotGameSave<SaveData>({
    gameId: 'tank-battle', name: '铁甲前线 自动存档', validateData: isSaveData,
    onStatus: status => { this.saveStatus = ({ idle: '进度自动保存', saving: '正在保存进度…', saved: '进度已保存', error: '保存失败，当前对局仍可继续' })[status]; },
  });
  private state = createGame(2);
  private readonly keys = new Set<string>();
  private readonly pointers = new Map<number, string>();
  private best = 0;
  private hasRun = false;
  private menuOpen = true;
  private lastTime = 0;
  private accumulator = 0;
  private saveTicks = 0;
  private lastHud = '';
  private disposed = false;
  async init(): Promise<void> {
    await this.renderer.init(); await this.hud.init();
    const saved = await this.saves.load();
    if (saved) {
      this.state = saved.state; this.best = saved.best; this.audio.muted = saved.muted; this.hasRun = true;
      if (this.state.phase === 'playing') this.state.phase = 'paused';
    } else {
      for (const [kind, x, y, carrier] of [['scout', 16, 48, false], ['runner', 208, 48, true], ['heavy', 400, 80, false], ['gunner', 144, 208, false]] as const) {
        const tank = createTank(this.state, kind, x, y, 0, carrier); tank.shield = 0; this.state.tanks.push(tank);
      }
    }
    this.bindInput(); this.updateHud();
    if (new URLSearchParams(location.search).get('verify') === '1') {
      Object.defineProperty(window, '__tankBattle', { configurable: true, value: { snapshot: () => structuredClone(this.state), hud: () => this.hud.snapshot() } });
    }
    this.hud.start(this.animate);
    document.body.dataset.renderStatus = 'passed';
  }
  private listen<K extends keyof WindowEventMap>(name: K, callback: (event: WindowEventMap[K]) => void): void {
    window.addEventListener(name, callback, { signal: this.abort.signal });
  }
  private bindInput(): void {
    const options = { signal: this.abort.signal };
    const controls = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyJ', 'Space', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'Enter', 'Slash', 'KeyP', 'Escape']);
    this.listen('keydown', e => {
      if (!controls.has(e.code) || e.altKey || e.ctrlKey || e.metaKey) return;
      if ((e.code === 'KeyP' || e.code === 'Escape') && !e.repeat) { e.preventDefault(); this.togglePause(); return; }
      if (this.menuOpen || this.state.phase !== 'playing') return;
      e.preventDefault(); if (!e.repeat) { this.keys.delete(e.code); this.keys.add(e.code); } this.audio.unlock();
    });
    this.listen('keyup', e => { this.keys.delete(e.code); });
    this.listen('blur', () => this.pause());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.pause(); }, options);
    this.listen('pagehide', e => { this.pause(); this.save(); if (!e.persisted) this.dispose(); });
    this.canvas.addEventListener('pointerdown', e => {
      if (this.menuOpen || this.state.phase !== 'playing') return;
      const key = this.hud.touchKey(e); if (!key) return;
      e.preventDefault(); this.canvas.setPointerCapture(e.pointerId); this.pointers.set(e.pointerId, key); this.audio.unlock();
    }, options);
    const release = (e: PointerEvent) => { this.pointers.delete(e.pointerId); };
    this.canvas.addEventListener('pointerup', release, options);
    this.canvas.addEventListener('pointercancel', release, options);
    this.canvas.addEventListener('lostpointercapture', release, options);
  }
  private input(player: number): Input {
    const mapping: Record<string, Direction> = player === 1 ? { KeyW: 0, KeyD: 1, KeyS: 2, KeyA: 3 } : { ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3 };
    const held = [...this.keys, ...this.pointers.values()]; let direction: Direction | null = null;
    for (const key of held) if (mapping[key] !== undefined) direction = mapping[key]!;
    return { direction, fire: held.some(key => (player === 1 ? ['KeyJ', 'Space'] : ['Enter', 'Slash']).includes(key)) };
  }
  private clearInput(): void { this.keys.clear(); this.pointers.clear(); this.accumulator = 0; }
  private start(mode: 1 | 2): void {
    this.state = createGame(mode); this.hasRun = true; this.menuOpen = false; this.clearInput();
    this.audio.unlock(); this.updateHud(); this.hud.releaseFocus(); this.save();
  }
  private resume(): void {
    if (!this.hasRun || ['gameover', 'victory'].includes(this.state.phase)) return;
    if (this.state.phase === 'paused') this.state.phase = 'playing';
    this.menuOpen = false; this.clearInput(); this.audio.unlock(); this.updateHud(); this.hud.releaseFocus(); this.save();
  }
  private pause(): void {
    this.clearInput();
    if (this.hasRun && this.state.phase === 'playing') { this.state.phase = 'paused'; this.updateHud(); this.save(); }
    if (this.hasRun && this.state.phase === 'cleared') { this.menuOpen = true; this.updateHud(); this.save(); }
  }
  private togglePause(): void {
    if (!this.hasRun) return;
    if (this.state.phase === 'paused' || this.menuOpen) this.resume(); else this.pause();
  }
  private save(): void {
    if (!this.hasRun) return;
    const snapshot = structuredClone(this.state); snapshot.sounds = [];
    this.saves.save({ state: snapshot, best: this.best, muted: this.audio.muted });
  }
  private updateHud(): void {
    const s = this.state; this.best = Math.max(this.best, s.players.reduce((n, p) => n + p.score, 0));
    const signature = JSON.stringify([s.stage, s.phase, s.baseAlive, s.killed, s.total, s.players, Math.ceil(s.freeze / 60), Math.ceil(s.fortify / 60), s.messageTimer > 0 ? s.message : '', this.menuOpen, this.best, this.hasRun, this.audio.muted, this.saveStatus]);
    if (signature === this.lastHud) return; this.lastHud = signature;
    this.hud.update({ state: s, best: this.best, hasRun: this.hasRun, menuOpen: this.menuOpen, muted: this.audio.muted, saveStatus: this.saveStatus });
  }
  private readonly animate = (time: number): void => {
    if (this.disposed) return;
    const delta = Math.min(.1, Math.max(0, (time - (this.lastTime || time)) / 1000)); this.lastTime = time;
    if (!this.menuOpen && (this.state.phase === 'playing' || this.state.phase === 'cleared')) {
      this.accumulator += delta;
      while (this.accumulator >= STEP) {
        const before: GameState['phase'] = this.state.phase; this.accumulator -= STEP;
        stepGame(this.state, [this.input(1), this.input(2)]);
        for (const sound of new Set(this.state.sounds)) this.audio.play(sound);
        this.updateHud();
        if (before !== this.state.phase) { this.clearInput(); this.save(); break; }
        if (++this.saveTicks >= 300) { this.saveTicks = 0; this.save(); }
      }
    }
    this.renderer.draw(this.state); this.updateHud();
  };
  dispose(): void { if (this.disposed) return; this.disposed = true; this.abort.abort(); this.clearInput(); this.audio.dispose(); this.hud.dispose(); this.restorePointerCapture(); }
}
const mobile = matchMedia('(pointer: coarse)').matches || innerWidth < 700 || new URLSearchParams(location.search).get('mobile') === '1';
const game = mobile ? null : new TankBattle();
void (game ? game.init() : launchMobile()).catch(error => {
  game?.dispose(); const fatal = element('fatal'); fatal.hidden = false;
  fatal.textContent = `游戏启动失败：${error instanceof Error ? error.message : String(error)}。请使用支持 WebGPU 的浏览器刷新重试。`;
  document.body.dataset.renderStatus = 'failed'; console.error(error);
});
