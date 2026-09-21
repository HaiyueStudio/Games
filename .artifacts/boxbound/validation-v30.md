# Boxbound v30 local validation

- Six fixed room palettes: meadow / rose / ocean / violet / amber / teal. Same-hue checkerboard floor, walls, caps, studs and base; distinct authored parent/child rooms use different themes.
- JSON room.theme overrides automatic assignment; moving boxes never changes room color. Self/clone instances retain shared identity. Existing saves need no gameplay reset.
- Current, parent and child LOD palette equality tested through real entry/undo. Goal, crate and character semantics retain their existing colors.
- Environment light intensity 1 → 1.45, with neutral sky tint. Desktop/mobile and spatial shadow/occlusion views visually reviewed.
- 224 focused tests, TypeScript, ESLint and single-game build passed.
- 5 isolated browser views / 198 assertions passed.
- 17 resource checks passed. Maximum sampled material-cache entries: 62; repeated workloads plateau and dispose releases game resources.
- No Engine changes or full-repository tests. Source/build hashes and runner provenance: validation-v30.json.

Bundle SHA256: `de078dfad33511ce98a7d609ef0fa51618c8b29dcd82c3236c9fa336d98ca470`
