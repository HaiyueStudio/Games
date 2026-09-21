# Boxbound v24 local validation

- Orthographic projection; 60 degree pitch, 10 degree yaw, 85% limiting viewport coverage.
- Portal zoom interpolates orthographic bounds and target; camera distance is independent of scale.
- Complete scene bounds, including parent and retained portal models, determine camera distance and far clip; near stays at 0.1.
- Parent walls stay complete and opaque, with natural occlusion, as confirmed by the user.
- 168 focused tests, TypeScript, ESLint and single-game build pass.
- 6 isolated browser views / 232 assertions pass, including Empty 13 desktop/mobile and portal/undo regressions.
- 17 resource checks pass: bounded assets, idle rendering stops, teardown returns to baseline.
- Screenshots visually reviewed. Full source/build fingerprints are in validation-v24.json.
- No Engine edits or full-repository tests; no user browser/save changes.

Bundle SHA256: `4d71a21dd781fbd01badf2e536168a0d3732a0ac41585e8a2a753079ccbd0eae`
