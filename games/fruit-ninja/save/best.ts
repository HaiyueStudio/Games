export interface BestScore { best: number }
export function isBestScore(value: unknown): value is BestScore {
  return typeof value === 'object' && value !== null && 'best' in value && typeof value.best === 'number' && Number.isSafeInteger(value.best) && value.best >= 0;
}
