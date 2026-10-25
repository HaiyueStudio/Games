/** Logical carousel coordinates: independent of the GUI layout's next-frame rectangles. */
export function artworkWindow(count: number, scroll: number, width: number, cardWidth: number, gap: number, inset: number) {
  if (!count || width <= 0) return { capacity: 0, visible: [] as number[], indices: [] as number[] };
  const stride = cardWidth + gap;
  const first = Math.max(0, Math.floor((Math.max(0, scroll) - inset - cardWidth) / stride) + 1);
  const last = Math.min(count - 1, Math.ceil((Math.max(0, scroll) + width - inset) / stride) - 1);
  const visible = Array.from({ length: Math.max(0, last - first + 1) }, (_, index) => first + index);
  const indices = Array.from({ length: Math.max(0, Math.min(count - 1, last + 1) - Math.max(0, first - 1) + 1) }, (_, index) => Math.max(0, first - 1) + index);
  // At most two partially visible end cards, plus one prefetched card on either side.
  return { capacity: Math.min(count, Math.ceil((width + cardWidth) / stride) + 2), visible, indices };
}
