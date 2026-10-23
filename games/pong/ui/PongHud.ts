import { GameHud } from '../../shared/ui/GameHud';
import type { HaiyueEngine, World } from '@haiyue/engine';
export class PongHud extends GameHud {
    readonly leftScore;
    readonly rightScore;
    readonly rallyText;
    readonly speedText;
    readonly statusText;
    readonly announcement;
    constructor(engine: HaiyueEngine, world: World, restart: () => void, pause: () => void) {
        super(engine, world, "·↑↓一中交位住停再准击分动发启块备失始存对局开或战拉按换数新方暂本束来档步滑点球相结继续置自败连速邻重锁高：");
        this.label('PONG · 1P / 2P', 20, 18, 240, 38, 24);
        this.leftScore = this.label('0', 330, 18, 100, 55, 36);
        this.rightScore = this.label('0', 570, 18, 100, 55, 36);
        this.rallyText = this.label('0', 350, 600, 100);
        this.speedText = this.label('0', 460, 600, 180);
        this.statusText = this.label('', 350, 80, 300);
        this.announcement = this.label('READY', 280, 280, 440, 70, 28);
        this.button('重新开始', 740, 20, 120, restart);
        this.button('暂停', 870, 20, 110, pause);
        this.label('1P · W / S', 20, 600, 200);
        this.label('2P · ↑ / ↓', 780, 600, 200);
    }
}
