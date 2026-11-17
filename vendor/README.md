# Dependency releases and historical local candidates

Games now installs published npm Engine and Extensions 0.2.3, animation-spec and UI 0.2.2 with `npm ci`. `@haiyue/engine-gamepad` is an npm alias for `@haiyue/engine@0.2.3`; `@haiyue/extensions-controls` aliases `@haiyue/extensions@0.2.3`. The lockfile records the registry URLs and integrity hashes. Pages uses the same locked releases.

The archives below are retained historical development inputs, not the active dependencies. Their provenance and SHA-256 values are recorded in `candidates.json`. `npm run deps:local` remains an explicit development opt-in; run `npm ci` to restore the released dependencies.

The previous Engine, animation-spec and Extensions packages were the qualified 0.2.2 candidate. Engine SHA-256 is `580bc3b5c0510d1c662116fa577e4a0e34ab4758691ae7a47498611bd8e061bd`; the repaired buffer lifetime replaces the prior Engine candidate. Windows global qualification was captured at `95ffbb4`. The complete release and Apple-device status remains in Engine/review/engine-0.2.2/README.md.

In that previous setup, `@haiyue/engine-gamepad` shared the Engine archive and `@haiyue/extensions-controls` shared the Extensions archive. UI used its independent 0.2.2 candidate. Historical 0.2.1 archives and their provenance are also retained.

The repository also retains the Engine 0.2.3 development archive listed in `candidates.json`. Games use the published Engine's `experimental/simulation` export for `BrowserMultiplayerInput` and the published Extensions' `controls` export for AK47 Range.

Refresh from a qualified public package report, verify each archive hash, update every affected dependency alias and lock integrity, then validate the installed packages and product builds. Keep package paths relative to this vendor directory. A local candidate version is not evidence of npm publication or Native-device acceptance.
