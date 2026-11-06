import { GameHud } from '../../shared/ui/GameHud';
import type { HaiyueEngine, World } from '@haiyue/engine';
import { GuiButton, GuiElement, GuiLabel, type GuiRect } from '@haiyue/engine/gui';
import { SokobanVictory, VICTORY_CHARS } from './SokobanVictory';

const CHARS = '暖仓推箱子手绘仓库关卡步数归位撤销重来上一关下一关音效开关方向键移动拖动旋转滚轮缩放把货箱推入光环碰壁了换个方向试试已撤销一步全部归位完成准备就绪选择关已完成入门进阶挑战自动存档请继续加油上一页下一页关闭↑↓←→·：！';

export class SokobanHud extends GameHud {
  readonly levelText: GuiLabel;
  readonly movesText: GuiLabel;
  readonly boxesText: GuiLabel;
  readonly messageText: GuiLabel;
  readonly soundButton: GuiButton;
  readonly subtitleText: GuiLabel;
  readonly victory: SokobanVictory;
  constructor(engine: HaiyueEngine, world: World, restart: () => void, undo: () => void, prev: () => void, next: () => void, move: (x: number, y: number) => void, sound: () => void, levels: () => void, victoryNext: () => void) {
    super(engine, world, CHARS + VICTORY_CHARS);
    Object.assign(this.root.theme.colors, { text: '#f6efdf', textMuted: '#adc8c2', background: '#173d43', surface: '#264b50', primary: '#d5ac6b', hover: '#416969', active: '#315457', border: '#66857d' });
    const label = (id: string, text: string, size: number, color: string, rect: (area: GuiRect) => GuiRect) => {
      const node = this.root.add(new GuiLabel({ id, text, fontSize: size, pointerFilter: 'ignore', style: { color, padding: 0 } }));
      node.layout = area => { Object.assign(node.rect, rect(area)); }; return node;
    };
    label('sokoban-title', '暖仓 · 推箱子', 26, '#fff0cb', area => ({ x: 22, y: 16, width: area.width - 150, height: 36 }));
    this.subtitleText = label('sokoban-subtitle', 'THE LITTLE WAREHOUSE', 10, '#a8c5be', area => ({ x: 24, y: 54, width: Math.min(340, area.width - 48), height: 18 }));
    const values = ['level', 'moves', 'boxes'].map((id, index) => {
      label(id + '-caption', ['关卡', '步数', '归位'][index]!, 11, '#b6c9ba', () => ({ x: 24 + index * 100, y: 87, width: 88, height: 18 }));
      return label(id + '-value', '', 19, '#fff2d7', () => ({ x: 24 + index * 100, y: 107, width: 90, height: 26 }));
    });
    [this.levelText, this.movesText, this.boxesText] = values as [GuiLabel, GuiLabel, GuiLabel];
    this.messageText = label('sokoban-message', '把货箱推入光环', 12, '#d5d9be', area => ({ x: 22, y: area.height - (area.width < 760 ? 137 : 98), width: area.width - 44, height: 28 }));
    const actions: [string, string, () => void][] = [['undo', '撤销', undo], ['restart', '重来', restart], ['previous', '上一关', prev], ['next', '下一关', next], ['sound', '音效 开', sound]];
    const controls = actions.map(([id, text, onClick], index) => {
      const node = this.root.add(new GuiButton({ id: 'sokoban-' + id, text, onClick, hoverTransition: true, style: { fontSize: 13, padding: 0, radius: 12, backgroundColor: '#24484b', borderColor: '#64857b', color: '#f5ebd4' } }));
      node.layout = area => { const mobile = area.width < 760, width = mobile ? (area.width - 36) / 5 : 96; Object.assign(node.rect, { x: 18 + index * width, y: area.height - (mobile ? 96 : 58), width: width - 5, height: 40 }); };
      return node;
    });
    this.soundButton = controls[4]!;
    for (const [index, [text, x, y]] of ([['←', -1, 0], ['↑', 0, -1], ['↓', 0, 1], ['→', 1, 0]] as const).entries()) {
      const node = this.root.add(new GuiButton({ id: 'sokoban-move-' + index, text, onClick: () => move(x, y), hoverTransition: true, style: { fontSize: 23, radius: 12, padding: 0, color: '#ffdfa0', backgroundColor: '#1b3c41', borderColor: '#6b8b7f' } }));
      node.layout = area => { const mobile = area.width < 760, width = mobile ? (area.width - 36) / 4 : 48; Object.assign(node.rect, { x: mobile ? 18 + index * width : area.width - 228 + index * 50, y: area.height - (mobile ? 48 : 58), width: width - 5, height: 40 }); };
    }
    this.victory = this.root.add(new SokobanVictory({ next: victoryNext, replay: restart, levels }));
  }
  override hit(clientX: number, clientY: number, canvas: HTMLCanvasElement): boolean {
    return this.victory.visible || super.hit(clientX, clientY, canvas);
  }
  override snapshot() {
    const nodes: { id: string; type: string; text: string; visible: boolean; disabled: boolean; value: unknown; rect: GuiRect }[] = [];
    const visit = (node: GuiElement, visible: boolean) => {
      visible = visible && node.visible;
      nodes.push({ id: node.id, type: node.constructor.name, text: 'text' in node ? String(node.text) : '', visible, disabled: node.disabled,
        value: 'value' in node ? node.value : null, rect: { ...node.rect } });
      for (const child of node.children) visit(child, visible);
    };
    for (const child of this.root.root.children) visit(child, true);
    return { width: this.root.viewport.width, height: this.root.viewport.height, nodes, victoryVisible: this.victory.visible, victoryRect: { ...this.victory.dialogRect } };
  }
}
