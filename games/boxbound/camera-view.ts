import type { Vec } from './model';
export const MAP_PHI = Math.PI / 4;
export const MAP_THETA = Math.PI / 18;
// SphericalTransform3D keeps this small polar offset to avoid its look-at pole.
export const MAP_TOP_PHI = 0.005;
export const MAP_FOV = 0.65;
export const MAP_COVERAGE = 0.85;
export function mapCameraAngles(planar = false) {
  return { phi: planar ? MAP_TOP_PHI : MAP_PHI, theta: planar ? 0 : MAP_THETA };
}
export function mapBasis(phi: number, theta: number) {
  const sp = Math.sin(phi), cp = Math.cos(phi), st = Math.sin(theta), ct = Math.cos(theta);
  return { right: [ct, 0, -st] as Vec, up: [-cp * st, sp, -cp * ct] as Vec,
    back: [sp * st, cp, sp * ct] as Vec };
}
export function mapCameraRadius(size: number, aspect: number, phi: number, theta: number, coverage = MAP_COVERAGE): number {
  const half = (size + 0.3) / 2, tangent = Math.tan(MAP_FOV / 2), basis = mapBasis(phi, theta);
  let radius = 0;
  for (const x of [-half, half]) for (const z of [-half, half]) for (const y of [-0.87, 1.15]) {
    const p: Vec = [x, y - 0.25, z];
    const dot = (axis: Vec) => p[0] * axis[0] + p[1] * axis[1] + p[2] * axis[2];
    const depth = dot(basis.back);
    radius = Math.max(radius, depth + Math.abs(dot(basis.right)) / (tangent * Math.max(.01, aspect) * coverage),
      depth + Math.abs(dot(basis.up)) / (tangent * coverage));
  }
  return radius;
}
/** Finite eye-to-board segment; objects behind the board or camera cannot occlude it. */
export function occludesPoint(eye: Vec, target: Vec, min: Vec, max: Vec): boolean {
  let near = 0, far = 0.999;
  for (let i = 0; i < 3; i++) {
    const d = target[i]! - eye[i]!;
    if (Math.abs(d) < 1e-9) { if (eye[i]! < min[i]! || eye[i]! > max[i]!) return false; }
    else {
      const a = (min[i]! - eye[i]!) / d, b = (max[i]! - eye[i]!) / d;
      near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b));
      if (near > far) return false;
    }
  }
  return far >= near;
}
