/** Integer lattice and signed orthonormal bases keep arbitrarily long replays exact. */
export type Axis = 0 | 1 | 2;
export type Vec = [number, number, number];
export type Kind = '2' | '3' | '4' | 'mirror';
export interface Move {
  axis: Axis;
  layer: number;
  direction: 1 | -1;
}
export interface Cubie {
  id: number;
  home: Vec;
  position: Vec;
  basis: [Vec, Vec, Vec];
  center: Vec;
  size: Vec;
}
export const KINDS: Kind[] = ['2', '3', '4', 'mirror'];
export const TITLES: Record<Kind, string> = {
  '2': '二阶魔方',
  '3': '三阶魔方',
  '4': '四阶魔方',
  mirror: '镜面魔方',
};
export function rotate(v: Vec, axis: Axis, direction: number): Vec {
  const [x, y, z] = v;
  if (axis === 0) return [x, -direction * z, direction * y];
  if (axis === 1) return [direction * z, y, -direction * x];
  return [-direction * y, direction * x, z];
}
export function transform(basis: [Vec, Vec, Vec], v: Vec): Vec {
  return [0, 1, 2].map((a) => basis[0][a]! * v[0] + basis[1][a]! * v[1] + basis[2][a]! * v[2]) as Vec;
}
export function inverse(move: Move): Move {
  return { ...move, direction: move.direction === 1 ? -1 : 1 };
}
export function notation(move: Move, order: number): string {
  const positive = ['R', 'U', 'F'][move.axis]!,
    negative = ['L', 'D', 'B'][move.axis]!;
  const fromPositive = order - move.layer,
    fromNegative = move.layer + 1;
  const usePositive = fromPositive <= fromNegative,
    depth = usePositive ? fromPositive : fromNegative;
  return `${depth > 1 ? depth : ''}${usePositive ? positive : negative}${move.direction === (usePositive ? 1 : -1) ? "'" : ''}`;
}
export class CubeModel {
  readonly order: number;
  readonly kind: Kind;
  readonly cubies: Cubie[] = [];
  readonly history: Move[] = [];
  constructor(kind: Kind = '3') {
    if (!KINDS.includes(kind)) throw new Error('Unknown cube kind');
    this.kind = kind;
    this.order = kind === 'mirror' ? 3 : Number(kind);
    const n = this.order;
    // A shared central thickness keeps all cut planes at ±0.5 after any turn.
    // Unequal outer extents shape-shift without intersecting neighboring slices.
    const widths: Vec[] =
      kind === 'mirror'
        ? [
            [0.55, 1, 1.45],
            [0.7, 1, 1.3],
            [0.45, 1, 1.55],
          ]
        : [];
    for (let x = 0; x < n; x++)
      for (let y = 0; y < n; y++)
        for (let z = 0; z < n; z++) {
          if ([x, y, z].every((v) => v > 0 && v < n - 1)) continue;
          const home: Vec = [x, y, z];
          const size = home.map((p, a) => widths[a]?.[p] ?? 3 / n) as Vec;
          const center = home.map((p, a) =>
            widths[a]
              ? p === 1
                ? 0
                : ((p === 0 ? -1 : 1) * (widths[a]![1] + widths[a]![p]!)) / 2
              : ((p - (n - 1) / 2) * 3) / n,
          ) as Vec;
          this.cubies.push({
            id: this.cubies.length,
            home,
            position: [...home],
            basis: [
              [1, 0, 0],
              [0, 1, 0],
              [0, 0, 1],
            ],
            center,
            size,
          });
        }
  }
  apply(move: Move, record = true): void {
    if (
      ![0, 1, 2].includes(move.axis) ||
      !Number.isInteger(move.layer) ||
      move.layer < 0 ||
      move.layer >= this.order ||
      ![1, -1].includes(move.direction)
    )
      throw new Error('Invalid cube move');
    const middle = (this.order - 1) / 2;
    for (const piece of this.cubies)
      if (piece.position[move.axis] === move.layer) {
        piece.position = rotate(piece.position.map((v) => v - middle) as Vec, move.axis, move.direction).map(
          (v) => v + middle,
        ) as Vec;
        piece.basis = piece.basis.map((v) => rotate(v, move.axis, move.direction)) as [Vec, Vec, Vec];
      }
    if (record) this.history.push({ ...move });
  }
  undo(): Move | null {
    const previous = this.history.pop();
    if (!previous) return null;
    const move = inverse(previous);
    this.apply(move, false);
    return move;
  }
  get solved(): boolean {
    if (this.kind === 'mirror')
      return this.cubies.every((p) => {
        const center = transform(p.basis, p.center),
          size = transform(p.basis, p.size).map(Math.abs);
        return center.every(
          (v, a) => Math.abs(v - p.center[a]!) < 1e-8 && Math.abs(size[a]! - p.size[a]!) < 1e-8,
        );
      });
    const faces = new Map<string, string>();
    for (const p of this.cubies)
      for (const a of [0, 1, 2] as Axis[])
        for (const sign of [-1, 1]) {
          if (p.home[a] !== (sign < 0 ? 0 : this.order - 1)) continue;
          const normal = p.basis[a].map((v) => v * sign).join(',');
          const color = `${a}:${sign}`,
            seen = faces.get(normal);
          if (seen && seen !== color) return false;
          faces.set(normal, color);
        }
    return true;
  }
  snapshot(): string {
    return JSON.stringify(this.cubies.map((p) => [p.position, p.basis]));
  }
}
/** Seeded, legal single-layer scramble; avoid consecutive turns about the same axis. */
export function scramble(
  order: number,
  seed: number,
  count = order === 2 ? 16 : order === 4 ? 40 : 25,
): Move[] {
  let state = seed >>> 0,
    last = -1;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  return Array.from({ length: count }, () => {
    const axis = (last < 0 ? Math.floor(random() * 3) : (last + 1 + Math.floor(random() * 2)) % 3) as Axis;
    last = axis;
    return { axis, layer: Math.floor(random() * order), direction: random() < 0.5 ? -1 : 1 };
  });
}
