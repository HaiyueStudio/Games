# Boxbound v28 local validation

- Reference 1 A-B-A cycle exits through the actual containing path box, stays inside the puzzle and reaches its solution. Revision 12 repairs saved broken routes without resetting progress.
- Full parent geometry and all recursive player occurrences remain present on first, middle and final portal frames. Original current-player model retained; outside self scales with it. Public batched profile enables frustum culling.
- Esc exits the independent puzzle, including queued input during a portal and inverse animated undo. Interior and completion records are preserved.
- Independent puzzle labels removed; completed boxes display a red corner flag. Chapter labels remain.
- 222 focused tests, TypeScript, ESLint and single-game build passed.
- 9 isolated browser views / 397 assertions passed, including desktop/mobile and existing player/box transfer regressions.
- 17 resource checks passed, including GPU plateau, idle work and teardown. No Engine changes or full-repository tests.
- Source/build hashes and individually timestamped browser provenance: validation-v28.json.

Bundle SHA256: `f0b8c1ff318e33812c86cada2f4a3c544d27398533261f938894d7b727e9f564`
