# Boxbound v29 local validation

- Dark gray crate goal outlines, including parent and miniature maps; readable matching legend.
- Ordinary step/push/undo changed from 160ms to 300ms. Queued moves wait for landing; 420ms ledge animation preserved.
- Weak wall-layout cache reuses static joins and detects in-place map edits; planar frames skip exterior occlusion tests; actor diagnostic identities are rebuilt only when model membership changes.
- 96 world steps: wall-layout builds remain 24 → 24. 32 recursive steps: occlusion passes remain 206 → 206.
- 222 focused tests, TypeScript, ESLint and single-game build passed.
- 6 isolated desktop/mobile browser views / 256 assertions passed.
- 17 resource checks passed: bounded GPU/CPU resources, idle work and teardown. No Engine changes or full-repository tests.
- Source/build hashes and runner provenance: validation-v29.json.

Bundle SHA256: `14bfbddd1551354ae72952d451b04913a676799a14ea8ac485352278ed5c61cd`
