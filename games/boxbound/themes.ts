import type { Box, Room } from './model';
export const ROOM_THEMES = ['meadow', 'rose', 'ocean', 'violet', 'amber', 'teal'] as const;
export type RoomTheme = typeof ROOM_THEMES[number];
export const isRoomTheme = (v: unknown): v is RoomTheme => ROOM_THEMES.includes(v as RoomTheme);
const shades = {
  meadow: ['#bfd6a2', '#dce7bd', '#76967f', '#a6c1a5', '#9ab39a', '#668875'],
  rose: ['#e5a09e', '#f3beb5', '#b97177', '#d98e91', '#ce8187', '#a7616b'],
  ocean: ['#98bfd9', '#c2d8e8', '#608dac', '#89aac6', '#7f9fbb', '#527b99'],
  violet: ['#c6b0da', '#e0cee9', '#9380af', '#b7a0cd', '#aa94be', '#806b9c'],
  amber: ['#e0bb81', '#f2d7a5', '#b18a50', '#d1aa72', '#c59e66', '#9f7948'],
  teal: ['#a0d1c6', '#c4e5d9', '#629b91', '#8bbcb0', '#7daea2', '#50877f'],
};
const surfaces = ['floor', 'tile', 'wall', 'wallTop', 'stud', 'edge'] as const;
export const THEME_COLORS: Record<string, [number, number, number, number]> = {};
const keys = Object.fromEntries(ROOM_THEMES.map((theme) => [theme, Object.fromEntries(surfaces.map((surface, i) => {
  const key = `theme/${theme}/${surface}`, hex = shades[theme][i]!;
  THEME_COLORS[key] = [parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255, 1];
  return [surface, key];
}))])) as Record<RoomTheme, Record<typeof surfaces[number], string>>;
export const roomMaterialKeys = (theme: RoomTheme) => keys[theme];
export const MIN_ROOM_THEME_CONTRAST = 80;
/** Angular separation of the checkerboard base colors (0–180 degrees). */
export function roomThemeContrast(a: RoomTheme, b: RoomTheme): number {
  const hue = (theme: RoomTheme) => {
    const [r,g,b] = THEME_COLORS[keys[theme].floor]!;
    const high=Math.max(r,g,b), low=Math.min(r,g,b), d=high-low;
    return (((high===r ? (g-b)/d : high===g ? 2+(b-r)/d : 4+(r-g)/d)*60)%360+360)%360;
  };
  const distance=Math.abs(hue(a)-hue(b));
  return Math.min(distance,360-distance);
}
export function fallbackRoomTheme(id: string): RoomTheme {
  let hash = 0;
  for (const c of id) hash = (Math.imul(hash, 31) + c.charCodeAt(0)) >>> 0;
  return ROOM_THEMES[hash % ROOM_THEMES.length]!;
}
/** Color the authored finite graph once. Moving a container never recolors its
 * interior; self/clone occurrences retain their shared room's identity. */
export function assignRoomThemes(rooms: Record<string, Room>, boxes: Box[]): Map<string, RoomTheme> {
  const neighbors = new Map(Object.keys(rooms).map((id) => [id, new Set<string>()]));
  const contents = new Map<string, Set<string>>();
  for (const b of boxes) if (b.inside && b.inside !== b.room) {
    neighbors.get(b.room)?.add(b.inside); neighbors.get(b.inside)?.add(b.room);
    if (!contents.has(b.room)) contents.set(b.room,new Set());
    contents.get(b.room)!.add(b.inside);
  }
  const result = new Map<string, RoomTheme>();
  for (const room of Object.values(rooms)) if (room.theme) result.set(room.id, room.theme);
  if (!result.has('world')) result.set('world', 'meadow');
  if (rooms['pp-hub'] && !result.has('pp-hub')) result.set('pp-hub', 'rose');
  const pinned = new Set(result.keys());
  const order = Object.keys(rooms).sort((a,b)=>neighbors.get(b)!.size-neighbors.get(a)!.size||a.localeCompare(b));
  for (const id of order) {
    if (result.has(id)) continue;
    const adjacent = [...neighbors.get(id)!].flatMap(n => result.has(n) ? [result.get(n)!] : []);
    const start = ROOM_THEMES.indexOf(fallbackRoomTheme(id));
    const choices = ROOM_THEMES.map((_, i) => ROOM_THEMES[(i + start) % ROOM_THEMES.length]!);
    // First reject similar pastel hues, then distinguish maps displayed beside
    // each other. Galleries keep varied colors instead of all picking the same
    // complementary hue. Selection happens once, never on movement or zoom.
    const contrast = (c: RoomTheme) => Math.min(180,...adjacent.map(n=>roomThemeContrast(c,n)));
    const siblings = [...contents.values()].filter(group=>group.has(id))
      .flatMap(group=>[...group].filter(n=>n!==id&&result.has(n)).map(n=>result.get(n)!));
    const candidates=choices.filter(c=>contrast(c)>=90);
    const pool=candidates.length ? candidates : choices;
    const repeats=(c:RoomTheme)=>siblings.filter(n=>n===c).length;
    const separation=(c:RoomTheme)=>Math.min(180,...siblings.map(n=>roomThemeContrast(c,n)));
    pool.sort((a,b)=>candidates.length
      ? repeats(a)-repeats(b)||separation(b)-separation(a)||contrast(b)-contrast(a)
      : contrast(b)-contrast(a));
    result.set(id, pool[0]!);
  }
  // Closing a cycle can constrain an earlier choice. Repair against *all*
  // neighbors; each change removes a weak edge without introducing another.
  for(let changed=true;changed;){
    changed=false;
    for(const id of order){
      if(pinned.has(id))continue;
      const contrast=(c:RoomTheme)=>Math.min(180,...[...neighbors.get(id)!].map(n=>roomThemeContrast(c,result.get(n)!)));
      if(contrast(result.get(id)!)>=MIN_ROOM_THEME_CONTRAST)continue;
      const choice=[...ROOM_THEMES].sort((a,b)=>contrast(b)-contrast(a))[0]!;
      if(contrast(choice)>=MIN_ROOM_THEME_CONTRAST){result.set(id,choice);changed=true;}
    }
  }
  return result;
}
