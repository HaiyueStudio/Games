export const JIGSAW_SAMPLE_RATE = 24000;
export const JIGSAW_SOUNDS = {
  'ui-click': { seconds: .095, gain: .30, priority: 20 },
  'piece-click': { seconds: .14, gain: .40, priority: 40 },
  snap: { seconds: .24, gain: .52, priority: 60 },
  complete: { seconds: 1.25, gain: .48, priority: 100 },
} as const;
export type JigsawSound = keyof typeof JIGSAW_SOUNDS;
export const JIGSAW_SOUND_IDS = Object.keys(JIGSAW_SOUNDS) as JigsawSound[];

