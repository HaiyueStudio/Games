export interface DesktopRect { x: number; y: number; width: number; height: number }

export function desktopLayout(width: number, height: number) {
  const compact = width < 720, shallow = width >= 600 && height < 520;
  const gap = compact ? 14 : 24, header = compact ? 58 : shallow ? 60 : 70, footer = 34;
  const sidebar = compact ? 0 : width < 1120 ? 76 : 184;
  const navigation = compact ? 44 : 0;
  const left = sidebar + gap, top = header + navigation + gap;
  const availableWidth = width - left - gap, availableHeight = height - top - footer - gap;
  const heroWidth = shallow ? availableWidth * .42 : availableWidth;
  const heroHeight = shallow ? availableHeight : compact && height < 650 ? 126 : Math.min(compact ? 192 : 286, Math.max(126, availableHeight * .38));
  const hero = { x: left, y: top, width: heroWidth, height: heroHeight };
  const collection = { x: shallow ? left + heroWidth + gap : left, y: shallow ? top : top + heroHeight + gap,
    width: shallow ? availableWidth - heroWidth - gap : availableWidth,
    height: shallow ? availableHeight : availableHeight - heroHeight - gap };
  const stacked = collection.width < 680;
  const filterRows = collection.width < 410 && height >= 650 ? 2 : 1;
  const shelfTop = collection.y + (stacked ? 76 : 42) + filterRows * 34 + 10;
  const shelf = { x: collection.x, y: shelfTop, width: collection.width, height: Math.max(60, height - footer - gap - shelfTop) };
  const columns = Math.max(2, Math.min(5, Math.floor((shelf.width + 14) / (compact ? 148 : shallow ? 145 : 210))));
  const cardWidth = (shelf.width - (columns - 1) * 14 - 8) / columns;
  const cardHeight = Math.round(cardWidth * (shallow ? .44 : .58) + (shallow ? 46 : 50));
  return { width, height, compact, shallow, gap, header, footer, sidebar, navigation, hero, collection, shelf, columns, cardWidth, cardHeight, stacked, filterRows };
}
