import type { Room, Vec } from './model';
import type { SurfaceMesh } from './wall-mesh';

interface FloorPatch {
  center: Vec;
  size: Vec;
  alternate: boolean;
  surface: SurfaceMesh;
}
const cache = new WeakMap<Room, { signature: string; patches: FloorPatch[] }>();

/** The same two checkerboard meshes serve full rooms and their miniature LOD.
 * Keep authored holes/heights and two triangles per tile, without an entity for
 * every square. Room definitions own the cache, so unloading a world releases it.
 */
export function roomFloor(room: Room): FloorPatch[] {
  const signature = `${room.size}:${JSON.stringify(room.floorTiles ?? null)}`;
  const cached = cache.get(room);
  if (cached?.signature === signature) return cached.patches;
  const tiles = room.floorTiles ?? Array.from({ length: room.size ** 2 }, (_, i): Vec =>
    [Math.floor(i / room.size), 0, i % room.size]);
  const patches: FloorPatch[] = [];
  for (const alternate of [false, true]) {
    const cells = tiles.filter(([x, , z]) => !!((x + z) % 2) === alternate);
    if (!cells.length) continue;
    const min: Vec = [Infinity, Infinity, Infinity], max: Vec = [-Infinity, -Infinity, -Infinity];
    for (const cell of cells) for (const axis of [0, 1, 2]) {
      const half = axis === 1 ? 0 : .5;
      min[axis] = Math.min(min[axis]!, cell[axis]! - half);
      max[axis] = Math.max(max[axis]!, cell[axis]! + half);
    }
    const center = min.map((v, i) => (v + max[i]!) / 2) as Vec;
    const surface: SurfaceMesh = { key: `floor/${signature}/${+alternate}`, positions: [], normals: [], indices: [] };
    for (const [x, y, z] of cells) {
      const start = surface.positions.length / 3;
      for (const [dx, dz] of [[-.5, -.5], [-.5, .5], [.5, .5], [.5, -.5]]) {
        surface.positions.push(x + dx! - center[0], y - center[1], z + dz! - center[2]);
        surface.normals.push(0, 1, 0);
      }
      surface.indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
    }
    patches.push({ center: [center[0], center[1] + .004, center[2]],
      size: min.map((v, i) => max[i]! - v) as Vec, alternate, surface });
  }
  cache.set(room, { signature, patches });
  return patches;
}
