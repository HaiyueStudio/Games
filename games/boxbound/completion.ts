import { copyState, eq, goalsSatisfied, leaveIndependentLevel, type State } from './model';

export function finishedLevel(state: State): number | null {
  const room = state.rooms[state.player.room]!;
  return room.level > 0 && room.home && eq(room.home, state.player.pos) &&
    state.completed.includes(room.level) && goalsSatisfied(state, room.level) ? room.level : null;
}
/** Completion and Esc use the same independent puzzle boundary and safe landing. */
export function returnFromCompletedLevel(state: State, level: number): State | null {
  if (finishedLevel(state) !== level) return null;
  const next = copyState(state);
  if (!leaveIndependentLevel(next, level)) return null;
  next.message = `小世界完成！回到「${next.rooms[next.player.room]!.name}」，继续探索吧。`;
  return next;
}
