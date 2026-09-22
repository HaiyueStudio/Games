import { findLogicalHint, applyHintToNotes, type LogicalHint } from './logical-hints';
import { inputChoices, noteChoices } from './preferences';
import { t, type Language } from './i18n';
import { type Generated, type SaveData } from './rules';
import {
  complete,
  editable,
  place,
  restoreMove,
  saveWithHistory,
  restoreWithHistory,
  type Move,
} from './session';
export class SudokuSession {
  state: SaveData | null = null;
  selected = -1;
  pencil = false;
  filterCandidates = true;
  hint: LogicalHint | null = null;
  history: Move[] = [];
  start(g: Generated): void {
    this.restore({
      ...g,
      board: g.puzzle.givens.slice(),
      notes: Array(g.puzzle.givens.length).fill(0),
      elapsed: 0,
      assisted: false,
    });
  }
  restore(s: SaveData): void {
    const restored = restoreWithHistory(s);
    this.state = restored.state;
    this.history = restored.history;
    this.pencil = false;
    this.hint = null;
    this.selected = s.puzzle.givens.findIndex((v, i) => !v && !s.puzzle.blocked[i]);
  }
  snapshot(): SaveData | null {
    return this.state ? saveWithHistory(this.state, this.history) : null;
  }
  get done(): boolean {
    return !!this.state && complete(this.state);
  }
  get choices(): number[] {
    return this.state && editable(this.state, this.selected)
      ? (this.pencil ? noteChoices : inputChoices)(this.state, this.selected, this.filterCandidates)
      : [];
  }
  select(i: number): void {
    if (this.state && i >= 0 && i < this.state.board.length && !this.state.puzzle.blocked[i]) {
      this.selected = i;
      this.hint = null;
    }
  }
  private remember(): void {
    if (this.state) {
      this.history.push({
        board: this.state.board.slice(),
        notes: this.state.notes.slice(),
        ...(this.state.crossed ? { crossed: this.state.crossed.slice() } : {}),
        deductionSteps: this.state.deductionSteps ?? 0,
      });
      if (this.history.length > 200) this.history.shift();
    }
  }
  input(d: number): boolean {
    if (!this.state) return false;
    const next = place(this.state, this.selected, d, this.pencil, this.filterCandidates);
    if (!next) return false;
    this.remember();
    this.state = next;
    this.hint = null;
    return true;
  }
  undo(): boolean {
    const previous = this.history.pop();
    if (!this.state || !previous) return false;
    this.state = restoreMove(this.state, previous);
    this.hint = null;
    return true;
  }
  answer(): void {
    if (!this.state || this.done) return;
    this.remember();
    this.state = {
      ...this.state,
      board: this.state.solution.slice(),
      notes: Array(this.state.board.length).fill(0),
      crossed: Array(this.state.board.length).fill(0),
      assisted: true,
      deductionSteps: 0,
    };
    this.hint = null;
  }
  applyHint(): boolean {
    if (!this.state || !this.hint) return false;
    const next = applyHintToNotes(this.state, this.hint);
    if (!next) return false;
    this.remember();
    this.state = next;
    this.pencil = true;
    this.hint = null;
    return true;
  }
  explain(language: Language = 'zh'): string {
    this.hint = null;
    if (!this.state) return '';
    const wrong = this.state.board.findIndex((v, i) => v && v !== this.state!.solution[i]);
    if (wrong >= 0) {
      this.selected = wrong;
      return t(language, 'wrong');
    }
    this.hint = findLogicalHint(this.state, language);
    if (this.hint) {
      this.selected = this.hint.cell;
      return this.hint.explanation;
    }
    return t(language, this.done ? 'completed' : 'noHint');
  }
}
