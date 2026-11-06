# Local package candidates

These archives are local development inputs, not published releases. Install the exact locked versions with `npm ci`. Provenance and SHA-256 values are recorded in `candidates.json`.

The active Engine and `@haiyue/engine-gamepad` aliases use the same **0.2.3** source archive, preserving the GUI and simulation APIs consumed by Games. Animation-spec, Extensions and `@haiyue/extensions-controls` use **0.2.2**; UI remains on its independent **0.2.2** candidate. All workspace games share these root runtime dependencies.

The historical Engine 0.2.2 candidate has SHA-256 `580bc3b5c0510d1c662116fa577e4a0e34ab4758691ae7a47498611bd8e061bd`. Its Windows qualification record at `95ffbb4` applies to those 0.2.2 bytes, not to the active 0.2.3 archive. The complete release and Apple-device status remains in Engine/review/engine-0.2.2/README.md. Historical 0.2.1 and 0.2.2 archives and their provenance are retained.

Games import Engine's public **experimental** `experimental/simulation` export for `BrowserMultiplayerInput`. The controls alias shares the Extensions archive for AK47's public `controls` export.

Refresh from a qualified public package report, verify each archive hash, update every affected dependency alias and lock integrity, then validate the installed packages and product builds. Keep package paths relative to this vendor directory. A local candidate version is not evidence of npm publication or Native-device acceptance.
