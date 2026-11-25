import type { LevelPack } from '../levels/pack';
import type { Campaign } from '../rules/campaign';
import { Puzzle } from '../rules/game';
import type { OfficialProgress } from '../rules/progress';

export type Room = { index: number; puzzle: Puzzle; entrance?: string | undefined };

/** Prepare the entire saved stack before the caller changes or saves any room. */
export async function restoreRooms(pack: LevelPack, saved: OfficialProgress, campaign: Campaign,
  signal: AbortSignal, cached: (index: number) => Puzzle | undefined = () => undefined): Promise<Room[]> {
  if (!saved.rooms.length) throw Error('The saved room stack is empty');
  const indices = saved.rooms.map(room => pack.entries.findIndex(entry => entry.id === room.id));
  if (indices.some(index => index < 0)) throw Error('A saved room is missing from the level pack');
  const prior = indices.map(cached);
  const levels = await Promise.all(indices.map((index, slot) => prior[slot]?.level ?? pack.entries[index]!.read()));
  signal.throwIfAborted();
  return levels.map((level, slot) => {
    const { state, entrance } = saved.rooms[slot]!;
    if (state.units.some(unit => unit.x < 0 || unit.y < 0 || unit.x >= level.width || unit.y >= level.height)) {
      throw Error('The saved board does not fit its level');
    }
    return { index: indices[slot]!, entrance, puzzle: prior[slot] ?? new Puzzle(level, state, campaign) };
  });
}
