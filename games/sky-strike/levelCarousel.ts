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
  readonly label: string;
  readonly aspect: number;
}

export interface SkyStrikeLevelCarouselOptions {
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
  private readonly levelName: GuiLabel;
  private readonly bossName: GuiLabel;
  private readonly counter: GuiLabel;
  private readonly startButton: GuiButton;
  private readonly channel: GuiLabel;
  private readonly hint: GuiLabel;
  private readonly settings: SkyStrikeOptions;
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
    this.layoutRelative(this.heading, (parent) => this.relativeRect(parent, 0.04, 0.045, 0.76, 0.075));

    this.bossImage = this.panel.add(new GuiImage({
      source: null,
      sourceKey: 'sky-strike-boss-preview-empty',
      style: {
        backgroundColor: 'rgba(14, 8, 34, 0.35)',
        borderColor: 'rgba(83, 219, 255, 0.28)',
        radius: 3,
      },
    }));
    this.layoutBossImage();

    const previousButton = skyStrikeButton(this.panel, options.guiImage, '', () => this.changeSelection(-1), 'left');
    const nextButton = skyStrikeButton(this.panel, options.guiImage, '', () => this.changeSelection(1), 'right');
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

    this.startButton = skyStrikeButton(this.panel, options.guiImage, '', () => options.onStart(this.selectedIndex));
    this.layoutRelative(this.startButton, parent => this.relativeRect(parent, 0.12, 0.86, 0.76, 0.1));

    const gear = skyStrikeIconButton(this.panel, options.guiImage, 'gear', () => { this.pointerId = -1; this.settings.open(); });
    this.layoutRelative(gear.button, p => ({ x: p.x + p.width - 58, y: p.y + p.height * 0.035, width: 52, height: 60 }));
    const entity = new Entity('SkyStrikeLevelCarouselGui');
    entity.addComponent(this.root);
    options.world.addEntity(entity);
    this.settings = new SkyStrikeOptions(options.world, options.guiImage, options.locale);
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
    this.levelName.setText(`${String(this.selectedIndex + 1).padStart(2, '0')} · ${t.named(level.id)}`);
    this.bossName.setText(`${t.text('boss')} · ${boss.label}`);
    this.counter.setText(`${t.text('sector')}  ${String(this.selectedIndex + 1).padStart(2, '0')} / ${String(this.options.levels.length).padStart(2, '0')}`);
    this.bossImage.setSource(boss.source, boss.sourceKey);
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
    this.bossImage.layout = (parentRect) => {
      const level = this.options.levels[this.selectedIndex];
      const aspect = level ? Math.max(0.8, this.options.resolveBoss(level).aspect) : 1.25;
      const maxWidth = parentRect.width * 0.56;
      const maxHeight = parentRect.height * 0.43;
      const width = Math.min(maxWidth, maxHeight / aspect);
      const height = width * aspect;
      this.bossImage.rect = {
        x: parentRect.x + (parentRect.width - width) / 2,
        y: parentRect.y + parentRect.height * 0.17 + (maxHeight - height) / 2,
        width,
        height,
      };
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
