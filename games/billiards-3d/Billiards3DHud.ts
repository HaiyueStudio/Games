import { Entity, type World } from '@haiyue/engine';
import {
  GuiButton,
  GuiDirtyFlags,
  GuiLabel,
  GuiRoot,
  type GuiElement,
  type GuiRect,
  type GuiTheme,
} from '@haiyue/engine/gui';

const HUD_MARGIN = 20;
const PANEL_WIDTH = 136;
const PANEL_HEIGHT = 52;
const PANEL_GAP = 10;
const POWER_WIDTH = 180;
const POWER_HEIGHT = 10;
const NARROW_BREAKPOINT = 620;

const HUD_THEME: GuiTheme = {
  fontFamily: 'Arial, Helvetica, sans-serif',
  fontSize: 16,
  radius: 6,
  colors: {
    text: '#f8fafc',
    textMuted: '#cbd5e1',
    primary: '#2563eb',
    danger: '#dc2626',
    background: 'rgba(6,12,18,0.76)',
    surface: 'rgba(6,12,18,0.76)',
    border: 'rgba(255,255,255,0.22)',
    hover: '#3b82f6',
    active: '#1d4ed8',
    disabled: '#64748b',
  },
};

export class Billiards3DHud {
  private readonly score: GuiLabel;
  private readonly state: GuiLabel;
  private readonly powerTrack: GuiLabel;
  private readonly powerFill: GuiLabel;
  private power = 0;

  constructor(world: World, onNewGame: () => void) {
    const entity = new Entity('Billiards 3D HUD');
    const root = new GuiRoot({ theme: HUD_THEME });
    entity.addComponent(root);
    world.addEntity(entity);

    const title = root.add(new GuiLabel({
      x: HUD_MARGIN,
      y: 14,
      width: 280,
      height: 42,
      text: '3D Billiards',
      fontSize: 34,
      style: { color: '#f8fafc' },
    }));
    this.layoutHeading(title, false);

    const help = root.add(new GuiLabel({
      x: HUD_MARGIN,
      y: 54,
      width: 520,
      height: 28,
      text: 'Orbit to aim · Drag the cue ball downward to shoot · Sink all 10 red balls',
      fontSize: 13,
      style: { color: 'rgba(248,250,252,0.76)' },
    }));
    this.layoutHeading(help, true);

    this.score = root.add(this.createPanel('POTTED  0 / 10'));
    this.layoutPanel(this.score, 0);

    this.state = root.add(this.createPanel('STATE  Ready'));
    this.layoutPanel(this.state, 1);

    this.powerTrack = root.add(new GuiLabel({
      x: HUD_MARGIN,
      y: 0,
      width: POWER_WIDTH,
      height: POWER_HEIGHT,
      text: '',
      visible: false,
      style: {
        backgroundColor: 'rgba(255,255,255,0.16)',
        borderColor: 'rgba(255,255,255,0.12)',
        radius: POWER_HEIGHT / 2,
      },
    }));
    this.layoutPowerTrack(this.powerTrack);

    this.powerFill = root.add(new GuiLabel({
      x: HUD_MARGIN,
      y: 0,
      width: 0,
      height: POWER_HEIGHT,
      text: '',
      visible: false,
      style: {
        backgroundColor: '#22c55e',
        radius: POWER_HEIGHT / 2,
      },
    }));
    this.layoutPowerFill(this.powerFill);

    const newGame = root.add(new GuiButton({
      x: 0,
      y: 0,
      width: 122,
      height: 42,
      text: 'New Game',
      variant: 'primary',
      style: {
        radius: 6,
        backgroundColor: '#2563eb',
        hoverBackgroundColor: '#3b82f6',
        color: '#ffffff',
        hoverColor: '#ffffff',
      },
      onClick: onNewGame,
    }));
    this.layoutNewGameButton(newGame);
  }

  setScore(potted: number): void {
    this.score.setText(`POTTED  ${potted} / 10`);
  }

  setState(state: string): void {
    this.state.setText(`STATE  ${state}`);
  }

  showPower(power: number): void {
    this.power = Math.max(0, Math.min(1, power));
    this.powerTrack.setVisible(true);
    this.powerFill.setVisible(true);
    this.powerFill.setStyle({ backgroundColor: this.powerColor() });
    this.powerFill.markDirty(GuiDirtyFlags.Layout | GuiDirtyFlags.Visual);
    this.setState(`Power ${Math.round(this.power * 100)}%`);
  }

  hidePower(): void {
    this.power = 0;
    this.powerTrack.setVisible(false);
    this.powerFill.setVisible(false);
  }

  private createPanel(text: string): GuiLabel {
    return new GuiLabel({
      x: 0,
      y: 0,
      width: PANEL_WIDTH,
      height: PANEL_HEIGHT,
      text,
      fontSize: 15,
      textAlign: 'center',
      style: {
        backgroundColor: 'rgba(6,12,18,0.76)',
        borderColor: 'rgba(255,255,255,0.22)',
        color: '#f8fafc',
        radius: 6,
        padding: 8,
      },
    });
  }

  private layoutHeading(element: GuiElement, help: boolean): void {
    const layout = element.layout.bind(element);
    element.layout = (parentRect: GuiRect) => {
      layout(parentRect);
      const narrow = parentRect.width < NARROW_BREAKPOINT;
      element.rect.x = HUD_MARGIN;
      element.rect.y = help ? 54 : 14;
      element.rect.width = narrow
        ? Math.max(1, parentRect.width - HUD_MARGIN * 2)
        : Math.min(element.rect.width, Math.max(1, parentRect.width - HUD_MARGIN * 2));
    };
  }

  private layoutPanel(element: GuiElement, index: number): void {
    const layout = element.layout.bind(element);
    element.layout = (parentRect: GuiRect) => {
      layout(parentRect);
      if (parentRect.width < NARROW_BREAKPOINT) {
        const totalWidth = PANEL_WIDTH * 2 + PANEL_GAP;
        element.rect.x = Math.max(HUD_MARGIN, (parentRect.width - totalWidth) * 0.5)
          + index * (PANEL_WIDTH + PANEL_GAP);
        element.rect.y = 92;
        return;
      }
      element.rect.x = parentRect.width - HUD_MARGIN - PANEL_WIDTH
        - index * (PANEL_WIDTH + PANEL_GAP);
      element.rect.y = HUD_MARGIN;
    };
  }

  private layoutPowerTrack(element: GuiElement): void {
    const layout = element.layout.bind(element);
    element.layout = (parentRect: GuiRect) => {
      layout(parentRect);
      element.rect.x = HUD_MARGIN;
      element.rect.y = parentRect.height - HUD_MARGIN - POWER_HEIGHT;
      element.rect.width = Math.min(POWER_WIDTH, Math.max(1, parentRect.width - HUD_MARGIN * 2));
    };
  }

  private layoutPowerFill(element: GuiElement): void {
    const layout = element.layout.bind(element);
    element.layout = (parentRect: GuiRect) => {
      layout(parentRect);
      element.rect.x = this.powerTrack.rect.x;
      element.rect.y = this.powerTrack.rect.y;
      element.rect.width = this.powerTrack.rect.width * this.power;
      element.rect.height = this.powerTrack.rect.height;
    };
  }

  private layoutNewGameButton(element: GuiElement): void {
    const layout = element.layout.bind(element);
    element.layout = (parentRect: GuiRect) => {
      layout(parentRect);
      element.rect.x = parentRect.width < NARROW_BREAKPOINT
        ? (parentRect.width - element.rect.width) * 0.5
        : parentRect.width - HUD_MARGIN - element.rect.width;
      element.rect.y = parentRect.height - HUD_MARGIN - element.rect.height;
    };
  }

  private powerColor(): string {
    if (this.power >= 0.72) return '#ef4444';
    if (this.power >= 0.38) return '#facc15';
    return '#22c55e';
  }
}
