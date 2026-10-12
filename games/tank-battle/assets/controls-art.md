# Mobile control textures

Created 2026-10-12 with the built-in imagegen tool. Original generated file:
`exec-923e4141-3e5f-47f6-9684-0437d27a3085.png`; copied unchanged to `controls.png`.
Transparent RGBA, four equal quadrants: joystick base, separate thumb cap,
fire idle, fire pressed. Runtime uses quadrant UVs and preserves alpha.

Prompt: production mobile game UI sprite atlas, exact 2×2 grid, isolated pixel-art
military olive and aged brass controls, circular recessed joystick base with four
cardinal markers, separate engraved thumb cap, red-brown projectile fire button
and amber pressed variant, orthographic, no text, no watermark, transparent background.

`pack-mobile.py` rotates the existing original 16×16 tank sprites in 90-degree steps
and exports native straight-alpha RGBA packs. It does not redraw the generated controls.
The same script synthesizes six original 44.1 kHz mono arcade sound effects.
The browser uses PNG textures; Native uploads the matching RGBA bytes once.
