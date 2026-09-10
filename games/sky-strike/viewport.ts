import { LOGICAL_WIDTH, LOGICAL_HEIGHT } from './rules';
/** Fixed-height 1:2 playfield: pillarbox wide screens, crop and track on narrow screens. */
export function skyStrikeViewport(width: number, height: number, playerX = LOGICAL_WIDTH / 2, radius = 15) {
  const scale = Math.max(1, height) / LOGICAL_HEIGHT;
  const viewportWidth = Math.min(Math.max(1, width), LOGICAL_WIDTH * scale);
  const visibleWidth = viewportWidth / scale;
  const progress = Math.max(0, Math.min(1, (playerX - radius) / (LOGICAL_WIDTH - 2 * radius)));
  return { scale, left: (Math.max(1, width) - viewportWidth) / 2, width: viewportWidth,
    visibleWidth, cameraX: (LOGICAL_WIDTH - visibleWidth) * progress };
}
/** Inverse of the tracked camera projection, so the fighter remains under the finger. */
export function skyStrikePointerX(x: number, width: number, height: number, radius = 15): number {
  const view = skyStrikeViewport(width, height, LOGICAL_WIDTH / 2, radius);
  const visibleX = (x - view.left) / view.scale;
  const progress = Math.max(0, Math.min(1, (visibleX - radius) / Math.max(1, view.visibleWidth - 2 * radius)));
  return radius + progress * (LOGICAL_WIDTH - 2 * radius);
}
