"""Reproducible texture packing only; controls.png is the original generated artwork."""
from pathlib import Path
from PIL import Image
import json
import wave, math, struct
root = Path(__file__).resolve().parent / 'assets'
source = Image.open(root / 'atlas.png').convert('RGBA')
meta = json.loads((root / 'atlas.json').read_text())
atlas = Image.new('RGBA', (source.width, source.height * 4))
for direction in range(4):
    for entry in meta.values():
        x,y = entry['x'],entry['y']
        cell = source.crop((x,y,x+16,y+16)).rotate(-90*direction)
        atlas.paste(cell,(x,y+direction*source.height))
atlas.save(root / 'mobile-atlas.png')
for name in ['mobile-atlas','controls']:
    image = atlas if name == 'mobile-atlas' else Image.open(root / 'controls.png').convert('RGBA')
    (root / (name+'.rgba')).write_bytes(image.tobytes())
    (root / (name+'.json')).write_text(json.dumps({'width':image.width,'height':image.height}))
# Small original mono arcade effects, matching the browser oscillator envelope.
sounds={'shoot':(650,120,.055),'hit':(110,65,.05),'explode':(80,25,.23),'pickup':(420,1100,.19),'over':(200,35,.65),'clear':(360,950,.4)}
for name,(start,end,seconds) in sounds.items():
    phase=0; samples=[]
    for i in range(round(44100*seconds)):
        t=i/44100;phase+=start*(end/start)**(t/seconds)/44100
        value=(1 if phase%1<.5 else -1)*.15*math.exp(-5*t/seconds)
        samples.append(struct.pack('<h',round(value*32767)))
    with wave.open(str(root/(name+'.wav')),'wb') as wav:
        wav.setparams((1,2,44100,0,'NONE','not compressed'));wav.writeframes(b''.join(samples))
