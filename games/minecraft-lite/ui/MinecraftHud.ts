import { GameHud } from '../../shared/ui/GameHud';
import type { HaiyueEngine, Scene } from '@haiyue/engine';
export class MinecraftHud extends GameHud {
    readonly target;
    readonly blockCount;
    readonly message;
    readonly seed;
    readonly mapSize;
    readonly jumpHeight;
    readonly title;
    readonly help;
    readonly start;
    readonly regenerate;
    constructor(engine: HaiyueEngine, scene: Scene, start: () => void, regenerate: () => void) {
        super(engine, scene, "·×—…。上不世删加动右图土在地坐块天始子字存家察岩左已度开成把择放数新方晶标格档棕樱橙水沙浅深游湖灰玩珀珊琥瑚生甸界白目石种移穹空粉紫红绿编置能自色花草蓝观跃跳身辑选速释量键除雪青颜高黄黑鼠");
        this.label('MINECRAFT LITE', 20, 15, 260, 40, 24);
        this.seed = this.label('', 20, 65, 260);
        this.mapSize = this.label('', 20, 100, 260);
        this.jumpHeight = this.label('', 20, 135, 260);
        this.target = this.label('', 20, 170, 260);
        this.blockCount = this.label('', 20, 205, 260);
        const layoutCount = this.blockCount.layout.bind(this.blockCount);
        this.blockCount.layout = parent => { layoutCount(parent); this.blockCount.rect.y = parent.y + 205 * Math.max(.65, Math.min(parent.width / this.width, parent.height / this.height)); };
        this.message = this.label('', 240, 525, 520, 40);
        this.message.setVisible(false);
        this.label('+', 485, 308, 30, 34, 24).setStyle({ backgroundColor: 'transparent' });
        this.title = this.label('方块世界', 250, 230, 500, 70, 32);
        this.help = this.label('WASD 移动 · Space 跳跃 · 鼠标左右键编辑 · 0-9 选择方块', 200, 305, 600, 50, 14);
        this.start = this.button('开始游玩', 300, 380, 190, start);
        this.regenerate = this.button('生成新世界', 510, 380, 190, regenerate);
    }
    overlay(visible: boolean) { for (const node of [this.title, this.help, this.start, this.regenerate])
        node.setVisible(visible); }
}
