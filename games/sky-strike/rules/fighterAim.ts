import type { EnemyDefinition } from './rules';

export const FIGHTER_AIM_LEAD_MS = 420;
export const FIGHTER_AIM_HOLD_MS = 160;
export const FIGHTER_TURN_RADIANS_PER_SECOND = 4.8;
export function isAimingFighter(definition: EnemyDefinition): boolean {
  return definition.tier === 'normal' && ['aimed', 'spread', 'burst'].includes(definition.bulletPattern);
}
export function angleDifference(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}
/** Small enemy art faces down at zero rotation. Turn by the shortest arc, without snapping. */
export function turnFighterToward(rotation: number, target: number, deltaMs: number): number {
  const limit = FIGHTER_TURN_RADIANS_PER_SECOND * Math.max(0, Math.min(34, deltaMs)) / 1000;
  return rotation + Math.max(-limit, Math.min(limit, angleDifference(rotation, target)));
}
export function fighterMuzzle(enemy: { x:number; y:number; rotation:number; definition: EnemyDefinition }) {
  const distance = enemy.definition.size * (enemy.definition.renderAspect ?? 1.3) * 0.40;
  const dx = -Math.sin(enemy.rotation)*distance, dy = Math.cos(enemy.rotation)*distance;
  return { x: enemy.x+dx, y: enemy.y+dy, dx, dy };
}
