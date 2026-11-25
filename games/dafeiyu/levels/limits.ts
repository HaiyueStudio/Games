/** Shared capacity for imported rooms, simulation, editor projects and saves. */
export const levelLimits = Object.freeze({
  units: 12000, editorTiles: 6000, side: 256, layers: 32,
  bytes: 16 * 1024 * 1024, ruleBranches: 768,
});

export class LevelCapacityError extends Error {
  constructor() {
    super(`Level exceeds the supported capacity of ${levelLimits.units} units`);
    this.name = 'LevelCapacityError';
  }
}

export function assertUnitCapacity(count: number): void {
  if (count > levelLimits.units) throw new LevelCapacityError();
}
