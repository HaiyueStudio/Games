import type { LanguageStorage } from './NeonLocale';
export type CameraMode = 'chase' | 'first-person';
export function readCameraMode(storage?: LanguageStorage): CameraMode {
  try { return storage?.getItem('neon.camera') === 'first-person' ? 'first-person' : 'chase'; }
  catch { return 'chase'; }
}
export function saveCameraMode(storage: LanguageStorage | undefined, mode: CameraMode): void {
  try { storage?.setItem('neon.camera', mode); } catch { /* Session choice still applies. */ }
}
export function windshieldStage(health: number): number {
  return health >= 100 ? 0 : health > 66 ? 1 : health > 33 ? 2 : health > 15 ? 3 : 4;
}
