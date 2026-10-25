import type { DeviceMode, DeviceOrientation } from './layout';

export function deviceDimensions(mode: DeviceMode, orientation: DeviceOrientation = 'portrait') {
  const height = mode === 'phone' ? 6.32 : 7.5, screenHeight = mode === 'phone' ? 6.16 : 6.5;
  const width = mode === 'phone' ? 3.3 : 5.6, screenWidth = screenHeight * (mode === 'phone' ? 390 / 760 : 820 / 1080), home = -height / 2 + .25, landscape = orientation === 'landscape';
  const thickness = .24 * .75, bezelY = thickness / 2 + .006;
  return { width: landscape ? height : width, height: landscape ? width : height, thickness, radius: mode === 'phone' ? .3 : .4,
    screenWidth: landscape ? screenHeight : screenWidth, screenHeight: landscape ? screenWidth : screenHeight, screenRadius: mode === 'phone' ? .24 : .16,
    bezelY, screenY: bezelY + .009, homeY: bezelY + .001, homeThickness: .012, homeX: landscape ? home : 0, homeZ: landscape ? 0 : home };
}

export function deviceGeometry(width: number, height: number, radius: number, thickness = 0, flipU = false) {
  const boundary: [number, number][] = [], segments = 12;
  for (let corner = 0; corner < 4; corner++) {
    const centerX = (corner === 0 || corner === 3 ? 1 : -1) * (width / 2 - radius);
    const centerZ = (corner < 2 ? 1 : -1) * (height / 2 - radius);
    for (let segment = 0; segment <= segments; segment++) {
      const angle = (corner + segment / segments) * Math.PI / 2;
      boundary.push([centerX + radius * Math.cos(angle), centerZ + radius * Math.sin(angle)]);
    }
  }
  const positions: number[] = [], normals: number[] = [], uv: number[] = [], indices: number[] = [];
  const face = (side: number) => {
    const center = positions.length / 3; positions.push(0, side * thickness / 2, 0); normals.push(0, side, 0); uv.push(.5, .5);
    for (const [horizontal, vertical] of boundary) { positions.push(horizontal, side * thickness / 2, vertical); normals.push(0, side, 0); uv.push(.5 + horizontal / width * (flipU ? -1 : 1), .5 - vertical / height); }
    for (let index = 0; index < boundary.length; index++) {
      const current = center + index + 1, next = center + (index + 1) % boundary.length + 1;
      indices.push(center, side > 0 ? next : current, side > 0 ? current : next);
    }
  };
  face(1);
  if (thickness > 0) {
    face(-1);
    for (let index = 0; index < boundary.length; index++) {
      const first = boundary[index]!, second = boundary[(index + 1) % boundary.length]!, base = positions.length / 3;
      const normalX = second[1] - first[1], normalZ = first[0] - second[0], length = Math.hypot(normalX, normalZ) || 1;
      positions.push(first[0], thickness / 2, first[1], first[0], -thickness / 2, first[1], second[0], -thickness / 2, second[1], second[0], thickness / 2, second[1]);
      for (let vertex = 0; vertex < 4; vertex++) normals.push(normalX / length, 0, normalZ / length);
      uv.push(0, 0, 0, 1, 1, 1, 1, 0); indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), textureCoordinates: [{ set: 0, data: new Float32Array(uv) }], indices: new Uint16Array(indices), cullMode: 'none' as const };
}

export function screenUv(horizontal: number, vertical: number, width: number, height: number) {
  return { x: .5 - horizontal / width, y: .5 - vertical / height };
}
