export type Match3LightningPoint = readonly [number, number, number];

export interface LightningTarget {
  readonly id: number;
  readonly position: Match3LightningPoint;
}

export const MATCH3_LIGHTNING_SEGMENTS = 6;

/** Builds independent jagged segment pairs so all target bolts share one draw. */
export function createLightningSegments(
  source: Match3LightningPoint,
  targets: readonly LightningTarget[],
  sourceId: number,
  frame: number,
  z: number,
  segmentCount = MATCH3_LIGHTNING_SEGMENTS,
): Float32Array {
  const safeSegmentCount = Math.max(2, Math.floor(segmentCount));
  const points: number[] = [];
  for (const target of targets) {
    const targetX = target.position[0];
    const targetY = target.position[1];
    const dx = targetX - source[0];
    const dy = targetY - source[1];
    const distance = Math.hypot(dx, dy) || 1;
    const perpendicularX = -dy / distance;
    const perpendicularY = dx / distance;
    const seed = sourceId * 131 + target.id * 977 + frame * 3571;
    let previous = source;
    for (let segment = 1; segment <= safeSegmentCount; segment++) {
      const t = segment / safeSegmentCount;
      const envelope = Math.sin(Math.PI * t);
      const jitter = hashSigned(seed + segment * 43) * Math.min(0.24, distance * 0.12) * envelope;
      const next: Match3LightningPoint = segment === safeSegmentCount
        ? [targetX, targetY, z]
        : [
            source[0] + dx * t + perpendicularX * jitter,
            source[1] + dy * t + perpendicularY * jitter,
            z + hashSigned(seed + segment * 71) * 0.025 * envelope,
          ];
      points.push(previous[0], previous[1], previous[2], next[0], next[1], next[2]);
      previous = next;
    }
  }
  return new Float32Array(points);
}

function hashSigned(seed: number): number {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return (value - Math.floor(value)) * 2 - 1;
}
