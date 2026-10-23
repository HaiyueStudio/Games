import { GameHud } from '../../shared/ui/GameHud';
import type { HaiyueEngine, Scene } from '@haiyue/engine';
export class MazeHud extends GameHud {
    readonly level;
    readonly seed;
    readonly holes;
    readonly status;
    readonly tilt;
    readonly victory;
    readonly next;
    restart = () => { };
    advance = () => { };
    constructor(engine: HaiyueEngine, scene: Scene) {
        super(engine, scene, "°·…。一下也了以住使候倾入全关出到前力动卡去口可右后向启回固在失子存安完定宫小屏左已幕并建开当成或抵拖拽按掉斜方暗本机构档正洞滚点球生用相种第红终绿置自色角让败起达进迷选避重键！，：");
        this.label('GRAVITY MAZE', 20, 15, 320, 48, 28);
        this.status = this.label('', 20, 70, 620, 40);
        this.label('关卡 / 种子 / 洞口', 650, 15, 330, 28);
        this.level = this.label('', 650, 48, 70);
        this.seed = this.label('', 730, 48, 160);
        this.holes = this.label('', 900, 48, 80);
        this.tilt = this.label('', 20, 590, 330);
        this.button('回到起点', 800, 585, 180, () => this.restart());
        this.victory = this.label('迷宫完成', 250, 260, 500, 75, 32);
        this.next = this.button('进入下一关', 360, 345, 280, () => this.advance());
        this.showVictory(false);
    }
    showVictory(visible: boolean) { this.victory.setVisible(visible); this.next.setVisible(visible); }
}
