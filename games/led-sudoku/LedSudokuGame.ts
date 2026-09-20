import { SingleSlotGameSave } from '../save/SingleSlotGameSave';
import { BoardView } from './board-view';
import { COLORS, drawDigit, drawClock } from './led-display';
import { GeneratorClient } from './generator-client';
import { DEFAULT_OPTIONS, DIGITS, SEGMENTS, candidates, cellRuleDetails, findHint, isSaveData, type Hint, type Options, type SaveData } from './rules';
import { complete, editable, place, type Move } from './session';
const RULE_KEYS = ['diagonal', 'missing', 'killer', 'renban', 'consecutive', 'inequality', 'multiDiagonal', 'exclusion', 'parity'] as const;
const SETTING_KEYS = ['led', ...RULE_KEYS] as const;
const RULE_LABELS = ['对角线', '缺一门', '杀手', 'Renban', '差 1', '数比', '多对角线', '排除点', '奇偶'];
function el<T extends HTMLElement = HTMLElement>(id: string): T { const e = document.getElementById(id); if (!e) throw new Error(`Missing LED Sudoku element: ${id}`); return e as T; }
export class LedSudokuGame {
  private state: SaveData | null = null;
  private selected = -1;
  private hint: Hint | null = null;
  private pencil = false;
  private glow = true;
  private history: Move[] = [];
  private options: Options = { ...DEFAULT_OPTIONS };
  private view = new BoardView();
  private generator = new GeneratorClient();
  private listeners = new AbortController();
  private timer: ReturnType<typeof setInterval> | undefined;
  private lastTick = performance.now();
  private loading = false;
  private stopped = false;
  private ready = false;
  private generation = 0;
  private confirmation: (() => void) | null = null;
  private readonly saves = new SingleSlotGameSave<SaveData>({ gameId: 'led-sudoku', name: '流光数独自动存档', validateData: isSaveData, onStatus: status => {
    if (!this.stopped) el('save-status').textContent = status === 'error' ? '存档失败 · 请检查浏览器存储' : status === 'saving' ? '正在保存…' : '进度自动保存';
  } });
  async init(): Promise<void> {
    this.bind(); this.createKeypad(); this.updateTimer();
    await this.view.init(el<HTMLCanvasElement>('board'));
    if (this.stopped) return;
    this.ready = true;
    const query = new URLSearchParams(location.search), seedText = query.get('seed');
    const saved = seedText === null ? await this.saves.load() : null;
    if (this.stopped) return;
    if (saved) { this.state = saved; this.options = { ...DEFAULT_OPTIONS, ...saved.puzzle.options }; this.syncSettings(); this.selectFirst(); this.render(); this.status(complete(saved) ? '已恢复完成的棋局。' : '已恢复上次的棋局与推理。'); }
    else {
      for (const key of SETTING_KEYS) {
        if (query.get(key) === '1') this.options[key] = true;
        else if (query.get(key) === '0') this.options[key] = false;
      }
      const difficulty = query.get('difficulty'); if (difficulty === 'easy' || difficulty === 'normal' || difficulty === 'hard') this.options.difficulty = difficulty;
      this.syncSettings(); await this.newGame(seedText === null ? undefined : Number(seedText) >>> 0);
    }
    if (this.stopped) return;
    this.lastTick = performance.now();
    this.timer = setInterval(() => { this.tick(); this.updateTimer(); }, 1000);
  }
  private on(target: EventTarget, event: string, handler: EventListener): void { target.addEventListener(event, handler, { signal: this.listeners.signal }); }
  private bind(): void {
    const button = (id: string, fn: () => void) => this.on(el(id), 'click', fn);
    button('new', () => {
      if (!this.ready) return;
      this.options = { ...DEFAULT_OPTIONS, ...this.state?.puzzle.options };
      this.syncSettings();
      el<HTMLDialogElement>('new-dialog').showModal();
    });
    button('cancel-new', () => el<HTMLDialogElement>('new-dialog').close());
    button('start-new', () => {
      el<HTMLDialogElement>('new-dialog').close();
      void this.newGame();
    });
    button('solve', () => { if (this.state && !this.loading && !complete(this.state)) this.confirm('显示完整答案？', '本局将标记为“辅助完成”，仍可通过撤销回到刚才的棋局。', () => {
      if (!this.state) return;
      this.remember(); this.state = { ...this.state, board: this.state.solution.slice(), notes: Array(81).fill(0), assisted: true }; this.hint = null; this.commit('答案已展示 · 辅助完成。');
    }); });
    button('undo', () => { const previous = this.history.pop(); if (this.state && previous && !this.loading) { this.state = { ...this.state, ...previous }; this.hint = null; this.commit('已撤销上一步。'); } });
    button('erase', () => this.input(0));
    button('notes', () => { this.pencil = !this.pencil; this.render(); });
    button('glow', () => { this.glow = !this.glow; this.render(); });
    button('hint', () => this.showHint(false)); button('explain', () => this.showHint(true));
    button('help', () => el<HTMLDialogElement>('help-dialog').showModal());
    button('close-help', () => el<HTMLDialogElement>('help-dialog').close());
    button('cancel-confirm', () => { this.confirmation = null; el<HTMLDialogElement>('confirm-dialog').close(); });
    button('accept-confirm', () => { const action = this.confirmation; this.confirmation = null; el<HTMLDialogElement>('confirm-dialog').close(); action?.(); });
    this.on(el('confirm-dialog'), 'cancel', () => { this.confirmation = null; });
    document.querySelectorAll<HTMLButtonElement>('[data-difficulty]').forEach(b => this.on(b, 'click', () => { this.options.difficulty = b.dataset.difficulty as Options['difficulty']; this.syncSettings(); }));
    SETTING_KEYS.forEach(k => this.on(el(k), 'change', () => { this.options[k] = el<HTMLInputElement>(k).checked; }));
    this.on(el('board'), 'pointerdown', event => {
      if (!this.state || this.loading) return;
      const e = event as PointerEvent, canvas = el<HTMLCanvasElement>('board'), rect = canvas.getBoundingClientRect();
      const x = Math.floor((e.clientX - rect.left) / rect.width * 9), y = Math.floor((e.clientY - rect.top) / rect.height * 9);
      if (x < 0 || y < 0 || x > 8 || y > 8 || this.state.puzzle.blocked[y * 9 + x]) return;
      this.selected = y * 9 + x; this.hint = null; canvas.focus({ preventScroll: true }); this.render();
    });
    this.on(document, 'keydown', event => {
      const e = event as KeyboardEvent;
      if (document.querySelector('dialog[open]') || (e.target instanceof HTMLInputElement) || !this.state || this.loading) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); el('undo').click(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (/^[1-9]$/.test(e.key)) { e.preventDefault(); this.input(Number(e.key)); }
      else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') { e.preventDefault(); this.input(0); }
      else if (e.key.toLowerCase() === 'n') { e.preventDefault(); el('notes').click(); }
      else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        e.preventDefault(); const delta = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' ? -9 : 9;
        let next = this.selected < 0 ? 0 : this.selected;
        for (let n = 0; n < 81; n++) { next = (next + delta + 81) % 81; if (!this.state.puzzle.blocked[next]) break; }
        this.selected = next; this.hint = null; this.render();
      }
    });
    this.on(document, 'visibilitychange', () => { this.tick(); if (this.state) this.save(); });
    this.on(window, 'pagehide', event => { this.tick(); if (this.state) this.save(); if (!(event as PageTransitionEvent).persisted) this.stop(); });
  }
  private createKeypad(): void {
    for (const d of DIGITS) {
      const b = document.createElement('button'); b.id = `digit-${d}`; b.setAttribute('aria-label', `填入 ${d}`); b.title = String(d);
      const canvas = document.createElement('canvas'); canvas.width = 60; canvas.height = 86; canvas.setAttribute('aria-hidden', 'true');
      drawDigit(canvas.getContext('2d')!, SEGMENTS[d]!, 4, 5, 70, COLORS.user);
      const plain = document.createElement('span'); plain.className = 'plain-digit'; plain.textContent = String(d); plain.setAttribute('aria-hidden', 'true');
      b.append(canvas, plain); el('keypad').append(b);
      this.on(b, 'click', () => this.input(d));
    }
  }
  private confirm(title: string, copy: string, action: () => void): void { this.confirmation = action; el('confirm-title').textContent = title; el('confirm-copy').textContent = copy; el<HTMLDialogElement>('confirm-dialog').showModal(); }
  private syncSettings(): void {
    SETTING_KEYS.forEach(k => { el<HTMLInputElement>(k).checked = this.options[k] ?? (k === 'led'); });
    document.querySelectorAll<HTMLButtonElement>('[data-difficulty]').forEach(b => { b.classList.toggle('active', b.dataset.difficulty === this.options.difficulty); b.setAttribute('aria-pressed', String(b.dataset.difficulty === this.options.difficulty)); });
  }
  private async newGame(seed = crypto.getRandomValues(new Uint32Array(1))[0]!): Promise<void> {
    const revision = ++this.generation;
    this.loading = true; el('busy').hidden = false;
    el('busy').textContent = this.options.led === false ? '正在生成常规数字题面并验证唯一解…' : '正在组合灯段并验证唯一解…';
    this.status('正在生成新数独…');
    if (this.state) this.render();
    try {
      const result = await this.generator.generate({ ...this.options }, seed);
      if (this.stopped || revision !== this.generation || !result) return;
      this.state = { ...result, board: result.puzzle.givens.slice(), notes: Array(81).fill(0), elapsed: 0, assisted: false };
      this.history = []; this.hint = null; this.pencil = false; this.selectFirst(); this.loading = false; this.lastTick = performance.now();
      this.commit(result.puzzle.options.led === false ? '新数独已就绪 · 常规数字题面，无 LED 灯段约束。' : '新数独已就绪 · 琥珀色为局部线索，全暗灯管格也可填写。');
    } catch (error) { if (!this.stopped && revision === this.generation) this.status(error instanceof Error ? error.message : String(error)); }
    finally { if (!this.stopped && revision === this.generation) { this.loading = false; el('busy').hidden = true; this.render(); } }
  }
  private selectFirst(): void {
    if (!this.state) { this.selected = -1; return; }
    const clue = this.state.puzzle.options.led === false ? -1 : this.state.puzzle.lights.findIndex(Boolean);
    this.selected = clue >= 0 ? clue : this.state.puzzle.givens.findIndex((v, i) => !v && !this.state!.puzzle.blocked[i]);
  }
  private input(value: number): void {
    if (!this.state || this.loading) return;
    const next = place(this.state, this.selected, value, this.pencil);
    if (!next) { this.status('此处无法填入：请选择可填写的格子，并使用当前可用候选。'); return; }
    this.remember(); this.state = next; this.hint = null;
    this.commit(complete(next) ? (next.assisted ? '棋局完成 · 使用过答案辅助。' : '数独已完成，恭喜！') : this.pencil && value ? '已更新候选笔记。' : value && value !== next.solution[this.selected] ? '这一步与答案不符，可擦除或撤销后继续推理。' : '进度已记录。');
  }
  private remember(): void { if (this.state) { this.history.push({ board: this.state.board.slice(), notes: this.state.notes.slice() }); if (this.history.length > 200) this.history.shift(); } }
  private showHint(explain: boolean): void {
    if (!this.state || this.loading) return;
    const wrong = this.state.board.findIndex((v, i) => v && v !== this.state!.solution[i]);
    if (wrong >= 0) { this.selected = wrong; this.render(); this.status('先修正高亮的错误填数，再进行可靠的逻辑推理。'); return; }
    this.hint = findHint(this.state.puzzle, this.state.board);
    if (this.hint) { this.selected = this.hint.cell; this.render(); this.status(explain ? [this.hint.explanation, ...cellRuleDetails(this.state.puzzle, this.selected)].join(' ') : '已高亮一个可推理的格子。点击“推理解释”查看具体步骤。'); }
    else this.status(complete(this.state) ? '棋局已完成。' : '目前没有单候选或完整单元的唯一位置提示，需要进一步组合推理。');
  }
  private status(text: string): void { el('status').textContent = text; }
  private commit(message: string): void { this.render(); this.status(message); this.save(); }
  private save(): void { if (this.state) this.saves.save(structuredClone(this.state)); }
  private tick(): void {
    const now = performance.now();
    if (this.state && !this.loading && !document.hidden && !complete(this.state)) this.state.elapsed += Math.min((now - this.lastTick) / 1000, 2);
    this.lastTick = now;
  }
  private updateTimer(): void {
    const t = Math.floor(this.state?.elapsed ?? 0);
    drawClock(el<HTMLCanvasElement>('timer'), `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`, this.glow);
  }
  private render(): void {
    if (!this.state || this.stopped) return;
    const s = this.state, p = s.puzzle, led = p.options.led !== false, done = complete(s);
    el('board-frame').classList.toggle('is-complete', done && !this.loading);
    el('keypad').classList.toggle('is-classic', !led);
    el('led-legend').hidden = !led;
    this.view.draw({ ...s, selected: this.selected, hint: this.hint?.cell ?? -1, glow: this.glow });
    el('busy').hidden = !this.loading;
    const edit = editable(s, this.selected), cs = edit ? candidates(p, s.board, this.selected) : [], without = edit ? candidates(p, s.board, this.selected, false) : [];
    el('cell-name').textContent = this.selected >= 0 ? `R${Math.floor(this.selected / 9) + 1} · C${this.selected % 9 + 1}${edit ? '' : ' / 已知'}` : '选择一个格子';
    el('candidate-count').textContent = edit ? String(cs.length).padStart(2, '0') : '—';
    for (const d of DIGITS) { const b = el<HTMLButtonElement>(`digit-${d}`); b.disabled = this.loading || !cs.includes(d); b.setAttribute('aria-pressed', String(this.pencil && !!(s.notes[this.selected]! & 1 << (d - 1)))); }
    const excluded = without.filter(d => !cs.includes(d));
    el('candidate-info').textContent = !edit ? '青色已知数不可修改。请选择可填写的格子。' : !led ? `${cs.length} 个候选符合当前数独规则。LED 灯段规则已关闭。` : `${without.length} 个规则候选 → ${cs.length} 个 LED 候选。${excluded.length ? `灯段额外排除 ${excluded.join('、')}。` : '所有候选均与已亮灯段兼容。'}${p.lights[this.selected] ? '暗灯段表示未知。' : ''}`;
    const details = cellRuleDetails(p, this.selected);
    el('cell-rules').replaceChildren(...details.map(text => { const item = document.createElement('p'); item.textContent = text; return item; }));
    el('cell-rules').hidden = !details.length;
    el('notes').setAttribute('aria-pressed', String(this.pencil)); el('glow').setAttribute('aria-pressed', String(this.glow)); el('glow').textContent = this.glow ? '辉光 开' : '辉光 关';
    el<HTMLButtonElement>('erase').disabled = !edit || this.loading;
    el<HTMLButtonElement>('undo').disabled = !this.history.length || this.loading;
    for (const id of ['hint', 'explain', 'solve']) el<HTMLButtonElement>(id).disabled = this.loading || complete(s);
    const active = RULE_KEYS.flatMap((k, i) => p.options[k] ? [RULE_LABELS[i]!] : []);
    el('mode-label').textContent = `${led ? 'LED' : '常规'} · ${{ easy: '入门', normal: '标准', hard: '挑战' }[p.options.difficulty]}${active.length ? ' / ' + active.join(' + ') : ''}`;
    const filled = s.board.filter(Boolean).length, total = p.blocked.filter(b => !b).length;
    el('progress').textContent = done ? '✓ 已完成' : `${String(filled).padStart(2, '0')} / ${total} 已填写`;
    el('active-rules').textContent = [led ? 'LED 灯段' : '常规数字', ...active].join(' · ');
    el('variant-legend').textContent = [p.options.inequality ? '数比尖端指向较小数' : '', p.options.multiDiagonal ? '金色编号斜线：线上不重复' : '', p.options.exclusion ? '交点圆圈：周围四格排除所示数字；灯管圈排除全部匹配数字' : '', p.options.parity ? '蓝底＋偶：偶数 · 红底＋奇：奇数' : ''].filter(Boolean).join('。');
    el('variant-legend').hidden = !el('variant-legend').textContent;
    el('insight-title').textContent = led ? '亮起的是线索，暗下的是未知。' : '回到数字本身，逐格推理。';
    el('insight-copy').textContent = led ? '中间横管亮起，就能排除 1 和 7。全暗灯管格仍可填数；只有带 × 的黑格不填。' : '每行、每列、每个宫内数字不重复。可在“新数独”面板中启用 LED 或其他规则。';
    el('seed-label').textContent = `SEED ${p.seed} · UNIQUE SOLUTION`;
    el('board').setAttribute('aria-label', `数独棋盘，已填写 ${filled}/${total}。选中 ${el('cell-name').textContent}，数字 ${s.board[this.selected] || '空'}，候选 ${cs.join('、') || '无'}。${details.join('')}方向键移动，数字键填数。`);
    this.updateTimer();
  }
  stop(): void { if (this.stopped) return; this.stopped = true; this.generation++; clearInterval(this.timer); this.listeners.abort(); this.generator.dispose(); el('board-frame').classList.remove('is-complete'); this.view.stop(); }
}
