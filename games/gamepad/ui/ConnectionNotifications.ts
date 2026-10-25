import { GuiDirtyFlags, GuiElement, GuiImage, GuiLabel, type GuiRoot } from '@haiyue/engine/gui';
import { CONNECTION_NOTICE_DURATION, type ConnectionNotice, type GamepadConnections } from '../connections';
import { connectionNoticeArt } from './connectionNoticeArt';

export const CONNECTION_NOTICE_CHARS = '手柄已连接断开准备就绪开始游戏吧中等待重新 0123456789，';

/** Passive native GUI feedback shared by the desktop, games and paused return dialog. */
export class ConnectionNotifications {
  private readonly items;
  private count = 0;
  private external: readonly ConnectionNotice[] = [];
  private top = 8;
  private right = 12;
  private readonly motion = matchMedia('(prefers-reduced-motion: reduce)');
  constructor(private readonly root: GuiRoot, private readonly state?: GamepadConnections, prefix = 'connection-notice-') {
    const art = connectionNoticeArt();
    this.items = Array.from({ length: 4 }, (_, index) => {
      const panel = root.add(new GuiElement({ id: `${prefix}${index}-panel`, width: '100%', height: '100%', visible: false, pointerFilter: 'ignore',
        style: { backgroundColor: 'transparent', borderColor: 'transparent', padding: 0 } }));
      const icon = panel.add(new GuiImage({ id: `${prefix}${index}-icon`, pointerFilter: 'ignore' }));
      const title = panel.add(new GuiLabel({ id: `${prefix}${index}`, text: '', fontSize: 15, pointerFilter: 'ignore', style: { color: '#eefaff', padding: 0 } }));
      const detail = panel.add(new GuiLabel({ id: `${prefix}${index}-detail`, text: '', fontSize: 11, pointerFilter: 'ignore', style: { color: '#9cb9cb', padding: 0 } }));
      const track = panel.add(new GuiElement({ id: `${prefix}${index}-track`, pointerFilter: 'ignore', style: { backgroundColor: 'rgba(146,202,221,.12)', borderColor: 'transparent', radius: 1, padding: 0 } }));
      const bar = panel.add(new GuiElement({ id: `${prefix}${index}-bar`, pointerFilter: 'ignore', style: { backgroundColor: art.connected.accent, borderColor: 'transparent', radius: 1, padding: 0 } }));
      const item = { panel, icon, title, detail, track, bar, offset: 0, remaining: 1, connected: true, sequence: -1 };
      const layout = panel.layout.bind(panel);
      panel.layout = parent => {
        const width = Math.max(0, Math.min(336, parent.width - this.right * 2));
        const top = Math.min(this.top, Math.max(0, parent.height - 24));
        const height = Math.max(0, Math.min(88, (parent.height - top - 12 - 6 * Math.max(0, this.count - 1)) / Math.max(1, this.count)));
        layout({ x: parent.x + parent.width - this.right - width + item.offset, y: parent.y + top + index * (height + 6), width, height });
      };
      const rect = (node: GuiElement, x: number, y: number, width: number, height: number) => { Object.assign(node.rect, { x: panel.rect.x + x, y: panel.rect.y + y, width: Math.max(0, width), height: Math.max(0, height) }); };
      icon.layout = () => { const size = Math.max(0, Math.min(48, panel.rect.height - 22)); rect(icon, 15, (panel.rect.height - size) / 2 - 1, size, size); };
      title.layout = () => {
        const compact = panel.rect.height < 68, left = Math.min(74, panel.rect.height + 8);
        title.setFontSize(Math.min(15, panel.rect.height * .28, panel.rect.width / 18));
        rect(title, left, compact ? (panel.rect.height - 22) / 2 - 2 : 19, panel.rect.width - left - 22, 23);
      };
      detail.layout = () => { detail.setVisible(panel.rect.height >= 68); rect(detail, 74, 43, panel.rect.width - 96, 18); };
      track.layout = () => rect(track, 20, panel.rect.height - 15, panel.rect.width - 40, 2);
      bar.layout = () => rect(bar, 20, panel.rect.height - 15, (panel.rect.width - 40) * item.remaining, 2);
      return item;
    });
  }
  setNotices(notices: readonly ConnectionNotice[]): void { this.external = notices; }
  setInsets(top: number, right: number): void {
    if (this.top === top && this.right === right) return;
    this.top = top; this.right = right; this.root.root.markDirty(GuiDirtyFlags.Layout);
  }
  update(now: number): void {
    const notices = this.state?.visible(now) ?? this.external.filter(notice => notice.expiresAt > now);
    this.count = notices.length;
    const art = connectionNoticeArt();
    this.items.forEach((item, index) => {
      const notice = notices[index]; item.panel.setVisible(!!notice);
      if (!notice) return;
      if (item.sequence !== notice.sequence) {
        const skin = notice.connected ? art.connected : art.disconnected;
        item.sequence = notice.sequence; item.connected = notice.connected;
        item.panel.setStyle({ nineSlice: Object.freeze({ source: skin.panel, sourceWidth: skin.panel.width, sourceHeight: skin.panel.height, cuts: [52, 52, 52, 52] as const, pixelRatio: 2 }) });
        item.icon.setSource(skin.icon); item.title.setText(notice.message);
        item.detail.setText(notice.connected ? '已准备就绪，开始游戏吧' : '连接已中断，等待重新连接');
        item.bar.setStyle({ backgroundColor: skin.accent });
      }
      item.remaining = Math.max(0, Math.min(1, (notice.expiresAt - now) / CONNECTION_NOTICE_DURATION));
      const age = CONNECTION_NOTICE_DURATION - (notice.expiresAt - now);
      const enter = this.motion.matches ? 1 : 1 - Math.pow(1 - Math.max(0, Math.min(1, age / 280)), 3);
      const exit = this.motion.matches ? 1 : Math.min(1, (notice.expiresAt - now) / 320);
      item.offset = 12 * (1 - enter) + 8 * (1 - exit);
      const opacity = Math.round(enter * exit * 255) / 255;
      // GUI opacity is local to each element; fade the whole composition together.
      for (const node of [item.panel, ...item.panel.children]) node.setStyle({ opacity });
      item.panel.markDirty(GuiDirtyFlags.Layout | GuiDirtyFlags.Visual);
    });
  }
  get elements(): GuiElement[] { return this.items.flatMap(item => [item.panel, ...item.panel.children]); }
  snapshot() {
    return this.items.filter(item => item.panel.visible).map(item => ({ text: item.title.text, rect: { ...item.panel.rect },
      detail: item.detail.text, connected: item.connected, remaining: item.remaining, opacity: item.panel.style.opacity ?? 1,
      appearance: 'glass', icon: !!item.icon.source, accent: item.bar.style.backgroundColor, pointerFilter: item.panel.pointerFilter }));
  }
}
