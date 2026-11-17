import { wordTypes } from '../levels/catalog';
import type { PlacedTile } from '../levels/baba-format';

export interface Unit extends PlacedTile {
  id: number;
  link?: string;
  state?: number;
  marker?: boolean;
  holder?: number;
}
interface Word {
  name: string;
  type: number;
  ids: number[];
}
export interface Term { name: string; not: boolean }
export interface Condition extends Term { args: Term[] }
export interface Rule {
  subject: Term;
  verb: string;
  target: Term;
  targetType: number;
  conditions: Condition[];
  ids: number[];
  label: string;
}
export const isText = (unit: Unit): boolean => unit.type >= 0;
export const spelling = (name: string): string => name.replace(/^(text|letter)_/, '');
const TERM = 0, VERB = 1, PROPERTY = 2, PREFIX = 3, NOT = 4, LETTER = 5, AND = 6, CONDITION = 7;
const termLabel = (term: Term): string => (term.not ? 'not ' : '') + term.name;
const defaultLexicon = Object.entries(wordTypes).map(([name, type]) => [spelling(name), type] as const);

function parse(words: Word[], emit: (rule: Rule) => void): void {
  const conditions: Condition[] = [];
  const subjects: Term[] = [];
  let i = 0;
  const term = (types: number[]): (Term & { type: number }) | undefined => {
    let next = i;
    let not = false;
    while (words[next]?.type === NOT) { not = !not; next++; }
    const word = words[next];
    if (!word || !types.includes(word.type)) return undefined;
    i = next + 1;
    return { name: word.name, not, type: word.type };
  };
  const list = <T,>(read: () => T | undefined): T[] => {
    const result: T[] = [];
    const first = read();
    if (!first) return result;
    result.push(first);
    while (words[i]?.type === AND) {
      const previous = i++;
      const next = read();
      if (!next) { i = previous; break; }
      result.push(next);
    }
    return result;
  };
  for (const prefix of list(() => term([PREFIX]))) conditions.push({ ...prefix, args: [] });
  subjects.push(...list(() => term([TERM])));
  if (!subjects.length) return;
  const args = (name: string): number[] => name === 'feeling' ? [PROPERTY] : name === 'facing' || name === 'facedby' ? [TERM, PROPERTY] : [TERM];
  conditions.push(...list(() => {
    const start = i;
    const condition = term([CONDITION]);
    if (!condition) return undefined;
    const targets = list(() => term(args(condition.name)));
    if (!targets.length) { i = start; return undefined; }
    return { ...condition, args: targets };
  }));
  while (words[i]?.type === VERB) {
    const verb = words[i++]!.name;
    const types = verb === 'is' ? [TERM, PROPERTY] : verb === 'write' || verb === 'play' ? [TERM, PROPERTY, PREFIX, CONDITION, VERB, LETTER] : [TERM];
    const targets = list(() => term(types));
    if (!targets.length) return;
    const ids = [...new Set(words.slice(0, i).flatMap(w => w.ids))];
    for (const subject of subjects) for (const target of targets) {
      const prefix = conditions.filter(c => !c.args.length).map(termLabel).join(' and ');
      const suffix = conditions.filter(c => c.args.length).map(c => termLabel(c) + ' ' + c.args.map(termLabel).join(' and ')).join(' and ');
      const label = [prefix, termLabel(subject), suffix, verb, termLabel(target)].filter(Boolean).join(' ').toUpperCase();
      emit({ subject, verb, target, targetType: target.type, conditions, ids, label });
    }
    if (words[i]?.type !== AND) break;
    i++;
  }
}

export function readRules(units: readonly Unit[], width: number, height: number, extraWords: ReadonlySet<number> = new Set()): Rule[] {
  const cells = new Map<number, Word[]>();
  const lexicon = units.some(unit => unit.type === LETTER) ? new Map(defaultLexicon) : undefined;
  for (const unit of units) {
    if (!isText(unit) && !extraWords.has(unit.id)) continue;
    const name = spelling(unit.name);
    const type = Math.max(0, unit.type);
    const index = unit.y * width + unit.x;
    if (type !== LETTER) lexicon?.set(name, type);
    const word = { name, type, ids: [unit.id] };
    const stack = cells.get(index);
    if (stack) stack.push(word);
    else cells.set(index, [word]);
  }
  const prefixes = lexicon && new Set([...lexicon.keys()].flatMap(word => Array.from({ length: word.length }, (_, i) => word.slice(0, i + 1))));
  const rules = new Map<string, Rule>();
  const emit = (rule: Rule) => {
    const key = rule.label + ':' + rule.targetType;
    const existing = rules.get(key);
    if (existing) existing.ids = [...new Set([...existing.ids, ...rule.ids])];
    else rules.set(key, rule);
  };
  for (const vertical of [false, true]) {
    const step = vertical ? width : 1;
    const valid = (at: number, start: number) => at >= 0 && at < width * height && (vertical || Math.floor(at / width) === Math.floor(start / width));
    for (const start of cells.keys()) {
      const previous = valid(start - step, start) ? cells.get(start - step) : undefined;
      if (previous?.every(word => word.type === NOT || word.type === CONDITION || word.type === PREFIX)) continue;
      const collected: Word[] = [];
      let branches = 0;
      const visit = (at: number) => {
        if (++branches > 768) return;
        const stack = valid(at, start) ? cells.get(at) : undefined;
        if (!stack) {
          parse(collected, emit);
          return;
        }
        const use = (word: Word, next: number) => {
          if (!collected.length && ![TERM, NOT, PREFIX].includes(word.type)) return;
          collected.push(word);
          visit(next);
          collected.pop();
        };
        const readLetters = (position: number, word: string, ids: number[]): void => {
          if (++branches > 768) return;
          const type = lexicon?.get(word);
          if (type !== undefined && type !== LETTER) use({ name: word, type, ids }, position);
          if (!prefixes?.has(word) || !valid(position, start)) return;
          for (const letter of cells.get(position) ?? []) if (letter.type === LETTER) {
            readLetters(position + step, word + letter.name, [...ids, ...letter.ids]);
          }
        };
        for (const word of stack) {
          if (word.type === LETTER) readLetters(at + step, word.name, word.ids);
          else use(word, at + step);
        }
        // A non-spelling letter ends a sentence just as an empty cell does.
        if (stack.every(word => word.type === LETTER)) parse(collected, emit);
      };
      visit(start);
    }
  }
  return [...rules.values()];
}

export type RuleReader = (units: readonly Unit[], extraWords?: ReadonlySet<number>) => Rule[];

export function createRuleReader(width: number, height: number): RuleReader {
  type WordCell = Pick<Unit, 'id' | 'name' | 'type' | 'x' | 'y'>;
  const cache: ({ words: WordCell[]; rules: Rule[] } | undefined)[] = [];
  return (units, extraWords) => {
    const slot = extraWords?.size ? 1 : 0;
    const words = units.filter(unit => isText(unit) || extraWords?.has(unit.id));
    const prior = cache[slot];
    if (prior && words.length === prior.words.length && words.every(({ id, name, type, x, y }, index) => {
      const word = prior.words[index]!;
      return word.id === id && word.name === name && word.type === type && word.x === x && word.y === y;
    })) return prior.rules;
    const rules = readRules(words, width, height, extraWords);
    cache[slot] = { words: words.map(({ id, name, type, x, y }) => ({ id, name, type, x, y })), rules };
    return rules;
  };
}
