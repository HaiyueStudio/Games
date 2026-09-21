import { boardWidth } from './topology';
import { THEMES, type ThemeId } from './theme';
import { inputChoices, noteChoices, noteDisplayMasks, noteCrossedMasks } from './preferences';
import { findLogicalHint, applyHintToNotes, type LogicalHint } from './logical-hints';
import { SingleSlotGameSave } from '../save/SingleSlotGameSave';
import { selectRule } from './extra-rules';
import { boardCellAt } from './board-painter';
import { BoardView } from './board-view';
import { drawDigit, drawClock } from './led-display';
import { GeneratorClient } from './generator-client';
import { DEFAULT_OPTIONS, DIGITS, SEGMENTS, candidates, cellRuleDetails, lineRuleDescription, isSaveData, type Options, type SaveData } from './rules';
import { complete, editable, place, restoreMove, type Move } from './session';
const RULE_KEYS = ['staircase', 'diagonal', 'missing', 'killer', 'renban', 'consecutive', 'inequality', 'multiDiagonal', 'exclusion', 'parity', 'thermometer', 'skyscraper', 'xv', 'quadruple', 'extraRegion', 'nonConsecutive', 'littleKiller', 'antiKing'] as const;
const SETTING_KEYS = ['led', ...RULE_KEYS] as const;
const RULE_LABELS = ['阶梯数独', '对角线', '缺一门', '杀手', '连续数', '差 1', '数比', '多对角线', '排除点', '奇偶', '温度计', '摩天大楼', 'XV', '四数和', '额外区域', '不连续', '小杀手', '无缘'];
function el<T extends HTMLElement = HTMLElement>(id: string): T { const e = document.getElementById(id); if (!e) throw new Error(`Missing LED Sudoku element: ${id}`); return e as T; }
export class LedSudokuGame {
  private theme: ThemeId = 'dark';
  private manualCandidates=false;
  private state: SaveData | null = null;
  private selected = -1;
  private hint: LogicalHint | null = null;
  private lessonIndex = -1;
  private pencil = false;
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
    try { this.theme=localStorage.getItem('led-sudoku-theme')==='light-blue'?'light-blue':'dark'; } catch {}
    try{this.manualCandidates=localStorage.getItem('led-sudoku-manual-candidates')==='true';}catch{}
    el<HTMLInputElement>('manual-candidates').checked=this.manualCandidates;
    this.bind(); this.createKeypad(); this.applyTheme();
    await this.view.init(el<HTMLCanvasElement>('board'));
    if (this.stopped) return;
    this.ready = true;
    const query = new URLSearchParams(location.search), seedText = query.get('seed');
    const saved = seedText === null ? await this.saves.load() : null;
    if (this.stopped) return;
    if (saved) { this.state = saved; this.options = { ...DEFAULT_OPTIONS, ...saved.puzzle.options }; this.syncSettings(); this.selectFirst(); this.render(); this.status(complete(saved) ? '已恢复完成的棋局。' : '已恢复上次的棋局与推理。'); }
    else {
      for (const key of SETTING_KEYS) {
        if (query.get(key) === '1') this.options = selectRule(this.options,key,true).options;
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
    this.on(el('skin-select'),'change',()=>{this.theme=el<HTMLSelectElement>('skin-select').value==='light-blue'?'light-blue':'dark';try{localStorage.setItem('led-sudoku-theme',this.theme);}catch{}this.applyTheme();});
    const button = (id: string, fn: () => void) => this.on(el(id), 'click', fn);
    button('preferences',()=>el<HTMLDialogElement>('preferences-dialog').showModal());
    button('preferences-done',()=>el<HTMLDialogElement>('preferences-dialog').close());
    this.on(el('manual-candidates'),'change',()=>{this.manualCandidates=el<HTMLInputElement>('manual-candidates').checked;try{localStorage.setItem('led-sudoku-manual-candidates',String(this.manualCandidates));}catch{}this.render();});
    button('new', () => {
      if (!this.ready) return;
      this.options = { ...DEFAULT_OPTIONS, ...this.state?.puzzle.options };
      this.syncSettings(); el('rule-notice').textContent='';
      el<HTMLDialogElement>('new-dialog').showModal();
    });
    button('cancel-new', () => el<HTMLDialogElement>('new-dialog').close());
    button('start-new', () => {
      el<HTMLDialogElement>('new-dialog').close();
      void this.newGame();
    });
    button('solve', () => { if (this.state && !this.loading && !complete(this.state)) this.confirm('显示完整答案？', '本局将标记为“辅助完成”，仍可通过撤销回到刚才的棋局。', () => {
      if (!this.state) return;
      this.remember(); this.state = { ...this.state, board: this.state.solution.slice(), notes: Array(this.state.board.length).fill(0), crossed: Array(this.state.board.length).fill(0), assisted: true, deductionSteps: 0 }; this.hint = null; this.commit('答案已展示 · 辅助完成。');
    }); });
    button('undo', () => { const previous = this.history.pop(); if (this.state && previous && !this.loading) { this.state = restoreMove(this.state, previous); this.hint = null; this.commit('已撤销上一步。'); } });
    button('erase', () => this.input(0));
    button('notes', () => { this.pencil = !this.pencil; this.render(); });
    button('hint', () => this.showHint(false)); button('explain', () => this.showHint(true));
    button('lesson-close', () => this.closeLesson());
    button('lesson-previous', () => this.moveLesson(-1)); button('lesson-next', () => this.moveLesson(1));
    button('help', () => el<HTMLDialogElement>('help-dialog').showModal());
    button('close-help', () => el<HTMLDialogElement>('help-dialog').close());
    button('cancel-confirm', () => { this.confirmation = null; el<HTMLDialogElement>('confirm-dialog').close(); });
    button('accept-confirm', () => { const action = this.confirmation; this.confirmation = null; el<HTMLDialogElement>('confirm-dialog').close(); action?.(); });
    this.on(el('confirm-dialog'), 'cancel', () => { this.confirmation = null; });
    document.querySelectorAll<HTMLButtonElement>('[data-difficulty]').forEach(b => this.on(b, 'click', () => { this.options.difficulty = b.dataset.difficulty as Options['difficulty']; this.syncSettings(); }));
    SETTING_KEYS.forEach(k => this.on(el(k), 'change', () => { const change=selectRule(this.options,k,el<HTMLInputElement>(k).checked); this.options=change.options; el('rule-notice').textContent=change.notice; this.syncSettings(); }));
    this.on(el('board'), 'pointerdown', event => {
      if (!this.state || this.loading || this.lessonIndex >= 0) return;
      const e = event as PointerEvent, canvas = el<HTMLCanvasElement>('board'), rect = canvas.getBoundingClientRect();
      const cell=boardCellAt(this.state.puzzle,(e.clientX-rect.left)/rect.width,(e.clientY-rect.top)/rect.height);
      if(cell<0 || this.state.puzzle.blocked[cell]) return;
      this.selected = cell; this.hint = null; canvas.focus({ preventScroll: true }); this.render();
    });
    this.on(document, 'keydown', event => {
      const e = event as KeyboardEvent;
      if(this.lessonIndex>=0){if(e.key==='Escape')this.closeLesson();return;}
      if (document.querySelector('dialog[open]') || (e.target instanceof HTMLInputElement) || (e.target instanceof HTMLSelectElement) || !this.state || this.loading) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); el('undo').click(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (/^[1-9]$/.test(e.key)) { e.preventDefault(); this.input(Number(e.key)); }
      else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') { e.preventDefault(); this.input(0); }
      else if (e.key.toLowerCase() === 'n') { e.preventDefault(); el('notes').click(); }
      else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        e.preventDefault(); const delta = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' ? -boardWidth(this.state.puzzle) : boardWidth(this.state.puzzle);
        let next = this.selected < 0 ? 0 : this.selected;
        for (let n = 0; n < this.state.board.length; n++) { next = (next + delta + this.state.board.length) % this.state.board.length; if (!this.state.puzzle.blocked[next]) break; }
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
      drawDigit(canvas.getContext('2d')!, SEGMENTS[d]!, 4, 5, 70, THEMES[this.theme].user, THEMES[this.theme].tube);
      const plain = document.createElement('span'); plain.className = 'plain-digit'; plain.textContent = String(d); plain.setAttribute('aria-hidden', 'true');
      b.append(canvas, plain); el('keypad').append(b);
      this.on(b, 'click', () => this.input(d));
    }
  }
  private applyTheme():void {
    const c=THEMES[this.theme];document.documentElement.dataset.theme=this.theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content',c.background);
    el<HTMLSelectElement>('skin-select').value=this.theme;
    for(const d of DIGITS){const canvas=el(`digit-${d}`).querySelector('canvas')!;const ctx=canvas.getContext('2d')!;ctx.clearRect(0,0,canvas.width,canvas.height);drawDigit(ctx,SEGMENTS[d]!,4,5,70,c.user,c.tube);}
    this.updateTimer();if(this.ready)this.render();
  }
  private confirm(title: string, copy: string, action: () => void): void { this.confirmation = action; el('confirm-title').textContent = title; el('confirm-copy').textContent = copy; el<HTMLDialogElement>('confirm-dialog').showModal(); }
  private syncSettings(): void {
    SETTING_KEYS.forEach(k => { el<HTMLInputElement>(k).checked = this.options[k] ?? (k === 'led'); });
    document.querySelectorAll<HTMLButtonElement>('[data-difficulty]').forEach(b => { b.classList.toggle('active', b.dataset.difficulty === this.options.difficulty); b.setAttribute('aria-pressed', String(b.dataset.difficulty === this.options.difficulty)); });
  }
  private async newGame(seed = crypto.getRandomValues(new Uint32Array(1))[0]!): Promise<void> {
    this.closeLesson();
    const revision = ++this.generation;
    this.loading = true; el('busy').hidden = false;
    el('busy').textContent = this.options.difficulty === 'hard' ? '正在验证唯一解并筛选挑战难度…' : this.options.led === false ? '正在生成常规数字题面并验证唯一解…' : '正在组合灯段并验证唯一解…';
    this.status('正在生成新数独…');
    if (this.state) this.render();
    try {
      const result = await this.generator.generate({ ...this.options }, seed);
      if (this.stopped || revision !== this.generation || !result) return;
      this.state = { ...result, board: result.puzzle.givens.slice(), notes: Array(result.puzzle.givens.length).fill(0), elapsed: 0, assisted: false };
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
    if (!this.state || this.loading || this.lessonIndex >= 0) return;
    const next = place(this.state, this.selected, value, this.pencil,!this.manualCandidates);
    if (!next) { this.status('此处无法填入：请选择可填写的格子，并使用当前可用候选。'); return; }
    this.remember(); this.state = next; this.hint = null;
    this.commit(complete(next) ? (next.assisted ? '棋局完成 · 使用过答案辅助。' : '数独已完成，恭喜！') : this.pencil && value ? '已更新候选笔记。' : value && value !== next.solution[this.selected] ? '这一步与答案不符，可擦除或撤销后继续推理。' : '进度已记录。');
  }
  private remember(): void { if (this.state) { this.history.push({ board: this.state.board.slice(), notes: this.state.notes.slice(), ...(this.state.crossed?{crossed:this.state.crossed.slice()}:{}), deductionSteps: this.state.deductionSteps ?? 0 }); if (this.history.length > 200) this.history.shift(); } }
  private showHint(explain: boolean): void {
    if (!this.state || this.loading) return;
    const wrong = this.state.board.findIndex((v, i) => v && v !== this.state!.solution[i]);
    if (wrong >= 0) { this.selected = wrong; this.render(); this.status('先修正高亮的错误填数，再进行可靠的逻辑推理。'); return; }
    this.hint = findLogicalHint(this.state);
    if (this.hint) { this.selected = this.hint.cell; if(explain){this.lessonIndex=0;this.moveLesson(0);}else{this.render();this.status(this.hint.kind==='elimination'?this.hint.explanation:'已高亮一个可推理的格子。点击“推理解释”逐步查看依据。');} }
    else this.status(complete(this.state) ? '棋局已完成。' : '当前支持的技巧暂未找到下一步，可继续结合更多规则推理。');
  }
  private moveLesson(delta:number):void {
    if(!this.hint||this.lessonIndex<0)return;
    if(this.lessonIndex+delta>=this.hint.steps.length){const next=this.state&&applyHintToNotes(this.state,this.hint);if(next){this.remember();this.state=next;this.pencil=true;this.hint=null;}this.closeLesson();if(next)this.commit('候选已记入笔记，可继续提示或撤销。');return;}
    this.lessonIndex=Math.max(0,this.lessonIndex+delta);const step=this.hint.steps[this.lessonIndex]!;
    el('hint-lesson').hidden=false;el('lesson-title').textContent=`${this.lessonIndex+1} / ${this.hint.steps.length} · ${step.title}`;el('lesson-body').textContent=step.text;
    el<HTMLButtonElement>('lesson-previous').disabled=this.lessonIndex===0;el('lesson-next').textContent=this.lessonIndex===this.hint.steps.length-1?(this.hint.kind==='elimination'?'应用到笔记':'返回棋盘'):'下一步';this.render();
  }
  private closeLesson():void {this.lessonIndex=-1;el('hint-lesson').hidden=true;this.render();}
  private status(text: string): void { el('status').textContent = text; }
  private commit(message: string): void { this.render(); this.status(message); this.save(); }
  private save(): void { if (this.state) this.saves.save(structuredClone(this.state)); }
  private tick(): void {
    const now = performance.now();
    if (this.state && !this.loading && this.lessonIndex < 0 && !document.hidden && !complete(this.state)) this.state.elapsed += Math.min((now - this.lastTick) / 1000, 2);
    this.lastTick = now;
  }
  private updateTimer(): void {
    const t = Math.floor(this.state?.elapsed ?? 0);
    drawClock(el<HTMLCanvasElement>('timer'), `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`, this.theme);
  }
  private render(): void {
    if (!this.state || this.stopped) return;
    const s = this.state, p = s.puzzle, led = p.options.led !== false, done = complete(s);
    el('board-frame').classList.toggle('is-complete', done && !this.loading);
    el('keypad').classList.toggle('is-classic', !led);
    el('led-legend').hidden = !led;
    const lesson=this.lessonIndex>=0?this.hint?.steps[this.lessonIndex]:undefined;
    const visibleCrosses=noteCrossedMasks(s,!this.manualCandidates);
    this.view.draw({ ...s, theme:this.theme, completed:done&&!this.loading, crossed:visibleCrosses, candidateMasks:noteDisplayMasks(s,this.selected,this.pencil,!this.manualCandidates), selected: this.selected, hint: this.hint?.cell ?? -1, ...(lesson?{lesson}:{}) });
    for(const id of ['new','notes','hint','explain','undo','erase','solve',...DIGITS.map(d=>`digit-${d}`)]) el<HTMLButtonElement>(id).disabled=!!lesson;
    el('busy').hidden = !this.loading;
    const edit = editable(s, this.selected), cs = edit ? (this.pencil?noteChoices:inputChoices)(s, this.selected,!this.manualCandidates) : [], without = edit && !this.manualCandidates ? candidates(p, s.board, this.selected, false) : [];
    el('cell-name').textContent = this.selected >= 0 ? `R${Math.floor(this.selected / boardWidth(p)) + 1} · C${this.selected % boardWidth(p) + 1}${edit ? '' : ' / 已知'}` : '选择一个格子';
    el('candidate-count').textContent = edit ? String(cs.length).padStart(2, '0') : '—';
    for (const d of DIGITS) { const b = el<HTMLButtonElement>(`digit-${d}`); b.disabled = this.loading || !cs.includes(d); const crossed=this.pencil && !!((visibleCrosses[this.selected]??0)&1<<(d-1)); b.classList.toggle('is-crossed',crossed); b.setAttribute('aria-pressed',String(crossed)); b.setAttribute('aria-label',this.pencil?`${crossed?'恢复':'划去'}候选 ${d}`:`填入 ${d}`); }
    const excluded = without.filter(d => !cs.includes(d));
    el('candidate-info').textContent = !edit ? '青色已知数不可修改。请选择可填写的格子。' : this.manualCandidates ? '手动推理模式：1–9 均可选，请自行判断并在笔记中划去候选。' : !led ? `${cs.length} 个候选符合当前数独规则。LED 灯段规则已关闭。` : `${without.length} 个规则候选 → ${cs.length} 个 LED 候选。${excluded.length ? `灯段额外排除 ${excluded.join('、')}。` : '所有候选均与已亮灯段兼容。'}${p.lights[this.selected] ? '暗灯段表示未知。' : ''}`;
    const details = cellRuleDetails(p, this.selected);
    el('cell-rules').replaceChildren(...details.map(text => { const item = document.createElement('p'); item.textContent = text; return item; }));
    el('cell-rules').hidden = !details.length;
    el('notes').setAttribute('aria-pressed', String(this.pencil));
    el<HTMLButtonElement>('erase').disabled = !edit || this.loading;
    el<HTMLButtonElement>('undo').disabled = !this.history.length || this.loading;
    for (const id of ['hint', 'explain', 'solve']) el<HTMLButtonElement>(id).disabled = this.loading || complete(s);
    const active = RULE_KEYS.flatMap((k, i) => p.options[k] ? [k === 'renban' && p.lineRule !== 'ordered' ? '旧版 Renban' : RULE_LABELS[i]!] : []);
    el('line-rule-help').textContent = p.options.renban ? lineRuleDescription(p) : '连续数：沿整条紫线每步差 1，全部升序或全部降序，不能乱序或中途转向。';
    el('mode-label').textContent = `${led ? 'LED' : '常规'} · ${{ easy: '入门', normal: '标准', hard: '挑战' }[p.options.difficulty]}${active.length ? ' / ' + active.join(' + ') : ''}`;
    const filled = s.board.filter(Boolean).length, total = p.blocked.filter(b => !b).length;
    el('progress').textContent = done ? '✓ 已完成' : `${String(filled).padStart(2, '0')} / ${total} 已填写`;
    el('active-rules').textContent = [led ? 'LED 灯段' : '常规数字', ...active].join(' · ');
    el('variant-legend').textContent = [p.options.staircase ? '阶梯：空白缺口不填，跨缺口的每行、列及每个宫恰好包含 1–9' : '',p.options.antiKing ? '无缘：斜角紧邻格不能同数' : '',p.options.littleKiller ? '外围斜箭头：沿该方向各格数字之和，允许符合行列宫规则的重复数' : '',p.options.nonConsecutive ? '不连续：上下左右相邻格不能相差 1' : '', p.options.extraRegion ? '字母标识的色块区域：各含 1–9，不重复' : '', p.options.inequality ? '数比尖端指向较小数' : '', p.options.multiDiagonal ? '金色编号斜线：线上不重复' : '', p.options.exclusion ? '交点圆圈：周围四格排除所示数字；灯管圈排除全部匹配数字' : '', p.options.parity ? '蓝底＋偶：偶数 · 红底＋奇：奇数' : '', p.options.thermometer ? '青绿温度计：圆灯泡到平头严格递增' : '', p.options.skyscraper ? '外围数字：从该方向可见的楼数' : '', p.options.xv ? 'V＝和5，X＝和10，无标记不能和为5或10' : '', p.options.quadruple ? '菱形 Σ：周围四格之和' : ''].filter(Boolean).join('。');
    el('variant-legend').hidden = !el('variant-legend').textContent;
    el('insight-title').textContent = led ? '亮起的是线索，暗下的是未知。' : '回到数字本身，逐格推理。';
    el('insight-copy').textContent = p.options.staircase ? '行、列跨空白缺口仍各有 9 格，填入 1–9 且不重复。空白缺口不是格子，不填数字。' : led ? '中间横管亮起，就能排除 1 和 7。全暗灯管格仍可填数；只有带 × 的黑格不填。' : '每行、每列、每个宫内数字不重复。可在“新数独”面板中启用 LED 或其他规则。';
    el('seed-label').textContent = `SEED ${p.seed} · UNIQUE SOLUTION`;
    el('board').setAttribute('aria-label', `数独棋盘，已填写 ${filled}/${total}。选中 ${el('cell-name').textContent}，数字 ${s.board[this.selected] || '空'}，候选 ${cs.join('、') || '无'}。${details.join('')}方向键移动，数字键填数。`);
    if(lesson)for(const id of ['new','notes','hint','explain','undo','erase','solve',...DIGITS.map(d=>`digit-${d}`)])el<HTMLButtonElement>(id).disabled=true;
    this.updateTimer();
  }
  stop(): void { if (this.stopped) return; this.stopped = true; this.generation++; clearInterval(this.timer); this.listeners.abort(); this.generator.dispose(); el('board-frame').classList.remove('is-complete'); this.view.stop(); }
}
