import type { Axial } from './VersusRules';

export type BoardShape = 'trident' | 'blossom';
// Reference-image lattice: column k, vertical step m; k and m have equal parity.
// Only playable interiors are listed. A complete one-cell mountain rim closes every exposed edge.
const INTERIOR_COLUMNS: Record<BoardShape, readonly [number, number, number][]> = {
  trident: [[-3,-3,-1], [-2,-4,0], [-1,-5,5], [0,-2,6], [1,-5,5], [2,-4,0], [3,-3,-1]],
  blossom: [[-5,-1,1], [-4,-2,2], [-3,-7,7], [-2,-8,8], [-1,-7,7], [0,-6,6],
    [1,-7,7], [2,-8,8], [3,-7,7], [4,-2,2], [5,-1,1]],
};
const DIRECTIONS: readonly [number, number][] = [[1,0], [0,1], [-1,1], [-1,0], [0,-1], [1,-1]];
export function createBoardShape(shape: BoardShape): { cells: Axial[]; walls: Axial[] } {
  const interior = new Map<string, Axial>(), boundary = new Map<string, Axial>();
  for (const [column, first, last] of INTERIOR_COLUMNS[shape]) for (let row = first; row <= last; row += 2) {
    const cell = { q: (row + column) / 2, r: -column };
    interior.set(`${cell.q},${cell.r}`, cell);
  }
  for (const { q, r } of interior.values()) for (const [dq, dr] of DIRECTIONS) {
    const id = `${q + dq},${r + dr}`;
    if (!interior.has(id)) boundary.set(id, { q: q + dq, r: r + dr });
  }
  const ordered = (cells: Axial[]) => cells.sort((a, b) => a.q - b.q || a.r - b.r);
  return { cells: ordered([...interior.values(), ...boundary.values()]), walls: ordered([...boundary.values()]) };
}
