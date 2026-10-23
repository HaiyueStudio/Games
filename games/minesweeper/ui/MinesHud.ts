import { GameHud } from '../../shared/ui/GameHud';
import type { HaiyueEngine, World } from '@haiyue/engine';
export class MinesHud extends GameHud {
    readonly mines;
    readonly timer;
    readonly title;
    readonly detail;
    constructor(engine: HaiyueEngine, world: World, restart: () => void) {
        super(engine, world, "·×─◷⚑✓动存档自💥", 900, 600);
        this.mines = this.label('0', 25, 15, 100);
        this.timer = this.label('0', 135, 15, 100);
        this.label('MINES / SECONDS', 25, 50, 210, 24, 12);
        this.button('New Game', 730, 15, 145, restart);
        this.title = this.label('', 250, 235, 400, 60, 30);
        this.detail = this.label('', 250, 295, 400, 40);
        this.title.setVisible(false);
        this.detail.setVisible(false);
    }
}
