/** The camera looks down (1,1,1). Only authored end ports may join in projection. */
export type Vec3 = [number, number, number];
export type PathId = 'home' | 'turn' | 'landing' | 'slide' | 'gate';
export interface PuzzleState { angle: number; offset: number; at: PathId; completed: boolean; moves: number }
export interface Path { id: PathId; a: Vec3; b: Vec3 }
export const PATH_IDS: PathId[] = ['home', 'turn', 'landing', 'slide', 'gate'];
export const TURN_CENTER: Vec3 = [-2.5, 0, 0];
export const PORT_TOLERANCE = 0.055;
export const initialState = (): PuzzleState => ({ angle: Math.PI / 2, offset: -2, at: 'home', completed: false, moves: 0 });
export const clampOffset = (value: number): number => Math.max(-2, Math.min(2, value));
export const snapOffset = (value: number): number => Math.round(clampOffset(value) * 2) / 2;
export const snapAngle = (value: number): number => ((Math.round(value / (Math.PI / 2)) % 4 + 4) % 4) * Math.PI / 2;
export const midpoint = (p: Path): Vec3 => p.a.map((v, i) => (v + p.b[i]!) / 2) as Vec3;
export const distance = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export function project(p: Vec3): [number, number] { return [(p[0] - p[2]) / Math.SQRT2, (2 * p[1] - p[0] - p[2]) / Math.sqrt(6)]; }
export function paths(s: PuzzleState): Path[] {
  const dx = 2 * Math.cos(s.angle), dz = -2 * Math.sin(s.angle);
  return [
    { id: 'home', a: [-7, 0, 0], b: [-4.5, 0, 0] },
    { id: 'turn', a: [-2.5 - dx, 0, -dz], b: [-2.5 + dx, 0, dz] },
    { id: 'landing', a: [2.5, 3, 3], b: [4.5, 3, 3] },
    { id: 'slide', a: [4.5 + s.offset, 3, 3], b: [4.5 + s.offset, 3, 0] },
    { id: 'gate', a: [6.5, 5, 2], b: [8.5, 5, 2] },
  ];
}
export interface Join { from: PathId; to: PathId; a: Vec3; b: Vec3; illusion: boolean }
export function joins(s: PuzzleState): Join[] {
  const all = paths(s), result: Join[] = [];
  for (let i = 0; i < all.length - 1; i++) {
    const a = all[i]!, b = all[i + 1]!;
    let closest: { a: Vec3; b: Vec3; error: number } | null = null;
    for (const pa of [a.a, a.b]) for (const pb of [b.a, b.b]) {
      const u = project(pa), v = project(pb), error = Math.hypot(u[0] - v[0], u[1] - v[1]);
      if (!closest || error < closest.error) closest = { a: pa, b: pb, error };
    }
    if (closest && closest.error <= PORT_TOLERANCE) result.push({ from: a.id, to: b.id, a: closest.a, b: closest.b, illusion: distance(closest.a, closest.b) > 0.2 });
  }
  return result;
}
export function route(s: PuzzleState, destination: PathId): Vec3[] | null {
  const all = paths(s), links = joins(s), queue: PathId[] = [s.at];
  const parent = new Map<PathId, { previous: PathId; a: Vec3; b: Vec3 }>();
  const visited = new Set<PathId>(queue);
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i]!;
    for (const link of links) {
      const next = link.from === current ? link.to : link.to === current ? link.from : null;
      if (!next || visited.has(next)) continue;
      visited.add(next); queue.push(next);
      parent.set(next, { previous: current, a: link.from === current ? link.a : link.b, b: link.from === current ? link.b : link.a });
    }
  }
  if (!visited.has(destination)) return null;
  const points: Vec3[] = [midpoint(all.find(p => p.id === destination)!)];
  let current = destination;
  while (current !== s.at) {
    const edge = parent.get(current)!;
    points.unshift(edge.a, edge.b); current = edge.previous;
  }
  return points;
}
export function canManipulate(s: PuzzleState, id: 'turn' | 'slide', walking: boolean): boolean { return !walking && !s.completed && s.at !== id; }
export function isPuzzleState(value: unknown): value is PuzzleState {
  if (!value || typeof value !== 'object') return false;
  const s = value as PuzzleState;
  return Number.isFinite(s.angle) && s.angle >= 0 && s.angle < Math.PI * 2
    && Math.abs(s.angle - snapAngle(s.angle)) < 1e-6
    && Number.isFinite(s.offset) && s.offset >= -2 && s.offset <= 2 && s.offset === snapOffset(s.offset)
    && PATH_IDS.includes(s.at) && typeof s.completed === 'boolean'
    && (!s.completed || s.at === 'gate') && Number.isSafeInteger(s.moves) && s.moves >= 0;
}
