export const NEON_SOUNDS = {
  record: {seconds:.85,gain:.78,cooldown:.8},
  lap: {seconds:.85,gain:.62,cooldown:1},
  brake: {seconds:.62,gain:.43,cooldown:.25},
  'count-3': {seconds:.25,gain:.58,cooldown:.5},
  'count-2': {seconds:.25,gain:.58,cooldown:.5},
  'count-1': {seconds:.25,gain:.62,cooldown:.5},
  go: {seconds:.55,gain:.64,cooldown:.5},
  music: {seconds:30,gain:.46,cooldown:0},
  click: {seconds:.24,gain:.48,cooldown:.065},
  course: {seconds:.52,gain:.50,cooldown:.11},
  rail: {seconds:.62,gain:.78,cooldown:.16},
  boost: {seconds:1.1,gain:.62,cooldown:.65},
  'engine-low': {seconds:1,gain:.48,cooldown:0},
  'engine-high': {seconds:1,gain:.40,cooldown:0},
} as const;
export type NeonSound = keyof typeof NEON_SOUNDS;
export const NEON_SOUND_IDS = Object.keys(NEON_SOUNDS) as NeonSound[];
export const soundPath = (id:NeonSound) => `assets/audio/${id}.wav`;
