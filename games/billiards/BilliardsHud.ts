import { Entity, type World } from '@haiyue/engine';
import {
  GuiButton,
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
const NARROW_BREAKPOINT = 620;

const HUD_THEME: GuiTheme = {
  fontFamily: 'Arial, Helvetica, sans-serif',
  fontSize: 16,
  radius: 6,
  colors: {
    text: '#f8fafc',
    textMuted: '#cbd5e1',
    primary: '#166534',
    danger: '#dc2626',
    background: 'rgba(6,12,18,0.76)',
    surface: 'rgba(6,12,18,0.76)',
    border: 'rgba(255,255,255,0.22)',
    hover: '#ef4444',
    active: '#b91c1c',
    disabled: '#64748b',
  },
};

export class BilliardsHud {
  private readonly score: GuiLabel;
  private readonly state: GuiLabel;

  constructor(world: World, onNewGame: () => void) {
    const entity = new Entity('Billiards HUD');
    const root = new GuiRoot({ theme: HUD_THEME });
    entity.addComponent(root);
    world.addEntity(entity);

    const title = root.add(new GuiLabel({
      x: HUD_MARGIN,
      y: 14,
      width: 260,
      height: 42,
      text: 'Billiards',
      fontSize: 34,
      style: { color: '#f8fafc' },
    }));
    this.layoutHeading(title, false);

    const help = root.add(new GuiLabel({
      x: HUD_MARGIN,
      y: 54,
      width: 500,
      height: 28,
      text: 'Drag cue ball to shoot · Sink all 10 red balls',
      fontSize: 13,
      style: { color: 'rgba(248,250,252,0.76)' },
    }));
    this.layoutHeading(help, true);

    this.score = root.add(this.createPanel('POTTED  0 / 10'));
    this.layoutPanel(this.score, 0);

    this.state = root.add(this.createPanel('STATE  Ready'));
    this.layoutPanel(this.state, 1);

    const newGame = root.add(new GuiButton({
      x: 0,
      y: 0,
      width: 122,
      height: 42,
      text: 'New Game',
      variant: 'danger',
      style: {
        radius: 6,
        backgroundColor: '#dc2626',
        hoverBackgroundColor: '#ef4444',
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
}
