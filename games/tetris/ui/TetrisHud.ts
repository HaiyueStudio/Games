import { GuiElement } from '@haiyue/engine/gui';
import { GameHud } from '../../shared/ui/GameHud';
import type { HaiyueEngine, World } from '@haiyue/engine';
export class TetrisHud extends GameHud {
    readonly score;
    readonly title;
    readonly detail;
    readonly pause;
    readonly next;
    constructor(engine: HaiyueEngine, world: World, pause: () => void, restart: () => void) {
        super(engine, world, "·←↑→下动存旋档移自落转");
        this.label('TETRIS', 20, 18, 180, 42, 30);
        this.label('← → / A D 移动 · ↑ / W 旋转 · Space 落下', 20, 610, 700, 28, 14);
        this.score = this.label('0', 790, 30, 180, 42, 28);
        this.label('SCORE / NEXT', 790, 80, 180, 30);
        this.next = Array.from({ length: 16 }, (_, i) => {
            const node = this.root.add(new GuiElement({ style: { backgroundColor: '#334155' } }));
            node.layout = parent => {
                const scale = Math.min(parent.width / this.width, parent.height / this.height);
                Object.assign(node.rect, { x: parent.x + (parent.width - this.width * scale) / 2 + (820 + i % 4 * 28) * scale,
                    y: parent.y + 120 * Math.max(.65, scale) + Math.floor(i / 4) * 28 * scale, width: 25 * scale, height: 25 * scale });
            };
            return node;
        });
        this.title = this.label('', 300, 250, 400, 65, 30);
        this.detail = this.label('', 300, 315, 400, 45);
        this.title.setVisible(false);
        this.detail.setVisible(false);
        this.pause = this.button('Pause', 740, 590, 110, pause);
        this.button('New Game', 860, 590, 120, restart);
    }
}
