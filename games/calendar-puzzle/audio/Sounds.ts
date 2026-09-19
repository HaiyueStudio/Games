export const CALENDAR_SOUNDS = {
  date: { seconds: .26, gain: .65 },
  place: { seconds: .18, gain: .72 },
  rotate: { seconds: .24, gain: .56 },
  flip: { seconds: .30, gain: .55 },
  shuffle: { seconds: .48, gain: .55 },
  win: { seconds: 1.32, gain: .70 },
  settings: { seconds: .16, gain: .55 },
  back: { seconds: .22, gain: .52 },
} as const;
export type CalendarSound = keyof typeof CALENDAR_SOUNDS;
export const CALENDAR_SOUND_IDS = Object.keys(CALENDAR_SOUNDS) as CalendarSound[];
