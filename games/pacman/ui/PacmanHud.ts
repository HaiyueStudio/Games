import { GameHud } from '../../shared/ui/GameHud';
import type { HaiyueEngine, World } from '@haiyue/engine';
export class PacmanHud extends GameHud {
    readonly scoreElement;
    readonly highScoreElement;
    readonly levelElement;
    readonly pelletElement;
    readonly livesElement;
    readonly statusTitleElement;
    readonly statusDetailElement;
    readonly pauseButton;
    readonly soundButton;
    constructor(engine: HaiyueEngine, world: World, restart: () => void, pause: () => void, sound: () => void, direction: (value: 'up' | 'down' | 'left' | 'right') => void) {
        super(engine, world, "…←↑→↓●动存档自", 1280, 720);
        this.label('PAC-MAN', 20, 18, 220, 45, 30);
        this.label('SCORE / BEST', 20, 78, 220, 28, 14);
        this.scoreElement = this.label('0', 20, 110, 220, 36, 24);
        this.highScoreElement = this.label('0', 20, 150, 220, 36, 22);
        this.label('LEVEL / PELLETS', 1040, 85, 220, 28, 14);
        this.levelElement = this.label('0', 1040, 120, 220);
        this.pelletElement = this.label('0', 1040, 160, 220);
        this.livesElement = this.label('', 20, 200, 220);
        this.button('New Game', 1040, 220, 220, restart);
        this.pauseButton = this.button('Pause', 1040, 268, 220, pause);
        this.soundButton = this.button('Sound on', 1040, 316, 220, sound);
        this.statusTitleElement = this.label('', 390, 300, 500, 65, 32);
        this.statusDetailElement = this.label('', 390, 365, 500, 42);
        this.button('↑', 1100, 480, 60, () => direction('up'), 50);
        this.button('↓', 1100, 590, 60, () => direction('down'), 50);
        this.button('←', 1040, 535, 60, () => direction('left'), 50);
        this.button('→', 1160, 535, 60, () => direction('right'), 50);
    }
}
