"""Measure complete generated silhouettes; preserve source pixels and alpha."""
from pathlib import Path
from PIL import Image
from advanced_frames import components
import json
ROOT=Path(__file__).parent
frames=json.loads((ROOT/'frames.json').read_text(encoding='utf-8'))
def uv(b,im):return [b[0]/im.width,b[1]/im.height,(b[2]-b[0])/im.width,(b[3]-b[1])/im.height]
for name in ['whale-small','whale-tall','whale-fire','whale-ice']:
    im=Image.open(ROOT/(name+'.png')).convert('RGBA')
    boxes=[b for b in components(im,100) if b[4]>10000]
    if name=='whale-small':
        bounds=[216,437,650,854,1060,1231];ordered=[];last=0
        for top in bounds:
            row=sorted([b for b in boxes if last<=(b[1]+b[3])/2<top],key=lambda b:b[0]);ordered+=row;last=top
        assert len(ordered)==34,len(ordered)
        mapping=[*range(11),9,11,12,13,14,15,16,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33]
        measured=[ordered[i] for i in mapping]
        # Use the complete left-hand grip silhouette, with both legs and the
        # full dress visible. The original narrow back-profile read as half a
        # character at game size. Frame 20 remains the climbing animation pose.
        measured[23]=measured[20]
    else:
        assert len(boxes)==36,(name,len(boxes))
        measured=[]
        for n in range(36):
            cx=(n%6+.5)*im.width/6;cy=(n//6+.5)*im.height/6
            b=min(boxes,key=lambda b:((b[0]+b[2])/2-cx)**2+((b[1]+b[3])/2-cy)**2);measured.append(b)
        assert len(set(tuple(b) for b in measured))==36
    frames[name]=[uv(b,im) for b in measured]
im=Image.open(ROOT/'frost.png').convert('RGBA')
# The projectile tail and detached shatter chunks belong to their cell.
measured=[]
for n in range(12):
    x0=round(n%4*im.width/4);x1=round((n%4+1)*im.width/4)
    y0=round(n//4*im.height/3);y1=round((n//4+1)*im.height/3)
    # Projectile extends past its nominal cell, but not into the impact burst.
    if n==8:x1=390
    if n==9:x0=392
    a=im.getchannel('A').crop((x0,y0,x1,y1)).point(lambda a:255 if a>110 else 0).getbbox()
    measured.append([x0+a[0],y0+a[1],x0+a[2],y0+a[3]])
frames['frost']=[uv(b,im) for b in measured]
im=Image.open(ROOT/'lava.png').convert('RGBA')
frames['lava']=[]
for n in range(8):
    x=(n%4)*im.width/4;y=(n//4)*im.height/2
    # Remove generated seams. Surface retains its original transparent sky.
    b=[x+im.width/4*.04,y+(im.height/2*.04 if n>=4 else 0),x+im.width/4*.96,y+im.height/2*.96]
    frames['lava'].append(uv(b,im))
(ROOT/'frames.json').write_text(json.dumps(frames,indent=2)+'\n',encoding='utf-8')
print('Measured four character forms, frost and lava')
