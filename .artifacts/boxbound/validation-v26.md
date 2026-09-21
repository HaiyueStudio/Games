# Boxbound v26 local validation

- Perspective rendering: grid-aligned top-down view for planar rooms; 45 degree pitch / 10 degree yaw for spatial rooms.
- Both modes retain 85% limiting viewport coverage; mixed-mode portals smoothly interpolate orientation and scale.
- Exterior objects occluding a spatial board/player use 15% opacity; they recover their base materials after leaving the sightline. Current and child geometry stay unchanged.
- Actual material alpha and model identity are verified, not just requested opacity values.
- 168 focused tests, TypeScript, ESLint and single-game build pass.
- 7 isolated browser views / 285 assertions pass; screenshots visually reviewed.
- 17 resource checks pass: bounded assets, idle rendering stops, teardown returns to baseline.
- Source/build fingerprints are in validation-v26.json. No Engine edits, full-repository tests or user browser/save changes.

Bundle SHA256: `85073afb0d9b3c606840fb6158fd9f6bf13d792c70dc7c671fb9dcf0104a4b26`
