import type { HaiyueEngine, World } from '@haiyue/engine';
import { GuiProgress } from '@haiyue/engine/gui';
import { GameHud } from '../../shared/ui/GameHud';
import type { PinballInput } from '../input/input';
export class PinballHud extends GameHud {
    readonly score = this.label('000000', 12, 8, 170, 32, 26);
    readonly best = this.label('', 185, 8, 150, 32, 15);
    readonly balls = this.label('', 25, 805, 360, 28, 18);
    readonly combo = this.label('', 395, 805, 180, 28, 18);
    readonly title = this.label('', 85, 320, 430, 45, 26);
    readonly detail = this.label('', 45, 365, 510, 36, 16);
    readonly power = this.place(new GuiProgress({ min: 0, max: 1, value: 0 }), { x: 380, y: 838, width: 195, height: 8 });
    readonly pause;
    readonly sound;
    constructor(engine: HaiyueEngine, world: World, input: PinballInput, pause: () => void, restart: () => void, sound: () => void) {
        super(engine, world, "·×’…Ⅱ←↑→↓▷○●★☆♪。一上下不乐习书休住停再写准击分力动发右后启回声备奇好局左开弹得息恼或打按挡摘无时星暂最本来松板法点烦球碰第签纸练继续自菇蓄蘑课走车这连遇重错间静音页颗风高，：", 600, 900);
        this.root.theme.colors.text = '#514839';
        for (const node of this.root.root.children)
            node.setStyle({ color: '#514839', backgroundColor: '#f6efdded' });
        for (const [text, x, y, width] of [['碰一下，摘颗星。', 180, 225, 180], ['课间奇遇 · LITTLE WONDERS', 150, 690, 280], ['A / ←', 120, 760, 80], ['D / →', 360, 760, 80]] as const) {
            this.label(text, x, y, width, 24, 14).setStyle({ color: '#837454', backgroundColor: 'transparent' });
        }
        this.pause = this.button('暂停', 345, 8, 70, pause, 32);
        this.button('重开', 420, 8, 70, restart, 32);
        this.sound = this.button('声音', 495, 8, 93, sound, 32);
        for (const [i, control] of (['left', 'charge', 'right'] as const).entries()) {
            const button = this.button(['← 左挡板', '↓ 蓄力发球', '右挡板 →'][i]!, 12 + i * 196, 852, 184, () => { }, 42);
            button.on('pointerdown', event => input.press(control, event.detail.pointerId));
            button.on('pointerup', event => input.release(event.detail.pointerId, event.detail.nativeEvent.type === 'pointercancel'));
        }
    }
}
