export interface JigsawPreferences { rows: number; cols: number; allowRotation: boolean }
export function isJigsawPreferences(value: unknown): value is JigsawPreferences {
  if (typeof value !== 'object' || value === null) return false;
  const data = value as Record<string, unknown>;
  return [data.rows, data.cols].every(n => typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 12)
    && typeof data.allowRotation === 'boolean';
}
