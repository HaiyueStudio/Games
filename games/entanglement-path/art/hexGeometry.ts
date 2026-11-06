import { inkHash, inkNoise } from './inkNoise';

export interface InkPoint { x: number; y: number }
export type HexOrientation = 'pointy' | 'flat';
export const boardAngle = (orientation: HexOrientation = 'pointy'): number => orientation === 'flat' ? Math.PI / 2 : 0;
export const HEX_RADIUS = 117;
export const HEX_TEXTURE_STRETCH = 1.15;
export const HEX_TEXTURE_SIZE = 256;
export const PATH_HANDLE_LENGTH = HEX_RADIUS * .56;
const LANE_T = [.28, .72] as const;

export function hexPoint(index: number, radius = HEX_RADIUS, center = 128): InkPoint {
  const angle = (-30 + index * 60) * Math.PI / 180;
  return { x: center + Math.cos(angle) * radius, y: center + Math.sin(angle) * radius };
}

export function hexCenter(q: number, r: number, screenRadius: number): InkPoint {
  return { x: 2 * screenRadius * (q + r / 2), y: Math.sqrt(3) * screenRadius * r };
}

export function boardCenter(q: number, r: number, screenRadius: number, orientation: HexOrientation = 'pointy'): InkPoint {
  const p = hexCenter(q, r, screenRadius);
  return orientation === 'flat' ? { x: -p.y, y: p.x } : p;
}

export function boardPlaneSize(screenRadius: number, orientation: HexOrientation = 'pointy'): { width: number; height: number } {
  const size = hexPlaneSize(screenRadius);
  return orientation === 'flat' ? { width: size.height, height: size.width } : size;
}

/** The canvas stretch cancels the plane aspect, so both axes share one physical scale. */
export function hexPlaneSize(screenRadius: number): { width: number; height: number } {
  const physicalRadius = 2 * screenRadius / Math.sqrt(3);
  return { width: physicalRadius * HEX_TEXTURE_SIZE / (HEX_RADIUS * HEX_TEXTURE_STRETCH),
    height: physicalRadius * HEX_TEXTURE_SIZE / HEX_RADIUS };
}

export function portNormal(port: number): InkPoint {
  const angle = Math.floor(port / 2) * Math.PI / 3;
  return { x: -Math.cos(angle), y: -Math.sin(angle) };
}

export function portPoint(port: number, inset = 0): InkPoint {
  const side = Math.floor(port / 2), a = hexPoint(side), b = hexPoint(side + 1), t = LANE_T[port % 2]!;
  const inward = portNormal(port);
  return { x: a.x + (b.x - a.x) * t + inward.x * inset, y: a.y + (b.y - a.y) * t + inward.y * inset };
}

/** Every port has the same normal handle, giving C1 continuity across cell seams. */
export function pathCurve(startPort: number, endPort: number) {
  const start = portPoint(startPort), end = portPoint(endPort);
  const a = portNormal(startPort), b = portNormal(endPort);
  return { start, control1: { x: start.x + a.x * PATH_HANDLE_LENGTH, y: start.y + a.y * PATH_HANDLE_LENGTH },
    control2: { x: end.x + b.x * PATH_HANDLE_LENGTH, y: end.y + b.y * PATH_HANDLE_LENGTH }, end };
}

/** Low frequency edge wander and independent brush pressure, stable for a given tile. */
export function brushEdgePoint(edge: number, t: number, seed: number): InkPoint & { pressure: number; offset: number } {
  const a = hexPoint(edge), b = hexPoint(edge + 1);
  const taper = Math.sin(t * Math.PI);
  const wander = (inkNoise(t * 3.8, edge * 2.3, seed) - .5) * 13
    + (inkNoise(t * 12, edge * 4.1, seed + 7) - .5) * 3.5;
  const offset = taper * wander;
  const angle = edge * Math.PI / 3;
  return { x: a.x + (b.x - a.x) * t + Math.cos(angle) * offset,
    y: a.y + (b.y - a.y) * t + Math.sin(angle) * offset,
    pressure: .25 + inkNoise(t * 4.5, edge * 1.7, seed + 53) * .85 + inkHash(edge, Math.floor(t * 22), seed) * .12,
    offset };
}
