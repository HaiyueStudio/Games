"""Crop used sprites and resize for 48 px tiles; leave generated sources intact.

Run after measure-atlas.py. Runtime frames keep stable logical IDs so editor,
GUI and ordinary 2D rendering share the same samples. Unused IDs are empty.
"""
from pathlib import Path
from PIL import Image
import json, math
from advanced_frames import components

ROOT=Path(__file__).parent
OUT=ROOT/'runtime'
OUT.mkdir(exist_ok=True)
frames=json.loads((ROOT/'frames.json').read_text(encoding='utf-8'))

def uv(box,image):
    x,y,r,b=box[:4];w,h=image.size
    return [x/w,y/h,(r-x)/w,(b-y)/h]

# Use the complete connected stone silhouettes, not all alpha in a grid cell.
image=Image.open(ROOT/'adventure.png').convert('RGBA')
boxes=components(image,60)
stones=[]
for index in [3,4,5]:
    cx=(index%4+.5)*image.width/4;cy=(.14 if index==3 else .40)*image.height
    box=min((b for b in boxes if b[4]>12000),key=lambda b:math.hypot((b[0]+b[2])/2-cx,(b[1]+b[3])/2-cy))
    stones.append(box)
side=max(max(b[2]-b[0],b[3]-b[1]) for b in stones)+4
for index,b in zip([3,4,5],stones):
    x=(b[0]+b[2]-side)/2;y=b[3]+2-side
    frames['adventure'][index]=uv([x,y,x+side,y+side],image)

# New 4x3 half-turn sheet. A shared transparent canvas keeps edge views narrow.
image=Image.open(ROOT/'tokens-half.png').convert('RGBA')
boxes=components(image,70)
coin=[]
for n in range(12):
    cx=(n%4+.5)*image.width/4;cy=(n//4+.5)*image.height/3
    box=min((b for b in boxes if b[4]>1000),key=lambda b:math.hypot((b[0]+b[2])/2-cx,(b[1]+b[3])/2-cy))
    coin.append(box)
cw=max(b[2]-b[0] for b in coin)+4;ch=max(b[3]-b[1] for b in coin)+4
frames['tokens']=[uv([(b[0]+b[2]-cw)/2,(b[1]+b[3]-ch)/2,(b[0]+b[2]+cw)/2,(b[1]+b[3]+ch)/2],image) for b in coin]
frames['backdrops']=[[0,n/3,1,1/3] for n in range(3)]

# New collectibles are tight transparent crops; flags keep a shared square
# canvas so their left attachment and cloth size stay stable while fluttering.
for name,columns,rows in [('pearls',2,1),('goal-flags',4,1),('tall-characters',4,4)]:
    im=Image.open(ROOT/(('tall-characters-v2' if name=='tall-characters' else name)+'.png')).convert('RGBA')
    measured=[]
    for n in range(columns*rows):
        x0=round(n%columns*im.width/columns);y0=round(n//columns*im.height/rows)
        x1=round((n%columns+1)*im.width/columns);y1=round((n//columns+1)*im.height/rows)
        box=im.getchannel('A').crop((x0,y0,x1,y1)).point(lambda a:255 if a>70 else 0).getbbox()
        if box is None:raise ValueError(f'Empty {name} frame {n}')
        measured.append([x0+box[0],y0+box[1],x0+box[2],y0+box[3]])
    frames[name]=[uv(b,im) for b in measured]

# ON/OFF blocks replace the two switch frames, retaining stable runtime IDs.
switch_image=Image.open(ROOT/'switch-blocks.png').convert('RGBA')
blocks=sorted((b for b in components(switch_image,100) if b[4]>10000),key=lambda b:b[0])
switch_frames=[uv(b,switch_image) for b in blocks[:2]]
# The pipe rim crosses the nominal grid boundary. Keep the complete rim/collar,
# excluding the decorative foot, so the cap fits the repeatable shaft.
frames['mechanics'][12]=[70/1536,746/1024,414/1536,154/1024]
# Reuse painted source regions as layered animation parts; no source repainting.
device=Image.open(ROOT/'devices.png')
frames['iron-parts']=[uv(box,device) for box in [[47,741,383,964],[240,960,383,989],[90,940,159,1010],[188,915,289,1035],[299,963,374,1023]]]

# Keep measured source coordinates separate from packed runtime UVs.
(ROOT/'frames.json').write_text(json.dumps(frames,indent=2)+'\n',encoding='utf-8')
used={name:list(range(len(values))) for name,values in frames.items()}
used['characters']=[8,9,13,15]
used['world']=[0,1,3,4,10,14]
used['expansion']=[*range(8),14,15]
used['adventure']=[*range(8)]
used['coins']=[8]
used['creatures']=[*range(8),12,13,14,15]
used['environment']=[*range(8),10,11,12,13,14,15]
used['clear']=[2]
used['mechanics']=[i for i in used['mechanics'] if i!=14]

retired={'actions','eating','cheer','motion','motion2','transit','fire-base','fire-actions','fire-motion','fire-extra','tall-characters'}
for name in retired:
    (OUT/(name+'.png')).unlink(missing_ok=True)
    frames.pop(name,None);used.pop(name,None)
report={};packed={};total_source=0;total_runtime=0
for name,values in frames.items():
    source='hammer-otter-grid' if name=='hammer-otter' else 'tall-characters-v2' if name=='tall-characters' else 'devices' if name=='iron-parts' else 'tokens-half' if name=='tokens' else 'distant-landscapes-clean' if name=='backdrops' else 'transit-v2' if name=='transit' else name
    path=ROOT/(source+'.png')
    image=Image.open(path).convert('RGBA')
    if name!='iron-parts':total_source+=path.stat().st_size
    if name=='mechanics':total_source+=(ROOT/'switch-blocks.png').stat().st_size
    # Common scale within each atlas preserves relative painted pose dimensions.
    cap={'world':256,'adventure':192,'checkpoint':192,'clear':256,'expansion':336,'backdrops':1232,'night-coast':1232,'reef-boss':128,'reef-bridge':128,'mechanics':512}.get(name,128 if name in ['gadgets','devices'] else 96)
    largest=max(max(values[i][2]*image.width,values[i][3]*image.height) for i in used[name])
    scale=min(1,cap/largest)
    parts=[]
    for i in used[name]:
        f=values[i];x,y,w,h=[round(n*d) for n,d in zip(f,[image.width,image.height,image.width,image.height])]
        sample=image.crop((x,y,x+w,y+h))
        if name=='mechanics' and i in [0,1]:
            u,v,sw,sh=switch_frames[i];x,y,w,h=[round(n*d) for n,d in zip([u,v,sw,sh],[switch_image.width,switch_image.height,switch_image.width,switch_image.height])];sample=switch_image.crop((x,y,x+w,y+h))
        frame_scale=scale
        if name=='mechanics' and i!=14:frame_scale=min(1,(192 if i in [12,13] else 96)/max(w,h))
        if name=='expansion' and i!=15:frame_scale=min(1,112/max(w,h))
        if name=='adventure' and i not in [3,4,5]:frame_scale=min(1,128/max(w,h))
        size=(max(2,round(w*frame_scale)),max(2,round(h*frame_scale)))
        sample=sample.resize(size,Image.Resampling.LANCZOS)
        if name=='whale-small' and i==23:
            # Keep the wall pose on a full standing-width canvas. Narrow tight
            # crops need clear texels around both raised hands and the long hair.
            side=max(sample.width+8,round(values[0][2]*image.width*scale)+8)
            padded=Image.new('RGBA',(side,sample.height+8))
            padded.paste(sample,((side-sample.width)//2,4));sample=padded
        if name=='goal-flags':
            square=Image.new('RGBA',(cap,cap));square.paste(sample,(0,(cap-sample.height)//2));sample=square
        if name=='pearls':
            side=max(sample.size);square=Image.new('RGBA',(side,side));square.paste(sample,((side-sample.width)//2,(side-sample.height)//2));sample=square
        if name=='mechanics' and i in [0,1]:
            side=max(sample.size);square=Image.new('RGBA',(side,side));square.paste(sample,((side-sample.width)//2,(side-sample.height)//2));sample=square
        if name=='gadgets' and i==10:
            side=max(sample.size);square=Image.new('RGBA',(side,side));square.paste(sample,((side-sample.width)//2,(side-sample.height)//2));sample=square
        if name=='world' and i==14:
            # Downsampling can spread the cloud's antialiasing into its old
            # two-pixel padding. Keep an explicit clear border after resizing.
            bordered=Image.new('RGBA',(sample.width+4,sample.height+4));bordered.paste(sample,(2,2));sample=bordered
        parts.append((i,sample))
    # Shelf pack with transparent 2-pixel gutters, including one empty texel.
    area=sum((im.width+4)*(im.height+4) for _,im in parts)
    width=max(max(im.width+4 for _,im in parts),int(math.sqrt(area)*1.35))
    width=math.ceil(width/4)*4;x=4;y=4;row=0;positions=[]
    for i,im in parts:
        if x+im.width+2>width:x=4;y+=row+4;row=0
        positions.append((i,im,x,y));x+=im.width+4;row=max(row,im.height)
    height=y+row+4
    atlas=Image.new('RGBA',(width,height))
    packed[name]=[[0,0,1/width,1/height] for _ in values]
    for i,im,x,y in positions:
        atlas.paste(im,(x,y));packed[name][i]=[x/width,y/height,im.width/width,im.height/height]
    target=OUT/(name+'.png');atlas.save(target,optimize=True)
    total_runtime+=target.stat().st_size
    report[name]={'source':path.name,'sourceBytes':path.stat().st_size,'runtimeBytes':target.stat().st_size,'size':[width,height],'used':used[name],'removed':[i for i in range(len(values)) if i not in used[name]]}
    if name=='mechanics':report[name]['overrides']={'0':'switch-blocks.png','1':'switch-blocks.png'}
(OUT/'frames.json').write_text(json.dumps(packed,indent=2)+'\n',encoding='utf-8')
report['totals']={'sourceBytes':total_source,'runtimeBytes':total_runtime,'reduction':round(1-total_runtime/total_source,4)}
(OUT/'packing.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report['totals']))
