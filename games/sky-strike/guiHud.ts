import { Entity, type World } from '@haiyue/engine';
import { GuiRoot, GuiElement, GuiLabel, GuiButton, GuiProgress, GuiImage } from '@haiyue/engine/gui';
import { skyStrikeButton, type SkyStrikeGuiImage } from './guiSkins';
import { skyStrikeViewport } from './viewport';
import type { SkyStrikeUi, SkyStrikeHud, SkyStrikeActions, SkyStrikeStatus } from './presentation';
/** Shared browser/native HUD, composed entirely through the engine GuiSystem. */
export class SkyStrikeGuiHud implements SkyStrikeUi {
  private readonly root = new GuiRoot({ theme: { radius: 3, colors: { primary: '#7750c4', background: '#100722', surface: '#201036', border: '#694690', text: '#edf5ff', hover: '#6843a7', active: '#452c70', disabled: '#292038', danger: '#ff538a', textMuted: '#ad9cc3' } } });
  private readonly title: GuiLabel;
  private readonly stats: GuiLabel;
  private readonly health: GuiLabel;
  private readonly weapon: GuiLabel;
  private readonly boss: GuiLabel;
  private readonly hullBar: GuiProgress;
  private readonly bossBar: GuiProgress;
  private readonly bomb: GuiButton;
  private readonly pause: GuiButton;
  private readonly overlay: GuiElement;
  private readonly statusTitle: GuiLabel;
  private readonly statusCopy: GuiLabel;
  private actions: SkyStrikeActions | null = null;
  constructor(world: World, image: SkyStrikeGuiImage, insets: { top: number; bottom: number } = { top: 0, bottom: 0 }) {
    const layer = this.root.add(new GuiElement({ width: '100%', height: '100%' }));
    layer.layout = rect => { const view = skyStrikeViewport(rect.width, rect.height); layer.rect = { x: rect.x + view.left, y: rect.y, width: view.width, height: rect.height }; for (const child of layer.children) child.layout(layer.rect); };
    const panel = layer.add(new GuiElement({ x: 0, y: insets.top, width: '100%', height: 106, style: { backgroundColor: 'rgba(13,5,31,0.86)', borderColor: '#614280', radius: 3 } }));
    this.title = panel.add(new GuiLabel({ x: 14, y: 10, width: '100%', height: 24, text: 'SKY / STRIKE', fontSize: 22, style: { color: '#74e9ff' } }));
    this.stats = panel.add(new GuiLabel({ x: 14, y: 38, width: '100%', height: 21, fontSize: 12 }));
    this.health = panel.add(new GuiLabel({ x: 14, y: 62, width: '100%', height: 19, fontSize: 12, style: { color: '#59e9b4' } }));
    this.hullBar = panel.add(new GuiProgress({ x: 14, y: 102, width: '90%', height: 4, min: 0, max: 100, value: 100, style: { backgroundColor: '#19253a', color: '#59e9d0', radius: 0 } }));
    this.weapon = panel.add(new GuiLabel({ x: 14, y: 82, width: '100%', height: 18, fontSize: 12, style: { color: '#b6ccf2' } }));
    this.boss = layer.add(new GuiLabel({ x: 14, y: insets.top + 110, width: '100%', height: 23, fontSize: 12, style: { color: '#ff7996' } }));
    this.bossBar = layer.add(new GuiProgress({ x: 14, y: insets.top + 133, width: '90%', height: 4, visible: false, min: 0, max: 1, style: { backgroundColor: '#25152c', color: '#ff538a' } }));
    this.bomb = layer.add(new GuiButton({ x: 14, y: 0, width: 112, height: 44, text: 'BOMB', style: { backgroundColor: '#362046', borderColor: '#e2ae70', color: '#ffe3a1', radius: 3 }, onClick: () => this.actions?.bomb() }));
    this.pause = layer.add(new GuiButton({ x: 0, y: 0, width: 90, height: 44, text: 'PAUSE', style: { backgroundColor: '#21143d', borderColor: '#7195cf', color: '#bdf6ff', radius: 3 }, onClick: () => this.actions?.pause() }));
    for (const [button, right] of [[this.bomb, false], [this.pause, true]] as const) {
      const layout = button.layout.bind(button);
      button.layout = rect => { layout(rect); button.rect.y = rect.y + rect.height - insets.bottom - 58; if (right) button.rect.x = rect.x + rect.width - 104; };
    }
    this.overlay = layer.add(new GuiElement({ width: '100%', height: '100%', visible: false, style: { backgroundColor: 'rgba(1,4,13,0.88)' } }));
    const card = this.overlay.add(new GuiElement());
    card.layout = rect => {
      const width = Math.min(400, rect.width - 28), height = Math.min(width * 0.78, rect.height - 40);
      card.rect = { x: rect.x + (rect.width - width) / 2, y: rect.y + (rect.height - height) / 2, width, height };
      for (const child of card.children) child.layout(card.rect);
    };
    card.add(new GuiImage({ source: image('assets/gui-pause-panel.png'), sourceKey: 'assets/gui-pause-panel.png', width: '100%', height: '100%', disabled: true }));
    const place = (element: GuiElement, x: number, y: number, width: number, height: number) => {
      element.layout = rect => {
        element.rect = { x: rect.x + rect.width * x, y: rect.y + rect.height * y, width: rect.width * width, height: rect.height * height };
        for (const child of element.children) child.layout(element.rect);
      };
    };
    const channel = card.add(new GuiLabel({ text: 'FLIGHT CONTROL / STANDBY', textAlign: 'center', fontSize: 10, style: { color: '#95d4ef' } }));
    place(channel, 0.08, 0.15, 0.84, 0.06);
    this.statusTitle = card.add(new GuiLabel({ textAlign: 'center', fontSize: 25, style: { color: '#f5f0ff' } }));
    place(this.statusTitle, 0.08, 0.26, 0.84, 0.14);
    this.statusCopy = card.add(new GuiLabel({ textAlign: 'center', fontSize: 12, style: { color: '#aeabc8' } }));
    place(this.statusCopy, 0.08, 0.43, 0.84, 0.08);
    const resume = skyStrikeButton(card, image, 'RESUME', () => this.actions?.start());
    place(resume, 0.15, 0.62, 0.7, 0.22);
    const entity = new Entity('SkyStrikeNativeHud'); entity.addComponent(this.root); world.addEntity(entity);
  }
  update(hud: SkyStrikeHud): void {
    this.stats.setText(`SCORE ${hud.score}   BEST ${hud.highScore}   WAVE ${hud.wave}`);
    this.hullBar.setValue(hud.health); this.bossBar.setValue(hud.bossHealth); this.bossBar.setVisible(!!hud.bossName);
    this.health.setText(`HULL ${Math.ceil(hud.health)} / 100    LIVES ${hud.lives}`);
    this.weapon.setText(`${hud.weapon.toUpperCase()}   ${hud.weaponLevel ? `LV ${hud.weaponLevel}` : 'BASE'}`);
    this.bomb.setText(`BOMB  x${hud.bombs}`); this.bomb.setDisabled(hud.bombDisabled);
    this.boss.setText(hud.bossName ? `${hud.bossName}   ${Math.ceil(hud.bossHealth * 100)}%` : '');
  }
  status(status: SkyStrikeStatus | null): void {
    this.overlay.setVisible(!!status);
    if (status) { this.statusTitle.setText(status.gameOver ? 'MISSION LOST' : 'PAUSED'); this.statusCopy.setText('Ready when you are, pilot.'); }
  }
  pauseState(text: string, disabled: boolean): void { this.pause.setText(text === '继续' ? 'RESUME' : 'PAUSE'); this.pause.setDisabled(disabled); }
  metadata(values: Record<string, string>): void { if (values.phase) this.root.root.setVisible(values.phase === 'playing' || values.phase === 'paused'); }
  bindActions(actions: SkyStrikeActions): () => void { this.actions = actions; return () => { this.actions = null; }; }
  dispose(): void { this.actions = null; }
}
