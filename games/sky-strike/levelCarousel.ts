import type { SkyStrikeAudio } from './audio/SkyStrikeAudio';
import { SKY_FONT_CHARACTERS, type SkyStrikeLocale } from './i18n';
import { SkyStrikeOptions } from './options';
import { Entity, type HaiyueEngine, type World } from '@haiyue/engine';
import {
  GuiButton,
  GuiElement,
  GuiImage,
  GuiLabel,
  GuiRoot,
  GuiSystem,
  type GuiRect,
  type GuiImageSource,
  type GuiFontOptions,
} from '@haiyue/engine/gui';
import { skyStrikeButton, skyStrikeIconButton, type SkyStrikeGuiImage } from './guiSkins';
import { wrapLevelIndex, type SkyStrikeLevel } from './levels/loader';

export interface LevelBossPresentation {
  readonly source: GuiImageSource;
  readonly sourceKey: string;
  readonly companion?: {source: GuiImageSource; sourceKey: string};
  /** Layer rectangles normalized to the main hull's displayed rectangle. */
  readonly attachments?: readonly {source:GuiImageSource;sourceKey:string;x:number;y:number;width:number;height:number}[];
  readonly label: string;
  readonly aspect: number;
}

export interface SkyStrikeLevelCarouselOptions {
  readonly audio?: SkyStrikeAudio | undefined;
  readonly locale: SkyStrikeLocale;
  readonly engine: HaiyueEngine;
  readonly world: World;
  readonly canvas: HTMLCanvasElement;
  readonly levels: readonly SkyStrikeLevel[];
  readonly initialIndex?: number;
  readonly guiFont?: GuiFontOptions;
  readonly loadOp?: 'clear' | 'load';
  readonly guiImage: SkyStrikeGuiImage;
  readonly resolveBoss: (level: SkyStrikeLevel) => LevelBossPresentation;
  readonly onSelectionChange?: (index: number) => void;
  readonly onStart: (index: number) => void;
}

const SWIPE_THRESHOLD = 42;

export class SkyStrikeLevelCarousel {
  private readonly root: GuiRoot;
  private readonly panel: GuiElement;
  private readonly heading: GuiLabel;
  private readonly bossImage: GuiImage;
  private readonly companionImage: GuiImage;
  private readonly bossAttachments:GuiImage[]=[];
  private readonly levelName: GuiLabel;
  private readonly bossName: GuiLabel;
  private readonly counter: GuiLabel;
  private readonly startButton: GuiButton;
  private readonly channel: GuiLabel;
  private readonly hint: GuiLabel;
  private readonly settings: SkyStrikeOptions;
  private scanMs=0;
  private readonly scanBands:GuiElement[]=[];
  private failed = false;
  private selectedIndex: number;
  private active = false;
  private readonly cleanup: (() => void)[] = [];
  private pointerId = -1;
  private pointerStartX = 0;

  constructor(private readonly options: SkyStrikeLevelCarouselOptions) {
    this.selectedIndex = wrapLevelIndex(options.initialIndex ?? 0, options.levels.length);
    this.root = new GuiRoot({
      visible: false,
      theme: {
        fontSize: 18,
        radius: 10,
        colors: {
          text: '#f4fbff',
          textMuted: '#9cc7d9',
          primary: '#168cb4',
          danger: '#ff4968',
          background: '#01040d',
          surface: 'rgba(5, 19, 42, 0.96)',
          border: 'rgba(91, 226, 255, 0.42)',
          hover: '#155c83',
          active: '#1d7eaa',
          disabled: '#41566a',
        },
      },
    });

    const backdrop = this.root.add(new GuiElement({
      x: 0,
      y: 0,
      width: '100%',
      height: '100%',
      style: { backgroundColor: 'rgba(9, 3, 25, 0.22)' },
    }));
    this.panel = backdrop.add(new GuiElement({
      style: {
        backgroundColor: 'rgba(15, 7, 35, 0.58)',
        borderColor: 'rgba(91, 226, 255, 0.48)',
        radius: 3,
        padding: 12,
      },
    }));
    this.layoutPanel();
    // Subtle circuit lattice: immutable GUI geometry, rendered beneath text and ships.
    for(let i=0;i<11;i++){
      const line=this.panel.add(new GuiElement({disabled:true,style:{backgroundColor:'rgba(96, 174, 227, 0.055)'}}));
      this.layoutRelative(line,p=>this.relativeRect(p,.06,.065+i*.085,.88,.0008));
    }
    for(let i=0;i<7;i++){
      const line=this.panel.add(new GuiElement({disabled:true,style:{backgroundColor:'rgba(116, 129, 226, 0.045)'}}));
      this.layoutRelative(line,p=>this.relativeRect(p,.11+i*.13,.06,.001,.88));
      for(const y of [.21,.55,.80]){
        const node=this.panel.add(new GuiElement({disabled:true,style:{backgroundColor:'rgba(99, 224, 247, 0.16)'}}));
        this.layoutRelative(node,p=>({x:p.x+p.width*(.11+i*.13)-1,y:p.y+p.height*y-1,width:2,height:2}));
      }
      const trace=this.panel.add(new GuiElement({disabled:true,style:{backgroundColor:'rgba(97, 215, 244, 0.11)'}}));
      this.layoutRelative(trace,p=>this.relativeRect(p,i%2?.83:.06,.20+i*.092,.11,.0014));
    }
    for(let i=0;i<12;i++){
      const band=this.panel.add(new GuiElement({disabled:true,style:{backgroundColor:`rgba(102, 218, 255, ${.035*(1-i/12)**2})`}}));
      this.layoutRelative(band,p=>{
        const y=((this.scanMs/8500-i*.006)%1+1)%1;
        return this.relativeRect(p,.06,.04+y*.91,.88,.006);
      });this.scanBands.push(band);
    }
    for (const y of [0.02, 0.975]) {
      const rail = this.panel.add(new GuiElement({ style: { backgroundColor: '#57d9f5' } }));
      this.layoutRelative(rail, p => this.relativeRect(p, 0.08, y, 0.84, 0.002));
    }
    this.channel = this.panel.add(new GuiLabel({ text: '', fontSize: 10, textAlign: 'center', style: { color: '#ad91e0' } }));
    this.layoutRelative(this.channel, p => this.relativeRect(p, 0.06, 0.125, 0.88, 0.035));

    this.heading = this.panel.add(new GuiLabel({
      text: '',
      textAlign: 'center',
      fontSize: 23,
      style: { color: '#f4fbff' },
    }));
    this.layoutRelative(this.heading, parent => {
      const units=Array.from(this.heading.text).reduce((n,c)=>n+(c.charCodeAt(0)<128?.6:1),0);
      this.heading.setFontSize(Math.min(23,Math.max(1,parent.width-124)/Math.max(1,units)));
      return this.relativeRect(parent,0.04,0.045,0.92,0.075);
    });

    this.bossImage = this.panel.add(new GuiImage({
      source: null,
      sourceKey: 'sky-strike-boss-preview-empty',
      style: {
        backgroundColor: 'rgba(14, 8, 34, 0.35)',
        borderColor: 'rgba(83, 219, 255, 0.28)',
        radius: 3,
      },
    }));
    this.companionImage=this.panel.add(new GuiImage({visible:false,disabled:true}));
    this.layoutBossImage();

    const previousButton = skyStrikeButton(this.panel, options.guiImage, '', () => {this.changeSelection(-1);options.audio?.click();}, 'left');
    const nextButton = skyStrikeButton(this.panel, options.guiImage, '', () => {this.changeSelection(1);options.audio?.click();}, 'right');
    for (const [button, right] of [[previousButton, false], [nextButton, true]] as const) {
      button.layout = rect => {
        const size = Math.max(48, Math.min(64, rect.width * 0.16));
        button.rect = { x: rect.x + (right ? rect.width - size - 4 : 4), y: rect.y + rect.height * 0.36 - size / 2, width: size, height: size };
        for (const child of button.children) child.layout(button.rect);
      };
    }

    this.levelName = this.panel.add(new GuiLabel({
      text: '',
      textAlign: 'center',
      fontSize: 25,
      style: { color: '#ffffff' },
    }));
    this.layoutRelative(this.levelName, (parent) => this.relativeRect(parent, 0.06, 0.635, 0.88, 0.07));

    this.bossName = this.panel.add(new GuiLabel({
      text: '',
      textAlign: 'center',
      fontSize: 13,
      style: { color: '#65e8ff' },
    }));
    this.layoutRelative(this.bossName, (parent) => this.relativeRect(parent, 0.08, 0.705, 0.84, 0.045));

    this.counter = this.panel.add(new GuiLabel({
      text: '',
      textAlign: 'center',
      fontSize: 14,
      style: { color: '#a9cbd9' },
    }));
    this.layoutRelative(this.counter, (parent) => this.relativeRect(parent, 0.32, 0.765, 0.36, 0.04));

    this.hint = this.panel.add(new GuiLabel({
      text: '',
      textAlign: 'center',
      fontSize: 11,
      style: { color: '#8397b9' },
    }));
    this.layoutRelative(this.hint, (parent) => this.relativeRect(parent, 0.07, 0.81, 0.86, 0.025));

    this.startButton = skyStrikeButton(this.panel, options.guiImage, '', () => {options.onStart(this.selectedIndex);options.audio?.click();});
    this.layoutRelative(this.startButton, parent => this.relativeRect(parent, 0.12, 0.86, 0.76, 0.1));

    const gear = skyStrikeIconButton(this.panel, options.guiImage, 'gear', () => { this.pointerId = -1; this.settings.open(); options.audio?.click(); });
    this.layoutRelative(gear.button, p => ({ x: p.x + p.width - 58, y: p.y + p.height * 0.035, width: 52, height: 60 }));
    const entity = new Entity('SkyStrikeLevelCarouselGui');
    entity.addComponent(this.root);
    options.world.addEntity(entity);
    this.settings = new SkyStrikeOptions(options.world, options.guiImage, options.locale, options.audio);
    this.cleanup.push(options.locale.subscribe(() => this.sync()));
    const guiSystem = new GuiSystem(options.engine, {
      loadOp: options.loadOp ?? 'clear',
      font: {
        chars: SKY_FONT_CHARACTERS,
        fontSize: 34,
        atlasSize: 2048,
        ...options.guiFont,
      },
    });
    guiSystem.priority = 50;
    options.world.addSystem(guiSystem);
    this.bindSwipeInput();
    this.sync();
  }

  update(deltaMs:number):void {
    if(!this.active||this.optionsOpen)return;
    this.scanMs=(this.scanMs+Math.max(0,deltaMs))%8500;
    for(const band of this.scanBands){band.layout(this.panel.rect);band.markDirty();}
  }

  get isVisible(): boolean {
    return this.active;
  }

  get index(): number {
    return this.selectedIndex;
  }

  get optionsOpen(): boolean { return this.settings.isOpen; }
  closeOptions(): void { this.settings.close(); }

  show(index = this.selectedIndex, failed = false): void {
    this.active = true;
    this.selectedIndex = wrapLevelIndex(index, this.options.levels.length);
    this.failed = failed;
    this.root.root.setVisible(true);

    this.sync();
  }

  hide(): void {
    this.active = false;
    this.settings.close();
    this.pointerId = -1;
    this.root.root.setVisible(false);

  }

  changeSelection(offset: number): void {
    if (!this.active || this.optionsOpen || this.options.levels.length === 0) return;
    this.selectedIndex = wrapLevelIndex(this.selectedIndex + offset, this.options.levels.length);
    this.sync();
    this.options.onSelectionChange?.(this.selectedIndex);
  }

  private sync(): void {
    const level = this.options.levels[this.selectedIndex];
    if (!level) return;
    const t = this.options.locale;
    this.heading.setText(t.text(this.failed ? 'failedSelect' : 'select'));
    this.startButton.setText(t.text(this.failed ? 'retry' : 'start'));
    this.channel.setText(t.text('missionChannel')); this.hint.setText(t.text('swipe'));
    const boss = this.options.resolveBoss(level);
    this.levelName.setText(`${String(level.number ?? this.selectedIndex + 1).padStart(2, '0')} · ${t.named(level.id)}`);
    this.bossName.setText(`${t.text('boss')} · ${boss.label}`);
    this.counter.setText(`${t.text('sector')}  ${String(this.selectedIndex + 1).padStart(2, '0')} / ${String(this.options.levels.length).padStart(2, '0')}`);
    this.bossImage.setSource(boss.source, boss.sourceKey);
    const attachments=boss.attachments??[];
    while(this.bossAttachments.length<attachments.length)this.bossAttachments.push(this.bossImage.add(new GuiImage({disabled:true,visible:false})));
    for(let i=0;i<this.bossAttachments.length;i++){
      const image=this.bossAttachments[i]!,part=attachments[i];image.setVisible(!!part);
      if(part){image.setSource(part.source,part.sourceKey);image.layout=parent=>{image.rect=this.relativeRect(parent,part.x,part.y,part.width,part.height);};}
    }
    this.companionImage.setVisible(!!boss.companion);
    if(boss.companion)this.companionImage.setSource(boss.companion.source,boss.companion.sourceKey);
    this.bossImage.layout(this.panel.rect);
    this.companionImage.layout(this.panel.rect);
    this.root.root.markDirty();
  }

  private bindSwipeInput(): void {
    this.listen('pointerdown', event => {
      if (!this.active || this.optionsOpen || event.button !== 0 || this.pointerId !== -1) return;
      this.pointerId = event.pointerId;
      this.pointerStartX = event.clientX;
      this.options.canvas.setPointerCapture(event.pointerId);
    });
    this.listen('pointerup', event => {
      if (!this.active || this.optionsOpen || event.pointerId !== this.pointerId) return;
      const deltaX = event.clientX - this.pointerStartX;
      if (Math.abs(deltaX) >= SWIPE_THRESHOLD) this.changeSelection(deltaX < 0 ? 1 : -1);
      this.pointerId = -1;
      if (this.options.canvas.hasPointerCapture?.(event.pointerId)) {
        this.options.canvas.releasePointerCapture(event.pointerId);
      }
    });
    this.listen('pointercancel', event => {
      if (event.pointerId === this.pointerId) this.pointerId = -1;
    });
  }

  private listen(type: string, handler: (event: PointerEvent) => void): void {
    this.options.canvas.addEventListener(type, handler as EventListener);
    this.cleanup.push(() => this.options.canvas.removeEventListener(type, handler as EventListener));
  }
  dispose(): void { this.hide(); this.settings.dispose(); for (const off of this.cleanup.splice(0)) off(); }

  private layoutPanel(): void {
    this.panel.layout = (parentRect) => {
      const width = Math.min(410, Math.max(1, parentRect.width - 24));
      const height = Math.min(720, Math.max(280, parentRect.height - 36));
      this.panel.rect = {
        x: parentRect.x + (parentRect.width - width) / 2,
        y: parentRect.y + (parentRect.height - height) / 2,
        width,
        height,
      };
      for (const child of this.panel.children) child.layout(this.panel.rect);
    };
  }

  private layoutBossImage(): void {
    for(const [image,side] of [[this.bossImage,-1],[this.companionImage,1]] as const) image.layout = (parentRect) => {
      const level = this.options.levels[this.selectedIndex];
      const aspect = level ? Math.max(0.8, this.options.resolveBoss(level).aspect) : 1.25;
      const paired=!!(level && this.options.resolveBoss(level).companion);
      const maxWidth = parentRect.width * (paired?0.34:0.56);
      const maxHeight = parentRect.height * 0.43;
      const width = Math.min(maxWidth, maxHeight / aspect);
      const height = width * aspect;
      image.rect = {
        x: parentRect.x + (parentRect.width - width) / 2 + (paired?side*width*0.47:0),
        y: parentRect.y + parentRect.height * 0.17 + (maxHeight - height) / 2,
        width,
        height,
      };
      for(const child of image.children)child.layout(image.rect);
    };
  }

  private layoutRelative(element: GuiElement, resolve: (parent: GuiRect) => GuiRect): void {
    element.layout = (parentRect) => {
      element.rect = resolve(parentRect);
      for (const child of element.children) child.layout(element.rect);
    };
  }

  private relativeRect(parent: GuiRect, x: number, y: number, width: number, height: number): GuiRect {
    return {
      x: parent.x + parent.width * x,
      y: parent.y + parent.height * y,
      width: parent.width * width,
      height: parent.height * height,
    };
  }
}
