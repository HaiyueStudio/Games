# Local input candidates

These archives are local development inputs, not published releases. `candidates.json`
records their provenance and SHA-256 hashes. Install with `npm ci`.

- `@haiyue/engine-gamepad` is an npm alias for the packed Engine 0.2.1 candidate.
  Games import its public **experimental** `experimental/simulation` export for
  `BrowserMultiplayerInput`. Existing rendering continues using the installed Engine
  0.1 dependency, avoiding a renderer migration as part of controller support.
- `@haiyue/extensions-controls` pins the previously verified Native AK47 candidate,
  which supplies the public `controls` export missing from the installed Extensions
  package. It is used only by AK47's virtual joysticks and retains the 0.1 Engine peer.

To refresh the input candidate, build Engine, run `npm pack --ignore-scripts` in its
`engine` package, copy the archive here, update the dependency/lockfile and hashes,
then run the controller tests and browser checks. Do not replace these archives
silently when the version number stays the same. Once the intended Engine version
is published and the renderer migration is validated, remove the temporary alias
and use the normal public package export.
