import type { GameState } from './game';
import type { Unit } from './syntax';

interface Frame {
  state: GameState;
  units: Map<number, Unit>;
  order?: number[];
}

export interface TurnChange {
  before: Frame;
  after: Frame;
}

const noUnits: Unit[] = [];
const sameUnit = (a: Unit, b: Unit) => a.id === b.id && a.name === b.name && a.type === b.type &&
  a.layer === b.layer && a.x === b.x && a.y === b.y && a.dir === b.dir &&
  a.link === b.link && a.entrance === b.entrance && a.state === b.state && a.marker === b.marker && a.holder === b.holder;

export function recordTurn(before: GameState, after: GameState): TurnChange {
  const old: Frame = { state: { ...before, units: noUnits }, units: new Map() };
  const next: Frame = { state: { ...after, units: noUnits }, units: new Map() };
  if (before.units.length === after.units.length && before.units.every(({ id }, i) => id === after.units[i]!.id)) {
    before.units.forEach((unit, i) => {
      const changed = after.units[i]!;
      if (!sameUnit(unit, changed)) { old.units.set(unit.id, unit); next.units.set(unit.id, changed); }
    });
  } else {
    old.order = before.units.map(unit => unit.id);
    next.order = after.units.map(unit => unit.id);
    const byId = new Map(before.units.map(unit => [unit.id, unit]));
    for (const unit of after.units) {
      const prior = byId.get(unit.id);
      if (prior) byId.delete(unit.id);
      if (!prior || !sameUnit(prior, unit)) {
        next.units.set(unit.id, unit);
        if (prior) old.units.set(prior.id, prior);
      }
    }
    for (const [id, removed] of byId) old.units.set(id, removed);
  }
  return { before: old, after: next };
}

export function restoreTurn(current: GameState, { state, units, order }: Frame): GameState {
  if (!order) return { ...state, units: current.units.map(unit => units.get(unit.id) ?? unit) };
  const byId = new Map(current.units.map(unit => [unit.id, unit]));
  return { ...state, units: order.map(id => units.get(id) ?? byId.get(id)!) };
}
