const mode = process.argv.includes('--portrait') ? 'lobby-mobile'
  : process.argv.includes('--cards') ? 'lobby-cards'
  : process.argv.includes('--simulator') ? 'lobby-devices,lobby-mugen-rtt,simulator-external,simulator-published'
  : process.argv.includes('--routes') ? 'lobby-routes'
  : process.argv.includes('--direct') ? 'lobby-direct'
  : process.argv.includes('--root') ? 'lobby-root'
  : process.argv.includes('--published') ? 'lobby-published'
  : 'lobby,lobby-os,lobby-cards,notifications-lobby';
process.env.GAMEPAD_CASE = mode;
await import('./verify-gamepad.mjs');
