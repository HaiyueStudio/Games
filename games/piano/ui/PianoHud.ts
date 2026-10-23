import { GameHud } from '../../shared/ui/GameHud';
import { GuiSelect, GuiProgress } from '@haiyue/engine/gui';
import type { HaiyueEngine, World } from '@haiyue/engine';
export class PianoHud extends GameHud {
    readonly elStatus;
    readonly elNote;
    readonly elScoreList;
    readonly elAutoPlay;
    readonly elAutoStop;
    readonly elPlaybackStatus;
    readonly elPlaybackProgress;
    readonly elScoreSource;
    sourceUrl = 'https://www.mutopiaproject.org/';
    constructor(engine: HaiyueEngine, world: World, change: () => void, play: () => void, stop: () => void) {
        super(engine, world, "·ü—…动存档自");
        this.label('PIANO', 20, 20, 220, 50, 32);
        this.elStatus = this.label('', 20, 80, 420, 35);
        this.elNote = this.label('A0 - C8', 20, 600, 300, 38, 24);
        this.elScoreList = this.place(new GuiSelect<string>({ options: [], onChange: change }), { x: 560, y: 20, width: 420, height: 40 });
        this.elScoreList.setDisabled(true);
        this.elAutoPlay = this.button('Auto play', 560, 70, 150, play);
        this.elAutoPlay.setDisabled(true);
        this.elAutoStop = this.button('Stop', 720, 70, 100, stop);
        this.elAutoStop.setDisabled(true);
        this.elPlaybackStatus = this.label('Loading…', 560, 120, 420, 50, 14);
        this.elPlaybackProgress = this.place(new GuiProgress({ min: 0, max: 1, value: 0 }), { x: 560, y: 180, width: 420, height: 10 });
        this.elScoreSource = this.button('Mutopia Project', 560, 204, 420, () => window.open(this.sourceUrl, '_blank', 'noopener'));
    }
}
