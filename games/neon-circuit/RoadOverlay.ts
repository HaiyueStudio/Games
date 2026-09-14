import type { RaceTrack } from './RaceRules';

type UV = readonly [number, number];

/** Clip decals against the road's actual triangles. A banked quad is not planar:
 * independently extruding a narrow stripe can cut through its diagonal. */
export function roadOverlay(track: RaceTrack, top: ArrayLike<number>, from: number, to: number,
  left: number, right: number, halfWidth: number, lift: number, uvScale: UV) {
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [], indices: number[] = [];
  const start = ((from % track.length) + track.length) % track.length, end = start + to - from;
  const low = (left + halfWidth) / (2 * halfWidth), high = (right + halfWidth) / (2 * halfWidth);
  const clip = (polygon: UV[], axis: 0 | 1, bound: number, above: boolean): UV[] => {
    const output: UV[] = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i]!, b = polygon[(i + 1) % polygon.length]!;
      const insideA = above ? a[axis] >= bound : a[axis] <= bound;
      const insideB = above ? b[axis] >= bound : b[axis] <= bound;
      if (insideA) output.push(a);
      if (insideA !== insideB) {
        const t = (bound - a[axis]) / (b[axis] - a[axis]);
        output.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
    return output;
  };
  for (let ring = 0; ring < track.samples.length; ring++) for (const lap of [0,1]) {
    const d0 = track.samples[ring]!.distance + lap * track.length;
    const d1 = (track.samples[ring + 1]?.distance ?? track.length) + lap * track.length;
    if (d1 <= start || d0 >= end) continue;
    const t0 = Math.max(0, (start - d0) / (d1 - d0)), t1 = Math.min(1, (end - d0) / (d1 - d0));
    // Match PathExtrusion's [left, nextRight, right] / [left, nextLeft, nextRight].
    for (const upper of [true, false]) {
      let polygon: UV[] = upper ? [[0,0],[1,1],[0,1]] : [[0,0],[1,0],[1,1]];
      polygon = clip(clip(clip(clip(polygon, 0, t0, true), 0, t1, false), 1, low, true), 1, high, false);
      if (polygon.length < 3) continue;
      const base = positions.length / 3, a = ring * 6, b = a + 3, c = a + 6, d = a + 9;
      const triangle = upper ? [a,d,b] : [a,c,d];
      const ab = [0,1,2].map(axis => top[triangle[1]! + axis]! - top[triangle[0]! + axis]!);
      const ac = [0,1,2].map(axis => top[triangle[2]! + axis]! - top[triangle[0]! + axis]!);
      const normal = [ab[1]! * ac[2]! - ab[2]! * ac[1]!, ab[2]! * ac[0]! - ab[0]! * ac[2]!, ab[0]! * ac[1]! - ab[1]! * ac[0]!];
      const magnitude = Math.hypot(...normal) || 1;
      for (const [t,v] of polygon) {
        const weights = upper ? [1-v,t,v-t] : [1-t,t-v,v];
        for (let axis = 0; axis < 3; axis++) positions.push(weights.reduce((value, weight, i) => value + weight * top[triangle[i]! + axis]!, track.samples[ring]!.frame ? normal[axis]! / magnitude * lift : axis === 1 ? lift : 0));
        normals.push(...normal.map(value => value / magnitude));
        uvs.push((d0 + (d1 - d0) * t - start) * uvScale[0], (v * 2 * halfWidth - halfWidth - left) * uvScale[1]);
      }
      for (let i = 1; i < polygon.length - 1; i++) indices.push(base, base + i, base + i + 1);
    }
  }
  return { positions: new Float32Array(positions), normals: new Float32Array(normals),
    textureCoordinates: [{ set: 0, data: new Float32Array(uvs) }], indices: new Uint32Array(indices) };
}
