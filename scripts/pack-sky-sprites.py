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
    'gui-space.png': 1024, 'gui-pause-panel.png': 768, 'gui-launch.png': 640,
    'gui-arrow.png': 160, 'gui-bomb.png': 160, 'gui-pause.png': 160, 'gui-gear.png': 128,
    'gui-shield.png': 96, 'gui-life.png': 48,
    'fx-flame.png': 192, 'fx-turret.png': 192, 'fx-rotor.png': 128, 'fx-hatch.png': 192,
    'fx-burning-impact.png': 320, 'player-fighter.png': 256,
}
entries, chunks, offset = [], [], 0
for source in sorted(root.glob('*.png')):
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
