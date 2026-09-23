import { RULE_KEYS } from './i18n';
import type { RuleKey } from './extra-rules';
import type { Difficulty, SaveData } from './rules';
import { complete } from './session';

export interface CompletionRecord { id: string; difficulty: Difficulty; rules: RuleKey[]; }
export interface SudokuStatistics { version: 1; completed: CompletionRecord[]; }
export function statistics(value: unknown): SudokuStatistics {
  const entries = (value as Partial<SudokuStatistics> | null)?.completed;
  const ids = new Set<string>();
  return { version: 1, completed: (Array.isArray(entries) ? entries : []).filter((r): r is CompletionRecord => {
    if (!r || typeof r.id !== 'string' || !r.id || ids.has(r.id) ||
        !['easy', 'normal', 'hard'].includes(r.difficulty) || !Array.isArray(r.rules) ||
        !r.rules.every((key: RuleKey) => RULE_KEYS.includes(key))) return false;
    ids.add(r.id); return true;
  }).map(r => ({ ...r, rules: [...new Set(r.rules)] })) };
}
export function recordCompletion(stats: SudokuStatistics, state: SaveData): SudokuStatistics {
  if (state.assisted || !complete(state)) return stats;
  const rules = RULE_KEYS.filter(key => key === 'led' ? state.puzzle.options.led !== false : !!state.puzzle.options[key]);
  // Keep the full compact identity: no hash collision or seed-only deduplication.
  const id = [state.puzzle.seed, state.puzzle.options.difficulty, rules.join(','), state.solution.join(''), state.puzzle.givens.join('')].join(':');
  if (stats.completed.some(record => record.id === id)) return stats;
  return { version: 1, completed: [...stats.completed, { id, difficulty: state.puzzle.options.difficulty, rules }] };
}
export function completionCounts(stats: SudokuStatistics) {
  const difficulty = { easy: 0, normal: 0, hard: 0 };
  const rules = Object.fromEntries(RULE_KEYS.map(key => [key, 0])) as Record<RuleKey, number>;
  for (const record of stats.completed) {
    difficulty[record.difficulty]++;
    for (const key of record.rules) rules[key]++;
  }
  return { total: stats.completed.length, difficulty, rules };
}
