import { Geometry3D, type World } from '@haiyue/engine';
import { dot, cross, normalize, tangentFrame, CellMaterials, createCellFlag as createThemeFlag, type Vec3 } from '../../shared/minesweeper/Theme';
export { dot, cross, normalize, tangentFrame, CellMaterials } from '../../shared/minesweeper/Theme';
export type { Vec3, CellSurface, CellFlag } from '../../shared/minesweeper/Theme';

export const TILE_HEIGHT = 1.974;

/** Flat tile top with a narrow bevel. UVs use physical tangent coordinates so digits never fan-warp. */
export function tileGeometry(boundary: Vec3[], normal: Vec3, radius: number): Geometry3D {
  const { right, up } = tangentFrame(normal);
  const offsets = boundary.map(p => [dot(p, right) * radius * 0.955, dot(p, up) * radius * 0.955] as const);
  const extent = Math.max(...offsets.map(p => Math.hypot(...p)));
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [];
  const point = (x: number, y: number, height: number): Vec3 => [
    normal[0] * height + right[0] * x + up[0] * y,
    normal[1] * height + right[1] * x + up[1] * y,
    normal[2] * height + right[2] * x + up[2] * y,
  ];
  const triangle = (a: Vec3, b: Vec3, c: Vec3, faceNormal: Vec3) => {
    for (const p of [a, b, c]) {
      positions.push(...p); normals.push(...faceNormal);
      uvs.push(0.5 + dot(p, right) / (extent * 2), 0.5 - dot(p, up) / (extent * 2));
    }
  };
  for (let i = 0; i < offsets.length; i++) {
    const a = offsets[i]!, b = offsets[(i + 1) % offsets.length]!;
    const innerA = point(a[0] * 0.92, a[1] * 0.92, TILE_HEIGHT);
    const innerB = point(b[0] * 0.92, b[1] * 0.92, TILE_HEIGHT);
    const outerA = point(a[0], a[1], TILE_HEIGHT - 0.025);
    const outerB = point(b[0], b[1], TILE_HEIGHT - 0.025);
    triangle(point(0, 0, TILE_HEIGHT), innerA, innerB, normal);
    const edgeNormal = normalize(...cross(
      [outerA[0] - innerA[0], outerA[1] - innerA[1], outerA[2] - innerA[2]],
      [outerB[0] - innerA[0], outerB[1] - innerA[1], outerB[2] - innerA[2]],
    ));
    triangle(innerA, outerA, outerB, edgeNormal);
    triangle(innerA, outerB, innerB, edgeNormal);
  }
  return new Geometry3D({ positions: new Float32Array(positions), normals: new Float32Array(normals),
    textureCoordinates: [{ set: 0, data: new Float32Array(uvs) }], cullMode: 'none' });
}

export function createCellFlag(world: World, normal: Vec3, id: number, materials: CellMaterials) {
  return createThemeFlag(world, normal, id, materials, { origin: [normal[0] * TILE_HEIGHT, normal[1] * TILE_HEIGHT, normal[2] * TILE_HEIGHT] });
}
