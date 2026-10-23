import { GameHud } from '../../shared/ui/GameHud';
import { GuiInput, GuiCheckbox } from '@haiyue/engine/gui';
import type { HaiyueEngine, World } from '@haiyue/engine';
export class WfcHud extends GameHud {
    readonly seedText;
    readonly fixedSeedToggle;
    readonly seedInput;
    readonly backtracksText;
    readonly pickedText;
    readonly statusText;
    constructor(engine: HaiyueEngine, world: World, generate: () => void) {
        super(engine, world, "·动存档自");
        this.label('WFC CITY', 20, 15, 210, 45, 26);
        this.seedText = this.label('', 20, 70, 210);
        this.backtracksText = this.label('', 20, 108, 210);
        this.pickedText = this.label('', 20, 148, 300);
        this.statusText = this.label('', 20, 575, 960, 32, 13);
        this.label('Click / WASD / arrows to move', 20, 610, 960, 28, 13);
        this.fixedSeedToggle = this.place(new GuiCheckbox({ label: 'Fixed seed' }), { x: 700, y: 36, width: 130, height: 34 });
        this.seedInput = this.place(new GuiInput({ value: '1', placeholder: 'Seed' }), { x: 700, y: 85, width: 140, height: 38 });
        this.button('Generate', 850, 60, 130, generate);
    }
}
