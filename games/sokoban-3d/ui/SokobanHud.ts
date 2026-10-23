import { GameHud } from '../../shared/ui/GameHud';
import type { HaiyueEngine, World } from '@haiyue/engine';
export class SokobanHud extends GameHud {
    readonly levelText;
    readonly movesText;
    readonly boxesText;
    readonly messageText;
    constructor(engine: HaiyueEngine, world: World, restart: () => void, undo: () => void, prev: () => void, next: () => void) { super(engine, world, "·动存档自"); this.label('SOKOBAN 3D', 20, 15, 250, 42, 26); this.label('LEVEL / MOVES / BOXES', 20, 65, 360, 25, 14); this.levelText = this.label('', 20, 95, 100); this.movesText = this.label('', 130, 95, 100); this.boxesText = this.label('', 240, 95, 140); this.messageText = this.label('', 20, 600, 960, 35, 14); this.button('Restart', 520, 15, 110, restart); this.button('Undo', 640, 15, 100, undo); this.button('Previous', 750, 15, 110, prev); this.button('Next', 870, 15, 100, next); }
}
