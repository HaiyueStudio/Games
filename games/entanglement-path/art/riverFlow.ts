import { pathCurve, type InkPoint } from './hexGeometry';

export interface RiverRoute { cell: string; entry: number; exit: number }
export interface RiverSample extends InkPoint { distance: number }
export interface RiverCurve { points: readonly RiverSample[]; length: number }
export interface RiverWetness { entry: number; exit: number; progress: number; bank: number }
interface Fill extends RiverRoute { start: number; duration: number }
const curves = new Map<string, RiverCurve>();

export function riverSegmentKey(entry: number, exit: number): string {
  return `${Math.min(entry, exit)}-${Math.max(entry, exit)}`;
}

/** Sampled once per directed port pair. Distance, rather than Bezier t, drives the waterhead. */
export function riverCurve(entry: number, exit: number): RiverCurve {
  const id = `${entry}:${exit}`, cached = curves.get(id); if (cached) return cached;
  const c = pathCurve(entry, exit), points: RiverSample[] = [];
  let length = 0;
  for (let i = 0; i <= 80; i++) {
    const t = i / 80, u = 1 - t;
    const x = u ** 3 * c.start.x + 3 * u * u * t * c.control1.x + 3 * u * t * t * c.control2.x + t ** 3 * c.end.x;
    const y = u ** 3 * c.start.y + 3 * u * u * t * c.control1.y + 3 * u * t * t * c.control2.y + t ** 3 * c.end.y;
    const previous = points[i - 1]; if (previous) length += Math.hypot(x - previous.x, y - previous.y);
    points.push({ x, y, distance: length });
  }
  const result = { points, length }; curves.set(id, result); return result;
}

export function riverPointAt(curve: RiverCurve, distance: number): RiverSample {
  const d = Math.max(0, Math.min(curve.length, distance));
  let lo = 0, hi = curve.points.length - 1;
  while (lo + 1 < hi) { const mid = (lo + hi) >> 1; if (curve.points[mid]!.distance < d) lo = mid; else hi = mid; }
  const a = curve.points[lo]!, b = curve.points[hi]!, t = (d - a.distance) / (b.distance - a.distance || 1);
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, distance: d };
}

/** Intersections are overpasses, never gameplay junctions. Positions belong to the upper curve. */
export function riverCrossings(lower: RiverCurve, upper: RiverCurve): number[] {
  const result: number[] = [];
  for (let i = 1; i < lower.points.length; i++) for (let j = 1; j < upper.points.length; j++) {
    const a = lower.points[i - 1]!, b = lower.points[i]!, c = upper.points[j - 1]!, d = upper.points[j]!;
    const rx = b.x - a.x, ry = b.y - a.y, sx = d.x - c.x, sy = d.y - c.y, det = rx * sy - ry * sx;
    if (Math.abs(det) < 1e-8) continue;
    const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / det;
    const u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / det;
    if (t < 0 || t > 1 || u < 0 || u > 1) continue;
    const distance = c.distance + (d.distance - c.distance) * u;
    if (distance > 18 && upper.length - distance > 18 && !result.some(p => Math.abs(p - distance) < 12)) result.push(distance);
  }
  return result;
}

/** Visual state only: no timers, promises or gameplay locks. At most six fills per board cell. */
export class RiverFlow {
  private readonly fills = new Map<string, Fill>();
  private tail = 0;
  clear(): void { this.fills.clear(); this.tail = 0; }
  get size(): number { return this.fills.size; }
  private id(route: RiverRoute): string { return `${route.cell}:${riverSegmentKey(route.entry, route.exit)}`; }

  connect(routes: readonly RiverRoute[], now: number, instant = false): void {
    const fresh = routes.filter((route, i) => !this.fills.has(this.id(route))
      && routes.findIndex(other => this.id(other) === this.id(route)) === i);
    const totalLength = fresh.reduce((sum, r) => sum + riverCurve(r.entry, r.exit).length, 0);
    // Rapid placements finish the preceding pour, keeping feedback near the current move.
    if (this.tail > now + 320) {
      for (const fill of this.fills.values()) {
        if (fill.start + fill.duration > now) { fill.start = now - 1000; fill.duration = 1; }
      }
      this.tail = now;
    }
    let cursor = instant ? now - 2000 : Math.max(now, Math.min(this.tail, now + 320));
    const duration = Math.min(1200, Math.max(650, totalLength * 3.4));
    for (const route of fresh) {
      const span = instant ? 1 : duration * riverCurve(route.entry, route.exit).length / (totalLength || 1);
      this.fills.set(this.id(route), { ...route, start: cursor, duration: span }); cursor += span;
    }
    this.tail = cursor;
  }

  wetness(cell: string, now: number): RiverWetness[] {
    const result: RiverWetness[] = [];
    for (const fill of this.fills.values()) if (fill.cell === cell) {
      const elapsed = now - fill.start;
      result.push({ entry: fill.entry, exit: fill.exit,
        progress: Math.max(0, Math.min(1, elapsed / fill.duration)),
        bank: Math.max(0, Math.min(1, (elapsed - 110) / (fill.duration + 210))) });
    }
    return result;
  }

  movingCells(now: number): Set<string> {
    const keys = new Set<string>();
    for (const fill of this.fills.values()) if (now >= fill.start && now <= fill.start + fill.duration + 380) keys.add(fill.cell);
    return keys;
  }
}
