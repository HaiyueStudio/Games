import type { State, Vec, PlayerCrossing } from './model';
export interface SpaceTransform { scale: number; offset: Vec }
/** Explicit occurrence edge, including a room containing itself. Room IDs alone
 * cannot distinguish the large and small instances of that same room. */
export function containmentTransform(state: State, ownerId: string, outward = true): SpaceTransform {
  const b = state.boxes.find((box) => box.id === ownerId)!;
  const ratio = b.size / state.rooms[b.inside!]!.size;
  const center: Vec = [b.pos[0] + (b.size - 1) / 2 - (state.rooms[b.room]!.size - 1) / 2,
    b.pos[1] + b.size * 0.055, b.pos[2] + (b.size - 1) / 2 - (state.rooms[b.room]!.size - 1) / 2];
  return outward ? { scale: ratio, offset: center }
    : { scale: 1 / ratio, offset: center.map((v) => -v / ratio) as Vec };
}
/** Convert centered render coordinates between two occurrences of the finite graph.
 * Route edges are composed, never recursively expanded, including self references. */
export function spaceTransform(from: State, to: State, crossing?: PlayerCrossing): SpaceTransform {
  // A physical crossing is authoritative even when navigation is repaired from
  // A -> A into A -> B -> A. Do not also apply those bookkeeping route edges.
  if (crossing) return containmentTransform(crossing.entering ? to : from, crossing.container, !crossing.entering);
  let shared = 0;
  while (shared < Math.min(from.player.route.length, to.player.route.length) &&
    from.player.route[shared]!.box === to.player.route[shared]!.box) shared++;
  let scale = 1, offset: Vec = [0, 0, 0];
  const edge = (state: State, index: number) => {
    const b = state.boxes.find((v) => v.id === state.player.route[index]!.box)!;
    const ratio = b.size / state.rooms[b.inside!]!.size;
    const center: Vec = [b.pos[0] + (b.size - 1) / 2 - (state.rooms[b.room]!.size - 1) / 2,
      b.pos[1] + b.size * 0.055, b.pos[2] + (b.size - 1) / 2 - (state.rooms[b.room]!.size - 1) / 2];
    return { ratio, center };
  };
  for (let i = from.player.route.length - 1; i >= shared; i--) {
    const { ratio, center } = edge(from, i);
    offset = offset.map((v, a) => v * ratio + center[a]!) as Vec; scale *= ratio;
  }
  for (let i = shared; i < to.player.route.length; i++) {
    const { ratio, center } = edge(to, i);
    offset = offset.map((v, a) => (v - center[a]!) / ratio) as Vec; scale /= ratio;
  }
  return { scale, offset };
}
export const transformPoint = (p: Vec, t: SpaceTransform): Vec => p.map((v, i) => v * t.scale + t.offset[i]!) as Vec;

/** Map finite room coordinates through containment edges, preferring the actual
 * crossing container when a room has multiple occurrences. No graph expansion. */
export function roomSpaceTransform(state: State, from: string, to: string, container: string): SpaceTransform {
  const queue = [{ room: from, scale: 1, offset: [0, 0, 0] as Vec }];
  const seen = new Set<string>();
  const owners = state.boxes.filter((b) => b.inside).sort((a, b) => Number(b.id === container) - Number(a.id === container));
  for (let i = 0; i < queue.length; i++) {
    const node = queue[i]!;
    if (node.room === to) return { scale: node.scale, offset: node.offset };
    if (seen.has(node.room)) continue;
    seen.add(node.room);
    for (const box of owners) {
      const ratio = box.size / state.rooms[box.inside!]!.size;
      const center: Vec = [box.pos[0] + (box.size - 1) / 2 - (state.rooms[box.room]!.size - 1) / 2,
        box.pos[1] + box.size * 0.055, box.pos[2] + (box.size - 1) / 2 - (state.rooms[box.room]!.size - 1) / 2];
      const up = node.room === box.inside;
      if (!up && node.room !== box.room) continue;
      const scale = up ? ratio : 1 / ratio;
      queue.push({ room: up ? box.room : box.inside!, scale: node.scale * scale,
        offset: node.offset.map((v, a) => up ? v * ratio + center[a]! : (v - center[a]!) / ratio) as Vec });
    }
  }
  throw new Error(`No containment path from ${from} to ${to}`);
}
