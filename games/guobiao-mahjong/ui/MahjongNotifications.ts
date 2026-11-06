import { GuiToast, type GuiRoot } from '@haiyue/engine/gui';
import { seat, type Observation, type Seat } from '../rules/types';
import { ActionNoticeFeed, notificationRects, type ActionNotice } from './actionNotifications';

export const ACTION_NOTICE_CHARS = '你可以胡请选择下方动作暗明加杠吃碰自摸番花';
const TONES = {
  chow: { backgroundColor: '#1c674c', color: '#f0fff4' },
  pung: { backgroundColor: '#255973', color: '#f2fbff' },
  kong: { backgroundColor: '#63477f', color: '#fff5ff' },
  hu: { backgroundColor: '#e8ba68', color: '#30200d' },
};

/** Native popup-layer toasts, with bounded queues and no timers or input interception. */
export class MahjongNotifications {
  private readonly feed = new ActionNoticeFeed();
  private readonly toast: GuiToast;
  private readonly prompt: GuiToast;
  private readonly badges: GuiToast[];
  private readonly motion = matchMedia('(prefers-reduced-motion: reduce)');
  private view: Seat = 0;
  private opportunityId = '';
  private current: ActionNotice | null = null;
  constructor(root: GuiRoot, canvas: HTMLCanvasElement) {
    const create = (id: string, kind: 'toast' | 'opportunity' | 'badge', relative = () => 0) => {
      const toast = root.add(new GuiToast({ id, pointerFilter: 'ignore', style: { radius: kind === 'badge' ? 16 : 12, padding: kind === 'badge' ? 14 : 16 } }));
      toast.layout = p => {
        const scale = p.width / Math.max(1, canvas.clientWidth), width = p.width / scale, height = p.height / scale;
        const rect = notificationRects(width, height, relative())[kind];
        Object.assign(toast.rect, { x: p.x + rect.x * scale, y: p.y + rect.y * scale, width: rect.width * scale, height: rect.height * scale });
        const available = rect.width - (kind === 'badge' ? 12 : 32);
        const ems = [...toast.text].reduce((sum, char) => sum + (char.charCodeAt(0) < 128 ? .55 : 1), 0);
        const font = Math.min(kind === 'badge' ? width < 900 ? 29 : 40 : kind === 'opportunity' ? 18 : 20, available / Math.max(1, ems));
        toast.setStyle({ fontSize: font * scale, padding: (kind === 'badge' ? (rect.width - font) / 2 : 16) * scale });
      };
      return toast;
    };
    this.toast = create('mahjong-action-notification', 'toast');
    this.prompt = create('mahjong-action-opportunity', 'opportunity');
    this.badges = Array.from({ length: 4 }, (_, who) => create(`mahjong-action-effect-${who}`, 'badge', () => seat(who - this.view)));
  }
  sync(o: Observation, human: Seat | null, started: boolean, epoch: number, modal: boolean): void {
    this.view = human ?? 0;
    const update = this.feed.sync(o, human, started, epoch);
    if (update.reset) { for (const toast of [this.toast, this.prompt, ...this.badges]) toast.hide(); this.opportunityId = ''; this.current = null; }
    for (const notice of update.added) this.flash(notice);
    if (modal) { this.prompt.hide(); this.opportunityId = ''; return; }
    if (!this.toast.visible) this.current = null;
    if (update.urgent || !this.toast.visible) { const notice = this.feed.take(); if (notice) this.show(notice); }
    if (!update.opportunity) { this.prompt.hide(); this.opportunityId = ''; }
    else if (update.opportunity.id !== this.opportunityId || !this.prompt.visible) {
      this.opportunityId = update.opportunity.id;
      this.prompt.setStyle({ backgroundColor: update.opportunity.winning ? '#f1c66e' : '#d7bc78', color: '#282112' });
      this.prompt.show({ text: update.opportunity.text, durationMs: 86_400_000, animationMs: this.motion.matches ? 0 : 180 });
    }
  }
  private show(notice: ActionNotice): void {
    this.current = notice;
    const animationMs = this.motion.matches ? 0 : 180;
    this.toast.setStyle(TONES[notice.tone]);
    this.toast.show({ text: notice.text, durationMs: notice.winning ? 3600 : 2100, animationMs });
  }
  private flash(notice: ActionNotice): void {
    const badge = this.badges[notice.seat]!;
    badge.setStyle(TONES[notice.tone]);
    badge.show({ text: notice.badge, durationMs: notice.winning ? 2800 : 1600, animationMs: this.motion.matches ? 0 : 180 });
  }
  snapshot() {
    const visible = (node: GuiToast) => ({ text: node.text, visible: node.visible, progress: node.progress, rect: { ...node.rect }, pointerFilter: node.pointerFilter });
    return { renderer: 'engine-gui-toast', event: this.current && this.toast.visible ? { ...this.current, ...visible(this.toast) } : null,
      opportunity: this.prompt.visible ? visible(this.prompt) : null, queued: this.feed.pending,
      effects: this.badges.flatMap((node, seat) => node.visible ? [{ seat, ...visible(node) }] : []) };
  }
}
