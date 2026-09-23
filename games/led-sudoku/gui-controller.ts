import { statistics, recordCompletion, type SudokuStatistics } from './statistics';
import { SudokuSession } from './gameplay-session';
import { DEFAULT_OPTIONS, type Options, type Generated, type SaveData } from './rules';
import { preferences, autoCandidateFiltering, type Preferences } from './preferences';
import { t, type TextKey } from './i18n';
export interface SudokuPorts {
  generate(options: Options, seed: number): Promise<Generated | null>;
  save(state: SaveData): void;
  preferences(value: Preferences): void;
  changed(): void;
  statistics?: { read(): unknown; write(value: SudokuStatistics): void };
}
/** One controller for Engine GUI on browser, Android and iOS. */
export class SudokuController {
  readonly session = new SudokuSession();
  preferences: Preferences;
  loading = false;
  status = '';
  page: 'game' | 'new' | 'settings' | 'rules' | 'statistics' = 'game';
  statistics: SudokuStatistics = statistics(null);
  lesson = -1;
  private revision = 0;
  readonly ports: SudokuPorts;
  constructor(ports: SudokuPorts, prefs: Preferences) {
    this.ports = ports;
    try { this.statistics = statistics(ports.statistics?.read()); } catch {}
    this.preferences = preferences(prefs);
    this.session.filterCandidates = autoCandidateFiltering(this.preferences);
  }
  text(key: TextKey, values?: Record<string, string | number>) {
    return t(this.preferences.language, key, values);
  }
  restore(s: SaveData) {
    this.session.restore(s);
    this.changed();
  }
  changed() {
    this.ports.changed();
  }
  commit() {
    const s = this.session.snapshot();
    if (s) {
      this.ports.save(s);
      const next = recordCompletion(this.statistics, s);
      if (next !== this.statistics) {
        try { this.ports.statistics?.write(next); this.statistics = next; }
        catch { this.status = this.text('saveError'); }
      }
    }
    this.changed();
  }
  async newGame(options: Options = { ...DEFAULT_OPTIONS }, seed = Date.now() >>> 0) {
    const revision = ++this.revision;
    this.page = 'game';
    this.lesson = -1;
    this.loading = true;
    this.status = this.text(options.difficulty === 'hard' ? 'generatingHard' : 'generating');
    this.changed();
    try {
      const g = await this.ports.generate(options, seed);
      if (revision !== this.revision || !g) return;
      this.session.start(g);
      this.status = '';
      this.commit();
    } catch {
      if (revision === this.revision) this.status = this.text('generationError');
    } finally {
      if (revision === this.revision) {
        this.loading = false;
        this.changed();
      }
    }
  }
  input(d: number) {
    if (this.loading || this.page !== 'game' || this.lesson >= 0) return;
    if (this.session.input(d)) {
      this.status = '';
      this.commit();
    }
  }
  undo() {
    if (this.loading || this.lesson >= 0) return;
    if (this.session.undo()) {
      this.status = this.text('undo');
      this.commit();
    }
  }
  hint(explain = false) {
    if (this.loading) return;
    this.status = this.session.explain(this.preferences.language);
    if (explain && this.session.hint) this.lesson = 0;
    this.changed();
  }
  moveLesson(delta: number) {
    const hint = this.session.hint;
    if (!hint || this.lesson < 0) return;
    if (this.lesson + delta >= hint.steps.length) {
      if (hint.kind === 'elimination') this.session.applyHint();
      this.lesson = -1;
      this.status = '';
      this.commit();
    } else {
      this.lesson = Math.max(0, this.lesson + delta);
      this.changed();
    }
  }
  closeLesson() {
    this.lesson = -1;
    this.changed();
  }
  setPreferences(p: Preferences) {
    this.preferences = preferences(p);
    this.session.filterCandidates = autoCandidateFiltering(this.preferences);
    this.ports.preferences(this.preferences);
    this.changed();
  }
  tick(seconds: number) {
    if (this.session.state && !this.loading && this.page === 'game' && this.lesson < 0 && !this.session.done)
      this.session.state.elapsed += Math.min(2, seconds);
  }
  dispose() {
    this.revision++;
  }
}
