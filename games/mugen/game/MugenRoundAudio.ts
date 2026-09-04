import type { MugenMatchEvent, MugenMatchSnapshot } from '../runtime/match/MugenMatchState';

export type MugenRoundAudioCueKind = 'round' | 'fight' | 'ko' | 'double-ko' | 'character-ko';

export interface MugenRoundAudioCue {
  readonly kind: MugenRoundAudioCueKind;
  readonly owner: 'system' | string;
  readonly group: number;
  readonly item: number;
  readonly channel: string;
  readonly priority: number;
}

type MugenRoundAudioState = Pick<MugenMatchSnapshot, 'roundNumber' | 'roundWinnerId' | 'fighters'>;

/** Motif sounds use group 0 and one-based round numbers for the round announcement. */
export function initialMugenRoundAudioCues(roundNumber: number): readonly MugenRoundAudioCue[] {
  return Object.freeze([systemCue('round', 0, Math.max(1, Math.min(9, Math.trunc(roundNumber))), 'round-announcer', 70)]);
}

/** Derives presentation-only audio from deterministic round transitions. */
export function planMugenRoundAudioCues(
  state: MugenRoundAudioState,
  events: readonly MugenMatchEvent[],
  koSoundSuppressedFighters: ReadonlySet<string> = new Set<string>(),
): readonly MugenRoundAudioCue[] {
  const cues: MugenRoundAudioCue[] = [];
  const explicitKoSounds = new Set(events.filter(isExplicitCharacterKoSound).map(event => event.fighterId));

  for (const event of events) {
    if (event.kind === 'round-started') cues.push(...initialMugenRoundAudioCues(event.roundNumber));
    if (event.kind !== 'round-phase') continue;
    if (event.from === 'ready' && event.to === 'fight') cues.push(systemCue('fight', 1, 0, 'round-announcer', 75));
    if (event.from !== 'fight' || event.to !== 'ko') continue;

    const doubleKo = state.roundWinnerId === null;
    cues.push(systemCue(doubleKo ? 'double-ko' : 'ko', doubleKo ? 3 : 2, 0, 'round-announcer', 90));
    for (const fighter of state.fighters) {
      if (!fighter.ko || koSoundSuppressedFighters.has(fighter.id) || explicitKoSounds.has(fighter.id)) continue;
      cues.push(Object.freeze({ kind: 'character-ko', owner: fighter.id, group: 11, item: 0, channel: 'ko', priority: 80 }));
    }
  }

  return Object.freeze(cues);
}

function systemCue(kind: Exclude<MugenRoundAudioCueKind, 'character-ko'>, group: number, item: number, channel: string, priority: number): MugenRoundAudioCue {
  return Object.freeze({ kind, owner: 'system', group, item, channel, priority });
}

function isExplicitCharacterKoSound(event: MugenMatchEvent): event is Extract<MugenMatchEvent, { readonly kind: 'audio' }> {
  return event.kind === 'audio' && event.operation === 'play' && event.resourceOwner === 'self' && event.group === 11 && event.item === 0;
}
