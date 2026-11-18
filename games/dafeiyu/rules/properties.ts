import type { BabaLevel, Direction } from '../levels/baba-format';
import { wordTypes } from '../levels/catalog';
import { isText, readRules, spelling, type Rule, type RuleReader, type Term, type Unit } from './syntax';

export const vectors = [[1, 0], [0, -1], [-1, 0], [0, 1]] as const;
export const directions = ['right', 'up', 'left', 'down'] as const;
const universal = new Set(['all', 'text', 'empty', 'level', 'group', 'group2', 'group3']);
const groups = new Set(['group', 'group2', 'group3']);
export const isGroup = (name: string): boolean => groups.has(name);
export const isUniversal = (name: string): boolean => universal.has(name);
export const opposite = (dir: Direction): Direction => ((dir + 2) % 4) as Direction;
export interface RuleContext {
  rules: Rule[];
  active: Set<number>;
  at(x: number, y: number): Unit[];
  has(unit: Unit, name: string): boolean;
  hasProperty(name: string): boolean;
  hasVerb(name: string): boolean;
  room: Unit | undefined;
  propertyRules(unit: Unit, name: string): Rule[];
  targets(unit: Unit, verb: string, type?: number): string[];
  matches(unit: Unit, term: Term): boolean;
  units: Unit[];
}

export const player = (context: RuleContext, unit: Unit): boolean => context.has(unit, 'you') || context.has(unit, 'you2');

export function ruleContext(level: BabaLevel, units: Unit[], turn: number, waiting = false, movementRules?: Rule[],
  read: RuleReader = (pieces, extra) => readRules(pieces, level.width, level.height, extra)): RuleContext {
  const cells = new Map<number, Unit[]>();
  for (const unit of units) {
    const index = unit.y * level.width + unit.x;
    const same = cells.get(index);
    if (same) same.push(unit);
    else cells.set(index, [unit]);
  }
  const at = (x: number, y: number) => x >= 0 && x < level.width && y >= 0 && y < level.height ? cells.get(y * level.width + x) ?? [] : [];
  const blanks = new Map<number, Unit>();
  const objects = new Set(units.filter(u => !isText(u) && u.name !== 'level' && u.name !== 'empty').map(u => u.name));
  let rules = movementRules ?? read(units);
  const active = new Set<number>();
  const visiting = new Set<string>();
  const isTargets = new Map<string, Rule[]>();
  const byVerb = new Map<string, Rule[]>();
  const typedVerbs = new Map<string, Rule[]>();
  const properties = new Map<string, boolean>();
  let effective: Rule[] = [];
  const rebuild = () => {
    active.clear();
    isTargets.clear();
    byVerb.clear();
    typedVerbs.clear();
    properties.clear();
    const inherited = rules.flatMap(rule => {
      if (rule.verb !== 'mimic' || rule.target.not || rules.some(other => other.verb === 'mimic' &&
        other.subject.name === rule.subject.name && other.target.name === rule.target.name && other.target.not && !other.conditions.length)) return [];
      return rules.filter(other => other.verb !== 'mimic' && !other.subject.not && other.subject.name === rule.target.name).map(other => ({
        ...other, subject: rule.subject, conditions: [...rule.conditions, ...other.conditions], ids: [...rule.ids, ...other.ids],
      }));
    });
    effective = [...rules, ...inherited];
    for (const rule of effective) {
      if (rule.verb === 'is') {
        const list = isTargets.get(rule.target.name);
        if (list) list.push(rule);
        else isTargets.set(rule.target.name, [rule]);
      }
      const verb = byVerb.get(rule.verb);
      if (verb) verb.push(rule);
      else byVerb.set(rule.verb, [rule]);
      const key = rule.verb + '/' + rule.targetType;
      const typed = typedVerbs.get(key);
      if (typed) typed.push(rule);
      else typedVerbs.set(key, [rule]);
      for (const id of rule.ids) active.add(id);
    }
  };
  rebuild();
  const virtualEmpty = (x: number, y: number): Unit[] => {
    const index = y * level.width + x;
    if (at(x, y).length || level.edges.has(index) || x < 0 || y < 0 || x >= level.width || y >= level.height) return [];
    let unit = blanks.get(index);
    if (!unit) {
      unit = { id: -index - 2, name: 'empty', type: -1, layer: -1, x, y, dir: 0 };
      blanks.set(index, unit);
    }
    return [unit];
  };
  const occupants = (x: number, y: number, subject: Unit, term: Term): Unit[] =>
    (term.name === 'empty' ? virtualEmpty(x, y) : at(x, y)).filter(other => other.id !== subject.id);
  const guarded = (key: string, operation: () => boolean): boolean => {
    if (visiting.has(key)) return false;
    visiting.add(key);
    try { return operation(); } finally { visiting.delete(key); }
  };
  const named = (unit: Unit, name: string): boolean => {
    if (name === 'all') return objects.has(unit.name) && !isText(unit);
    if (name === 'text') return isText(unit);
    if (isGroup(name)) return guarded(unit.id + ':' + name, () => {
      const group = (isTargets.get(name) ?? []).filter(r => r.targetType === 0 && applies(unit, r));
      return group.some(r => !r.target.not) && !group.some(r => r.target.not);
    });
    return unit.name === name && !isText(unit);
  };
  const matches = (unit: Unit, term: Term): boolean => term.not !== named(unit, term.name);
  const applies = (unit: Unit, rule: Rule): boolean =>
    (rule.subject.not && (isText(unit) || unit.name === 'empty' || unit.name === 'level') && !isUniversal(rule.subject.name) ? false : matches(unit, rule.subject)) &&
    (rule.conditions.length === 0 || !has(unit, 'broken')) &&
    rule.conditions.every(condition => {
      const x = unit.x, y = unit.y;
      const [dx, dy] = vectors[unit.dir];
      const name = condition.name;
      let pass: boolean;
      if (name === 'lonely') pass = at(x, y).every(other => other.id === unit.id);
      else if (name === 'idle') pass = waiting;
      else if (name === 'often' || name === 'seldom') {
        const sample = ((Math.imul(unit.id + 73, 1664525) + Math.imul(turn + 1, 1013904223)) >>> 12) % 20;
        pass = sample < (name === 'often' ? 15 : 3);
      } else if (/^powered[23]?$/.test(name)) pass = units.some(other => has(other, name.replace('powered', 'power')));
      else if (name === 'feeling') pass = condition.args.every(arg => has(unit, arg.name) !== arg.not);
      else if (name === 'without') pass = condition.args.every(arg => units.every(other => other.id === unit.id || !matches(other, arg)));
      else pass = condition.args.every(arg => {
        const on = (tx: number, ty: number, accept: (other: Unit) => boolean = () => true) =>
          occupants(tx, ty, unit, arg).some(other => matches(other, { ...arg, not: false }) && accept(other));
        let found = false;
        if (name === 'on') found = on(x, y);
        if (name === 'near') found = [-1, 0, 1].some(oy => [-1, 0, 1].some(ox => on(x + ox, y + oy)));
        if (name === 'nextto') found = vectors.some(([ox, oy]) => on(x + ox, y + oy));
        if (name === 'facing') found = directions.some(side => side === arg.name) ? directions[unit.dir] === arg.name : on(x + dx, y + dy);
        if (name === 'facedby') found = vectors.some(([ox, oy], dir) => on(x + ox, y + oy, other => other.dir === opposite(dir as Direction)));
        if (name === 'above' || name === 'below' || name === 'besideleft' || name === 'besideright') {
          const vector = name === 'above' ? [0, 1] : name === 'below' ? [0, -1] : name === 'besideleft' ? [1, 0] : [-1, 0];
          found = units.some(other => (vector[0] ? other.y === y && Math.sign(other.x - x) === vector[0] :
            other.x === x && Math.sign(other.y - y) === vector[1]) && matches(other, { ...arg, not: false }));
        }
        if (name === 'seeing') {
          for (let tx = x + dx, ty = y + dy; tx >= 0 && tx < level.width && ty >= 0 && ty < level.height; tx += dx, ty += dy) {
            if (level.edges.has(ty * level.width + tx)) break;
            if (on(tx, ty)) { found = true; break; }
            if (at(tx, ty).some(other => has(other, 'stop'))) break;
          }
        }
        return found !== arg.not;
      });
      return pass !== condition.not;
    });
  const propertyRules = (unit: Unit, name: string) =>
    (isTargets.get(name) ?? []).filter(rule => rule.targetType === 2 && applies(unit, rule));
  function has(unit: Unit, name: string): boolean {
    const candidates = isTargets.get(name);
    const intrinsic = name === 'push' && isText(unit) || name === 'select' && unit.name === 'cursor';
    if (!candidates) return intrinsic;
    const key = unit.id + ':is:' + name;
    const prior = properties.get(key);
    if (prior !== undefined) return prior;
    const root = !visiting.size;
    const found = guarded(key, () => {
      let granted = intrinsic, denied = false;
      for (const rule of candidates) if (rule.targetType === 2 && applies(unit, rule)) {
        if (rule.target.not) denied = true;
        else granted = true;
      }
      return granted && !denied;
    });
    if (root) properties.set(key, found);
    return found;
  }
  if (!movementRules && isTargets.has('word')) {
    const extraWords = new Set(units.filter(unit => !isText(unit) && has(unit, 'word')).map(unit => unit.id));
    if (extraWords.size) { rules = read(units, extraWords); rebuild(); }
  }
  const targets = (unit: Unit, verb: string, type?: number): string[] => {
    const candidates = type === undefined ? byVerb.get(verb) : typedVerbs.get(verb + '/' + type);
    if (!candidates) return [];
    const denied = new Set<string>();
    const allowed = new Set<string>();
    for (const rule of candidates) {
      if (!applies(unit, rule)) continue;
      const name = rule.target.name;
      const resolved = name === 'all' ? [...objects] : isGroup(name) ? units.filter(other => named(other, name)).map(u => u.name) : [name];
      for (const target of resolved) (rule.target.not ? denied : allowed).add(target);
    }
    return [...allowed].filter(name => !denied.has(name));
  };
  const needsEmpty = effective.some(r => r.subject.name === 'empty');
  const needsLevel = effective.some(r => r.subject.name === 'level');
  const all = units.slice();
  if (needsEmpty) for (let y = 0; y < level.height; y++) for (let x = 0; x < level.width; x++) all.push(...virtualEmpty(x, y));
  const room: Unit | undefined = needsLevel ? { id: -1, name: 'level', x: -1, y: -1, dir: 0, type: -1, layer: -1 } : undefined;
  if (room) all.push(room);
  return { rules, active, at, has, propertyRules, targets, matches, units: all, room,
    hasProperty: name => isTargets.get(name)?.some(rule => rule.targetType === 2) ?? false,
    hasVerb: name => byVerb.has(name) };
}

export function typeOf(level: BabaLevel, name: string): number {
  return level.catalog.get(name)?.type ?? wordTypes[name] ?? (name.startsWith('text_') ? 0 : -1);
}

export function textName(unit: Unit): string {
  return 'text_' + spelling(unit.name);
}
