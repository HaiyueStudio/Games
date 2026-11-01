import { installGamepad } from '../../gamepad/runtime';
import { gameSession, gameTime } from '../../session/SessionPause';
import { InkBoardArt } from '../art/InkBoardArt';
import { InkBoardView } from '../rendering/BoardView';
import { SingleSlotGameSave } from '../../save/SingleSlotGameSave';
import { coveredCells, createPuzzle, dailySeed, DIFFICULTIES, hint, inkName, INKS, isInkTwinSave, lineComplete, move, newGame, nextNumber, otherInk, restoreGame, trimPath, undo, type Difficulty, type GameState, type Ink, type InkTwinSave } from '../rules/model';

function element<T extends HTMLElement>(id: string): T { const result = document.getElementById(id); if (!result) throw Error(`Missing ${id}`); return result as T; }
const dateKey = (): string => {
  const query = new URLSearchParams(location.search), fixtureDate = query.get('verifyDate');
  if (query.has('verify') && fixtureDate && /^\d{4}-\d{2}-\d{2}$/.test(fixtureDate)) return fixtureDate;
  const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const clock = (seconds: number): string => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

export class InkTwinGame {
  readonly canvas = element<HTMLCanvasElement>('board');
  state: GameState;
  active: Ink = 'black';
  mode: 'daily' | 'practice' = 'daily';
  difficulty: Difficulty = 'easy';
  private readonly cleanup: (() => void)[] = [];
  private drag: number | null = null;
  private started: number | null = null;
  private ended: number | null = null;
  private hintCount = 0;
  private destroyed = false;
  private frame = 0;
  private practiceIndex = 0;
  private puzzleDate = dateKey();
  private shownSeconds = -1;
  readonly view: InkBoardView;
  readonly saves = new SingleSlotGameSave<InkTwinSave>({ gameId: 'ink-twin', name: '墨白双生 · 续卷', validateData: isInkTwinSave });
  constructor(readonly art: InkBoardArt) {
    this.state = newGame(createPuzzle(this.difficulty, dailySeed(dateKey(), this.difficulty)));
    this.view = new InkBoardView(this.canvas, art);
  }
  async init(): Promise<void> {
    await this.view.init(); if (this.destroyed) return;
    const saved = await this.saves.load(); if (this.destroyed) return;
    if (saved && (saved.mode === 'practice' || saved.date === dateKey())) {
      this.difficulty = saved.difficulty; this.mode = saved.mode; this.practiceIndex = saved.practiceIndex;
      this.reset(false); this.puzzleDate = saved.date; this.state = restoreGame(saved); this.active = saved.active; this.hintCount = saved.hints;
      this.started = coveredCells(this.state) > 2 ? gameTime() - saved.seconds * 1000 : null;
      this.message('旧卷已续，黑白两笔分别续写。'); this.update(false);
    } else this.reset(false);
    this.bind(); this.view.run(); this.tick();
  }
  private on(target: EventTarget, type: string, handler: EventListener): void { target.addEventListener(type, handler); this.cleanup.push(() => target.removeEventListener(type, handler)); }
  private bind(): void {
    this.on(this.canvas, 'pointerdown', event => this.pointerDown(event as PointerEvent));
    this.on(this.canvas, 'pointermove', event => this.pointerMove(event as PointerEvent));
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) this.on(this.canvas, type, () => this.endDrag());
    this.on(window, 'blur', () => this.endDrag());
    this.on(window, 'keydown', event => this.key(event as KeyboardEvent));
    this.on(window, 'resize', () => this.resize());
    const resize = new ResizeObserver(() => this.resize()); resize.observe(this.canvas); this.cleanup.push(() => resize.disconnect());
    const click = (id: string, fn: () => void): void => this.on(element(id), 'click', () => { if (!gameSession.paused) fn(); });
    click('undo', () => this.undo()); click('hint', () => this.hint()); click('restart', () => this.reset());
    click('practice', () => this.practice()); click('next-puzzle', () => this.practice());
    click('daily', () => { this.mode = 'daily'; this.reset(); });
    click('select-black', () => this.selectInk('black')); click('select-white', () => this.selectInk('white'));
    click('rules-toggle', () => { const help = element('mobile-help'), button = element('rules-toggle'); help.hidden = !help.hidden; button.setAttribute('aria-expanded', String(!help.hidden)); });
    for (const button of document.querySelectorAll<HTMLButtonElement>('[data-difficulty]')) this.on(button, 'click', () => {
      if (gameSession.paused) return;
      this.difficulty = button.dataset.difficulty as Difficulty; this.reset();
    });
    this.cleanup.push(gameSession.register({ pause: () => this.endDrag(), resume: () => {} }));
    this.cleanup.push(installGamepad('ink-twin'));
  }
  reset(persist = true): void {
    this.endDrag();
    this.puzzleDate = dateKey();
    const seed = this.mode === 'daily' ? dailySeed(this.puzzleDate, this.difficulty) : dailySeed(`${this.puzzleDate}:practice:${this.practiceIndex}`, this.difficulty);
    this.state = newGame(createPuzzle(this.difficulty, seed)); this.active = 'black'; this.started = this.ended = null; this.hintCount = 0; this.shownSeconds = -1;
    element('complete').hidden = true; element('daily').hidden = this.mode === 'daily';
    element('puzzle-mode').textContent = this.mode === 'daily' ? '今日一卷' : '随心练习';
    element('edition').textContent = this.mode === 'daily' ? dateKey().replaceAll('-', ' . ') : `NO. ${String(this.practiceIndex).padStart(3, '0')}`;
    for (const button of document.querySelectorAll('[data-difficulty]')) button.setAttribute('aria-pressed', String((button as HTMLElement).dataset.difficulty === this.difficulty));
    this.message('从黑色或白色的 1 起笔。'); this.resize(); this.update(persist);
  }
  practice(): void { this.mode = 'practice'; this.practiceIndex++; this.reset(); }
  private selectInk(ink: Ink): void {
    this.endDrag(); this.active = ink;
    this.message(`${inkName(ink)} · ${lineComplete(this.state, ink) ? '已到终点，可回退调整路线。' : `下一数字 ${nextNumber(this.state, ink)}`}`); this.update();
  }
  private message(text: string): void { element('status').textContent = text; }
  private resize(): void {
    if (this.destroyed) return;
    this.view.resize();
    this.paint();
  }
  private paint(): void { this.view.draw(this.state, this.active); }
  private elapsed(): number { return this.started === null ? 0 : Math.max(0, Math.floor(((this.ended ?? gameTime()) - this.started) / 1000)); }
  private tick = (): void => {
    if (this.destroyed) return;
    const seconds = this.elapsed(); if (seconds !== this.shownSeconds) { element('timer').textContent = clock(seconds); this.shownSeconds = seconds; }
    if (this.state.won && !this.view.animating && element('complete').hidden) this.showComplete();
    this.frame = requestAnimationFrame(this.tick);
  };
  private save(): void {
    this.saves.save({ schemaVersion: 2, date: this.puzzleDate, difficulty: this.difficulty, mode: this.mode, seed: this.state.puzzle.seed, paths: { black: [...this.state.paths.black], white: [...this.state.paths.white] }, active: this.active, seconds: this.elapsed(), hints: this.hintCount, practiceIndex: this.practiceIndex });
  }
  private update(persist = true): void {
    const { puzzle, paths } = this.state;
    element('progress').textContent = `已落笔 ${coveredCells(this.state)} / ${puzzle.size * puzzle.size}`;
    for (const ink of INKS) element(`select-${ink}`).setAttribute('aria-pressed', String(this.active === ink));
    element<HTMLButtonElement>('undo').disabled = paths[this.active].length === 1;
    element<HTMLButtonElement>('hint').disabled = this.state.won;
    this.canvas.setAttribute('aria-label', `${DIFFICULTIES[this.difficulty].label}，${puzzle.size}乘${puzzle.size}棋盘。已落笔${coveredCells(this.state)}格。${inkName(this.active)}，${lineComplete(this.state, this.active) ? '已到终点' : `下一数字${nextNumber(this.state, this.active)}`}。方向键移动当前线，空格切换墨白，Z撤销当前线，H提示。`);
    this.paint();
    if (this.state.won) {
      this.ended ??= gameTime(); this.endDrag();
      this.message('墨白已合，正在收笔……');
      if (!this.view.animating) this.showComplete();
    }
    if (persist) this.save();
  }
  private showComplete(): void {
    const size = this.state.puzzle.size;
    element('complete-detail').textContent = `${clock(this.elapsed())} · ${this.hintCount ? `借墨 ${this.hintCount} 次` : '独立成卷'} · ${size} × ${size}`;
    element('complete').hidden = false; this.message('每一格都恰到好处。'); element('next-puzzle').focus();
  }
  private apply(cell: number): boolean {
    const result = move(this.state, this.active, cell);
    if (result.kind === 'blocked') { this.message(result.reason!); return false; }
    if (this.started === null) this.started = gameTime();
    this.state = result.state;
    this.message(result.kind === 'backtracked' ? `${inkName(this.active)}收笔，另一条线保留。` : lineComplete(this.state, this.active) ? `${inkName(this.active)}已连完，请续${inkName(otherInk(this.active))}。` : `${inkName(this.active)} · 下一数字 ${nextNumber(this.state, this.active)}`);
    this.update(); return true;
  }
  undo(): void {
    this.endDrag(); const updated = undo(this.state, this.active); if (updated === this.state) return;
    if (this.started !== null && this.ended !== null) this.started += gameTime() - this.ended;
    this.state = updated; this.ended = null; element('complete').hidden = true; this.message(`${inkName(this.active)}收笔一步，另一条线保留。`); this.update();
  }
  hint(): void {
    this.endDrag(); const result = hint(this.state, this.active); if (result.state === this.state) return;
    if (this.started === null) this.started = gameTime(); this.state = result.state; this.active = result.ink; this.hintCount++;
    this.message(result.rewound ? `已收回岔路，保留两笔的可行部分，${inkName(this.active)}续上一格。` : `${inkName(this.active)}借一笔墨，续上一格。`); this.update();
  }
  private cellAt(event: PointerEvent): number | null {
    const rect = this.canvas.getBoundingClientRect(), size = this.state.puzzle.size;
    const x = (event.clientX - rect.left) / rect.width * size, y = (event.clientY - rect.top) / rect.height * size;
    if (x < 0 || y < 0 || x >= size || y >= size) return null;
    return Math.floor(y) * size + Math.floor(x);
  }
  private pointerDown(event: PointerEvent): void {
    if (gameSession.paused || this.state.won || event.button !== 0 || this.drag !== null) return;
    const cell = this.cellAt(event); if (cell === null) return;
    const ink = INKS.find(color => this.state.paths[color].includes(cell));
    if (!ink) { this.message('请从黑白的 1 或已有线条上接着行笔。'); return; }
    event.preventDefault(); this.canvas.focus({ preventScroll: true });
    this.active = ink;
    this.state = trimPath(this.state, ink, this.state.paths[ink].indexOf(cell) + 1);
    this.drag = event.pointerId; this.canvas.setPointerCapture(event.pointerId); this.update();
    this.message(`${inkName(this.active)}独立行笔，依次连接同色数字。`);
  }
  private pointerMove(event: PointerEvent): void {
    if (this.drag !== event.pointerId || gameSession.paused) return;
    event.preventDefault(); const target = this.cellAt(event); if (target === null) return;
    const size = this.state.puzzle.size;
    let tip = this.state.paths[this.active].at(-1)!;
    // Fill skipped cells for fast pointer moves only along one row or column.
    if (tip === target) return;
    if (Math.floor(tip / size) !== Math.floor(target / size) && tip % size !== target % size) return;
    const delta = tip % size === target % size ? Math.sign(target - tip) * size : Math.sign(target - tip);
    for (let n = 0; n < size && tip !== target; n++) { const next = tip + delta; if (!this.apply(next)) break; tip = next; }
  }
  private endDrag(): void {
    const pointer = this.drag; this.drag = null;
    if (pointer !== null && this.canvas.hasPointerCapture(pointer)) this.canvas.releasePointerCapture(pointer);
  }
  private key(event: KeyboardEvent): void {
    if (gameSession.paused || event.ctrlKey || event.altKey || event.metaKey) return;
    const code = event.code || event.key, key = event.key.toLowerCase();
    if ((event.target as HTMLElement)?.matches('button,input,select,textarea') && [' ', 'Enter'].includes(event.key)) return;
    if (key === 'z' || event.key === 'Backspace') { event.preventDefault(); this.undo(); return; }
    if (key === 'h') { event.preventDefault(); this.hint(); return; }
    if (key === 'r') { event.preventDefault(); this.reset(); return; }
    if (code === 'Space' || event.key === ' ') { event.preventDefault(); this.selectInk(otherInk(this.active)); return; }
    const size = this.state.puzzle.size, delta = ({ ArrowUp: -size, ArrowRight: 1, ArrowDown: size, ArrowLeft: -1 } as Record<string, number>)[event.key];
    if (delta === undefined || this.state.won) return;
    event.preventDefault(); this.apply(this.state.paths[this.active].at(-1)! + delta);
  }
  destroy(): void {
    if (this.destroyed) return; this.save(); this.destroyed = true; this.endDrag(); cancelAnimationFrame(this.frame);
    this.cleanup.splice(0).reverse().forEach(remove => remove());
    this.view.destroy();
  }
}

async function start(): Promise<void> {
  let game: InkTwinGame | undefined, disposed = false;
  const onHide = (event: PageTransitionEvent): void => { if (!event.persisted) { disposed = true; game?.destroy(); } };
  window.addEventListener('pagehide', onHide);
  try {
    const art = await InkBoardArt.load(); if (disposed) return;
    game = new InkTwinGame(art); await game.init(); if (disposed) return;
    element('loading').hidden = true; document.body.dataset.renderStatus = 'ready';
    if (new URLSearchParams(location.search).has('verify')) (window as Window & { __inkTwin?: InkTwinGame }).__inkTwin = game;
  } catch (error) {
    game?.destroy(); document.body.dataset.renderStatus = 'failed';
    element('loading').textContent = `展纸未成：${error instanceof Error ? error.message : String(error)}`; console.error(error);
  }
}
void start();
