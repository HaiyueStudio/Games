import { GuiLabel } from '@haiyue/engine/gui';

/** A world-space annotation whose screen position is provided by the game's camera projection. */
export class ProjectedLabel extends GuiLabel {
  constructor(text = '', size = 22) {
    super({ text, fontSize: size * .7, textAlign: 'center', visible: false, disabled: true,
      style: { color: '#ffffff', backgroundColor: 'rgba(3,7,18,0.76)', padding: 0 } });
    this.rect.width = this.rect.height = size;
  }
  override layout(): void { /* Position is already in the GUI viewport's logical pixels. */ }
  move(x: number, y: number): void {
    this.rect.x = x - this.rect.width / 2;
    this.rect.y = y - this.rect.height / 2;
    this.markDirty();
  }
}
