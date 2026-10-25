import type { Geometry3D } from '@haiyue/engine/geometry';

/** Both Engine box factories use six independent face vertex blocks, with +Y at index 2. */
export function tileAtlasGeometry(geometry: Geometry3D, width: number, depth: number): Geometry3D {
  const uv = geometry.getTextureCoordinates(0);
  if (!uv || geometry.vertexCount % 6 !== 0) throw new Error('2048 atlas requires six independent box faces.');
  const perFace = geometry.vertexCount / 6;
  for (let vertex = 0; vertex < geometry.vertexCount; vertex++) {
    if (vertex >= perFace * 2 && vertex < perFace * 3) {
      // Physical coordinates avoid the nonuniform rounded-edge parameterization stretching numerals.
      uv[vertex * 2] = geometry.positions[vertex * 3]! / width + 0.5;
      uv[vertex * 2 + 1] = (geometry.positions[vertex * 3 + 2]! / depth + 0.5) * 0.5;
    } else {
      uv[vertex * 2 + 1] = 0.5 + uv[vertex * 2 + 1]! * 0.5;
    }
  }
  geometry.markDirty();
  return geometry;
}
