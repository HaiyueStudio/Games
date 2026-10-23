/** Read-only compatibility boundary for saves written before GameSaveService adoption. */
export type LegacyJsonStorage = Pick<Storage, 'getItem' | 'removeItem'>;

export function browserLegacyStorage(): LegacyJsonStorage | null {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

export function readLegacyJson(storage: LegacyJsonStorage | null, key: string, maxLength = 2_000_000): unknown {
  try {
    const text = storage?.getItem(key);
    return text && text.length <= maxLength ? JSON.parse(text) : null;
  } catch { return null; }
}
