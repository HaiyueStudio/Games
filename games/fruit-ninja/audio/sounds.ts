export const FRUIT_SAMPLE_RATE = 44100;
export const FRUIT_SOUNDS = {
  'ui-click': { seconds: .11, gain: .5, priority: 30 },
  'bomb-explosion': { seconds: 1.25, gain: .85, priority: 100 },
  'fruit-throw-a': { seconds: .28, gain: .38, priority: 0 },
  'fruit-throw-b': { seconds: .32, gain: .38, priority: 0 },
  'fruit-throw-c': { seconds: .26, gain: .38, priority: 0 },
  'fruit-splash-a': { seconds: .42, gain: .65, priority: 10 },
  'fruit-splash-b': { seconds: .47, gain: .65, priority: 10 },
  'fruit-splash-c': { seconds: .40, gain: .65, priority: 10 },
  'game-over': { seconds: 1.6, gain: .64, priority: 80 },
} as const;
export type FruitSound = keyof typeof FRUIT_SOUNDS;
export const FRUIT_SOUND_IDS = Object.keys(FRUIT_SOUNDS) as FruitSound[];
export const fruitSoundPath = (id: FruitSound): string => `assets/audio/${id}.wav`;
