# HaiyueStudio Games repository instructions

- Node.js 22 or newer is required.
- Consume only public Engine/Extensions package exports; do not depend on Editor or AIStudio implementation.
- Keep game rules deterministic and separate from rendering/input adapters. Every game remains manifest-backed.
- Run `npm run typecheck`, `npm test`, and `npm run build`.
