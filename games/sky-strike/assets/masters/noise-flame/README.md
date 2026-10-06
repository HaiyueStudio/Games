# Advected noise flame and movable guns — 2026-09-13

Built-in image_gen produced the furnace hull with empty gun mounts and an independent industrial burner. Full prompts and hashes are alongside this file. Reference-edit attempts with painted checkerboards were rejected; both delivered sources have generated RGBA transparency. Original hull remains archived here. Runtime images: ../../boss-inferno.png (384px long edge), ../../fx-inferno-gun.png (192px long edge, reused twice).

flamePass.ts implements a four-octave domain-warped noise shader. A bounded instance buffer draws advected fire bands without per-frame texture uploads. Cylindrical UV coordinates scroll around the elite's metal sleeve, exposing moving hot vent slots. Boss guns use the same individually tracked pivot/muzzle data as fire emission.

Simulation uses a carried 10ms fixed step, emission every 50ms, and overlapping 100ms fire bands for continuous coverage. Speeds: elite 420, long 520, wide 400 logical units/s. Sector warnings are removed. Historical origins/directions stay fixed during travel; the radial inner/outer bounds govern damage and ignition. Residual burn/fuse rules remain intact. Destroyed casters clear their jets; stop/return-home/dispose retain bounded cleanup.

User-selected revision: the third displayed square hull has been restored using image_gen background removal (restore-hull-prompt.json). The taller unused variant is archived as unused-tall-hull.png. Render aspect is 1:1 to match the source; barrel pivots are now at normalized x ±0.165, y +0.028. The central glass window uses a masked domain-warped molten-noise shader with slow flow, bright veins and a gentle pulse.
