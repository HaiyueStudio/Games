import type { BabaLevel, Direction } from '../levels/baba-format';
import type { Campaign } from './campaign';
import { directions, isUniversal, opposite, player, ruleContext, textName, typeOf, vectors, type RuleContext } from './properties';
import { createRuleReader, isText, type RuleReader, type Unit } from './syntax';
import { recordTurn, restoreTurn, type TurnChange } from './history';

export type Move = Direction | 'wait';
interface Movement {
  unit: Unit;
  dir: Direction;
}
export interface GameState {
  units: Unit[];
  nextId: number;
  turn: number;
  won: boolean;
  waiting: boolean;
  conversion?: string[];
  bonus?: number;
  island?: true;
}
const selector = (context: RuleContext, unit: Unit) => context.has(unit, 'select');
const directionsFor = (context: RuleContext, unit: Unit, property: string) =>
  directions.flatMap((name, dir) => context.has(unit, property + name) ? [dir as Direction] : []);
const samePlane = (context: RuleContext, a: Unit, b: Unit) => context.has(a, 'float') === context.has(b, 'float');
export const isMap = (level: BabaLevel) => level.metadata.general?.leveltype === '1';
export const cursorPosition = (level: BabaLevel) => ({
  x: Number(level.metadata.general?.selectorx ?? -1),
  y: Number(level.metadata.general?.selectory ?? -1),
});
export const canStandOnMapLink = (context: RuleContext, unit: Unit) =>
  !!unit.link && (unit.state ?? 2) >= 2 && !context.has(unit, 'hide');

export const blockedByWater = (context: RuleContext, x: number, y: number) =>
  context.at(x, y).some(unit => unit.name === 'water' && context.has(unit, 'stop'));

function addIsland(level: BabaLevel, state: GameState): GameState {
  if (!level.island || state.island) return state;
  let nextId = state.nextId;
  const island = level.island.map(tile => ({ ...tile, id: nextId++ }));
  return { ...state, units: [...state.units, ...island], nextId, island: true };
}

export function initialState(level: BabaLevel): GameState {
  const units: Unit[] = level.tiles.map((tile, id) => ({ ...tile, id }));
  if (isMap(level)) {
    for (const link of level.links) if (link.x >= 0 && link.y >= 0 && link.x < level.width && link.y < level.height) {
      const { id: target, x, y, dir, state } = link;
      units.push({ x, y, dir, state, marker: true, link: target, name: 'level', type: -1, id: units.length, layer: 18 });
    }
    const { x, y } = cursorPosition(level);
    if (x >= 0 && y >= 0 && x < level.width && y < level.height && !units.some(u => u.name === 'cursor')) {
      units.push({ x, y, name: 'cursor', type: -1, id: units.length, layer: 30, dir: 0 });
    }
  }
  for (const special of level.specials) {
    const [kind, target] = special.data.split(',');
    if (kind !== 'level' || !target) continue;
    const candidates = units.filter(unit => unit.x === special.x && unit.y === special.y && !isText(unit));
    const carrier = candidates.find(unit => unit.layer === special.z) ?? candidates.at(-1);
    if (carrier) carrier.link = target.toLowerCase();
  }
  return addIsland(level, { units, nextId: units.length, turn: 0, won: false, waiting: false });
}

export function advance(level: BabaLevel, previous: GameState, input: Move,
  openPaths = level.paths.filter(path => path.style > 0 && !path.gate),
  read = createRuleReader(level.width, level.height)): GameState {
  if (previous.won || previous.conversion) return previous;
  const waiting = input === 'wait';
  const state = { ...previous, units: previous.units.map(unit => ({ ...unit })), turn: previous.turn + 1, waiting };
  let context = ruleContext(level, state.units, state.turn, waiting, undefined, read);
  let movementRules: RuleContext['rules'] | undefined = context.rules;
  const update = () => { context = ruleContext(level, state.units, state.turn, waiting, movementRules, read); };
  const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < level.width && y < level.height && !level.edges.has(y * level.width + x);
  const spawn = (name: string, origin: Unit) => {
    if (name === 'empty' || (name === 'level' && !origin.link) || !inBounds(origin.x, origin.y) || state.units.length >= 12000) return;
    const type = typeOf(level, name);
    state.units.push({ name, type, x: origin.x, y: origin.y, dir: origin.dir, id: state.nextId++,
      ...(origin.link ? { link: origin.link, marker: origin.marker, state: origin.state } : {}),
      layer: level.catalog.get(name)?.layer ?? (type >= 0 ? 20 : 16) });
  };
  const destroy = (units: ReadonlySet<Unit>, rules = context) => {
    if (!units.size) return;
    state.units = state.units.filter(unit => !units.has(unit));
    for (const unit of units) for (const target of rules.targets(unit, 'has', 0)) {
      spawn(target === 'text' ? textName(unit) : target, unit);
    }
    update();
  };
  const walk = (actors: Movement[], mode: 'walk' | 'bounce' | 'shift' = 'walk'): void => {
    if (!actors.length) return;
    const shifting = mode === 'shift';
    // Evaluate movement conditions against the board at the start of each phase.
    const original = state.units.map(unit => ({ ...unit }));
    const phase = ruleContext(level, original, state.turn, waiting, movementRules, read);
    const before = new Map(phase.units.map(unit => [unit.id, unit]));
    const has = (unit: Unit, property: string) => phase.has(before.get(unit.id) ?? unit, property);
    const canFace = (unit: Unit, dir: Direction) => !has(unit, 'still') && !has(unit, 'locked' + directions[dir]);
    const occupancy = new Map<number, Unit[]>();
    const cell = (x: number, y: number) => y * level.width + x;
    const place = (unit: Unit) => {
      const key = cell(unit.x, unit.y);
      let list = occupancy.get(key);
      if (!list) { list = []; occupancy.set(key, list); }
      list.push(unit);
    };
    state.units.forEach(place);
    const at = (x: number, y: number) => inBounds(x, y) ? occupancy.get(cell(x, y)) ?? [] : [];
    const moves = new Set<Unit>();
    const broken = new Set<Unit>();
    const removed = new Set<Unit>();
    const intended = new Map(actors.map(({ unit, dir }) => [unit, dir]));
    const moved = new Set<Unit>();
    const unitsById = shifting ? new Map(state.units.map(unit => [unit.id, unit])) : undefined;
    // Shift actors can enter cells another actor leaves in the same phase. A
    // unit arriving from another cell does not become a new obstacle mid-phase.
    const obstacles = (x: number, y: number) => unitsById ? phase.at(x, y).flatMap(snapshot => {
      const unit = unitsById.get(snapshot.id);
      return unit && !removed.has(unit) && unit.x === x && unit.y === y ? [unit] : [];
    }) : at(x, y);
    const weak = (unit: Unit) => has(unit, 'weak') && !has(unit, 'safe');
    const group = (unit: Unit, dir: Direction, allowPush: boolean, pulling = false): boolean => {
      if (moves.has(unit) || broken.has(unit)) return true;
      if (!canFace(unit, dir) || pulling && moved.has(unit)) return false;
      if (moves.size >= 384) return false;
      const [dx, dy] = vectors[dir], x = unit.x + dx, y = unit.y + dy;
      if (!inBounds(x, y)) return false;
      moves.add(unit);
      for (const other of obstacles(x, y)) {
        if (moves.has(other) || broken.has(other)) continue;
        if (has(unit, 'phantom')) continue;
        const sameHeight = has(unit, 'float') === has(other, 'float');
        if (sameHeight && (!has(unit, 'safe') || !has(other, 'safe')) &&
            (has(unit, 'open') && has(other, 'shut') || has(unit, 'shut') && has(other, 'open'))) {
          if (!has(other, 'safe')) broken.add(other);
          if (!has(unit, 'safe')) broken.add(unit);
          continue;
        }
        if (sameHeight && !has(other, 'safe') && phase.targets(before.get(unit.id) ?? unit, 'eat', 0).includes(other.name)) {
          broken.add(other);
          continue;
        }
        if (has(unit, 'swap') || has(other, 'swap')) continue;
        const solid = has(other, 'stop') || has(other, 'pull');
        const willMove = has(other, 'push') || solid && intended.get(other) === dir && !moved.has(other);
        if (willMove) {
          if (!allowPush) return false;
          if (!weak(other)) {
            if (!group(other, dir, allowPush, pulling)) return false;
          } else {
            if (!tryGroup(other, dir, allowPush, pulling)) broken.add(other);
          }
        } else if (solid && !(sameHeight && weak(other))) return false;
      }
      const virtual = before.get(-cell(x, y) - 2);
      return !virtual || obstacles(x, y).length > 0 || !has(virtual, 'stop');
    };
    const tryGroup = (unit: Unit, dir: Direction, allowPush: boolean, pulling: boolean): boolean => {
      const priorMoves = new Set(moves), priorBroken = new Set(broken);
      if (group(unit, dir, allowPush, pulling)) return true;
      for (const member of moves) if (!priorMoves.has(member)) moves.delete(member);
      for (const member of broken) if (!priorBroken.has(member)) broken.delete(member);
      return false;
    };
    const unplace = (unit: Unit) => {
      const list = occupancy.get(cell(unit.x, unit.y));
      if (list?.includes(unit)) list.splice(list.indexOf(unit), 1);
    };
    const breakUnit = (unit: Unit) => { unplace(unit); removed.add(unit); };
    const relocate = (unit: Unit, x: number, y: number) => {
      unplace(unit);
      unit.x = x; unit.y = y; place(unit);
    };
    const applyMove = (unit: Unit, dir: Direction, allowPush: boolean): boolean => {
      moves.clear();
      broken.clear();
      if (!group(unit, dir, allowPush)) return false;
      const [dx, dy] = vectors[dir];
      // Every moving member can pull from behind, including members being
      // pushed. A pulled member can itself push the object in its way.
      for (const member of moves) {
        if (broken.has(member)) continue;
        for (const other of at(member.x - dx, member.y - dy)) {
          if (!moves.has(other) && !moved.has(other) && has(other, 'pull')) tryGroup(other, dir, true, true);
        }
      }
      for (const member of broken) breakUnit(member);
      for (const member of [...moves].reverse()) {
        if (member.id < 0 || broken.has(member)) continue;
        for (const other of [...obstacles(member.x + dx, member.y + dy)]) if (!moves.has(other) &&
          (has(member, 'swap') || has(other, 'swap'))) relocate(other, member.x, member.y);
        relocate(member, member.x + dx, member.y + dy);
        member.dir = dir;
        moved.add(member);
      }
      return true;
    };
    const attempt = ({ unit, dir: facing }: Movement, allowPush: boolean): boolean => {
      if (unit.id === -1 || removed.has(unit) || moved.has(unit) || unit.id < -1 && at(unit.x, unit.y).length) return true;
      const dir = has(unit, 'reverse') ? opposite(facing) : facing;
      if (!canFace(unit, dir)) return true;
      unit.dir = dir;
      if (applyMove(unit, dir, allowPush)) return true;
      if (mode === 'bounce' && canFace(unit, opposite(dir))) {
        unit.dir = opposite(dir);
        return applyMove(unit, unit.dir, allowPush);
      }
      return false;
    };
    const breakBlocked = ({ unit }: Movement) => {
      if (unit.id >= 0 && weak(unit)) breakUnit(unit);
    };
    if (shifting) {
      // Resolve unobstructed shifts before pushing. A pending shift may
      // become possible once another unit has vacated its destination.
      let pending = actors.filter(actor => !attempt(actor, false));
      while (pending.length) {
        const remaining = pending.filter(actor => !attempt(actor, true));
        if (remaining.length === pending.length) {
          remaining.forEach(breakBlocked);
          break;
        }
        pending = remaining;
      }
    } else {
      for (const actor of actors) if (!attempt(actor, true)) breakBlocked(actor);
    }
    if (removed.size) destroy(removed, phase);
    else update();
  };

  if (input !== 'wait') {
    const actors = context.units.filter(unit => player(context, unit) && !context.has(unit, 'sleep'));
    walk(actors.map(unit => ({ unit, dir: input })));
  } else {
    const levelUnit = context.units.find(unit => unit.id === -1);
    if (levelUnit && player(context, levelUnit) && context.has(levelUnit, 'win')) state.won = true;
  }

  const automatically: Movement[] = [];
  for (const unit of state.units) {
    if (context.has(unit, 'sleep')) continue;
    if (context.has(unit, 'move') || context.has(unit, 'auto')) automatically.push({ unit, dir: unit.dir });
    for (const dir of directionsFor(context, unit, 'nudge')) automatically.push({ unit, dir });
    const feared = context.targets(unit, 'fear', 0);
    for (const [dir, [dx, dy]] of vectors.entries()) if (feared.length && context.at(unit.x + dx, unit.y + dy).some(u => feared.includes(u.name))) {
      automatically.push({ unit, dir: opposite(dir as Direction) }); break;
    }
  }
  walk(automatically, 'bounce');
  const shifted: Movement[] = [];
  for (const source of state.units) if (context.has(source, 'shift')) for (const unit of context.at(source.x, source.y)) {
    if (unit.id !== source.id && samePlane(context, unit, source)) shifted.push({ unit, dir: source.dir });
  }
  walk(shifted, 'shift');
  movementRules = undefined;
  update();

  const holders = new Map(state.units.filter(unit => context.has(unit, 'hold')).map(unit => [unit.id, unit]));
  if (holders.size || state.units.some(unit => unit.holder !== undefined)) {
    for (const unit of state.units) {
      const holder = unit.holder === undefined ? undefined : holders.get(unit.holder);
      if (holder) { unit.x = holder.x; unit.y = holder.y; }
      else delete unit.holder;
    }
    update();
    for (const holder of holders.values()) for (const unit of context.at(holder.x, holder.y)) {
      if (unit.id !== holder.id && !holders.has(unit.id) && samePlane(context, unit, holder)) unit.holder = holder.id;
    }
  }

  const transformations = context.units.flatMap(unit => {
    const names = (verb: string, type?: number) => context.targets(unit, verb, type);
    const noun = (name: string) => name === 'text' ? textName(unit) : name;
    const identity = names('is', 0);
    const change = identity.includes(unit.name) || isText(unit) && identity.includes('text') ? [] :
      [...identity, ...names('become', 0)].map(noun);
    const writing = names('write').map(name => 'text_' + name);
    const targets = [...new Set([...change, ...writing])];
    return targets.length ? [{ unit, targets }] : [];
  });
  const room = transformations.find(({ unit }) => unit.id === -1);
  if (room) state.conversion = room.targets;
  if (transformations.length) {
    const replacing = new Set(transformations.map(({ unit }) => unit.id));
    state.units = state.units.filter(unit => !replacing.has(unit.id));
    for (const { unit, targets } of transformations) if (unit.id !== -1) for (const target of targets) spawn(target, unit);
    update();
  }
  let facingChanged = false;
  for (const unit of state.units) {
    const original = unit.dir;
    const face = directionsFor(context, unit, '')[0];
    if (face !== undefined) unit.dir = face;
    if (context.has(unit, 'turn')) unit.dir = ((unit.dir + 3) % 4) as Direction;
    if (context.has(unit, 'deturn')) unit.dir = ((unit.dir + 1) % 4) as Direction;
    const follows = context.targets(unit, 'follow', 0);
    if (follows.length) {
      const target = state.units.filter(other => other.id !== unit.id && follows.includes(other.name)).sort((a, b) =>
        Math.abs(a.x - unit.x) + Math.abs(a.y - unit.y) - Math.abs(b.x - unit.x) - Math.abs(b.y - unit.y))[0];
      if (target) unit.dir = Math.abs(target.x - unit.x) >= Math.abs(target.y - unit.y) ? (target.x < unit.x ? 2 : 0) : (target.y < unit.y ? 1 : 3);
    }
    facingChanged ||= original !== unit.dir;
  }
  const teleports = state.units.filter(unit => context.has(unit, 'tele'));
  const teleported = new Set<number>();
  for (const source of teleports) {
    const partner = teleports.find(unit => unit.name === source.name && (unit.x !== source.x || unit.y !== source.y));
    if (!partner) continue;
    for (const unit of context.at(source.x, source.y)) if (!teleported.has(unit.id) && !teleports.includes(unit) && samePlane(context, source, unit)) {
      unit.x = partner.x; unit.y = partner.y; teleported.add(unit.id);
    }
  }
  if (facingChanged || teleported.size) update();

  // SHIFT moves its initial riders earlier in the turn and faces the riders it has now.
  const shiftFacings: { unit: Unit; source: Unit }[] = [];
  for (const source of state.units) {
    if (!context.has(source, 'shift') || context.has(source, 'sleep')) continue;
    for (const unit of context.at(source.x, source.y)) {
      if (unit.id !== source.id && samePlane(context, unit, source)) shiftFacings.push({ unit, source });
    }
  }
  for (const { unit, source } of shiftFacings) unit.dir = source.dir;
  if (shiftFacings.length) update();

  const falls = state.units.flatMap(unit => {
    const dir = context.has(unit, 'fall') ? 3 : directionsFor(context, unit, 'fall')[0];
    return dir === undefined ? [] : [{ unit, dir } as { unit: Unit; dir: Direction }];
  });
  for (let i = 0; falls.length && i < Math.max(level.width, level.height); i++) {
    const before = falls.map(({ unit }) => [unit.x, unit.y]);
    walk(falls);
    if (falls.every(({ unit }, n) => unit.x === before[n]![0] && unit.y === before[n]![1])) break;
  }
  if (input !== 'wait') {
    let cursorMoved = false;
    for (const cursor of state.units) {
      if (!selector(context, cursor) || context.has(cursor, 'still')) continue;
      const dir = context.has(cursor, 'reverse') ? opposite(input) : input;
      if (context.has(cursor, 'locked' + directions[dir])) continue;
      const [dx, dy] = vectors[dir];
      const x = cursor.x + dx, y = cursor.y + dy;
      if (inBounds(x, y) && (!level.island || !blockedByWater(context, x, y)) && (openPaths.some(path => path.x === x && path.y === y) ||
          context.at(x, y).some(unit => canStandOnMapLink(context, unit)))) {
        cursor.x = x; cursor.y = y; cursor.dir = dir;
        cursorMoved = true;
      }
    }
    if (cursorMoved) update();
  }

  const resolveHazard = (effect: (unit: Unit, touching: Unit[], remove: (target: Unit) => void) => void) => {
    const hazard = new Set<Unit>();
    const remove = (unit: Unit) => { if (!context.has(unit, 'safe')) hazard.add(unit); };
    for (const unit of state.units) {
      const touching = context.at(unit.x, unit.y).filter(other => other.id !== unit.id && samePlane(context, unit, other));
      effect(unit, touching, remove);
    }
    destroy(hazard);
  };
  resolveHazard((unit, touching, remove) => {
    if (context.has(unit, 'sink') && touching.some(other => !context.has(other, 'safe'))) {
      remove(unit); touching.forEach(remove);
    }
  });
  resolveHazard((unit, touching, remove) => {
    if (!context.has(unit, 'boom')) return;
    remove(unit);
    for (const [dx, dy] of vectors) for (const other of context.at(unit.x + dx, unit.y + dy)) remove(other);
    touching.forEach(remove);
  });
  resolveHazard((unit, touching, remove) => {
    if (touching.length && context.has(unit, 'weak')) remove(unit);
  });
  resolveHazard((unit, touching, remove) => {
    const wholeRoom = context.units.find(candidate => candidate.id === -1);
    if (wholeRoom && context.has(wholeRoom, 'hot') && context.has(unit, 'melt') && samePlane(context, unit, wholeRoom)) remove(unit);
    if (context.has(unit, 'hot')) for (const other of touching) if (context.has(other, 'melt')) remove(other);
  });
  resolveHazard((unit, touching, remove) => {
    const levelUnit = context.units.find(candidate => candidate.id === -1);
    if (player(context, unit) && (context.has(unit, 'defeat') || (levelUnit && context.has(levelUnit, 'defeat')) ||
      touching.some(other => context.has(other, 'defeat') && (!context.has(other, 'weak') || context.has(other, 'safe'))))) {
      remove(unit);
    }
  });
  const unlocked = new Set<Unit>();
  for (const lock of state.units) {
    if (!context.has(lock, 'shut')) continue;
    const used = new Map<RuleContext['rules'][number], Set<string>>();
    // Each OPEN rule selects its first matching key from each stack on this cell.
    for (const key of context.at(lock.x, lock.y)) {
      if (!samePlane(context, lock, key) || !context.has(key, 'open')) continue;
      for (const rule of context.propertyRules(key, 'open')) {
        if (rule.target.not) continue;
        const name = rule.subject.name === 'text' && !rule.subject.not ? 'text' : key.name;
        let names = used.get(rule);
        if (!names) { names = new Set(); used.set(rule, names); }
        if (names.has(name)) continue;
        names.add(name);
        if (!context.has(lock, 'safe')) unlocked.add(lock);
        if (key.id !== lock.id && !context.has(key, 'safe')) unlocked.add(key);
      }
    }
  }
  destroy(unlocked);
  resolveHazard((unit, touching, remove) => {
    const eats = context.targets(unit, 'eat', 0);
    for (const other of touching) if (eats.includes(other.name)) remove(other);
  });
  const levelUnit = context.units.find(unit => unit.id === -1);
  const pending: { name: string; origin: Unit }[] = [];
  for (const unit of context.units) {
    for (const noun of context.targets(unit, 'make', 0)) {
      const name = noun === 'text' ? textName(unit) : noun;
      if (!context.at(unit.x, unit.y).some(other => other.name === name)) pending.push({ name, origin: unit });
    }
    if (context.has(unit, 'more')) for (const [dx, dy] of vectors) {
      const x = unit.x + dx, y = unit.y + dy;
      if (inBounds(x, y) && !context.at(x, y).some(other => other.name === unit.name || context.has(other, 'stop'))) {
        pending.push({ name: unit.name, origin: { ...unit, x, y } });
      }
    }
  }
  for (const { name, origin } of pending) {
    if (!isUniversal(name)) spawn(name, origin);
  }
  if (pending.length) update();
  const bonuses = new Set(state.units.filter(unit => context.has(unit, 'bonus') &&
    context.at(unit.x, unit.y).some(other => player(context, other) && samePlane(context, unit, other))));
  if (bonuses.size) {
    state.bonus = (state.bonus ?? 0) + bonuses.size;
    destroy(bonuses);
  }
  state.won ||= context.units.some(unit => player(context, unit) && (
    context.has(unit, 'win') || context.has(unit, 'end') ||
    (levelUnit && context.has(levelUnit, 'win')) ||
    context.at(unit.x, unit.y).some(target => samePlane(context, unit, target) && (context.has(target, 'win') || context.has(target, 'end')))
  ));
  return state;
}

export class Puzzle {
  readonly level: BabaLevel;
  state: GameState;
  context: RuleContext;
  private past: TurnChange[] = [];
  private future: TurnChange[] = [];
  private readonly read: RuleReader;
  private appliedConversions = new Map<string, readonly string[]>();
  private readonly campaign: Campaign | undefined;
  revealedPaths: BabaLevel['paths'];
  openPaths: BabaLevel['paths'];
  get canUndo(): boolean { return this.past.length > 0; }
  get canRedo(): boolean { return this.future.length > 0; }
  constructor(level: BabaLevel, saved?: GameState, campaign?: Campaign) {
    this.level = level;
    this.read = createRuleReader(level.width, level.height);
    this.campaign = campaign;
    this.state = saved && saved.units.every(unit => unit.x >= 0 && unit.y >= 0 && unit.x < level.width && unit.y < level.height) ? saved : initialState(level);
    if (this.state === saved) {
      this.state = addIsland(level, this.state);
      this.appliedConversions = new Map(campaign?.replacements(level.id));
    }
    this.context = ruleContext(level, this.state.units, this.state.turn, this.state.waiting, undefined, this.read);
    this.revealedPaths = level.paths.filter(path => path.style > 0);
    this.openPaths = this.revealedPaths.filter(path => !path.gate);
    this.refreshMap();
  }
  private change(state: GameState): void {
    this.state = state;
    this.context = ruleContext(this.level, state.units, state.turn, state.waiting, undefined, this.read);
  }
  move(input: Move): void {
    if (this.state.won || this.state.conversion) return;
    const next = advance(this.level, this.state, input, this.openPaths, this.read);
    this.past.push(recordTurn(this.state, next));
    if (this.past.length > 256) this.past.shift();
    this.future.length = 0;
    this.change(next);
  }
  undo(): void {
    const turn = this.past.pop();
    if (!turn) return;
    this.future.push(turn);
    this.change(restoreTurn(this.state, turn.before));
  }
  redo(): void {
    const turn = this.future.pop();
    if (!turn) return;
    this.past.push(turn);
    this.change(restoreTurn(this.state, turn.after));
  }
  reset(): void {
    this.past.length = 0;
    this.future.length = 0;
    this.appliedConversions.clear();
    this.change(initialState(this.level));
    this.refreshMap();
  }
  refreshMap(): void {
    const access = isMap(this.level) ? this.campaign?.access(this.level) : undefined;
    const pathsChanged = access && (access.paths.length !== this.openPaths.length ||
      access.paths.some((path, index) => path !== this.openPaths[index]));
    if (access) this.revealedPaths = access.revealedPaths;
    if (pathsChanged) this.openPaths = access.paths;
    let nextId = this.state.nextId;
    let units = this.state.units;
    if (access) units = units.map(unit => {
      if (!unit.marker) return unit;
      const index = this.level.links.findIndex(link => link.id === unit.link);
      const state = access.states[index];
      return state === undefined || state === unit.state ? unit : { ...unit, state };
    });
    for (const [link, targets] of this.campaign?.replacements(this.level.id) ?? []) {
      if (this.appliedConversions.get(link) === targets) continue;
      this.appliedConversions.set(link, targets);
      units = units.flatMap(unit => unit.link !== link ? [unit] : targets.flatMap((name, index) => {
        if (name === 'empty') return [];
        const type = typeOf(this.level, name);
        return [{ ...unit, id: index ? nextId++ : unit.id, name, type,
          layer: this.level.catalog.get(name)?.layer ?? (type >= 0 ? 20 : 16), state: Math.max(unit.state ?? 0, 2) }];
      }));
    }
    if (pathsChanged || units.length !== this.state.units.length || units.some((unit, index) => unit !== this.state.units[index])) {
      this.change({ ...this.state, units, nextId });
      this.past.length = 0;
      this.future.length = 0;
    }
  }
  selectedLink(): string | undefined {
    for (const cursor of this.state.units) {
      if (!selector(this.context, cursor)) continue;
      const link = this.context.at(cursor.x, cursor.y).find(unit =>
        unit.name === 'level' && canStandOnMapLink(this.context, unit))?.link;
      if (link) return link;
    }
    return undefined;
  }
}
