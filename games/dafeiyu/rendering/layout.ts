import type { GuiRect } from '@haiyue/engine/gui';

export interface GameLayout {
  compact: boolean;
  header: GuiRect;
  board: GuiRect;
  sidebar: GuiRect;
  footer: GuiRect;
  modal: GuiRect;
}
export function gameLayout(width: number, height: number, room?: { width: number; height: number }): GameLayout {
  const compact = width < 760 || height > width;
  const gap = compact ? 12 : 20;
  const container = Math.min(1320, width - gap * 2);
  const x = (width - container) / 2;
  const footerHeight = compact ? 47 : 52;
  const headHeight = compact ? 94 : 71;
  const sidebarExtent = compact ? (height < 490 ? 84 : 138) : Math.max(236, Math.min(308, container * .27));
  const shelfY = gap + headHeight + gap;
  const shelfWidth = compact ? container : container - sidebarExtent - gap;
  const footerY = height - gap - footerHeight;
  const available = Math.max(28, footerY - shelfY - gap - (compact ? sidebarExtent + gap : 0));
  const shelfHeight = compact && room ? Math.min(available, (shelfWidth - 16) * room.height / room.width + 28) : available;
  const modalWidth = Math.min(container - 12, 540);
  const modalHeight = Math.min(height - 16, 482);
  return {
    compact,
    header: { x, y: gap, width: container, height: headHeight },
    board: { x, y: shelfY, width: shelfWidth, height: shelfHeight },
    sidebar: compact ? { x, y: shelfY + shelfHeight + gap, width: container, height: sidebarExtent } :
      { x: x + shelfWidth + gap, y: shelfY, width: sidebarExtent, height: shelfHeight },
    footer: { x, y: footerY, width: container, height: footerHeight },
    modal: { x: (width - modalWidth) / 2, y: (height - modalHeight) / 2, width: modalWidth, height: modalHeight },
  };
}
