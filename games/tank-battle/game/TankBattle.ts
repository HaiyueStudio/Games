import { element } from '../ui/dom';
import { TankSimulation } from './TankSimulation';
import { ArcadeAudio } from '../audio/audio';
import { TankBattleHud } from '../ui/TankBattleHud';
import { guardQueuedPointerCapture } from '../input/pointerCapture';
import { desktopTankInput } from '../input/desktopControls';
import { SingleSlotGameSave, isRecord, isNonNegativeInteger } from '../../save/SingleSlotGameSave';
import { BattlefieldRenderer } from '../rendering/render';
import { createGame, createTank, isGameState, type GameState, type Input } from '../rules/rules';

interface SaveData { state: GameState; best: number; muted: boolean }
function isSaveData(data: unknown): data is SaveData {
  return isRecord(data) && isGameState(data.state) && isNonNegativeInteger(data.best) && typeof data.muted === 'boolean';
}

export class TankBattle {
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
  private readonly simulation = new TankSimulation();
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
  private input(player: 1 | 2): Input { return desktopTankInput(player, this.keys, this.pointers.values()); }
  private clearInput(): void { this.keys.clear(); this.pointers.clear(); this.simulation.reset(); }
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
    this.best = Math.max(this.best, this.state.players.reduce((score, player) => score + player.score, 0));
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
      const transitioned = this.simulation.advance(delta * 1000, this.state, [this.input(1), this.input(2)], changed => {
        for (const sound of new Set(this.state.sounds)) this.audio.play(sound);
        if (changed) return;
        if (++this.saveTicks >= 300) { this.saveTicks = 0; this.save(); }
      });
      if (transitioned) { this.clearInput(); this.save(); }
    }
    this.renderer.draw(this.state); this.updateHud();
  };
  dispose(): void { if (this.disposed) return; this.disposed = true; this.abort.abort(); this.clearInput(); this.audio.dispose(); this.hud.dispose(); this.restorePointerCapture(); }
}
