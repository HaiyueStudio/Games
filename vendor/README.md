# Local package candidates

These archives are local development inputs, not published releases. `candidates.json`
records their provenance and SHA-256 hashes. Install with `npm ci`.

The Engine archive was refreshed in Games commit `654107a69dc0f4d48fa8cd444501d6ef5d177638`.
Its SHA-256 record follows that checked-in archive; the archive also matches the
integrity values for both Engine dependency aliases in `package-lock.json`.

- Engine uses the 0.2.3 source package to match the GUI and simulation APIs already consumed by Games;
  Extensions and animation-spec retain 0.2.1, and UI retains 0.2.2.
- `@haiyue/engine-gamepad` uses the same Engine archive as `@haiyue/engine`.
  Games import its public **experimental** `experimental/simulation` export for
  `BrowserMultiplayerInput`.
- `@haiyue/extensions-controls` uses the same Extensions archive as
  `@haiyue/extensions` for AK47's public `controls` export.

To refresh candidates, build the source packages, run `npm pack` in their package
directories with `--pack-destination` pointing here, update the dependency/lockfile and hashes,
then run the controller tests and browser checks. Do not replace these archives
silently when the version number stays the same. All package paths in the Games
manifest and lockfile must resolve inside this directory, without sibling checkout
or absolute filesystem paths.
