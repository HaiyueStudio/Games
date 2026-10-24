/** Pure, deterministic trajectory: solid at both ends, scattered and spinning between. */
export function mergeMotion(progress: number, triangle: number, copy: number) {
  const p = Math.min(1, Math.max(0, progress));
  const burst = Math.sin(Math.PI * p) ** 1.4;
  const angle = triangle * 2.3999632297 + copy * Math.PI;
  const distance = 0.2 + ((triangle * 37) % 101) / 101 * 0.45;
  return {
    x: Math.cos(angle) * burst * distance,
    y: burst * (0.3 + ((triangle * 17) % 53) / 53 * 0.45),
    z: Math.sin(angle) * burst * distance,
    rotation: burst * ((triangle % 7) - 3) * 0.85,
    // The second source is absorbed as the target shell closes, avoiding overlapping faces.
    scale: (1 - burst * 0.42) * (copy === 0 ? 1 : 1 - smoothstep(0.65, 1, p)),
  };
}

export function smoothstep(start: number, end: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - start) / (end - start)));
  return t * t * (3 - 2 * t);
}
