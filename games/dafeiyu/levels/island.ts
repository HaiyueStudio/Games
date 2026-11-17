import type { BabaLevel, PlacedTile, Tile } from './baba-format';

type Ellipse = readonly [x: number, y: number, radiusX: number, radiusY: number];

export function islandOverworld(level: BabaLevel, shape: 'steam' | 'coral'): BabaLevel {
  const steam = shape === 'steam';
  const coast: readonly Ellipse[] = steam ? [
    [17.9, 9, 9.8, 7.3], [13.2, 14.1, 6, 3.7], [23.3, 13.4, 6.3, 4.9], [30, 16.5, 4.1, 2.7],
    [2.5, 4.4, 2, 3.1], [30, 2, 2.3, 1.55],
  ] : [[5.1, 4.1, 4.4, 3.7], [2.1, 5.8, 1.6, 2], [8, 6, 1.8, 1.6]];
  const { width, height } = level;
  const key = (x: number, y: number) => y * width + x;
  const inside = (x: number, y: number) => x > 0 && y > 0 && x < width - 1 && y < height - 1;
  const land = (x: number, y: number) => {
    const u = x + Math.sin(y * .83) * .54;
    const v = y + Math.sin(x * .81) * .53;
    return coast.some(([cx, cy, rx, ry]) => ((u - cx) / rx) ** 2 + ((v - cy) / ry) ** 2 <= 1);
  };
  const spawn = { x: Number(level.metadata.general?.selectorx), y: Number(level.metadata.general?.selectory) };
  const occupied = new Set([...level.tiles, ...level.paths, ...level.links,
    ...level.specials.filter(special => special.data.startsWith('level,')), spawn]
    .filter(({ x, y }) => Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < width && y < height)
    .map(({ x, y }) => key(x, y)));
  const canPlaceRule = (x: number, y: number) => inside(x, y) && inside(x + 2, y) &&
    [x, x + 1, x + 2].every(col => !occupied.has(key(col, y)));
  let rule = steam ? { x: 17, y: 16 } : { x: 3, y: 7 };
  if (!canPlaceRule(rule.x, rule.y)) {
    const fallback = Array.from({ length: width * height }, (_, i) => ({ x: i % width, y: Math.floor(i / width) }))
      .find(({ x, y }) => canPlaceRule(x, y) && land(x, y) && land(x + 2, y));
    if (!fallback) return level;
    rule = fallback;
  }

  const tile = (name: string, type: number, layer: number): Tile => level.catalog.get(name) ?? { name, type, layer };
  const water = tile('water', -1, 2);
  const words = [tile('text_water', 0, 20), tile('text_is', 1, 20), tile('text_stop', 2, 20)];
  const island: PlacedTile[] = words.map((word, i) => ({ ...word, x: rule.x + i, y: rule.y, dir: 0 }));
  for (const { x, y } of island) occupied.add(key(x, y));
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (occupied.has(key(x, y)) || inside(x, y) && land(x, y)) continue;
    island.push({ ...water, x, y, dir: 0 });
  }
  return { ...level, island, edges: new Set() };
}
