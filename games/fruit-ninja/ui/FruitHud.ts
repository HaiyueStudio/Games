import type { HaiyueEngine, World } from '@haiyue/engine';
import { GuiButton, GuiElement, GuiLabel, type GuiRect } from '@haiyue/engine/gui';
import { GameHud } from '../../shared/ui/GameHud';
import type { Round } from '../rules/model';
import type { View } from '../rendering/FruitScene';
export type Action = 'start' | 'pause';
const CHARS = '水果忍者鲜切时间得分最佳炸弹暂停继续开始再来局游戏结束一分钟滑动鼠标或手指挥刀摇杆避开三次命中加秒准备好了倒计归零剩余返回首页已超越纪录分数本轮按空格爆炸累计漏接不扣生命触屏轻扫连额外奖励递增；，。·！';
export class FruitHud extends GameHud {
  readonly view: View = { x: 20, y: 100, width: 1000, height: 500, scale: 1 };
  private readonly slots = new Map<GuiElement, GuiRect>();
  private readonly header: GuiElement;
  private readonly title: GuiLabel;
  private readonly score: GuiLabel;
  private readonly time: GuiLabel;
  private readonly bombs: GuiLabel;
  private readonly help: GuiLabel;
  private readonly rail: GuiElement;
  private readonly bar: GuiElement;
  private readonly overlay: GuiElement;
  private readonly card: GuiElement;
  private readonly heading: GuiLabel;
  private readonly detail: GuiLabel;
  private readonly rules: GuiLabel;
  private readonly start: GuiButton;
  private readonly pause: GuiButton;
  private readonly notice: GuiLabel;
  private viewportWidth = 1000;
  private noticeAge = 0;
  constructor(engine: HaiyueEngine, world: World, action: (action: Action) => void) {
    super(engine, world, CHARS, 1280, 800); this.root.theme.fontSize = 15;
    this.header = this.add(new GuiElement({ disabled: true, style: { backgroundColor: '#0b2423' } }));
    this.title = this.text('水果忍者 / FRUIT NINJA', 23, '#f7dfaa');
    this.score = this.text('000', 26, '#ffffff'); this.time = this.text('60', 26, '#94f0c5'); this.bombs = this.text('炸弹 0 / 3', 17, '#ffb19e');
    this.help = this.text('滑动鼠标 / 手指挥刀 · 连切奖励递增 · 避开炸弹', 13, '#a5c6b8');
    this.pause = this.add(new GuiButton({ text: '暂停', onClick: () => action('pause'), style: { backgroundColor: '#254b43', color: '#d8f5de', radius: 9 } }));
    this.rail = this.add(new GuiElement({ disabled: true, style: { backgroundColor: '#31554a' } }));
    this.bar = this.add(new GuiElement({ disabled: true, style: { backgroundColor: '#9ee2a4' } }));
    this.notice = this.text('', 28, '#ffdf89');
    this.overlay = this.add(new GuiElement({ disabled: true, style: { backgroundColor: 'rgba(5,20,17,0.65)' } }));
    this.card = this.add(new GuiElement({ disabled: true, style: { backgroundColor: '#133c32', borderColor: '#688b61', radius: 22 } }));
    this.heading = this.text('鲜切一分钟', 36, '#ffe3a2');
    this.detail = this.text('60 秒 / 3 次炸弹机会', 18, '#ebf6dc');
    this.rules = this.text('连切额外加分 · 加时 +10 秒', 14, '#a8d5bc');
    this.start = this.add(new GuiButton({ text: '开始游戏', onClick: () => action('start'), style: { backgroundColor: '#e4c17c', color: '#163e31', radius: 12 } }));
  }
  private add<T extends GuiElement>(node: T): T {
    const rect = { x: 0, y: 0, width: 0, height: 0 }; this.slots.set(node, rect); node.layout = () => Object.assign(node.rect, rect); this.root.add(node); return node;
  }
  private text(text: string, fontSize: number, color: string): GuiLabel { return this.add(new GuiLabel({ text, fontSize, disabled: true, textAlign: 'center', style: { color, padding: 0 } })); }
  private rect(node: GuiElement, x: number, y: number, width: number, height: number): void { Object.assign(this.slots.get(node)!, { x, y, width, height }); }
  resize(width: number, height: number): void {
    this.viewportWidth = width;
    const narrow = width < 600, header = narrow ? 106 : 86;
    this.rect(this.header, 0, 0, width, header); this.title.setFontSize(narrow ? 18 : 23);
    this.rect(this.title, 12, 8, narrow ? width - 95 : Math.min(320, width * .32), 34);
    this.rect(this.pause, width - 78, 12, 64, 34);
    const x = narrow ? 8 : width * .34, y = narrow ? 48 : 12, available = narrow ? width - 16 : width * .66 - 90;
    this.score.setFontSize(narrow ? 19 : 23); this.time.setFontSize(narrow ? 19 : 23); this.bombs.setFontSize(narrow ? 15 : 17);
    this.rect(this.score, x, y, available * .34, 34); this.rect(this.time, x + available * .34, y, available * .32, 34); this.rect(this.bombs, x + available * .66, y, available * .34, 34);
    this.rect(this.rail, 18, header - 14, width - 36, 3); this.rect(this.bar, 18, header - 14, width - 36, 3);
    this.rect(this.help, 10, height - 29, width - 20, 24); this.help.setFontSize(narrow ? 10 : 13);
    Object.assign(this.view, { x: 0, y: header, width, height: Math.max(40, height - header - 32), scale: width / 1000 });
    this.rect(this.notice, 0, header + 12, width, 40);
    this.rect(this.overlay, 0, header, width, height - header - 32);
    const cw = Math.min(480, width - 28), ch = Math.min(290, this.view.height - 18), left = (width - cw) / 2, top = header + (this.view.height - ch) / 2;
    this.rect(this.card, left, top, cw, ch); this.heading.setFontSize(ch < 230 ? 25 : narrow ? 29 : 36);
    this.rect(this.heading, left + 10, top + ch * .07, cw - 20, ch * .22);
    this.rect(this.detail, left + 10, top + ch * .32, cw - 20, ch * .15); this.detail.setFontSize(narrow ? 15 : 18);
    this.rect(this.rules, left + 10, top + ch * .52, cw - 20, ch * .12); this.rules.setFontSize(narrow ? 12 : 14);
    this.rect(this.start, left + cw * .22, top + ch * .73, cw * .56, Math.min(48, ch * .22));
    this.root.root.markDirty();
  }
  notify(text: string): void { this.notice.setText(text); this.noticeAge = 1.2; }
  clearNotice(): void { this.noticeAge = 0; this.notice.setVisible(false); }
  refresh(round: Round, best: number, dt: number): void {
    this.score.setText(`得分 ${String(round.score).padStart(3, '0')}`); this.time.setText(`${Math.ceil(round.remaining)} 秒`); this.bombs.setText(`炸弹 ${round.bombs} / 3`);
    const rect = this.slots.get(this.bar)!; rect.width = (this.viewportWidth - 36) * Math.min(1, round.remaining / 60);
    this.time.setStyle({ color: round.remaining <= 10 ? '#ffac8e' : '#94f0c5' });
    const overlay = round.phase !== 'playing';
    for (const node of [this.overlay, this.card, this.heading, this.detail, this.rules, this.start]) node.setVisible(overlay);
    this.pause.setDisabled(round.phase === 'ready' || round.phase === 'over'); this.pause.setText(round.phase === 'paused' ? '继续' : '暂停');
    this.heading.setText(round.phase === 'over' ? '游戏结束' : round.phase === 'paused' ? '已暂停' : '鲜切一分钟');
    this.detail.setText(round.phase === 'over' ? `${round.reason === 'bombs' ? '三次炸弹命中' : '倒计时归零'} · 得分 ${round.score}` : round.phase === 'paused' ? `剩余 ${Math.ceil(round.remaining)} 秒 · 得分 ${round.score}` : `60 秒 · 最佳 ${best}`);
    this.start.setText(round.phase === 'paused' ? '继续游戏' : round.phase === 'over' ? '再来一局' : '开始游戏');
    this.noticeAge = Math.max(0, this.noticeAge - dt); this.notice.setVisible(this.noticeAge > 0 && !overlay);
    this.root.root.markDirty();
  }
}
