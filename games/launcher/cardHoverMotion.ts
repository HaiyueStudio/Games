export function advanceCardHover(amount: number, hovered: boolean, delta: number, motion: boolean): number {
  if (!motion) return 0;
  const target = hovered ? 1 : 0;
  const next = amount + (target - amount) * (1 - Math.exp(-Math.max(0, delta) / .1));
  return Math.abs(next - target) < .002 ? target : next;
}

export function cardHoverPose(amount: number) {
  const progress = Math.max(0, Math.min(1, amount));
  return { scale: 1 + .045 * progress, rotation: -Math.PI / 150 * progress, lift: -2 * progress };
}
