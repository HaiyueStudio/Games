export const DEVICE_VOLUME_KEY = 'haiyue.simulator.volume';

export function readDeviceVolume(storage: Pick<Storage, 'getItem'>): number {
  try {
    const saved = storage.getItem(DEVICE_VOLUME_KEY), level = saved === null ? 1 : Number(saved);
    return saved?.trim() === '' || !Number.isFinite(level) || level < 0 || level > 1 ? 1 : level;
  } catch { return 1; }
}

export class DeviceVolume {
  private value: number;
  private remaining = 0;
  private readonly listeners = new Set<(level: number) => void>();
  constructor(level = 1) { this.value = Number.isFinite(level) ? Math.max(0, Math.min(1, level)) : 1; }
  get level(): number { return this.value; }
  adjust(direction: -1 | 1): void {
    this.value = Math.max(0, Math.min(10, Math.round(this.value * 10) + direction)) / 10;
    this.remaining = 2;
    for (const listener of this.listeners) listener(this.value);
  }
  subscribe(listener: (level: number) => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  update(delta: number): void { this.remaining = Math.max(0, this.remaining - Math.max(0, delta)); }
  snapshot() { return { level: this.value, percent: Math.round(this.value * 100), muted: this.value === 0, visible: this.remaining > 0, opacity: Math.min(1, this.remaining / .2) }; }
  destroy(): void { this.listeners.clear(); }
}
