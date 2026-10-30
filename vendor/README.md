# Local package candidates

These archives are local development inputs, not published releases. Install the exact locked versions with `npm ci`. Provenance and SHA-256 values are recorded in `candidates.json`.

The active Engine, animation-spec and Extensions packages are the qualified 0.2.2 candidate. Engine SHA-256 is `580bc3b5c0510d1c662116fa577e4a0e34ab4758691ae7a47498611bd8e061bd`; the repaired buffer lifetime replaces the prior Engine candidate. Windows global qualification was captured at `95ffbb4`. The complete release and Apple-device status remains in Engine/review/engine-0.2.2/README.md.

`@haiyue/engine-gamepad` shares the exact Engine archive; `@haiyue/extensions-controls` shares the exact Extensions archive. UI remains on its independent 0.2.2 candidate. Historical 0.2.1 archives and their provenance are retained.

Refresh from a qualified public package report, verify each archive hash, update every affected dependency alias and lock integrity, then validate the installed packages and product builds. Keep package paths relative to this vendor directory. A local candidate version is not evidence of npm publication or Native-device acceptance.
