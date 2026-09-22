import type { State, Vec, PlayerCrossing } from './model';
export interface SpaceTransform { scale: number; offset: Vec; flipX?: boolean }
/** Explicit occurrence edge, including a room containing itself. Room IDs alone
 * cannot distinguish the large and small instances of that same room. */
export function containmentTransform(state: State, ownerId: string, outward = true): SpaceTransform {
  const b = state.boxes.find((box) => box.id === ownerId)!;
  const ratio = b.size / state.rooms[b.inside!]!.size;
  const center: Vec = [b.pos[0] + (b.size - 1) / 2 - (state.rooms[b.room]!.size - 1) / 2,
    b.pos[1] + b.size * 0.055, b.pos[2] + (b.size - 1) / 2 - (state.rooms[b.room]!.size - 1) / 2];
  const flip = b.flipped ? {flipX:true} : {};
  return outward ? { scale: ratio, offset: center, ...flip }
    : { scale: 1 / ratio, offset: center.map((v,i) => -v / ratio * (i===0 && b.flipped ? -1 : 1)) as Vec, ...flip };
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
  let result: SpaceTransform = {scale:1,offset:[0,0,0]};
  for (let i = from.player.route.length - 1; i >= shared; i--)
    result = composeSpace(result, containmentTransform(from, from.player.route[i]!.box));
  for (let i = shared; i < to.player.route.length; i++)
    result = composeSpace(result, containmentTransform(to, to.player.route[i]!.box, false));
  return result;
}
export const transformPoint = (p: Vec, t: SpaceTransform): Vec => p.map((v, i) => v * t.scale * (i === 0 && t.flipX ? -1 : 1) + t.offset[i]!) as Vec;
export function composeSpace(first: SpaceTransform, second: SpaceTransform): SpaceTransform {
  return {scale:first.scale*second.scale,offset:transformPoint(first.offset,second),
    ...(!!first.flipX !== !!second.flipX ? {flipX:true} : {})};
}

/** Map finite room coordinates through containment edges, preferring the actual
 * crossing container when a room has multiple occurrences. No graph expansion. */
export function roomSpaceTransform(state: State, from: string, to: string, container: string): SpaceTransform {
  const queue: (SpaceTransform & {room:string})[] = [{ room: from, scale: 1, offset: [0, 0, 0] }];
  const seen = new Set<string>();
  const owners = state.boxes.filter((b) => b.inside).sort((a, b) => Number(b.id === container) - Number(a.id === container));
  for (let i = 0; i < queue.length; i++) {
    const node = queue[i]!;
    if (node.room === to) return { scale: node.scale, offset: node.offset, ...(node.flipX ? {flipX:true} : {}) };
    if (seen.has(node.room)) continue;
    seen.add(node.room);
    for (const box of owners) {
      const up = node.room === box.inside;
      if (!up && node.room !== box.room) continue;
      queue.push({room:up ? box.room : box.inside!, ...composeSpace(node, containmentTransform(state,box.id,up))});
    }
  }
  throw new Error(`No containment path from ${from} to ${to}`);
}
