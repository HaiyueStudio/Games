export const CONNECTION_NOTICE_DURATION = 5000;
export interface ConnectedPad { readonly index: number; readonly id: string; readonly connected: boolean }
export interface ConnectionNotice { readonly sequence: number; readonly index: number; readonly connected: boolean; readonly message: string; readonly expiresAt: number }

/** Connection state is independent of held buttons, input focus and game time. */
export class GamepadConnections {
  private readonly devices = new Map<number, string>();
  private readonly notices = new Map<number, ConnectionNotice>();
  private sequence = 0;

  update(devices: readonly (ConnectedPad | null)[], now: number): ConnectionNotice[] {
    const changes: ConnectionNotice[] = [];
    const present = new Set<number>();
    for (const pad of devices) {
      if (!pad?.connected) continue;
      present.add(pad.index);
      const notice = this.set(pad.index, pad.id, true, now);
      if (notice) changes.push(notice);
    }
    for (const index of this.devices.keys()) {
      if (present.has(index)) continue;
      const notice = this.set(index, '', false, now);
      if (notice) changes.push(notice);
    }
    return changes;
  }

  set(index: number, id: string, connected: boolean, now: number): ConnectionNotice | undefined {
    if (connected ? this.devices.get(index) === id : !this.devices.has(index)) return;
    if (connected) this.devices.set(index, id); else this.devices.delete(index);
    const notice = { sequence: ++this.sequence, index, connected,
      message: `手柄 ${index + 1} ${connected ? '已连接' : '已断开'}`, expiresAt: now + CONNECTION_NOTICE_DURATION };
    // A rapid reconnect replaces that controller's outdated notice and restarts its timeout.
    this.notices.delete(index); this.notices.set(index, notice);
    if (this.notices.size > 4) this.notices.delete(this.notices.keys().next().value!);
    return notice;
  }

  visible(now: number): ConnectionNotice[] {
    for (const [index, notice] of this.notices) if (notice.expiresAt <= now) this.notices.delete(index);
    return [...this.notices.values()];
  }
  get connected(): boolean { return this.devices.size > 0; }
  clear(): void { this.devices.clear(); this.notices.clear(); }
}
