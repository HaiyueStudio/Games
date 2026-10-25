export interface DesktopRect { x: number; y: number; width: number; height: number }
export const SHELF_INSET = 12;
export const CARD_GAP = 16;

export function desktopLayout(width: number, height: number) {
  const compact = width < 720, shallow = width >= 600 && height < 520;
  const gap = compact || shallow ? 14 : 28, header = width < 600 ? 112 : width < 1000 ? 62 : 78, footer = 34;
  const left = gap, top = header + gap;
  const availableWidth = width - left - gap;
  const cardWidth = shallow ? 144 : compact ? 160 : 200;
  const cardHeight = Math.round(cardWidth * .625);
  const shelfHeight = cardHeight + SHELF_INSET * 2 + 8;
  const sideArrows = width >= 600;
  const shelf = { x: left + (sideArrows ? 44 : 0), y: height - footer - gap - shelfHeight, width: availableWidth - (sideArrows ? 88 : 0), height: shelfHeight };
  const heroHeight = Math.min(compact ? height < 650 ? 126 : 220 : 286, shelf.y - gap - top - (sideArrows ? 0 : 40));
  const hero = { x: left, y: top, width: availableWidth, height: heroHeight };
  return { width, height, compact, shallow, gap, header, footer, hero, shelf, columns: 1, cardWidth, cardHeight };
}
