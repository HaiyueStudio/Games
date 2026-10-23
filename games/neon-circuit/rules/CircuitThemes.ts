import type { Circuit } from './RaceRules';

export type CircuitColor = readonly [number, number, number, number];
export interface CircuitPalette {
  roadA: CircuitColor; roadB: CircuitColor; rail: CircuitColor; boost: CircuitColor;
  marker: CircuitColor; ground: CircuitColor; accent: CircuitColor; white: CircuitColor;
  sky: CircuitColor;
}

/** Whole-scene palettes, including asphalt, architecture, rails and the sky. */
export const CIRCUIT_PALETTES: Readonly<Record<Circuit['theme'], CircuitPalette>> = {
  mobius: {
    roadA: [.025,.045,.09,1], roadB: [.04,.08,.13,1], rail: [.25,1,.8,1],
    boost: [.9,1,1,1], marker: [.4,.65,.8,1], ground: [0,0,0,1],
    accent: [.7,.35,1,1], white: [.85,1,1,1], sky: [.003,.002,.015,1],
  },
  volcanic: {
    roadA: [.11,.065,.055,1], roadB: [.17,.095,.06,1], rail: [1,.22,.035,1],
    boost: [1,.8,.25,1], marker: [.8,.57,.38,1], ground: [.035,.012,.008,1],
    accent: [1,.46,.06,1], white: [1,.9,.72,1], sky: [.12,.025,.016,1],
  },
  daylight: {
    roadA: [0.18,0.29,0.37,1], roadB: [0.72,0.82,0.88,1], rail: [0.1,0.75,0.92,1],
    boost: [1,0.65,0.17,1], marker: [0.86,0.94,1,1], ground: [0.3,0.65,0.85,1],
    accent: [1,0.47,0.13,1], white: [1,1,1,1], sky: [0.3,0.65,0.94,1],
  },
  harbor: {
    roadA: [0.14, 0.105, 0.08, 1], roadB: [0.19, 0.145, 0.105, 1], rail: [1, 0.57, 0.16, 1],
    boost: [1, 0.9, 0.5, 1], marker: [0.72, 0.66, 0.47, 1], ground: [0.045, 0.055, 0.065, 1],
    accent: [0.16, 0.8, 0.73, 1], white: [1, 0.93, 0.78, 1], sky: [0.07, 0.075, 0.1, 1],
  },
  neon: {
    roadA: [0.055, 0.075, 0.115, 1], roadB: [0.075, 0.1, 0.15, 1], rail: [0.055, 0.72, 0.95, 1],
    boost: [0.08, 0.95, 1, 1], marker: [0.48, 0.65, 0.78, 1], ground: [0.016, 0.024, 0.048, 1],
    accent: [0.95, 0.08, 0.58, 1], white: [0.88, 0.95, 1, 1], sky: [0.012, 0.025, 0.065, 1],
  },
  reactor: {
    roadA: [0.12, 0.06, 0.16, 1], roadB: [0.18, 0.085, 0.22, 1], rail: [0.72, 0.25, 1, 1],
    boost: [0.72, 1, 0.2, 1], marker: [0.62, 0.47, 0.72, 1], ground: [0.035, 0.015, 0.05, 1],
    accent: [0.68, 0.95, 0.14, 1], white: [0.95, 0.88, 1, 1], sky: [0.048, 0.014, 0.075, 1],
  },
  cosmic: {
    roadA: [0.065, 0.04, 0.15, 1], roadB: [0.12, 0.08, 0.23, 1], rail: [0.68, 0.79, 1, 1],
    boost: [1, 1, 1, 1], marker: [0.62, 0.72, 1, 1], ground: [0, 0, 0, 1],
    accent: [0.98, 0.35, 0.78, 1], white: [1, 1, 1, 1], sky: [0.003, 0.002, 0.015, 1],
  },
};
