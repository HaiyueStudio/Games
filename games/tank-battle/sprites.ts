/** Original 16×16 pixel artwork. Shared by the asset exporter and sprite renderer. */
export interface PixelSprite { name: string; pixels: string[][] }
export const SPRITES: PixelSprite[] = [];
function sprite(name: string, paint: (rect: (x: number, y: number, w: number, h: number, color: string) => void) => void): void {
  const pixels = Array.from({ length: 16 }, () => Array<string>(16).fill(''));
  paint((x, y, w, h, color) => {
    for (let py = y; py < y + h; py++) for (let px = x; px < x + w; px++) {
      if (px >= 0 && px < 16 && py >= 0 && py < 16) pixels[py]![px] = color;
    }
  });
  SPRITES.push({ name, pixels });
}
sprite('ground', r => {
  r(0, 0, 16, 16, '#22291f');
  r(2, 3, 1, 1, '#303629'); r(11, 10, 2, 1, '#303629'); r(7, 15, 1, 1, '#191f19');
});
sprite('brick', r => {
  r(0, 0, 16, 16, '#392e25');
  for (let y = 0; y < 16; y += 4) for (let x = (y % 8 ? -4 : 0); x < 16; x += 8) {
    r(x, y, 7, 3, '#b8663f'); r(x, y, 7, 1, '#d48a53'); r(x, y + 2, 7, 1, '#925035'); r(x, y, 1, 2, '#c87947');
  }
});
sprite('steel', r => {
  r(0, 0, 16, 16, '#344344'); r(1, 1, 14, 14, '#708383'); r(2, 2, 12, 2, '#c0cfc5');
  r(2, 4, 2, 9, '#9dafa5'); r(4, 4, 10, 9, '#82958c'); r(3, 13, 11, 1, '#4d605c');
  for (const x of [3, 12]) for (const y of [3, 12]) r(x, y, 1, 1, '#354747');
  r(6, 6, 5, 1, '#a6b7ad'); r(6, 7, 1, 4, '#657b72');
});
sprite('snow', r => {
  r(0, 0, 16, 16, '#b6d5d5'); r(0, 0, 16, 3, '#d5e9e0'); r(1, 4, 7, 3, '#c8e2df');
  r(10, 9, 6, 2, '#90bcbc'); r(2, 12, 5, 2, '#e1eee1'); r(12, 2, 2, 1, '#f1f4d8');
  r(7, 8, 1, 1, '#edf3e3'); r(3, 9, 2, 1, '#93baba');
});
for (let frame = 0; frame < 2; frame++) sprite(`water-${frame}`, r => {
  r(0, 0, 16, 16, '#254b5a');
  for (let y = 1; y < 16; y += 5) {
    const x = ((y * 3 + frame * 4) % 10) - 2;
    r(x, y, 8, 1, '#438291'); r(x + 2, y + 1, 6, 1, '#326c7a'); r(x + 7, y + 3, 4, 1, '#193e50');
  }
});
sprite('forest', r => {
  r(1, 2, 14, 13, '#183c2a'); r(3, 0, 10, 16, '#214b2e');
  for (const [x, y] of [[2, 2], [9, 1], [5, 7], [11, 10], [0, 11]]) {
    r(x!, y!, 5, 4, '#3f6938'); r(x!, y!, 3, 1, '#739044'); r(x! + 1, y! + 1, 2, 1, '#587e3e');
  }
  r(8, 4, 3, 2, '#2a582f'); r(2, 8, 2, 1, '#91a653'); r(13, 6, 2, 1, '#6c8b40');
});
sprite('base', r => {
  r(1, 1, 14, 14, '#272e2b'); r(2, 2, 12, 12, '#b8ae7e'); r(3, 3, 10, 10, '#434c3f');
  r(7, 4, 2, 7, '#f5dc86'); r(4, 5, 2, 3, '#ddba61'); r(10, 5, 2, 3, '#ddba61');
  r(3, 4, 1, 3, '#ddba61'); r(12, 4, 1, 3, '#ddba61'); r(5, 7, 6, 2, '#f5dc86');
  r(6, 10, 4, 1, '#ddba61'); r(5, 12, 6, 1, '#eee0a3');
});
sprite('base-destroyed', r => {
  r(2, 7, 11, 7, '#33362d'); r(3, 6, 3, 3, '#69604b'); r(8, 9, 5, 3, '#80704c');
  r(4, 12, 5, 2, '#454838'); r(7, 4, 2, 4, '#d2793d'); r(7, 5, 1, 2, '#efbb61');
});
const PALETTES = {
  p1: ['#f7db79', '#cd9f45', '#826733'], p2: ['#b6e3ed', '#559db3', '#335e76'],
  scout: ['#efe4c0', '#b8ab86', '#71694f'], runner: ['#ed9472', '#b45844', '#683b36'],
  gunner: ['#d1b9df', '#9377a5', '#564b67'], heavy: ['#bdd394', '#7c9469', '#4d6146'],
  flash: ['#fff4db', '#ee7659', '#963e37'],
};
for (const team of ['p1', 'p2', 'scout', 'runner', 'gunner', 'heavy', 'flash'] as const) {
  const levels = team === 'p1' || team === 'p2' ? 4 : 1;
  for (let level = 0; level < levels; level++) for (let frame = 0; frame < 2; frame++) sprite(`${team}-${level}-${frame}`, r => {
    const [light, main, dark] = PALETTES[team] as [string, string, string];
    const heavy = team === 'heavy' || level === 3;
    r(1, 4, 4, 11, '#171f21'); r(11, 4, 4, 11, '#171f21');
    for (let y = 4; y < 15; y += 3) { r(1, y + frame, 3, 1, '#809083'); r(12, y + frame, 3, 1, '#657367'); }
    r(4, 5, 8, 9, dark); r(4, 5, 8, 2, light); r(5, 7, 6, 6, main);
    r(heavy ? 3 : 5, 7, heavy ? 10 : 6, 5, main);
    r(6, 6, 4, 6, dark); r(6, 6, 4, 4, light); r(7, 7, 3, 3, main);
    r(7, 0, 2, 7, dark); r(7, 0, 1, 7, light); r(7, 0, 2, 1, '#e1dfba');
    r(6, 13, 4, 1, '#202b28'); r(5, 12, 1, 1, light); r(10, 12, 1, 1, light);
    if (team === 'runner') { r(6, 11, 4, 1, '#f7c989'); r(6, 12, 1, 1, '#f7c989'); }
    if (team === 'gunner' || level >= 1) { r(6, 1, 4, 2, dark); r(6, 1, 4, 1, light); }
    if (heavy) { r(4, 9, 1, 3, light); r(11, 9, 1, 3, light); r(6, 11, 4, 1, light); }
    if (level >= 2) { r(3, 4, 2, 2, main); r(11, 4, 2, 2, main); }
  });
}
const ICONS: Record<string, string[]> = {
  star: ['...#...', '...#...', '#######', '.#####.', '..###..', '.##.##.', '.#...#.'],
  shield: ['#######', '#.....#', '#..#..#', '#.###.#', '.#.#.#.', '.#...#.', '..###..'],
  bomb: ['....##.', '...#...', '..###..', '.#####.', '.#####.', '.#####.', '..###..'],
  clock: ['..###..', '.#...#.', '#..#..#', '#..##.#', '#.....#', '.#...#.', '..###..'],
  shovel: ['..###..', '..#.#..', '...#...', '...#...', '.#####.', '.#####.', '..###..'],
  life: ['...#...', '...#...', '.#####.', '#######', '#######', '#######', '.#...#.'],
};
for (const [name, rows] of Object.entries(ICONS)) sprite(`item-${name}`, r => {
  r(1, 1, 14, 14, '#1d2828'); r(1, 1, 14, 1, '#e9c76e'); r(1, 14, 14, 1, '#9d824f');
  r(1, 2, 1, 12, '#e9c76e'); r(14, 2, 1, 12, '#9d824f'); r(3, 3, 10, 10, '#32443c');
  rows.forEach((row, y) => [...row].forEach((p, x) => { if (p === '#') r(x + 5, y + 5, 1, 1, '#f7e3a0'); }));
});
export const SPRITE_INDEX = Object.fromEntries(SPRITES.map((s, i) => [s.name, i])) as Record<string, number>;
export const ATLAS_COLUMNS = 8;
