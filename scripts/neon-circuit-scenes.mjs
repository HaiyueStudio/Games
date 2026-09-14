/** Named diagnostic scenarios. With no CLI names, the full matrix remains mandatory. */
export const NEON_SCENES = Object.freeze([
  ['music-loop','sky-harbor','music-loop',932,430],
  ['settings-en','sky-harbor','home-settings-en',932,430],
  ['settings-ja-narrow','sky-harbor','home-settings-ja',390,844],
  ['home-en','sky-harbor','home-en',932,430],
  ['home-ja','sky-harbor','home-ja',932,430],
  ['lap-banner','sky-harbor','lap',932,430],
  ['coaster-overlook','sky-coaster','coaster-overlook',1440,900],
  ['coaster-loop','sky-coaster','coaster-loop',1440,900],
  ['coaster-roll','sky-coaster','coaster-roll',1440,900],
  ['coaster-helix','sky-coaster','coaster-helix',1440,900],
  ['home-coaster','sky-coaster','home-coaster',1440,900],
  ['rainbow-overlook', 'rainbow-road', 'space-overlook', 1440, 900],
  ['rainbow-road', 'rainbow-road', 'race', 1440, 900],
  ['rainbow-high-speed', 'rainbow-road', 'high-speed', 1440, 900],
  ['rainbow-mobile', 'rainbow-road', 'high-speed', 390, 844],
  ['home-rainbow', 'rainbow-road', 'home-rainbow', 1440, 900],
  ['idle', 'neon-city', 'race', 1440, 900],
  ['high-speed', 'neon-city', 'high-speed', 1440, 900],
  ['high-speed-mobile', 'neon-city', 'high-speed', 390, 844],
  ['home-desktop', 'neon-city', 'home', 1440, 900],
  ['home-swipe', 'neon-city', 'home-swipe', 1440, 900],
  ['countdown', 'neon-city', 'countdown', 1440, 900],
  ['hull-amber', 'neon-city', 'amber', 1440, 900],
  ['home-mobile', 'neon-city', 'home-sky', 390, 844],
  ['hud-mobile', 'neon-city', 'race', 390, 844],
  ['hud-tablet', 'neon-city', 'race', 844, 900],
  ['home-landscape', 'neon-city', 'home-reactor', 844, 390],
  ['paused', 'neon-city', 'paused', 1440, 900],
  ['paused-mobile', 'neon-city', 'paused', 390, 844],
  ['paused-landscape', 'neon-city', 'paused', 844, 390],
  ['destroyed', 'neon-city', 'destroyed', 1440, 900],
  ['finished', 'neon-city', 'finished', 1440, 900],
  ['neon-city-fire', 'neon-city', 'fire', 1440, 900],
  ['sky-harbor', 'sky-harbor', 'race', 1440, 900],
  ['reactor-run-fire', 'reactor-run', 'fire', 1440, 900],
  ['accelerating', 'neon-city', 'accelerating', 1440, 900],
  ['coasting', 'neon-city', 'coasting', 1440, 900],
  ['half-health-smoke', 'neon-city', 'smoke', 1440, 900],
  ['rail-collision', 'neon-city', 'collision', 1440, 900],
  ['animated-boost', 'neon-city', 'boost', 1440, 900],
].map(row => Object.freeze(row)));
export function selectNeonScenes(names = []) {
  if (!names.length) return NEON_SCENES;
  const requested = new Set(names);
  for (const name of requested) {
    if (!NEON_SCENES.some(row => row[0] === name)) throw new Error(`Unknown neon-circuit scene: ${name}`);
  }
  return NEON_SCENES.filter(row => requested.has(row[0]));
}
