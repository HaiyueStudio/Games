import { GuiElement, GuiLabel, type GuiRoot, type GuiRect } from '@haiyue/engine/gui';
import type { Actor, Enemy } from './rules';
import { radarContact } from './radar';
import type { SafeInsets } from './RangeGame';
function place(node: GuiElement, rect: (r: GuiRect) => GuiRect) { node.layout = r => { node.rect = rect(r); for (const child of node.children) child.layout(node.rect); }; }
/** Engine GUI presentation of all living threats, independently of the scene's fog visibility. */
export class RadarHud {
  private readonly panel: GuiElement;
  private readonly heading: GuiElement;
  private headingX = 0;
  private headingY = -1;
  private readonly dots: { node: GuiElement; x: number; y: number; id: number; onRim: boolean }[] = [];
  constructor(root: GuiRoot, insets: () => SafeInsets) {
    this.panel = root.add(new GuiElement({ disabled: true, style: { backgroundColor: '#102c3299', borderColor: '#a5d5cb70', radius: 60 } }));
    place(this.panel, r => ({ x: r.width - insets().right - 138, y: insets().top + 12, width: 120, height: 120 }));
    for (const inset of [16, 34]) {
      const ring = this.panel.add(new GuiElement({ disabled: true, style: { backgroundColor: '#00000000', borderColor: '#9cbfb530', radius: 60 } }));
      place(ring, r => ({ x: r.x + inset, y: r.y + inset, width: r.width - inset * 2, height: r.height - inset * 2 }));
    }
    for (const vertical of [false, true]) {
      const line = this.panel.add(new GuiElement({ disabled: true, style: { backgroundColor: '#a5d5cb25', borderColor: '#00000000', radius: 0 } }));
      place(line, r => ({ x: r.x + (vertical ? 59.5 : 8), y: r.y + (vertical ? 8 : 59.5), width: vertical ? 1 : 104, height: vertical ? 104 : 1 }));
    }
    const label = this.panel.add(new GuiLabel({ text: '雷达', fontSize: 11, textAlign: 'center', disabled: true, style: { color: '#b8d6d3' } }));
    place(label, r => ({ x: r.x + 32, y: r.y + 121, width: 56, height: 18 }));
    const north = this.panel.add(new GuiLabel({ text: 'N', fontSize: 9, textAlign: 'center', disabled: true, style: { color: '#b8d6d3' } }));
    place(north, r => ({ x: r.x + 53, y: r.y + 3, width: 14, height: 13 }));
    const center = this.panel.add(new GuiElement({ disabled: true, style: { backgroundColor: '#d5f5e9', borderColor: '#183d39', radius: 4 } }));
    place(center, r => ({ x: r.x + 56, y: r.y + 56, width: 8, height: 8 }));
    this.heading = this.panel.add(new GuiElement({ disabled: true, style: { backgroundColor: '#d5f5e9b0', borderColor: '#00000000', radius: 2 } }));
    place(this.heading, r => ({ x: r.x + 58 + this.headingX * 12, y: r.y + 58 + this.headingY * 12, width: 4, height: 4 }));
  }
  update(player: Actor, enemies: readonly Enemy[]): void {
    this.headingX = -Math.sin(player.heading); this.headingY = -Math.cos(player.heading);
    this.heading.markDirty();
    while (this.dots.length < enemies.length) {
      const node = this.panel.add(new GuiElement({ disabled: true, style: { backgroundColor: '#ff8069d9', borderColor: '#ffc5b6a0', radius: 3 } }));
      const dot = { node, x: 0, y: 0, id: 0, onRim: false };
      place(node, r => ({ x: r.x + 57 + dot.x * 49, y: r.y + 57 + dot.y * 49, width: 6, height: 6 }));
      this.dots.push(dot);
    }
    this.dots.forEach((dot, index) => {
      const enemy = enemies[index]; dot.node.setVisible(!!enemy);
      if (!enemy) return;
      Object.assign(dot, radarContact(player, enemy), { id: enemy.id }); dot.node.markDirty();
    });
  }
  snapshot() {
    return { rect: { ...this.panel.rect }, heading: { x: this.headingX, y: this.headingY },
      contacts: this.dots.filter(dot => dot.node.visible).map(({ id, x, y, onRim, node }) => ({ id, x, y, onRim, rect: { ...node.rect } })) };
  }
}
