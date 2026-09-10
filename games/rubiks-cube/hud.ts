import { Entity, type World } from '@haiyue/engine';
import { GuiRoot, GuiElement, GuiLabel, GuiButton } from '@haiyue/engine/gui';
import { cubeLayout, type Rect } from './layout';
import { KINDS, TITLES, notation, type Axis, type Kind } from './model';
import type { CubeSession } from './session';
export interface CubeActions {
  start(kind: Kind): void;
  home(): void;
  shuffle(): void;
  undo(): void;
  restore(): void;
  axis(axis: Axis): void;
  layer(layer: number): void;
  turn(direction: 1 | -1): void;
  view(): void;
}
const COPY =
  '魔方实验室选择你的挑战自由旋转逐步探索二阶三阶四阶镜面魔方色彩入门经典挑战内层进阶异形银色返回打乱撤销还原停止记录步已复原旋转中按记录逆序还原拖动方块转层空白观察选择轴层正转反转视角重置从负向到正向包含打乱操作公式求解后续提供';
export const FONT_CHARS = [
  ...new Set(Array.from({ length: 95 }, (_, i) => String.fromCharCode(i + 32)).join('') + COPY + '·×→−'),
].join('');
function place(element: GuiElement, getRect: (r: Rect) => Rect): void {
  element.layout = (r) => {
    element.rect = getRect(r);
    for (const child of element.children) child.layout(element.rect);
  };
}
export class CubeHud {
  readonly root = new GuiRoot({
    theme: {
      fontSize: 14,
      radius: 10,
      colors: {
        text: '#edf3ff',
        textMuted: '#91a1b8',
        primary: '#306a9d',
        danger: '#b44955',
        background: '#0b1421',
        surface: '#172a40',
        border: '#31516e',
        hover: '#2b5275',
        active: '#397bb2',
        disabled: '#182638',
      },
    },
  });
  private menu: GuiElement;
  private play: GuiElement;
  private stats: GuiLabel;
  private history: GuiLabel;
  private axes: GuiButton[] = [];
  private layers: GuiButton[] = [];
  private turns: GuiButton[] = [];
  private undoButton: GuiButton;
  private restoreButton: GuiButton;
  private shuffleButton: GuiButton;
  private title: GuiLabel;
  private cache = '';
  constructor(world: World, actions: CubeActions) {
    world.addEntity(new Entity('Cube Engine GUI').addComponent(this.root));
    this.menu = this.root.add(new GuiElement({ width: '100%', height: '100%' }));
    const title = this.menu.add(new GuiLabel({ text: '魔方实验室', fontSize: 30, textAlign: 'center' }));
    place(title, (r) => ({ x: r.x, y: r.y + 20, width: r.width, height: 40 }));
    const sub = this.menu.add(
      new GuiLabel({
        text: '自由旋转 · 逐步探索',
        fontSize: 13,
        textAlign: 'center',
        style: { color: '#8da8c5' },
      }),
    );
    place(sub, (r) => ({ x: r.x, y: r.y + 64, width: r.width, height: 22 }));
    const menuPanel = this.menu.add(new GuiElement());
    place(menuPanel, (r) => cubeLayout(r.width, r.height).panel);
    const captions = ['色彩入门', '经典挑战', '内层进阶', '异形银色'];
    KINDS.forEach((kind, i) => {
      const button = menuPanel.add(
        new GuiButton({
          text: `${TITLES[kind]}  /  ${kind === 'mirror' ? 'M' : kind + '×' + kind}`,
          onClick: () => actions.start(kind),
          style: {
            backgroundColor: kind === 'mirror' ? '#303747' : '#172c43',
            borderColor: kind === 'mirror' ? '#a2abbc' : '#3f6689',
            radius: 12,
          },
        }),
      );
      place(button, (r) => ({
        x: r.x + ((i % 2) * (r.width + 10)) / 2,
        y: r.y + 20 + Math.floor(i / 2) * 85,
        width: (r.width - 10) / 2,
        height: 74,
      }));
      const caption = button.add(
        new GuiLabel({
          text: captions[i]!,
          fontSize: 10,
          textAlign: 'center',
          style: { color: '#9cb1cb' },
          disabled: true,
        }),
      );
      place(caption, (r) => ({ x: r.x, y: r.y + r.height - 22, width: r.width, height: 18 }));
    });
    const foot = menuPanel.add(
      new GuiLabel({
        text: '拖动空白观察 · 选择你的挑战',
        fontSize: 11,
        textAlign: 'center',
        style: { color: '#8098b2' },
      }),
    );
    place(foot, (r) => ({ x: r.x, y: r.y + 195, width: r.width, height: 20 }));
    this.play = this.root.add(new GuiElement({ width: '100%', height: '100%', visible: false }));
    const home = this.play.add(new GuiButton({ text: '返回', onClick: actions.home }));
    place(home, (r) => ({ x: r.x + 12, y: r.y + 14, width: 62, height: 34 }));
    this.shuffleButton = this.play.add(
      new GuiButton({ text: '打乱', variant: 'primary', onClick: actions.shuffle }),
    );
    place(this.shuffleButton, (r) => ({ x: r.x + r.width - 76, y: r.y + 14, width: 64, height: 34 }));
    this.title = this.play.add(new GuiLabel({ text: '', fontSize: 21, textAlign: 'center' }));
    place(this.title, (r) => ({ x: r.x + 80, y: r.y + 12, width: r.width - 160, height: 38 }));
    this.stats = this.play.add(
      new GuiLabel({ fontSize: 12, textAlign: 'center', style: { color: '#92cdeb' } }),
    );
    place(this.stats, (r) => ({ x: r.x + 8, y: r.y + 52, width: r.width - 16, height: 22 }));
    this.history = this.play.add(
      new GuiLabel({ fontSize: 11, textAlign: 'center', style: { color: '#869ab4' } }),
    );
    place(this.history, (r) => ({ x: r.x + 8, y: r.y + 75, width: r.width - 16, height: 18 }));
    const panel = this.play.add(
      new GuiElement({ style: { backgroundColor: '#101f30', radius: 12, borderColor: '#243c55' } }),
    );
    place(panel, (r) => cubeLayout(r.width, r.height).panel);
    const hint = panel.add(
      new GuiLabel({
        text: '拖动方块转层 · 空白观察',
        textAlign: 'center',
        fontSize: 11,
        style: { color: '#98abc1' },
      }),
    );
    place(hint, (r) => ({ x: r.x, y: r.y + 2, width: r.width, height: 23 }));
    for (let i = 0; i < 3; i++) {
      const b = panel.add(
        new GuiButton({
          text: ['X / L→R', 'Y / D→U', 'Z / B→F'][i]!,
          onClick: () => actions.axis(i as Axis),
        }),
      );
      place(b, (r) => ({
        x: r.x + 8 + (i * (r.width - 12)) / 3,
        y: r.y + 30,
        width: (r.width - 24) / 3,
        height: 30,
      }));
      this.axes.push(b);
    }
    for (let i = 0; i < 4; i++) {
      const b = panel.add(new GuiButton({ text: `层 ${i + 1}`, onClick: () => actions.layer(i) }));
      place(b, (r) => ({
        x: r.x + 8 + (i * (r.width - 12)) / 4,
        y: r.y + 68,
        width: (r.width - 28) / 4,
        height: 30,
      }));
      this.layers.push(b);
    }
    [-1, 1].forEach((d, i) => {
      const b = panel.add(
        new GuiButton({
          text: d === -1 ? '− 反转 90°' : '+ 正转 90°',
          variant: 'primary',
          onClick: () => actions.turn(d as 1 | -1),
        }),
      );
      place(b, (r) => ({
        x: r.x + 8 + (i * (r.width - 8)) / 2,
        y: r.y + 108,
        width: (r.width - 24) / 2,
        height: 42,
      }));
      this.turns.push(b);
    });
    this.undoButton = panel.add(new GuiButton({ text: '撤销', onClick: actions.undo }));
    place(this.undoButton, (r) => ({ x: r.x + 8, y: r.y + 160, width: (r.width - 28) / 3, height: 40 }));
    this.restoreButton = panel.add(new GuiButton({ text: '还原', onClick: actions.restore }));
    place(this.restoreButton, (r) => ({
      x: r.x + 12 + (r.width - 28) / 3,
      y: r.y + 160,
      width: (r.width - 28) / 3,
      height: 40,
    }));
    const view = panel.add(new GuiButton({ text: '视角重置', onClick: actions.view }));
    place(view, (r) => ({
      x: r.x + 16 + (2 * (r.width - 28)) / 3,
      y: r.y + 160,
      width: (r.width - 28) / 3,
      height: 40,
    }));
  }
  update(session: CubeSession, home: boolean, axis: Axis, layer: number): void {
    const m = session.model;
    const key = [
      home,
      m.kind,
      m.history.length,
      session.busy,
      session.restoring,
      session.remaining,
      axis,
      layer,
      m.solved,
    ].join(':');
    if (key === this.cache) return;
    this.cache = key;
    this.menu.setVisible(home);
    this.play.setVisible(!home);
    this.title.setText(TITLES[m.kind]);
    this.stats.setText(
      `${session.restoring ? '按记录逆序还原' : session.busy ? '旋转中' : m.solved ? '已复原' : '自由旋转'} · 记录 ${m.history.length} 步${session.busy ? ` · ${session.remaining}` : ''}`,
    );
    this.history.setText(
      m.history.length
        ? m.history
            .slice(-8)
            .map((v) => notation(v, m.order))
            .join('  ')
        : '记录包含打乱操作',
    );
    this.shuffleButton.setDisabled(session.busy);
    this.undoButton.setDisabled(session.busy || !m.history.length);
    this.restoreButton.setText(session.busy ? '停止' : '还原');
    this.restoreButton.setDisabled(!session.busy && !m.history.length);
    this.axes.forEach((b, i) => b.setStyle({ backgroundColor: i === axis ? '#347caf' : '#1b3047' }));
    this.layers.forEach((b, i) => {
      b.setVisible(i < m.order);
      b.setStyle({ backgroundColor: i === layer ? '#347caf' : '#1b3047' });
    });
    this.turns.forEach((b) => b.setDisabled(session.busy));
  }
}
