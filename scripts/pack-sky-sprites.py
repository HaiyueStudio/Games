"""Offline RGBA pack, sized by on-screen footprint at up to 2x DPR.
Original generated PNGs remain editable masters; only this pack is loaded at runtime.
"""
from pathlib import Path
from PIL import Image
import json
root = Path(__file__).resolve().parents[1] / 'games/sky-strike/assets'
# Long-edge limits. Boss previews/background retain detail; small controls/effects do not
# occupy 320px textures. The manifest deliberately lists master art for provenance too.
limits = {
    **{f'bg-{name}.png': 512 for name in ['orbital','ion','void','carrier','prism','serpent','binary','mining']},
    'fx-inferno.png':128, 'boss-inferno.png':384, 'elite-cinder.png':192,
    'fx-quantum-turret.png': 128, 'fx-quantum-preview.png': 256,
    'boss-quantum-dreadnought.png': 512, 'boss-miner.png': 512, **{f'asteroid-{name}.png': 192 for name in ['iron','copper','ice']},
    'planet-ice.png': 384, 'planet-amber.png': 384,
    'boss-twin-red.png': 384, 'boss-twin-blue.png': 384, 'elite-fission.png': 256,
    'gui-space.png': 768, 'gui-pause-panel.png': 640, 'gui-launch.png': 640,
    'gui-arrow.png': 160, 'gui-bomb.png': 160, 'gui-pause.png': 160, 'gui-gear.png': 128,
    'gui-shield.png': 96, 'gui-life.png': 48,
    'fx-flame.png': 192,
    **{f'part-{name}.png': 128 for name in ['serpent-gun','dread-gun','ion-impeller','mantis-blade','carrier-door','prism-iris','twin-gyro','mining-cog','crimson-rail']},
    'part-serpent-body.png':192, 'part-serpent-joint.png':96,
    'part-violet-capacitor.png':96, 'part-lancer-petal.png':96, 'part-fission-shell.png':96,
    'fx-burning-impact.png': 320, 'player-fighter.png': 256,
}
entries, chunks, offset = [], [], 0
# Retained source masters are no longer used by any runtime attachment.
retired = {'fx-turret.png', 'fx-rotor.png', 'fx-hatch.png'}
for source in sorted(root.glob('*.png')):
    if source.name in retired:
        continue
    image = Image.open(source).convert('RGBA')
    bound = limits.get(source.name, 640 if source.name.startswith('boss-') else 320 if source.name.startswith('elite-') else 256)
    image.thumbnail((bound, bound), Image.Resampling.LANCZOS)
    data = image.tobytes()
    entries.append(dict(id='assets/' + source.name, width=image.width, height=image.height, offset=offset, length=len(data)))
    chunks.append(data)
    offset += len(data)
(root / 'sprites.rgba').write_bytes(b''.join(chunks))
(root / 'sprites.json').write_text(json.dumps(entries, indent=2) + '\n')
print(f'{len(entries)} sprites, {offset:,} bytes')
