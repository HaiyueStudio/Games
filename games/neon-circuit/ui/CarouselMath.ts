/** Projection shared by the race selector's GPU pass and GUI hit testing. */
export function carouselOffset(index: number, position: number, count: number): number {
  return ((index - position + count / 2) % count + count) % count - count / 2;
}
export function carouselMetrics(width: number, height: number) {
  const cardHeight = Math.min(height * 0.94, width < 600 ? width * 1.04 : height);
  const cardWidth = cardHeight * 0.82;
  return { cardWidth, cardHeight, spacing: cardWidth * (width < 600 ? 0.78 : 0.96), focal: cardWidth * 3 };
}
export function carouselPose(index: number, position: number, width: number, height: number, count: number) {
  const d = carouselOffset(index, position, count), m = carouselMetrics(width, height);
  return { ...m, d, yaw: -d * 0.62, depth: Math.abs(d) * m.cardWidth * 0.65,
    shiftY: Math.abs(d) * height * 0.045, alpha: Math.min(1, Math.max(0, (1.5 - Math.abs(d)) * 5)) };
}
export function projectCard(index: number, position: number, width: number, height: number, u: number, v: number, count: number) {
  const p = carouselPose(index, position, width, height, count), x = (u - 0.5) * p.cardWidth, y = (v - 0.5) * p.cardHeight;
  const w = 1 + (p.depth - Math.sin(p.yaw) * x) / p.focal;
  return { x: width / 2 + (p.d * p.spacing + Math.cos(p.yaw) * x) / w, y: height / 2 + (y + p.shiftY) / w };
}
export function cardUv(index: number, position: number, width: number, height: number, x: number, y: number, count: number) {
  const p = carouselPose(index, position, width, height, count), qx = x - width / 2;
  const localX = (qx * (1 + p.depth / p.focal) - p.d * p.spacing) / (Math.cos(p.yaw) + qx * Math.sin(p.yaw) / p.focal);
  const w = 1 + (p.depth - Math.sin(p.yaw) * localX) / p.focal;
  return { u: localX / p.cardWidth + 0.5, v: ((y - height / 2) * w - p.shiftY) / p.cardHeight + 0.5 };
}
export function hitCarousel(position: number, width: number, height: number, x: number, y: number, count: number): number {
  if (x < 0 || y < 0 || x > width || y > height) return -1;
  for (const index of Array.from({ length: count }, (_, index) => index).sort((a, b) => Math.abs(carouselOffset(a, position, count)) - Math.abs(carouselOffset(b, position, count)))) {
    const uv = cardUv(index, position, width, height, x, y, count);
    if (carouselPose(index, position, width, height, count).alpha > 0.1 && uv.u > 0.02 && uv.u < 0.98 && uv.v > 0.035 && uv.v < 0.965) return index;
  }
  return -1;
}
export const CAROUSEL_DRAG_THRESHOLD = 8;
export function swipeStep(dx: number, dy: number): number {
  return Math.abs(dx) > CAROUSEL_DRAG_THRESHOLD && Math.abs(dx) > Math.abs(dy) * 1.2 ? -Math.sign(dx) : 0;
}

/** Velocity is measured in CSS pixels/second over the last 100 ms. Keep the
 * unwrapped destination so a fast throw animates through every intervening card. */
export function carouselRelease(start: number, dx: number, dy: number, width: number, height: number, velocity: number): number | null {
  // Use the same intent threshold for following and committing the gesture:
  // once the card visibly follows a horizontal drag, even a slow release advances.
  const step = swipeStep(dx, dy);
  if (!step) return null;
  const spacing = carouselMetrics(width, height).spacing;
  const coast = Math.max(-4, Math.min(4, -velocity / spacing * 0.24));
  const dragged = start - dx / spacing;
  let target = Math.round(dragged + coast);
  if (target === Math.round(start)) target += step;
  return target;
}
