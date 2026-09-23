type Point = [number, number];
interface Edge { start: Point; end: Point; direction: number; }
/** Trace the whole cage before insetting, so shared cell edges never leave gaps. */
export function cageOutlines(cells: readonly number[], columns: number): Point[][] {
  const occupied = new Set(cells), edges: Edge[] = [];
  const add = (start: Point, end: Point, direction: number) => edges.push({ start, end, direction });
  for (const cell of occupied) {
    const x = cell % columns, y = Math.floor(cell / columns);
    if (!occupied.has(cell - columns)) add([x, y], [x + 1, y], 0);
    if (x === columns - 1 || !occupied.has(cell + 1)) add([x + 1, y], [x + 1, y + 1], 1);
    if (!occupied.has(cell + columns)) add([x + 1, y + 1], [x, y + 1], 2);
    if (x === 0 || !occupied.has(cell - 1)) add([x, y + 1], [x, y], 3);
  }
  const key = ([x, y]: Point) => `${x},${y}`;
  const outgoing = new Map<string, Edge[]>();
  for (const edge of edges) outgoing.set(key(edge.start), [...(outgoing.get(key(edge.start)) ?? []), edge]);
  const unused = new Set(edges), contours: Point[][] = [];
  const normals: Point[] = [[0, 1], [-1, 0], [0, -1], [1, 0]];
  for (const first of edges) {
    if (!unused.has(first)) continue;
    const loop: Edge[] = [];
    let edge = first;
    do {
      loop.push(edge); unused.delete(edge);
      // Keep the cage on the right, including at diagonally touching corners.
      const candidates = outgoing.get(key(edge.end)) ?? [];
      const next: Edge | undefined = [1, 0, 3, 2].flatMap(turn => candidates.filter(candidate =>
        (unused.has(candidate) || candidate === first) && candidate.direction === (edge.direction + turn) % 4,
      ))[0];
      if (!next) break;
      edge = next;
    } while (edge !== first);
    contours.push(loop.map((current, i) => {
      const previous = loop[(i + loop.length - 1) % loop.length]!;
      const a = normals[previous.direction]!, b = normals[current.direction]!;
      return [current.start[0] * 70 + (a[0] + b[0]) * (previous.direction === current.direction ? 2.5 : 5),
        current.start[1] * 70 + (a[1] + b[1]) * (previous.direction === current.direction ? 2.5 : 5)];
    }));
  }
  return contours;
}
