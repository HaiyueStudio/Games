import { ownerFor, boxAt, boxColor, goalColor, gateOpen, gateContains, platePressed, type State, type Vec, type CrateColor } from './model';
import type { DecorationKind } from './decorations';
export interface OuterCell {
  source: Vec;
  center: Vec;
  size: Vec;
  paved: boolean;
  wall: boolean;
  decoration?: DecorationKind;
  box?: { id: string; color: CrateColor; inside: boolean; fixed: boolean; portal: boolean; size: number; offset: Vec };
  goal?: CrateColor | 'white';
  home: boolean;
  gate?: { open: boolean; axis: 'x' | 'z' };
  button?: boolean;
}
/** Nearby-cell metadata for exit diagnostics, at the containing box scale.
 * Rendering uses the complete parent room; this ring never clips its geometry. */
export function outerContext(state: State): { parent: string; owner: string; scale: number; cells: OuterCell[] } | null {
  const owner = ownerFor(state, state.player.room);
  if (!owner) return null;
  const parent = state.rooms[owner.room]!, inner = state.rooms[state.player.room]!;
  const cells: OuterCell[] = [], step = inner.size / owner.size;
  const axis = (offset: number): [number, number] => [-0.5 + step * (offset + 0.5), step];
  for (let dx = -1; dx <= owner.size; dx++) for (let dz = -1; dz <= owner.size; dz++) {
    if (dx >= 0 && dx < owner.size && dz >= 0 && dz < owner.size) continue;
    const source: Vec = [owner.pos[0] + dx, owner.pos[1], owner.pos[2] + dz];
    if (source[0] < 0 || source[0] >= parent.size || source[2] < 0 || source[2] >= parent.size) continue;
    const same = (p: Vec) => p.every((v, i) => v === source[i]);
    const [x, width] = axis(dx), [z, depth] = axis(dz);
    const cell: OuterCell = {
      source, center: [x, -inner.size * 0.055, z], size: [width, 0.08 * step, depth],
      paved: !parent.floorTiles || parent.floorTiles.some((p) => p[0] === source[0] && p[2] === source[2]),
      wall: parent.walls.some(same), home: !!parent.home && same(parent.home),
    };
    const decoration = parent.decorations?.find((d) => d.pos[0] === source[0] && d.pos[2] === source[2]);
    if (decoration) cell.decoration = decoration.type;
    const box = boxAt(state, parent.id, source, owner.id);
    if (box) cell.box = { id: box.id, color: boxColor(box), inside: !!box.inside, fixed: box.fixed, portal: !!box.portal, size: box.size, offset: box.pos.map((v, i) => v - source[i]! + (i === 1 ? 0 : (box.size - 1) / 2)) as Vec };
    const goal = parent.goals.findIndex(same);
    if (goal >= 0) cell.goal = parent.anyGoalColor ? 'white' : goalColor(parent, goal);
    const gate = parent.gates?.find((g) => g.pos[1]===source[1] && gateContains(g,source));
    if (gate) cell.gate = { open: gateOpen(state, parent.id, gate), axis: gate.axis };
    const button = parent.buttons?.find((b) => same(b.pos));
    if (button) cell.button = platePressed(state, parent.id, button);
    cells.push(cell);
  }
  return { parent: parent.id, owner: owner.id, scale: step, cells };
}
