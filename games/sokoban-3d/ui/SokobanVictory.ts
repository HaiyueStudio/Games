import { GuiButton, GuiElement, GuiLabel, GuiModal, type GuiRect } from '@haiyue/engine/gui';

export const VICTORY_CHARS = '全部归位整理完成胜利关卡步数已完成下一关再玩一次选择关卡查看仓库返回选关关卡全通关第已解锁新的挑战继续保持★✓';

interface VictoryResult {
  level: number;
  total: number;
  name: string;
  moves: number;
  completed: number;
}

/** One reusable engine GUI modal; no DOM controls or per-win event listeners. */
export class SokobanVictory extends GuiModal {
  readonly nextButton: GuiButton;
  private readonly medal: GuiElement;
  private readonly check: GuiLabel;
  private readonly stars: GuiLabel;
  private readonly level: GuiLabel;
  private readonly stats: GuiElement;
  private readonly moves: GuiLabel;
  private readonly progress: GuiLabel;
  private readonly movesCaption: GuiLabel;
  private readonly progressCaption: GuiLabel;
  private readonly replayButton: GuiButton;
  private readonly levelsButton: GuiButton;
  private readonly dismissButton: GuiButton;

  constructor(actions: { next: () => void; replay: () => void; levels: () => void }) {
    super({ id: 'sokoban-victory', width: 440, height: 388, title: '全部归位！',
      showConfirmButton: false, showCancelButton: false, showCloseButton: false,
      closeOnBackdrop: false, backdropColor: 'rgba(4,15,18,0.72)',
      style: { backgroundColor: '#183b3d', borderColor: '#c5a366', color: '#fff0cb', radius: 24 } });
    this.titleLabel.setTextAlign('center'); this.titleLabel.setStyle({ padding: 0 });
    this.messageLabel.setTextAlign('center'); this.messageLabel.setStyle({ color: '#a9c8bb', padding: 0 });
    this.dismissButton = this.add(new GuiButton({ id: 'sokoban-victory-close', text: 'X', onClick: () => this.hide(),
      style: { color: '#b6c9ba', backgroundColor: 'transparent', borderColor: 'transparent', radius: 8, padding: 0 } }));
    const label = (id: string, text: string, color: string) => this.add(new GuiLabel({ id, text,
      textAlign: 'center', pointerFilter: 'ignore', style: { color, padding: 0 } }));
    this.medal = this.add(new GuiElement({ pointerFilter: 'ignore', style: { backgroundColor: '#d7b46e', borderColor: '#f6d693', radius: 38 } }));
    this.check = label('sokoban-victory-check', '✓', '#183b3d');
    this.stars = label('sokoban-victory-stars', '★     ★', '#e7c888');
    this.level = label('sokoban-victory-level', '', '#dac59c');
    this.stats = this.add(new GuiElement({ pointerFilter: 'ignore', style: { backgroundColor: '#24494a', radius: 14 } }));
    this.moves = label('sokoban-victory-moves', '', '#fff0cb');
    this.progress = label('sokoban-victory-progress', '', '#8fdbb5');
    this.movesCaption = label('sokoban-victory-moves-caption', '完成步数', '#a9c8bb');
    this.progressCaption = label('sokoban-victory-progress-caption', '已完成关卡', '#a9c8bb');
    const button = (id: string, text: string, onClick: () => void, primary = false) => this.add(new GuiButton({ id, text, onClick,
      hoverTransition: true, style: { backgroundColor: primary ? '#d7b46e' : '#284f50', borderColor: primary ? '#f6d693' : '#64857b',
        color: primary ? '#173638' : '#ecdfc6', radius: 11, padding: 0 } }));
    this.nextButton = button('sokoban-victory-next', '下一关 →', actions.next, true);
    this.replayButton = button('sokoban-victory-replay', '再玩一次', actions.replay);
    this.levelsButton = button('sokoban-victory-levels', '选择关卡', actions.levels);
  }

  showResult(result: VictoryResult): void {
    this.setTitle(result.completed === result.total ? '关卡全通关！' : '全部归位！');
    this.setMessage(result.name);
    this.level.setText(`第 ${result.level} / ${result.total} 关 · 整理完成`);
    this.moves.setText(String(result.moves));
    this.progress.setText(`${result.completed} / ${result.total}`);
    this.nextButton.setText(result.level === result.total ? '返回选关 →' : '下一关 →');
    this.show();
  }

  override layout(area: GuiRect): void {
    const scale = Math.min(1, Math.max(1, area.width - 28) / 440, Math.max(1, area.height - 24) / 388);
    this.rect = { ...area };
    Object.assign(this.dialogRect, { x: area.x + (area.width - 440 * scale) / 2, y: area.y + (area.height - 388 * scale) / 2, width: 440 * scale, height: 388 * scale });
    const place = (node: GuiElement, x: number, y: number, width: number, height: number, fontSize?: number) => {
      Object.assign(node.rect, { x: this.dialogRect.x + x * scale, y: this.dialogRect.y + y * scale, width: width * scale, height: height * scale });
      if (node instanceof GuiLabel) node.setFontSize((fontSize ?? 14) * scale);
      else if (node instanceof GuiButton) node.setStyle({ fontSize: (fontSize ?? 15) * scale });
    };
    place(this.dismissButton, 396, 12, 32, 32, 15);
    place(this.medal, 184, 24, 72, 72);
    place(this.check, 184, 25, 72, 68, 43);
    place(this.stars, 105, 38, 230, 38, 23);
    place(this.titleLabel, 24, 106, 392, 42, 31);
    place(this.level, 24, 152, 392, 24, 13);
    place(this.messageLabel, 24, 178, 392, 24, 14);
    place(this.stats, 28, 214, 384, 76);
    place(this.moves, 38, 218, 172, 38, 29);
    place(this.progress, 230, 218, 172, 38, 29);
    place(this.movesCaption, 38, 259, 172, 22, 12);
    place(this.progressCaption, 230, 259, 172, 22, 12);
    place(this.replayButton, 28, 310, 119, 48);
    place(this.levelsButton, 155, 310, 119, 48);
    place(this.nextButton, 282, 310, 130, 48);
  }
}
