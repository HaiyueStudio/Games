import { eq, gateOpen, platePressed, type Action, type State, type GateRecoil, type PlayerCrossing } from './model';
import { finishedLevel } from './completion';
import { GATE_RECOIL_DELAY_MS, movementDuration } from './visuals';
export const SOUND_NAMES = ['step', 'jump', 'push', 'gate-up', 'gate-down', 'button', 'land', 'recoil', 'complete', 'enter', 'exit'] as const;
export type SoundName = typeof SOUND_NAMES[number];
export interface SoundCue { name: SoundName; delay: number }
/** Derive audible events from committed state changes; blocked inputs are silent. */
export function soundCues(before: State, after: State, action?: Action, recoil?: GateRecoil, alreadyJumping = false, playerCrossing?: PlayerCrossing): SoundCue[] {
  const cues: SoundCue[] = [];
  const add = (name: SoundName, delay = 0) => { if (!cues.some((c) => c.name === name)) cues.push({ name, delay }); };
  if (playerCrossing || before.player.room !== after.player.room || before.player.route.length !== after.player.route.length)
    add((playerCrossing?.entering ?? (after.player.route.length > before.player.route.length)) ? 'enter' : 'exit');
  if (action && finishedLevel(after) !== null && finishedLevel(after) !== finishedLevel(before)) add('complete');
  const sameRoom = before.player.room === after.player.room;
  const moved = sameRoom && !eq(before.player.pos, after.player.pos);
  if (action) {
    const pushed = after.boxes.some((b) => {
      const old = before.boxes.find((o) => o.id === b.id);
      return old && (old.room !== b.room || !eq(old.pos, b.pos));
    });
    if (pushed) add('push');
    if (action.type === 'move' && action.jump && !alreadyJumping) add('jump');
    else if (moved && !playerCrossing && !pushed && !(action.type === 'move' && action.jump) && before.player.pos[1] === after.player.pos[1]) add('step');
    if (moved && after.player.pos[1] < before.player.pos[1])
      add('land', movementDuration(before.player.pos, after.player.pos, action.type === 'move' && action.jump));
  }
  for (const room of Object.values(after.rooms)) {
    if (room.id !== before.player.room && room.id !== after.player.room) continue;
    for (const button of room.buttons ?? [])
      if (!platePressed(before, room.id, button) && platePressed(after, room.id, button)) add('button');
    for (const gate of room.gates ?? []) {
      const was = gateOpen(before, room.id, gate), open = gateOpen(after, room.id, gate);
      if (was !== open) add(open ? 'gate-down' : 'gate-up', recoil?.gate === gate.id && recoil.room === room.id ? GATE_RECOIL_DELAY_MS : 0);
    }
  }
  if (recoil) add('recoil', GATE_RECOIL_DELAY_MS);
  return cues;
}
