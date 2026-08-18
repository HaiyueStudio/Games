# Games instructions

## Product role

- Games are integration/product scenarios, not substitutes for engine modules. Reusable rendering, geometry, controls, animation, physics, navigation, and asset behavior belongs in engine or extensions.
- Declare every game in `manifest.json` with explicit capabilities, assets, screenshot/performance metadata, and `ci` tier. CI target discovery remains manifest-driven.
- Prefer stable engine and extension subpaths. If a game intentionally validates experimental behavior, make that dependency explicit and keep it out of ordinary golden-path documentation.

## Game architecture and lifecycle

- Separate deterministic game rules/state transitions from rendering and input adapters so rules can run in Node tests.
- Input must be frame-consistent and removable. Scene restart/game reset cannot duplicate listeners, timers, physics bodies, animation actions, or retained assets.
- Randomized gameplay used in tests or screenshots needs a seed or deterministic fixture.
- Heavy computation that can create a main-thread long task should use a capability-specific worker protocol, not a generic worker abstraction or silent synchronous fallback.
- Effects may use engine facilities such as separated triangles, particles, postprocess, and animation, but effect teardown must be bounded and leave no stale entities/resources.

## Validation

```bash
npm run typecheck -w ./games
npm test -w ./games
npm run build:target -- game:<id>
```

- Representative visual/gameplay changes should update or add deterministic browser/screenshot coverage; do not update screenshot baselines without visual review.

