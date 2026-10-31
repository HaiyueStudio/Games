import { SingleSlotGameSave, isRecord, isNonNegativeInteger } from '../../save/SingleSlotGameSave';
import { InkArt } from '../art/InkArt';
import { collapseTerrain, extendTerrainSites } from '../art/terrainWfc';
import { VersusMatch, greedyChoice, isMatchRecord, cellKey, type VersusMode, type MatchRecord, type Choice } from './VersusRules';
import { VersusView, type DrawingLevel } from './VersusView';

type Mode = 'solo' | VersusMode;
interface VersusSave { mode: Mode; levelIndex: number; seed: number; match: MatchRecord | null; swapped: boolean; rotations: number[] }
function isVersusSave(value: unknown): value is VersusSave {
  return isRecord(value) && (value.mode === 'solo' || value.mode === 'shared' || value.mode === 'race')
    && isNonNegativeInteger(value.levelIndex) && isNonNegativeInteger(value.seed) && value.seed <= 0xffffffff
    && (value.match === null || isMatchRecord(value.match)) && typeof value.swapped === 'boolean'
    && Array.isArray(value.rotations) && value.rotations.length === 2 && value.rotations.every(n => isNonNegativeInteger(n) && n < 6);
}
interface Options {
  canvas: HTMLCanvasElement; levels: DrawingLevel[]; ready: () => boolean;
  now: () => number; sound: (kind: 'turn' | 'place' | 'end') => void;
  present: (canvas: HTMLCanvasElement | null) => void;
  soloLevel: () => number;
  selectSoloLevel: (index: number) => Promise<void>;
}
const seedNumber = (): number => crypto.getRandomValues(new Uint32Array(1))[0]!;

export class VersusController {
  private readonly saves = new SingleSlotGameSave<VersusSave>({ gameId: 'entanglement-path-versus', name: '阡陌交通 · 对弈', validateData: isVersusSave });
  private readonly toolbar = document.createElement('nav');
  private readonly canvas = document.createElement('canvas');
  private readonly announcement = document.createElement('span');
  private readonly seedInput = document.createElement('input');
  private readonly levelSelect = document.createElement('select');
  private readonly modeButtons = new Map<Mode, HTMLButtonElement>();
  private artPromise: Promise<InkArt> | null = null;
  private art: InkArt | null = null;
  private view: VersusView | null = null;
  private generation = 0;
  private disposed = false;
  mode: Mode = 'solo';
  match: VersusMatch | null = null;
  seed = seedNumber();
  levelIndex = 0;
  loading = false;
  private swapped = false;
  private rotations = [0, 0];
  private machineAt = Infinity;
  private machineChoice: Choice | null = null;
  private lastAnnouncement = '';
  private soloFrame = '';
  private readonly toolbarHits: { element: HTMLElement; x: number; y: number; w: number; h: number }[] = [];
  get active(): boolean { return this.mode !== 'solo'; }
  get selection(): Choice { return { swap: this.swapped, rotation: this.rotations[Number(this.swapped)]! }; }
  constructor(private readonly options: Options) {
    this.toolbar.className = 'versus-toolbar'; this.toolbar.ariaLabel = '游戏模式与对战种子';
    this.announcement.className = 'versus-announcement'; this.announcement.setAttribute('role', 'status');
    for (const [mode, label] of [['solo', '独行'], ['shared', '共盘对弈'], ['race', '双盘竞分']] as const) {
      const button = document.createElement('button'); button.textContent = label; button.dataset.mode = mode;
      button.addEventListener('click', () => { void this.setMode(mode); }); this.modeButtons.set(mode, button); this.toolbar.append(button);
    }
    const seedLabel = document.createElement('label'); seedLabel.textContent = '种子 ';
    this.seedInput.type = 'text'; this.seedInput.inputMode = 'numeric'; this.seedInput.maxLength = 10;
    this.seedInput.ariaLabel = '对战随机种子（0至4294967295）'; seedLabel.append(this.seedInput);
    for (const [i, level] of options.levels.entries()) { const option = document.createElement('option'); option.value = String(i); option.textContent = ['山河', '环山', '曲径'][i] ?? level.name; this.levelSelect.append(option); }
    this.levelSelect.ariaLabel = '棋盘形状';
    this.levelSelect.addEventListener('change', () => { this.selectLevel(Number(this.levelSelect.value)); });
    this.toolbar.append(this.levelSelect);
    const restart = document.createElement('button'); restart.textContent = '同种重赛'; restart.dataset.action = 'rematch';
    restart.addEventListener('click', () => {
      if (!/^\d{1,10}$/.test(this.seedInput.value) || Number(this.seedInput.value) > 0xffffffff) { this.seedInput.setCustomValidity('请输入 0 至 4294967295 的整数'); this.seedInput.reportValidity(); return; }
      this.seedInput.setCustomValidity(''); void this.newMatch(Number(this.seedInput.value));
    });
    this.seedInput.addEventListener('input', () => this.seedInput.setCustomValidity(''));
    const fresh = document.createElement('button'); fresh.textContent = '新一局'; fresh.dataset.action = 'new-seed';
    fresh.addEventListener('click', () => { void this.newMatch(seedNumber()); });
    const group = document.createElement('span'); group.className = 'versus-settings'; group.append(seedLabel, restart, fresh);
    this.toolbar.append(group, this.announcement); document.body.append(this.toolbar);
    this.refreshToolbar();
  }
  async init(): Promise<void> {
    const generation = this.generation;
    const saved = await this.saves.load(); if (this.disposed || generation !== this.generation || !saved || saved.levelIndex >= this.options.levels.length) return;
    this.seed = saved.seed; this.levelIndex = saved.levelIndex;
    if (saved.mode === 'solo') { this.refreshToolbar(); return; }
    let match: VersusMatch | undefined;
    try {
      if (saved.match && saved.match.mode === saved.mode && saved.match.seed === saved.seed) match = VersusMatch.restore(this.options.levels[saved.levelIndex]!, saved.match);
    } catch { /* A structurally valid but impossible move history starts a clean match. */ }
    await this.setMode(saved.mode, match);
    if (match && this.match === match) { this.swapped = saved.swapped; this.rotations = saved.rotations; this.view?.invalidate(); this.save(); }
  }
  async setMode(mode: Mode, restored?: VersusMatch): Promise<void> {
    if (this.disposed || !this.options.ready()) return;
    if (mode === this.mode && !restored) return;
    if (this.mode === 'solo' && mode !== 'solo' && !restored) this.levelIndex = this.options.soloLevel();
    this.generation++; this.mode = mode; this.machineAt = Infinity; this.machineChoice = null;
    this.toolbar.dataset.mode = mode; this.soloFrame = '';
    if (mode === 'solo') { this.loading = false; this.refreshToolbar(); this.save(); this.options.canvas.tabIndex = 0; this.options.canvas.focus({ preventScroll: true }); return; }
    await this.newMatch(this.seed, this.levelIndex, restored);
  }
  async newMatch(seed: number, levelIndex = this.levelIndex, restored?: VersusMatch): Promise<void> {
    if (!this.active || this.disposed || !this.options.ready()) return;
    const generation = ++this.generation, mode = this.mode as VersusMode;
    this.seed = seed; this.levelIndex = (levelIndex + this.options.levels.length) % this.options.levels.length;
    this.loading = true; this.machineAt = Infinity; this.machineChoice = null; this.lastAnnouncement = ''; this.refreshToolbar();
    try {
      this.artPromise ??= InkArt.load(); const art = await this.artPromise;
      if (this.disposed) { art.connected.dispose(); return; }
      this.art = art;
      if (generation !== this.generation) return;
      const level = this.options.levels[this.levelIndex]!;
      const world = collapseTerrain(extendTerrainSites(level.cells.map(c => ({ ...c,
        kind: level.wallKeys.has(cellKey(c)) && !(level.startWall && cellKey(c) === cellKey(level.start)) ? 'wall' as const : 'play' as const }))), seed);
      if (!await art.connected.configure(world) || generation !== this.generation || this.disposed) return;
      this.match = restored ?? new VersusMatch(level, seed, mode);
      this.view ??= new VersusView(this.canvas, art); this.view.configure(world, level);
      this.swapped = false; this.rotations = [0, 0]; this.loading = false;
      this.scheduleMachine(); this.refreshToolbar(); this.save(); this.update(); this.options.canvas.tabIndex = 0; this.options.canvas.focus({ preventScroll: true });
    } catch (error) {
      if (generation !== this.generation || this.disposed) return;
      this.loading = false; this.announcement.textContent = '山河绘制失败，请重试'; console.error(error);
    }
  }
  private selectLevel(index: number): void {
    if (this.active) void this.newMatch(this.seed, index);
    else void this.options.selectSoloLevel(index).then(() => {
      if (this.disposed || this.active || !this.options.ready()) return;
      this.options.canvas.tabIndex = 0; this.options.canvas.focus({ preventScroll: true });
    });
  }
  changeLevel(delta: number): void { this.selectLevel((this.active ? this.levelIndex : this.options.soloLevel()) + delta); }
  pointer(clientX: number, clientY: number): boolean {
    if (!this.options.ready()) return false;
    const rect = this.options.canvas.getBoundingClientRect(), x = clientX - rect.left, y = clientY - rect.top;
    const control = this.toolbarHits.find(r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
    if (control) {
      if (control.element === this.levelSelect) { this.changeLevel(1); }
      else if (control.element === this.seedInput) { this.seedInput.focus(); }
      else control.element.click();
      return true;
    }
    if (!this.active) return false;
    if (!this.view || this.loading) return true;
    const hit = this.view.hit(x, y);
    if (hit === 'restart') void this.newMatch(this.seed);
    else if (hit === 'swap') this.swap();
    else if (hit === 'ccw') this.rotate(-1);
    else if (hit === 'cw') this.rotate(1);
    else if (hit === 'place' || this.match && this.view.hitCurrent(x, y, this.match)) this.place();
    return true;
  }
  cycleMode(): void { const modes: Mode[] = ['solo', 'shared', 'race']; void this.setMode(modes[(modes.indexOf(this.mode) + 1) % modes.length]!); }
  private canPlay(): boolean { return this.active && !this.loading && !!this.match && !this.match.winner && this.match.turn === 'human' && !this.match.human.ended; }
  rotate(delta: number): void {
    if (!this.canPlay()) return;
    const i = Number(this.swapped); this.rotations[i] = (this.rotations[i]! + delta + 6) % 6;
    this.options.sound('turn'); this.view?.invalidate(); this.save();
  }
  swap(): void { if (!this.canPlay()) return; this.swapped = !this.swapped; this.options.sound('turn'); this.view?.invalidate(); this.save(); }
  place(): void {
    if (!this.active || this.loading) return;
    if (this.match?.winner) { void this.newMatch(this.seed); return; }
    if (!this.canPlay()) return;
    this.match!.play('human', this.selection); this.afterMove();
  }
  private afterMove(): void {
    this.swapped = false; this.rotations = [0, 0]; this.options.sound(this.match!.winner ? 'end' : 'place');
    this.scheduleMachine(); this.view?.invalidate(); this.save();
  }
  private scheduleMachine(): void {
    this.machineChoice = null; this.machineAt = Infinity;
    if (this.match && !this.match.winner && this.match.turn === 'machine') {
      this.machineChoice = greedyChoice(this.match.level, this.seed, this.match.machine); this.machineAt = this.options.now() + 650;
    }
  }
  update(): void {
    this.toolbar.hidden = !this.options.ready();
    if (this.toolbar.hidden) { this.soloFrame = ''; this.options.present(null); return; }
    const rect = this.options.canvas.getBoundingClientRect();
    if (!this.active) {
      const signature = `${rect.width}:${rect.height}:${this.options.soloLevel()}`;
      if (this.soloFrame !== signature) {
        this.soloFrame = signature;
        this.levelSelect.value = String(this.options.soloLevel());
        const dpr = Math.min(devicePixelRatio || 1, 2, 2048 / Math.max(1, rect.width), 2048 / Math.max(1, rect.height));
        this.canvas.width = Math.max(1, Math.round(rect.width * dpr)); this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
        this.canvas.getContext('2d')!.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.paintToolbar(); this.options.present(this.canvas);
      }
      return;
    }
    if (this.loading || !this.match || !this.view) return;
    const now = this.options.now();
    if (this.machineChoice && now >= this.machineAt && !this.match.winner && this.match.turn === 'machine') {
      this.match.play('machine', this.machineChoice); this.afterMove();
    }
    if (this.view.render(this.match, this.selection, this.machineChoice, now, rect)) { this.paintToolbar(); this.options.present(this.canvas); }
    const text = this.match.winner ? this.match.winner === 'draw' ? '平局' : this.match.winner === 'human' ? '你赢了' : '机器获胜'
      : this.match.turn === 'human' ? '轮到你' : '机器落笔中';
    if (text !== this.lastAnnouncement) { this.lastAnnouncement = text; this.announcement.textContent = text; }
  }
  /** Mirror controls into the engine texture so embedded screens receive the same UI and hit targets. */
  private paintToolbar(): void {
    const ctx = this.canvas.getContext('2d')!, bounds = document.body.getBoundingClientRect();
    this.toolbarHits.length = 0;
    for (const element of this.toolbar.querySelectorAll<HTMLElement>('button, input, select')) {
      const rect = element.getBoundingClientRect(); if (rect.width < 1 || rect.height < 1) continue;
      const x = rect.left - bounds.left, y = rect.top - bounds.top, style = getComputedStyle(element);
      ctx.fillStyle = style.backgroundColor; ctx.fillRect(x, y, rect.width, rect.height);
      ctx.strokeStyle = style.borderColor; ctx.lineWidth = 1; ctx.strokeRect(x + .5, y + .5, rect.width - 1, rect.height - 1);
      ctx.fillStyle = style.color; ctx.font = style.font; ctx.textAlign = element instanceof HTMLButtonElement ? 'center' : 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(element instanceof HTMLSelectElement ? element.selectedOptions[0]!.text : element instanceof HTMLInputElement ? element.value : element.textContent ?? '',
        x + (element instanceof HTMLButtonElement ? rect.width / 2 : parseFloat(style.paddingLeft) + 1), y + rect.height / 2);
      this.toolbarHits.push({ element, x, y, w: rect.width, h: rect.height });
    }
    if (this.active) {
      const label = this.seedInput.parentElement!.getBoundingClientRect();
      ctx.fillStyle = '#263e36'; ctx.textAlign = 'left'; ctx.fillText('种子', label.left - bounds.left, label.top - bounds.top + label.height / 2);
    }
  }
  private refreshToolbar(): void {
    for (const [mode, button] of this.modeButtons) button.setAttribute('aria-pressed', String(mode === this.mode));
    this.seedInput.value = String(this.seed); this.levelSelect.value = String(this.levelIndex);
    this.toolbar.dataset.mode = this.mode; this.toolbar.hidden = !this.options.ready();
    this.announcement.textContent = this.loading ? '正在绘制同种山河…' : '';
  }
  private save(): void {
    if (this.loading) return;
    this.saves.save({ mode: this.mode, levelIndex: this.levelIndex, seed: this.seed, match: this.match?.record() ?? null,
      swapped: this.swapped, rotations: [...this.rotations] });
  }
  dispose(): void {
    this.disposed = true; this.generation++; this.machineAt = Infinity;
    this.art?.connected.dispose(); this.view?.dispose(); this.canvas.remove(); this.toolbar.remove();
    this.options.present(null);
  }
}
