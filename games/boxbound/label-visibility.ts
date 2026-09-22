import type {Vec} from './model';
/** Distances are in the active room's grid units, independent of nesting scale. */
export function labelIsNear(room: string, activeRoom: string, outer: boolean, anchor: Vec, player: Vec): boolean {
  return !outer && room===activeRoom && Math.hypot(anchor[0]-player[0],anchor[2]-player[2])<=2.5;
}
