import { GameHud } from '../../shared/ui/GameHud';
import type { HaiyueEngine, World } from '@haiyue/engine';
export class MinesHud extends GameHud {
    readonly elMines;
    readonly elFlags;
    readonly elOpen;
    readonly elTotal;
    readonly elMessage;
    constructor(engine: HaiyueEngine, world: World, restart: () => void) {
        super(engine, world, "×⚑动存档自💥");
        this.label('MINES / FLAGS / OPEN / TOTAL', 20, 12, 460, 24, 14);
        this.elMines = this.label('0', 20, 42, 100);
        this.elFlags = this.label('0', 130, 42, 100);
        this.elOpen = this.label('0', 240, 42, 100);
        this.elTotal = this.label('0', 350, 42, 100);
        this.elMessage = this.label('', 30, 590, 940, 48, 14);
        this.button('Restart', 850, 20, 120, restart);
    }
}
