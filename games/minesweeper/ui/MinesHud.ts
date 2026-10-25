import { MinesHud as ThemeHud } from '../../shared/minesweeper/MinesHud';
import type { HaiyueEngine, World } from '@haiyue/engine';
import type { MinesAudio } from '../../shared/minesweeper/audio/MinesAudio';

export class MinesHud extends ThemeHud {
  readonly mines = this.elMines;
  readonly timer = this.elTotal;
  constructor(engine: HaiyueEngine, world: World, restart: () => void, rows: number, cols: number, audio: MinesAudio) {
    super(engine, world, restart, { title: 'CLASSIC / MINES', subtitle: `${rows} x ${cols}  /  TITANIUM FIELD`,
      labels: ['LEFT', 'FLAGS', 'OPEN', 'TIME'], audio });
  }
  showResult(won: boolean, seconds: number): void {
    this.showMessage(`${won ? 'CLEARED' : 'BOOM'}  /  ${seconds}s  /  Restart or R to play again`, 0, true);
  }
}
