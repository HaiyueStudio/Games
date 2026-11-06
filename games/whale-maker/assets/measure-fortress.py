"""Measure generated fortress sprites, preserving alpha and shared boss scale."""
from pathlib import Path
from PIL import Image
import json
root=Path(__file__).parent
frames=json.loads((root/'frames.json').read_text(encoding='utf-8'))
def uv(b,im):return [b[0]/im.width,b[1]/im.height,(b[2]-b[0])/im.width,(b[3]-b[1])/im.height]
im=Image.open(root/'reef-boss.png').convert('RGBA');boxes=[]
for n in range(12):
 x=round(n%4*im.width/4);y=round(n//4*im.height/3);r=round((n%4+1)*im.width/4);b=round((n//4+1)*im.height/3)
 bb=im.getchannel('A').crop((x,y,r,b)).point(lambda a:255 if a>80 else 0).getbbox()
 boxes.append([x+bb[0],y+bb[1],x+bb[2],y+bb[3]])
w=max(b[2]-b[0] for b in boxes)+4;h=max(b[3]-b[1] for b in boxes)+4
frames['reef-boss']=[uv([(b[0]+b[2]-w)/2,b[3]+2-h,(b[0]+b[2]+w)/2,b[3]+2],im) for b in boxes]
im=Image.open(root/'reef-bridge.png').convert('RGBA');boxes=[]
for x,r in [(0,770),(770,1160),(1160,1660),(1660,2172)]:
 bb=im.getchannel('A').crop((x,0,r,im.height)).point(lambda a:255 if a>80 else 0).getbbox()
 boxes.append([x+bb[0],bb[1],x+bb[2],bb[3]])
frames['reef-bridge']=[uv(b,im) for b in boxes]
frames['night-coast']=[[0,.02,1,.90]]
im=Image.open(root/'firebar-anchor.png').convert('RGBA')
# Keep a square reference and the painted top edge aligned with tile collision.
frames['firebar-anchor']=[uv([26,48,1225,1207],im)]
(root/'frames.json').write_text(json.dumps(frames,indent=2)+'\n',encoding='utf-8')
print('Boss shared bounds',w,h,'bridge boxes',boxes)
