import { GuiLabel, GuiProgress, type GuiRoot } from '@haiyue/engine/gui';
import { CONNECTION_NOTICE_DURATION, type GamepadConnections } from '../connections';

export const CONNECTION_NOTICE_CHARS = '手柄已连接断开 0123456789';

/** Passive notifications render in the existing GUI root, including the paused return dialog. */
export class ConnectionNotifications {
  private readonly items;
  private count = 0;
  constructor(root: GuiRoot, private readonly state: GamepadConnections) {
    this.items = Array.from({ length: 4 }, (_, index) => {
      const label = root.add(new GuiLabel({ text: '', disabled: true, visible: false, fontSize: 16,
        textAlign: 'center', style: { backgroundColor: '#172437f5', color: '#eff4ff', radius: 8, padding: 4 } }));
      const progress = root.add(new GuiProgress({ min: 0, max: 1, value: 1, disabled: true, visible: false }));
      label.layout = parent => {
        const width = Math.max(0, Math.min(320, parent.width - 24));
        const height = Math.min(46, Math.max(20, (parent.height - 24 - 6 * Math.max(0, this.count - 1)) / Math.max(1, this.count)));
        Object.assign(label.rect, { x: parent.x + parent.width - width - 12, y: parent.y + 12 + index * (height + 6), width, height });
        label.setFontSize(Math.min(16, height * .4, Math.max(9, width / 15)));
      };
      progress.layout = () => Object.assign(progress.rect, { x: label.rect.x + 8, y: label.rect.y + label.rect.height - 6, width: label.rect.width - 16, height: 3 });
      return { label, progress };
    });
  }
  update(now: number): void {
    const notices = this.state.visible(now);
    this.count = notices.length;
    this.items.forEach(({ label, progress }, index) => {
      const notice = notices[index];
      label.setVisible(!!notice); progress.setVisible(!!notice);
      if (!notice) return;
      label.setText(notice.message);
      label.setStyle({ color: notice.connected ? '#8fe5b4' : '#ffd18a' });
      progress.setValue((notice.expiresAt - now) / CONNECTION_NOTICE_DURATION);
    });
  }
  snapshot() { return this.items.filter(item => item.label.visible).map(({ label }) => ({ text: label.text, rect: { ...label.rect } })); }
}
