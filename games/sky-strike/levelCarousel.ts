import { Entity, type HaiyueEngine, type World } from '@haiyue/engine';
import {
  GuiButton,
  GuiDirtyFlags,
  GuiElement,
  GuiImage,
  GuiLabel,
  GuiRoot,
  GuiSystem,
  type GuiRect,
} from '@haiyue/engine/gui';
import { wrapLevelIndex, type SkyStrikeLevel } from './levels/loader';

export interface LevelBossPresentation {
  readonly source: HTMLImageElement | null;
  readonly sourceKey: string;
  readonly label: string;
  readonly aspect: number;
}

export interface SkyStrikeLevelCarouselOptions {
  readonly engine: HaiyueEngine;
  readonly world: World;
  readonly canvas: HTMLCanvasElement;
  readonly levels: readonly SkyStrikeLevel[];
  readonly initialIndex?: number;
  readonly resolveBoss: (level: SkyStrikeLevel) => LevelBossPresentation;
  readonly onSelectionChange?: (index: number) => void;
  readonly onStart: (index: number) => void;
}

const ASCII_CHARACTERS = ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~';
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
  private selectedIndex: number;
  private active = false;
  private pointerId = -1;
  private pointerStartX = 0;

  constructor(private readonly options: SkyStrikeLevelCarouselOptions) {
    this.selectedIndex = wrapLevelIndex(options.initialIndex ?? 0, options.levels.length);
    const localizedCharacters = `${options.levels.map(level => level.name).join('')}选择关卡任务失败开始出击再次出击左右滑动切换·`;
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
      style: { backgroundColor: 'rgba(1, 4, 13, 0.86)' },
    }));
    this.panel = backdrop.add(new GuiElement({
      style: {
        backgroundColor: 'rgba(5, 20, 44, 0.96)',
        borderColor: 'rgba(91, 226, 255, 0.48)',
        radius: 14,
        padding: 12,
      },
    }));
    this.layoutPanel();

    this.heading = this.panel.add(new GuiLabel({
      text: '选择关卡',
      textAlign: 'center',
      fontSize: 28,
      style: { color: '#f4fbff' },
    }));
    this.layoutRelative(this.heading, (parent) => this.relativeRect(parent, 0.08, 0.045, 0.84, 0.075));

    this.bossImage = this.panel.add(new GuiImage({
      source: null,
      sourceKey: 'sky-strike-boss-preview-empty',
      style: {
        backgroundColor: 'rgba(3, 11, 28, 0.72)',
        borderColor: 'rgba(83, 219, 255, 0.28)',
        radius: 12,
      },
    }));
    this.layoutBossImage();

    const previousButton = this.panel.add(new GuiButton({
      text: '<',
      style: {
        backgroundColor: 'rgba(11, 42, 72, 0.92)',
        hoverBackgroundColor: '#155c83',
        borderColor: 'rgba(99, 230, 255, 0.52)',
        color: '#dffaff',
        hoverColor: '#ffffff',
        radius: 22,
      },
      onClick: () => this.changeSelection(-1),
    }));
    this.layoutRelative(previousButton, (parent) => this.relativeRect(parent, 0.035, 0.32, 0.13, 0.095));

    const nextButton = this.panel.add(new GuiButton({
      text: '>',
      style: {
        backgroundColor: 'rgba(11, 42, 72, 0.92)',
        hoverBackgroundColor: '#155c83',
        borderColor: 'rgba(99, 230, 255, 0.52)',
        color: '#dffaff',
        hoverColor: '#ffffff',
        radius: 22,
      },
      onClick: () => this.changeSelection(1),
    }));
    this.layoutRelative(nextButton, (parent) => this.relativeRect(parent, 0.835, 0.32, 0.13, 0.095));

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
    this.layoutRelative(this.counter, (parent) => this.relativeRect(parent, 0.32, 0.755, 0.36, 0.04));

    const hint = this.panel.add(new GuiLabel({
      text: '< > / A D / 左右滑动切换',
      textAlign: 'center',
      fontSize: 12,
      style: { color: '#83aabc' },
    }));
    this.layoutRelative(hint, (parent) => this.relativeRect(parent, 0.07, 0.8, 0.86, 0.04));

    this.startButton = this.panel.add(new GuiButton({
      text: '开始出击',
      variant: 'primary',
      style: {
        backgroundColor: '#0f86b0',
        hoverBackgroundColor: '#18a8d5',
        borderColor: '#67e9ff',
        color: '#ffffff',
        hoverColor: '#ffffff',
        radius: 8,
      },
      onClick: () => options.onStart(this.selectedIndex),
    }));
    this.layoutRelative(this.startButton, (parent) => this.relativeRect(parent, 0.2, 0.87, 0.6, 0.085));

    const entity = new Entity('SkyStrikeLevelCarouselGui');
    entity.addComponent(this.root);
    options.world.addEntity(entity);
    const guiSystem = new GuiSystem(options.engine, {
      loadOp: 'clear',
      font: {
        chars: [...new Set(`${ASCII_CHARACTERS}${localizedCharacters}`)].join(''),
        fontSize: 34,
        atlasSize: 2048,
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

  show(index = this.selectedIndex, actionText = '开始出击', heading = '选择关卡'): void {
    this.active = true;
    this.selectedIndex = wrapLevelIndex(index, this.options.levels.length);
    this.heading.setText(heading);
    this.startButton.setText(actionText);
    this.root.root.setVisible(true);
    this.options.canvas.classList.add('level-carousel-active');
    this.sync();
  }

  hide(): void {
    this.active = false;
    this.pointerId = -1;
    this.root.root.setVisible(false);
    this.options.canvas.classList.remove('level-carousel-active');
  }

  changeSelection(offset: number): void {
    if (!this.active || this.options.levels.length === 0) return;
    this.selectedIndex = wrapLevelIndex(this.selectedIndex + offset, this.options.levels.length);
    this.sync();
    this.options.onSelectionChange?.(this.selectedIndex);
  }

  private sync(): void {
    const level = this.options.levels[this.selectedIndex];
    if (!level) return;
    const boss = this.options.resolveBoss(level);
    this.levelName.setText(`${String(this.selectedIndex + 1).padStart(2, '0')} · ${level.name}`);
    this.bossName.setText(`BOSS · ${boss.label}`);
    this.counter.setText(`${this.selectedIndex + 1} / ${this.options.levels.length}`);
    this.bossImage.setSource(boss.source, boss.sourceKey);
    this.panel.markDirty(GuiDirtyFlags.All);
  }

  private bindSwipeInput(): void {
    this.options.canvas.addEventListener('pointerdown', event => {
      if (!this.active || event.button !== 0) return;
      this.pointerId = event.pointerId;
      this.pointerStartX = event.clientX;
      this.options.canvas.setPointerCapture(event.pointerId);
    });
    this.options.canvas.addEventListener('pointerup', event => {
      if (!this.active || event.pointerId !== this.pointerId) return;
      const deltaX = event.clientX - this.pointerStartX;
      if (Math.abs(deltaX) >= SWIPE_THRESHOLD) this.changeSelection(deltaX < 0 ? 1 : -1);
      this.pointerId = -1;
      if (this.options.canvas.hasPointerCapture(event.pointerId)) {
        this.options.canvas.releasePointerCapture(event.pointerId);
      }
    });
    this.options.canvas.addEventListener('pointercancel', event => {
      if (event.pointerId === this.pointerId) this.pointerId = -1;
    });
  }

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
