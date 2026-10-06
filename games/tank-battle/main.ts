import { SingleSlotGameSave, isRecord, isNonNegativeInteger } from '../save/SingleSlotGameSave';
import { BattlefieldRenderer } from './render';
import { createGame, createTank, isGameState, stepGame, STEP, STAGE_NAMES, type GameState, type Direction, type Input } from './rules';

interface SaveData { state: GameState; best: number; muted: boolean }
function isSaveData(data: unknown): data is SaveData {
  return isRecord(data) && isGameState(data.state) && isNonNegativeInteger(data.best) && typeof data.muted === 'boolean';
}
function element<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id); if (!el) throw new Error(`Missing game element: ${id}`); return el as T;
}
class ArcadeAudio {
  private context: AudioContext | null = null;
  muted = false;
  unlock(): void {
    try { this.context ??= new AudioContext(); void this.context.resume().catch(() => {}); } catch { /* Audio is optional. */ }
  }
  play(kind: GameState['sounds'][number]): void {
    if (this.muted || !this.context || this.context.state !== 'running') return;
    const c = this.context; const oscillator = c.createOscillator(); const gain = c.createGain();
    const settings = { shoot: [650, 120, .055, .022], hit: [110, 65, .05, .018], explode: [80, 25, .23, .07], pickup: [420, 1100, .19, .045], over: [200, 35, .65, .06], clear: [360, 950, .4, .05] }[kind]!;
    oscillator.type = kind === 'explode' ? 'sawtooth' : 'square';
    oscillator.frequency.setValueAtTime(settings[0]!, c.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(settings[1]!, c.currentTime + settings[2]!);
    gain.gain.setValueAtTime(settings[3]!, c.currentTime); gain.gain.exponentialRampToValueAtTime(.001, c.currentTime + settings[2]!);
    oscillator.connect(gain); gain.connect(c.destination); oscillator.start(); oscillator.stop(c.currentTime + settings[2]!);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }
  dispose(): void { void this.context?.close().catch(() => {}); }
}
class TankBattle {
  private readonly abort = new AbortController();
  private readonly canvas = element<HTMLCanvasElement>('battlefield');
  private readonly renderer = new BattlefieldRenderer(this.canvas);
  private readonly audio = new ArcadeAudio();
  private readonly saves = new SingleSlotGameSave<SaveData>({
    gameId: 'tank-battle', name: '铁甲前线 自动存档', validateData: isSaveData,
    onStatus: status => { element('save-status').textContent = ({ idle: '进度自动保存', saving: '正在保存进度…', saved: '进度已保存', error: '保存失败，当前对局仍可继续' })[status]; },
  });
  private state = createGame(2);
  private readonly keys = new Set<string>();
  private readonly pointers = new Map<number, string>();
  private best = 0;
  private hasRun = false;
  private menuOpen = true;
  private frame = 0;
  private lastTime = 0;
  private accumulator = 0;
  private saveTicks = 0;
  private lastHud = '';
  private disposed = false;
  async init(): Promise<void> {
    await this.renderer.init();
    const saved = await this.saves.load();
    if (saved) {
      this.state = saved.state; this.best = saved.best; this.audio.muted = saved.muted; this.hasRun = true;
      if (this.state.phase === 'playing') this.state.phase = 'paused';
    } else {
      // A fixed, non-running title-screen composition for repeatable previews.
      for (const [kind, x, y, carrier] of [['scout', 16, 48, false], ['runner', 208, 48, true], ['heavy', 400, 80, false], ['gunner', 144, 208, false]] as const) {
        const tank = createTank(this.state, kind, x, y, 0, carrier); tank.shield = 0; this.state.tanks.push(tank);
      }
    }
    this.bindInput(); this.updateSoundButton(); this.showOverlay(); this.updateHud();
    if (new URLSearchParams(location.search).get('verify') === '1') {
      Object.defineProperty(window, '__tankBattle', { configurable: true, value: { snapshot: () => structuredClone(this.state) } });
    }
    document.body.dataset.renderStatus = 'passed';
    this.frame = requestAnimationFrame(this.animate);
  }
  private listen<K extends keyof WindowEventMap>(name: K, callback: (event: WindowEventMap[K]) => void): void {
    window.addEventListener(name, callback, { signal: this.abort.signal });
  }
  private bindInput(): void {
    const options = { signal: this.abort.signal };
    element('solo').addEventListener('click', () => this.start(1), options);
    element('duo').addEventListener('click', () => this.start(2), options);
    element('resume').addEventListener('click', () => this.resume(), options);
    element('pause').addEventListener('click', () => this.togglePause(), options);
    element('menu').addEventListener('click', () => {
      this.pause(); this.menuOpen = true; this.showOverlay();
    }, options);
    element('sound').addEventListener('click', () => {
      this.audio.unlock(); this.audio.muted = !this.audio.muted; this.updateSoundButton(); this.save();
    }, options);
    const controls = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyJ', 'Space', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'Enter', 'Slash', 'KeyP', 'Escape']);
    this.listen('keydown', e => {
      if (!controls.has(e.code) || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.target instanceof HTMLButtonElement && (e.code === 'Enter' || e.code === 'Space')) return;
      if ((e.code === 'KeyP' || e.code === 'Escape') && !e.repeat) { e.preventDefault(); this.togglePause(); return; }
      if (this.menuOpen || this.state.phase !== 'playing') return;
      e.preventDefault(); if (!e.repeat) { this.keys.delete(e.code); this.keys.add(e.code); } this.audio.unlock();
    });
    this.listen('keyup', e => { this.keys.delete(e.code); });
    this.listen('blur', () => this.pause());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.pause(); }, options);
    this.listen('pagehide', e => { this.pause(); this.save(); if (!e.persisted) this.dispose(); });
    for (const button of document.querySelectorAll<HTMLButtonElement>('[data-key]')) {
      button.addEventListener('pointerdown', e => {
        if (this.menuOpen || this.state.phase !== 'playing') return;
        e.preventDefault(); button.setPointerCapture(e.pointerId); this.pointers.set(e.pointerId, button.dataset.key!); this.audio.unlock();
      }, options);
      const release = (e: PointerEvent) => { this.pointers.delete(e.pointerId); };
      button.addEventListener('pointerup', release, options); button.addEventListener('pointercancel', release, options); button.addEventListener('lostpointercapture', release, options);
    }
  }
  private input(player: number): Input {
    const mapping: Record<string, Direction> = player === 1 ? { KeyW: 0, KeyD: 1, KeyS: 2, KeyA: 3 } : { ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3 };
    const held = [...this.keys, ...this.pointers.values()]; let direction: Direction | null = null;
    for (const key of held) if (mapping[key] !== undefined) direction = mapping[key]!;
    const fire = held.some(key => (player === 1 ? ['KeyJ', 'Space'] : ['Enter', 'Slash']).includes(key));
    return { direction, fire };
  }
  private clearInput(): void { this.keys.clear(); this.pointers.clear(); this.accumulator = 0; }
  private start(mode: 1 | 2): void {
    this.state = createGame(mode); this.hasRun = true; this.menuOpen = false; this.clearInput();
    this.audio.unlock(); this.showOverlay(); this.updateHud(); this.canvas.focus({ preventScroll: true }); this.save();
  }
  private resume(): void {
    if (!this.hasRun || ['gameover', 'victory'].includes(this.state.phase)) return;
    if (this.state.phase === 'paused') this.state.phase = 'playing';
    this.menuOpen = false; this.clearInput(); this.audio.unlock(); this.showOverlay(); this.canvas.focus({ preventScroll: true }); this.save();
  }
  private pause(): void {
    this.clearInput();
    if (this.hasRun && this.state.phase === 'playing') { this.state.phase = 'paused'; this.showOverlay(); this.save(); }
    // A cleared stage also stops advancing whenever the menu is open or focus is lost.
    if (this.hasRun && this.state.phase === 'cleared') { this.menuOpen = true; this.showOverlay(); this.save(); }
  }
  private togglePause(): void {
    if (!this.hasRun) return;
    if (this.state.phase === 'paused' || this.menuOpen) this.resume(); else this.pause();
  }
  private showOverlay(): void {
    const phase = this.state.phase;
    const ended = phase === 'gameover' || phase === 'victory';
    element('overlay').hidden = !this.menuOpen && !ended && phase !== 'paused';
    const resumable = this.hasRun && !ended;
    element('resume').hidden = !resumable;
    element('overlay-title').textContent = ended ? (phase === 'victory' ? '防线守住了' : '作战结束') : this.menuOpen ? '守住最后的防线' : '作战已暂停';
    element('overlay-description').textContent = ended
      ? `${phase === 'victory' ? '五个战区全部肃清。' : this.state.message + '。'}总分 ${this.state.players.reduce((s, p) => s + p.score, 0)} · 选择模式再次出击。`
      : resumable ? `第 ${this.state.stage} 关 · ${STAGE_NAMES[this.state.stage - 1]}。继续当前进度，或选择模式开始新任务。`
        : '驾驶坦克突破敌阵，保护你的基地。击毁闪光敌军，收集战场补给。';
    element<HTMLButtonElement>('pause').disabled = !this.hasRun || ended;
    element<HTMLButtonElement>('menu').disabled = !this.hasRun;
    element('pause').innerHTML = phase === 'paused' || this.menuOpen ? '▶ 继续 <kbd>P</kbd>' : 'Ⅱ 暂停 <kbd>P</kbd>';
    element('stage-clear').hidden = phase !== 'cleared' || this.menuOpen;
  }
  private updateSoundButton(): void {
    element('sound').textContent = this.audio.muted ? '♪ 声音 关' : '♪ 声音 开';
    element('sound').setAttribute('aria-pressed', String(this.audio.muted));
  }
  private save(): void {
    if (!this.hasRun) return;
    const snapshot = structuredClone(this.state); snapshot.sounds = [];
    this.saves.save({ state: snapshot, best: this.best, muted: this.audio.muted });
  }
  private updateHud(): void {
    const s = this.state;
    this.best = Math.max(this.best, s.players.reduce((n, p) => n + p.score, 0));
    const signature = JSON.stringify([s.stage, s.phase, s.killed, s.total, s.players, s.freeze > 0 ? Math.ceil(s.freeze / 60) : 0, s.fortify > 0 ? Math.ceil(s.fortify / 60) : 0, s.messageTimer > 0 ? s.message : '', this.menuOpen, this.best]);
    if (signature === this.lastHud) return; this.lastHud = signature;
    const stage = String(s.stage).padStart(2, '0');
    element('sector').textContent = stage; element('stage-caption').textContent = `${stage} / ${STAGE_NAMES[s.stage - 1]}`;
    element('stage-name').textContent = STAGE_NAMES[s.stage - 1]!; element('stage-count').textContent = `${stage} / 05`;
    element('stage-progress').style.width = `${s.stage * 20}%`;
    element('phase-label').textContent = this.menuOpen ? '等待指令' : ({ playing: '作战进行中', paused: '作战暂停', cleared: '区域肃清', gameover: '任务结束', victory: '任务完成' })[s.phase];
    element('enemy-count').textContent = String(s.total - s.killed).padStart(2, '0');
    const grid = element('enemy-grid');
    if (grid.childElementCount !== s.total) grid.replaceChildren(...Array.from({ length: s.total }, () => {
      const img = document.createElement('img'); img.src = './assets/scout-0-0.png'; img.alt = ''; return img;
    }));
    [...grid.children].forEach((img, i) => img.classList.toggle('defeated', i < s.killed));
    for (let i = 1; i <= 2; i++) {
      const p = s.players[i - 1];
      element(`p${i}-lives`).textContent = p ? (p.lives === 0 ? '已阵亡' : p.lives <= 5 ? '▰ '.repeat(p.lives).trim() : `▰ × ${p.lives}`) : '未加入';
      element(`p${i}-score`).textContent = String(p?.score ?? 0).padStart(6, '0');
      element(`p${i}-level`).textContent = `LV. ${(p?.level ?? 0) + 1}`;
      element<HTMLImageElement>(`p${i}-image`).src = `./assets/p${i}-${p?.level ?? 0}-0.png`;
    }
    element('best').textContent = String(this.best).padStart(6, '0');
    element('base-state').textContent = !s.baseAlive ? '基地失守' : s.fortify > 0 ? `加固 ${Math.ceil(s.fortify / 60)}s` : '基地完好';
    element('base-light').style.background = s.baseAlive ? '#a5bb80' : '#d36b50';
    element('message').textContent = !this.hasRun ? '选择模式，准备出击。' : s.freeze > 0 ? `敌军冻结 · ${Math.ceil(s.freeze / 60)}s` : s.messageTimer > 0 ? s.message : '消灭敌军 · 保护基地';
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
        if (before !== this.state.phase) { this.clearInput(); this.showOverlay(); this.save(); break; }
        if (++this.saveTicks >= 300) { this.saveTicks = 0; this.save(); }
      }
    }
    this.renderer.draw(this.state); this.updateHud(); this.frame = requestAnimationFrame(this.animate);
  };
  dispose(): void { this.disposed = true; cancelAnimationFrame(this.frame); this.abort.abort(); this.clearInput(); this.audio.dispose(); }
}
const game = new TankBattle();
void game.init().catch(error => {
  game.dispose(); const fatal = element('fatal'); fatal.hidden = false;
  fatal.textContent = `游戏启动失败：${error instanceof Error ? error.message : String(error)}。请刷新页面重试。`;
  document.body.dataset.renderStatus = 'failed'; console.error(error);
});
