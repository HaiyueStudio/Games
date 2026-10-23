import { GameHud } from '../../shared/ui/GameHud';
import type { HaiyueEngine, World } from '@haiyue/engine';
export class Match3Hud extends GameHud {
    readonly scoreText;
    readonly movesText;
    readonly cascadeText;
    readonly messageText;
    constructor(engine: HaiyueEngine, world: World, restart: () => void) {
        super(engine, world, "×—…、三下个中为乐了交以位住停全共击分动化双发可同向启在块复央失始存它定已开式引弹形彩恢成或择按换撤改数新方时晶暂有来核档棋模正步没洗消清滑炸点爆牌生电的盘相碎级置自色落行裂触证请败超转连选邻部重销锁闪除验鸣！，：；");
        this.label('晶核消消乐', 20, 15, 240, 44, 28);
        this.scoreText = this.label('0', 20, 75, 100);
        this.movesText = this.label('0', 130, 75, 100);
        this.cascadeText = this.label('—', 240, 75, 100);
        this.label('分数 / 步数 / 连锁', 20, 112, 320, 26, 14);
        this.messageText = this.label('点击相邻方块，或按住滑动交换位置', 180, 600, 640, 34);
        this.button('重新开始', 840, 20, 140, restart);
    }
}
