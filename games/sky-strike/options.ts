import type { SkyStrikeAudio } from './audio/SkyStrikeAudio';
import { Entity, type World } from '@haiyue/engine';
import { GuiRoot, GuiElement, GuiImage, GuiLabel } from '@haiyue/engine/gui';
import { SKY_LANGUAGES, SKY_LANGUAGE_NAMES, type SkyStrikeLocale } from './i18n';
import { skyStrikeButton, type SkyStrikeGuiImage } from './guiSkins';

/** A separate GUI root keeps the modal above the carousel's batched images and text. */
export class SkyStrikeOptions {
  private readonly root = new GuiRoot({ visible: false });
  private readonly offLocale: () => void;
  private readonly offAudio: (() => void) | undefined;
  isOpen = false;
  constructor(world: World, image: SkyStrikeGuiImage, locale: SkyStrikeLocale, audio?: SkyStrikeAudio) {
    const overlay = this.root.add(new GuiElement({ width: '100%', height: '100%', style: { backgroundColor: 'rgba(1,3,13,0.94)' } }));
    const card = overlay.add(new GuiElement());
    card.layout = rect => {
      const width = Math.min(400, rect.width - 24), height = Math.min(640, rect.height - 48);
      card.rect = { x: rect.x + (rect.width-width)/2, y: rect.y + (rect.height-height)/2, width, height };
      for (const child of card.children) child.layout(card.rect);
    };
    card.add(new GuiImage({ width: '100%', height: '100%', source: image('assets/gui-pause-panel.png'), sourceKey: 'assets/gui-pause-panel.png', disabled: true }));
    const place = (element: GuiElement, y: number, height: number, width = 0.76) => {
      element.layout = rect => { element.rect = { x: rect.x + rect.width*(1-width)/2, y: rect.y + rect.height*y, width: rect.width*width, height: rect.height*height }; for (const child of element.children) child.layout(element.rect); };
    };
    const heading = card.add(new GuiLabel({ fontSize: 25, textAlign: 'center', style: { color: '#edf8ff' } })); place(heading,0.10,0.065);
    const subtitle = card.add(new GuiLabel({ fontSize: 13, textAlign: 'center', style: { color: '#a2deef' } })); place(subtitle,0.185,0.035);
    const buttons = SKY_LANGUAGES.map((language,index) => {
      const button = skyStrikeButton(card,image,'',()=>{locale.set(language);audio?.click();}); place(button,0.235+index*0.115,0.095);
      return { language, button };
    });
    const hint = card.add(new GuiLabel({ fontSize: 10, textAlign: 'center', style: { color: '#c9b5df' } })); place(hint,0.575,0.035,0.9);
    const sound = skyStrikeButton(card,image,'',()=>{audio?.settings(!audio.enabled);audio?.click();}); place(sound,0.63,0.075);
    const volume = card.add(new GuiLabel({fontSize:14,textAlign:'center',style:{color:'#a2deef'}})); place(volume,0.735,0.075,0.44);
    for (const direction of [-1,1]) {
      const button = skyStrikeButton(card,image,direction<0?'-':'+',()=>{audio?.settings(audio.enabled,audio.volume+direction*0.1);audio?.click();});
      button.layout = rect => {button.rect={x:rect.x+rect.width*(direction<0?0.12:0.71),y:rect.y+rect.height*0.735,width:rect.width*0.17,height:rect.height*0.075};for(const child of button.children)child.layout(button.rect);};
    }
    const back = skyStrikeButton(card,image,'',()=>{this.close();audio?.click('back');}); place(back,0.835,0.075,0.6);
    const refresh = () => {
      heading.setText(locale.text('options')); subtitle.setText(locale.text('language'));
      hint.setText(locale.text(audio?.saveFailed ? 'audioSaveFailed' : locale.saveFailed ? 'saveFailed' : 'languageHint'));
      sound.setText(locale.text(audio?.enabled !== false ? 'audioOn' : 'audioOff'));
      volume.setText(`${locale.text('volume')} ${Math.round((audio?.volume ?? 0.65)*100)}%`); back.setText(locale.text('close'));
      for (const {language,button} of buttons) button.setText(`${locale.language === language ? '●' : '○'}  ${SKY_LANGUAGE_NAMES[language]}`);
    };
    this.offLocale = locale.subscribe(refresh); this.offAudio = audio?.subscribe(refresh); refresh();
    const entity = new Entity('SkyStrikeOptionsGui'); entity.addComponent(this.root); world.addEntity(entity);
  }
  open(): void { this.isOpen = true; this.root.root.setVisible(true); }
  close(): void { this.isOpen = false; this.root.root.setVisible(false); }
  dispose(): void { this.close(); this.offLocale(); this.offAudio?.(); }
}
