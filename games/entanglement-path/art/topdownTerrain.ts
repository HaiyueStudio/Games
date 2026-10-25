import { inkHash } from './inkNoise';
import { type InkPoint } from './hexGeometry';
import { riverCurve } from './riverFlow';

export type TerrainPairs = readonly (readonly [number, number])[];
export interface TerrainStamp extends InkPoint {
  motif: number; width: number; height: number; angle: number; opacity: number;
}
export interface TerrainPlan { family: 'peaks' | 'ridges' | 'basin' | 'islands'; stamps: TerrainStamp[] }

export function terrainPairKey(pairs: TerrainPairs): string {
  return pairs.map(([a, b]) => `${Math.min(a, b)}-${Math.max(a, b)}`).sort().join(':');
}

export function rotateTerrainPoint(point: InkPoint, rotation: number): InkPoint {
  const angle = rotation * Math.PI / 3, x = point.x - 128, y = point.y - 128;
  return { x: 128 + x * Math.cos(angle) - y * Math.sin(angle), y: 128 + x * Math.sin(angle) + y * Math.cos(angle) };
}

/** Seeded art arrangement only. River ports/curves and the gameplay random stream remain untouched. */
export function makeTerrainPlan(seed: number, pairs: TerrainPairs = [], wall = false): TerrainPlan {
  const families = ['peaks', 'ridges', 'basin', 'islands'] as const;
  const family = families[Math.floor(inkHash(seed, 231) * 4)]!;
  const ordered = pairs.map(([a, b]) => [Math.min(a, b), Math.max(a, b)] as const).sort((a, b) => a[0] - b[0]);
  const channels = ordered.flatMap(([a, b]) => {
    const points = riverCurve(a, b).points;
    return points.filter((_, i) => i % 3 === 0).map(point => {
      const i = points.indexOf(point), previous = points[Math.max(0, i - 2)]!, next = points[Math.min(points.length - 1, i + 2)]!;
      return { ...point, angle: Math.atan2(next.y - previous.y, next.x - previous.x) };
    });
  });
  const candidates: (InkPoint & { clearance: number; angle: number })[] = [];
  for (let i = 0; i < 100; i++) {
    const x = 128 + (inkHash(i, 31, seed) - .5) * 166;
    const y = 128 + (inkHash(i, 47, seed) - .5) * 166;
    if (Math.hypot(x - 128, y - 128) > 87) continue;
    let distance = 2500, angle = inkHash(i, 71, seed) * Math.PI * 2;
    for (let j = 0; j < channels.length; j++) {
      const point = channels[j]!, d = (x - point.x) ** 2 + (y - point.y) ** 2;
      if (d < distance) {
        distance = d;
        angle = point.angle;
      }
    }
    candidates.push({ x, y, clearance: Math.sqrt(distance), angle });
  }
  const stamps: TerrainStamp[] = [];
  const count = wall ? 3 : pairs.length === 0 ? (family === 'islands' ? 3 : 2)
    : family === 'islands' ? 5 : 3 + Math.floor(inkHash(seed, 233) * 2);
  for (let i = 0; i < count; i++) {
    const candidate = candidates.reduce<typeof candidates[number] | null>((best, p) => {
      const spacing = stamps.length ? Math.min(...stamps.map(s => Math.hypot(p.x - s.x, p.y - s.y))) : 80;
      const score = p.clearance * .7 + spacing * .6;
      if (p.clearance < 13 || spacing < 35) return best;
      if (!best) return p;
      const bestSpacing = stamps.length ? Math.min(...stamps.map(s => Math.hypot(best.x - s.x, best.y - s.y))) : 80;
      return score > best.clearance * .7 + bestSpacing * .6 ? p : best;
    }, null);
    if (!candidate) break;
    const ridge = family === 'ridges' || family === 'basin';
    const size = wall ? 158 + inkHash(i, 91, seed) * 30 : pairs.length === 0 ? 140 + inkHash(i, 91, seed) * 28
      : Math.min(108, 48 + candidate.clearance * 1.8) * (family === 'islands' ? .82 : 1);
    const choice = inkHash(i, 93, seed);
    const motif = family === 'basin' ? (choice < .5 ? 4 : 7) : family === 'ridges' ? (choice < .5 ? 5 : 6) : Math.floor(choice * 4);
    stamps.push({ x: candidate.x, y: candidate.y, motif,
      width: size, height: size * (ridge ? .68 : .90), angle: candidate.angle + (inkHash(i, 95, seed) - .5) * 1.1,
      opacity: wall ? .92 : .57 + inkHash(i, 97, seed) * .2 });
  }
  return { family, stamps };
}
