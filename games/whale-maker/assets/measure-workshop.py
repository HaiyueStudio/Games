"""Crop the generated machinery and otter sheets without repainting pixels."""
from pathlib import Path
from PIL import Image
from advanced_frames import components
import json
ROOT=Path(__file__).parent
frames=json.loads((ROOT/'frames.json').read_text(encoding='utf-8'))
for name,columns,rows in [('workshop',4,4),('hammer-otter',4,2)]:
    im=Image.open(ROOT/(('hammer-otter-grid' if name=='hammer-otter' else name)+'.png')).convert('RGBA');result=[]
    complete=[b for b in components(im,100) if b[4]>10000]
    for n in range(columns*rows):
        x0=round(n%columns*im.width/columns);x1=round((n%columns+1)*im.width/columns)
        y0=round(n//columns*im.height/rows);y1=round((n//columns+1)*im.height/rows)
        b=im.getchannel('A').crop((x0,y0,x1,y1)).point(lambda a:255 if a>100 else 0).getbbox()
        if b is None:raise ValueError((name,n))
        if name=='hammer-otter' or name=='workshop' and n>=8:
            # Fuse sparks and held hammers cross the nominal grid boundaries.
            # Choose the complete silhouette, excluding neighbouring sprites.
            cx=(x0+x1)/2;cy=(y0+y1)/2
            whole=min(complete,key=lambda b:((b[0]+b[2])/2-cx)**2+((b[1]+b[3])/2-cy)**2)
            x0=y0=0;b=(whole[0],whole[1],whole[2],whole[3])
        result.append([(x0+b[0])/im.width,(y0+b[1])/im.height,(b[2]-b[0])/im.width,(b[3]-b[1])/im.height])
    frames[name]=result
(ROOT/'frames.json').write_text(json.dumps(frames,indent=2)+'\n',encoding='utf-8')
print('Measured workshop 16 frames and hammer otter 8 frames')
