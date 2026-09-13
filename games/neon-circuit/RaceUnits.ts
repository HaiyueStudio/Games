/** Model scale: the ~44-unit racer is 4.4 m long; the 184-unit road is 18.4 m wide. */
export const WORLD_UNIT_METERS = 0.1;
export function speedKmh(worldUnitsPerSecond: number): number {
  return Math.max(0, worldUnitsPerSecond) * WORLD_UNIT_METERS * 3.6;
}
export function distanceKm(worldUnits: number): number {
  return worldUnits * WORLD_UNIT_METERS / 1000;
}
export function formatSpeed(worldUnitsPerSecond: number): string {
  return String(Math.round(speedKmh(worldUnitsPerSecond))).padStart(3, '0');
}
