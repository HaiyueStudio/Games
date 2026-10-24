const mode = process.argv.includes('--portrait') ? 'lobby-mobile'
  : process.argv.includes('--direct') ? 'lobby-direct'
  : process.argv.includes('--root') ? 'lobby-root'
  : process.argv.includes('--published') ? 'lobby-published'
  : 'lobby,lobby-os,notifications-lobby';
process.env.GAMEPAD_CASE = mode;
await import('./verify-gamepad.mjs');
