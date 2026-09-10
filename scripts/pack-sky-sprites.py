"""Offline asset preparation (Python 3 + Pillow). No runtime Canvas 2D decoding.
RGBA sprites retain alpha and are sized for their on-screen footprint at 2x DPR.
"""
from pathlib import Path
from PIL import Image
import json
root = Path(__file__).resolve().parents[1] / 'games/sky-strike/assets'
entries, chunks, offset = [], [], 0
for source in sorted(root.glob('*.png')):
    image = Image.open(source).convert('RGBA')
    bound = 1024 if source.name in ('gui-space.png', 'gui-pause-panel.png') else 768 if source.name == 'gui-launch.png' else 640 if source.name.startswith('boss-') else 320
    image.thumbnail((bound, bound), Image.Resampling.LANCZOS)
    data = image.tobytes()
    entries.append(dict(id='assets/' + source.name, width=image.width, height=image.height, offset=offset, length=len(data)))
    chunks.append(data)
    offset += len(data)
(root / 'sprites.rgba').write_bytes(b''.join(chunks))
(root / 'sprites.json').write_text(json.dumps(entries, indent=2) + '\n')
print(f'{len(entries)} sprites, {offset:,} bytes')
