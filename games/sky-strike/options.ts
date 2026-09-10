import { Entity, type World } from '@haiyue/engine';
import { GuiRoot, GuiElement, GuiImage, GuiLabel } from '@haiyue/engine/gui';
import { SKY_LANGUAGES, SKY_LANGUAGE_NAMES, type SkyStrikeLocale } from './i18n';
import { skyStrikeButton, type SkyStrikeGuiImage } from './guiSkins';

/** A separate GUI root keeps the modal above the carousel's batched images and text. */
export class SkyStrikeOptions {
  private readonly root = new GuiRoot({ visible: false });
  private readonly offLocale: () => void;
  isOpen = false;
  constructor(world: World, image: SkyStrikeGuiImage, locale: SkyStrikeLocale) {
    const overlay = this.root.add(new GuiElement({ width: '100%', height: '100%', style: { backgroundColor: 'rgba(1,3,13,0.94)' } }));
    const card = overlay.add(new GuiElement());
    card.layout = rect => {
      const width = Math.min(400, rect.width - 24), height = Math.min(510, rect.height - 48);
      card.rect = { x: rect.x + (rect.width-width)/2, y: rect.y + (rect.height-height)/2, width, height };
      for (const child of card.children) child.layout(card.rect);
    };
    card.add(new GuiImage({ width: '100%', height: '100%', source: image('assets/gui-pause-panel.png'), sourceKey: 'assets/gui-pause-panel.png', disabled: true }));
    const place = (element: GuiElement, y: number, height: number, width = 0.76) => {
      element.layout = rect => { element.rect = { x: rect.x + rect.width*(1-width)/2, y: rect.y + rect.height*y, width: rect.width*width, height: rect.height*height }; for (const child of element.children) child.layout(element.rect); };
    };
    const heading = card.add(new GuiLabel({ fontSize: 25, textAlign: 'center', style: { color: '#edf8ff' } })); place(heading,0.12,0.08);
    const subtitle = card.add(new GuiLabel({ fontSize: 13, textAlign: 'center', style: { color: '#a2deef' } })); place(subtitle,0.22,0.045);
    const buttons = SKY_LANGUAGES.map((language,index) => {
      const button = skyStrikeButton(card,image,'',()=>locale.set(language)); place(button,0.30+index*0.125,0.105);
      return { language, button };
    });
    const hint = card.add(new GuiLabel({ fontSize: 10, textAlign: 'center', style: { color: '#c9b5df' } })); place(hint,0.70,0.055,0.9);
    const back = skyStrikeButton(card,image,'',()=>this.close()); place(back,0.78,0.105,0.6);
    const refresh = () => {
      heading.setText(locale.text('options')); subtitle.setText(locale.text('language'));
      hint.setText(locale.text(locale.saveFailed ? 'saveFailed' : 'languageHint')); back.setText(locale.text('close'));
      for (const {language,button} of buttons) button.setText(`${locale.language === language ? '●' : '○'}  ${SKY_LANGUAGE_NAMES[language]}`);
    };
    this.offLocale = locale.subscribe(refresh); refresh();
    const entity = new Entity('SkyStrikeOptionsGui'); entity.addComponent(this.root); world.addEntity(entity);
  }
  open(): void { this.isOpen = true; this.root.root.setVisible(true); }
  close(): void { this.isOpen = false; this.root.root.setVisible(false); }
  dispose(): void { this.close(); this.offLocale(); }
}
