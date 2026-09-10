"""Deterministically derive runtime glTF + native RGBA from the supplied GLBs.

Original files remain byte-for-byte intact. AK's first-person arms and helper plane
are omitted; rigid gun parts retain their original bind-pose geometry.
"""
import hashlib
import io
import json
import struct
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1] / 'games/ak47-range/assets'
manifest = {'schemaVersion': 1, 'models': {}}
for name in ['ren42', 'qiang_ak47']:
    source = (ROOT / (name + '.glb')).read_bytes()
    assert struct.unpack_from('<III', source) == (0x46546c67, 2, len(source))
    size = struct.unpack_from('<I', source, 12)[0]
    gltf = json.loads(source[20:20 + size])
    offset = 20 + size
    binary = source[offset + 8:offset + 8 + struct.unpack_from('<I', source, offset)[0]]
    folder = ROOT / name
    folder.mkdir(exist_ok=True)
    textures = []
    for i, image in enumerate(gltf.get('images', [])):
        view = gltf['bufferViews'][image['bufferView']]
        data = binary[view.get('byteOffset', 0):view.get('byteOffset', 0) + view['byteLength']]
        ext = 'png' if image['mimeType'] == 'image/png' else 'jpg'
        filename = f'image-{i}.{ext}'
        (folder / filename).write_bytes(data)
        rgba = Image.open(io.BytesIO(data)).convert('RGBA')
        raw = rgba.tobytes()
        (folder / f'image-{i}.rgba').write_bytes(raw)
        textures.append({'image': filename, 'rgba': f'image-{i}.rgba', 'width': rgba.width,
                         'height': rgba.height, 'sha256': hashlib.sha256(raw).hexdigest()})
        image.pop('bufferView')
        image['uri'] = filename
    if name == 'qiang_ak47':
        retained = [i for i, node in enumerate(gltf['nodes'])
                    if 'mesh' in node and gltf['meshes'][node['mesh']]['name'].startswith('ak_47_reference')]
        gltf['scenes'] = [{'name': 'AK47 rifle only', 'nodes': retained}]
        gltf['scene'] = 0
        gltf.pop('animations', None)
        gltf.pop('skins', None)
        for node in gltf['nodes']:
            node.pop('skin', None)
        for mesh in gltf['meshes']:
            for primitive in mesh['primitives']:
                primitive['attributes'].pop('JOINTS_0', None)
                primitive['attributes'].pop('WEIGHTS_0', None)
    gltf['buffers'][0]['uri'] = 'model.bin'
    (folder / 'model.bin').write_bytes(binary)
    (folder / 'model.gltf').write_text(json.dumps(gltf, separators=(',', ':')) + '\n')
    (folder / 'textures.json').write_text(json.dumps(textures, indent=2) + '\n')
    manifest['models'][name] = {'source': name + '.glb', 'sourceBytes': len(source),
        'sourceSha256': hashlib.sha256(source).hexdigest(),
        'gltfSha256': hashlib.sha256((folder / 'model.gltf').read_bytes()).hexdigest(),
        'binarySha256': hashlib.sha256(binary).hexdigest(), 'textures': textures}
(ROOT / 'provenance.json').write_text(json.dumps(manifest, indent=2) + '\n')
print('Prepared ren42 character and rifle-only AK47; original GLBs preserved.')
