import { SkyStrikeVitals } from './hudVitals';
import { SkyStrikeLocale } from './i18n';
import { Entity, type World } from '@haiyue/engine';
import { GuiRoot, GuiElement, GuiLabel, GuiImage } from '@haiyue/engine/gui';
import { skyStrikeButton, skyStrikeIconButton, type SkyStrikeGuiImage } from './guiSkins';
import { skyStrikeViewport } from './viewport';
import type { SkyStrikeUi, SkyStrikeHud, SkyStrikeActions, SkyStrikeStatus } from './presentation';
/** Shared browser/native HUD, composed entirely through the engine GuiSystem. */
export class SkyStrikeGuiHud implements SkyStrikeUi {
  private readonly root = new GuiRoot({ theme: { radius: 3, colors: { primary: '#7750c4', background: '#100722', surface: '#201036', border: '#694690', text: '#edf5ff', hover: '#6843a7', active: '#452c70', disabled: '#292038', danger: '#ff538a', textMuted: '#ad9cc3' } } });
  private readonly vitals: SkyStrikeVitals;
  private readonly bomb: ReturnType<typeof skyStrikeIconButton>;
  private readonly pause: ReturnType<typeof skyStrikeIconButton>;
  private lastHud: SkyStrikeHud | null = null;
  private paused = false;
  private readonly offLocale: () => void;
  private readonly overlay: GuiElement;
  private readonly statusTitle: GuiLabel;
  private readonly statusCopy: GuiLabel;
  private actions: SkyStrikeActions | null = null;
  constructor(world: World, image: SkyStrikeGuiImage, insets: { top: number; bottom: number } = { top: 0, bottom: 0 }, private readonly locale = new SkyStrikeLocale()) {
    const layer = this.root.add(new GuiElement({ width: '100%', height: '100%' }));
    layer.layout = rect => { const view = skyStrikeViewport(rect.width, rect.height); layer.rect = { x: rect.x + view.left, y: rect.y, width: view.width, height: rect.height }; for (const child of layer.children) child.layout(layer.rect); };
    this.vitals = new SkyStrikeVitals(layer, image, locale, insets.top);
    this.bomb = skyStrikeIconButton(layer, image, 'bomb', () => this.actions?.bomb());
    this.pause = skyStrikeIconButton(layer, image, 'pause', () => this.actions?.pause());
    for (const [control, right] of [[this.bomb, false], [this.pause, true]] as const) {
      const button = control.button;
      button.layout = rect => {
        button.rect = { x: rect.x + (right ? rect.width - 100 : 10), y: rect.y + rect.height - insets.bottom - 90, width: 90, height: 82 };
        for (const child of button.children) child.layout(button.rect);
      };
    }
    this.overlay = layer.add(new GuiElement({ width: '100%', height: '100%', visible: false, style: { backgroundColor: 'rgba(1,4,13,0.88)' } }));
    const card = this.overlay.add(new GuiElement());
    card.layout = rect => {
      const width = Math.min(400, rect.width - 28), height = Math.min(width * 0.98, rect.height - 40);
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
    const channel = card.add(new GuiLabel({ text: '', textAlign: 'center', fontSize: 10, style: { color: '#95d4ef' } }));
    place(channel, 0.08, 0.10, 0.84, 0.06);
    this.statusTitle = card.add(new GuiLabel({ textAlign: 'center', fontSize: 25, style: { color: '#f5f0ff' } }));
    place(this.statusTitle, 0.08, 0.19, 0.84, 0.12);
    this.statusCopy = card.add(new GuiLabel({ textAlign: 'center', fontSize: 12, style: { color: '#aeabc8' } }));
    place(this.statusCopy, 0.08, 0.34, 0.84, 0.07);
    const resume = skyStrikeButton(card, image, '', () => this.actions?.start());
    place(resume, 0.15, 0.48, 0.7, 0.16);
    const home = skyStrikeButton(card, image, '', () => this.actions?.home());
    place(home, 0.15, 0.69, 0.7, 0.16);
    const refresh = () => {
      channel.setText(locale.text('standby'));
      this.statusTitle.setText(locale.text('paused')); this.statusCopy.setText(locale.text('pauseCopy'));
      home.setText(locale.text('home')); resume.setText(locale.text('resume')); this.pause.caption.setText(locale.text(this.paused ? 'resume' : 'pause'));
      if (this.lastHud) this.update(this.lastHud);
    };
    this.offLocale = locale.subscribe(refresh); refresh();
    const entity = new Entity('SkyStrikeNativeHud'); entity.addComponent(this.root); world.addEntity(entity);
  }
  update(hud: SkyStrikeHud): void {
    this.lastHud = hud;
    this.vitals.update(hud);
    this.bomb.caption.setText(`${this.locale.text('bomb')} ×${hud.bombs}`); this.bomb.setDisabled(hud.bombDisabled);
  }

  status(status: SkyStrikeStatus | null): void {
    this.overlay.setVisible(!!status);
    if (status) this.statusTitle.setText(this.locale.text(status.gameOver ? 'lost' : 'paused'));
  }
  pauseState(paused: boolean, disabled: boolean): void { this.paused = paused; this.pause.caption.setText(this.locale.text(paused ? 'resume' : 'pause')); this.pause.setDisabled(disabled); }
  metadata(values: Record<string, string>): void { if (values.phase) this.root.root.setVisible(values.phase === 'playing' || values.phase === 'paused'); }
  bindActions(actions: SkyStrikeActions): () => void { this.actions = actions; return () => { this.actions = null; }; }
  dispose(): void { this.actions = null; this.offLocale(); }
}
