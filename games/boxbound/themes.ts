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
export function fallbackRoomTheme(id: string): RoomTheme {
  let hash = 0;
  for (const c of id) hash = (Math.imul(hash, 31) + c.charCodeAt(0)) >>> 0;
  return ROOM_THEMES[hash % ROOM_THEMES.length]!;
}
/** Color the authored finite graph once. Moving a container never recolors its
 * interior; self/clone occurrences retain their shared room's identity. */
export function assignRoomThemes(rooms: Record<string, Room>, boxes: Box[]): Map<string, RoomTheme> {
  const neighbors = new Map(Object.keys(rooms).map((id) => [id, new Set<string>()]));
  for (const b of boxes) if (b.inside && b.inside !== b.room) {
    neighbors.get(b.room)?.add(b.inside); neighbors.get(b.inside)?.add(b.room);
  }
  const result = new Map<string, RoomTheme>();
  for (const room of Object.values(rooms)) if (room.theme) result.set(room.id, room.theme);
  if (!result.has('world')) result.set('world', 'meadow');
  if (rooms['pp-hub'] && !result.has('pp-hub')) result.set('pp-hub', 'rose');
  const order = Object.keys(rooms).sort((a, b) => neighbors.get(b)!.size - neighbors.get(a)!.size || a.localeCompare(b));
  for (const id of order) {
    if (result.has(id)) continue;
    const used = new Set([...neighbors.get(id)!].map((n) => result.get(n)));
    const start = ROOM_THEMES.indexOf(fallbackRoomTheme(id));
    const choices = ROOM_THEMES.map((_, i) => ROOM_THEMES[(i + start) % ROOM_THEMES.length]!);
    result.set(id, choices.find((c) => !used.has(c)) ?? choices[0]!);
  }
  return result;
}
