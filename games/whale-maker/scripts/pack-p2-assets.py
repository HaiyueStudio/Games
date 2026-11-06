"""Pack original generated atlases at their actual game rendering scale."""
from pathlib import Path
from PIL import Image
import json
from collections import deque
def figures(im,cols,rows):
    w,h=im.size;alpha=im.getchannel('A').tobytes();seen=bytearray(w*h);parts={}
    for seed,a in enumerate(alpha):
        if a<160 or seen[seed]:continue
        q=deque([seed]);seen[seed]=1;left=right=seed%w;top=bottom=seed//w;count=0
        while q:
            at=q.popleft();x=at%w;y=at//w;count+=1;left=min(left,x);right=max(right,x);top=min(top,y);bottom=max(bottom,y)
            for yy in range(max(0,y-1),min(h,y+2)):
                for xx in range(max(0,x-1),min(w,x+2)):
                    n=yy*w+xx
                    if not seen[n] and alpha[n]>=160:seen[n]=1;q.append(n)
        if count<w*h/(cols*rows)*.08:continue
        col=min(cols-1,int((left+right+1)/2/w*cols));row=min(rows-1,int((top+bottom+1)/2/h*rows));key=row*cols+col
        if key in parts:raise RuntimeError(f'Overlapping atlas figures: {key}')
        parts[key]=im.crop((max(0,left-3),max(0,top-3),min(w,right+4),min(h,bottom+4)))
    if len(parts)!=cols*rows:raise RuntimeError(f'Expected {cols*rows} figures, got {len(parts)}')
    return [parts[n] for n in range(cols*rows)]
root=Path(__file__).resolve().parents[1]
frames_path=root/'assets/runtime/frames.json';frames=json.loads(frames_path.read_text(encoding='utf-8'))
for name,source,cols,rows,size,group in [('p2-wearables','p2-wearables',8,5,96,8),('p2-enemies','p2-enemies',8,8,80,8),('p2-bosses','p2-bosses',8,6,128,16),('p2-bills','p2-bills-cutout',4,4,112,4)]:
    im=Image.open(root/'assets'/f'{source}.png').convert('RGBA');parts=figures(im,cols,rows)
    out=Image.new('RGBA',(cols*size,rows*size));uv=[]
    for index,part in enumerate(parts):
        if name=='p2-bosses' and index==43:uv.append([0,0,1/out.width,1/out.height]);continue
        family=[p for n,p in enumerate(parts) if n//group==index//group and not(name=='p2-bosses' and n==43)];factor=(size-8)/max(max(p.size) for p in family)
        part=part.resize((max(1,round(part.width*factor)),max(1,round(part.height*factor))),Image.Resampling.LANCZOS)
        px=(index%cols)*size+(size-part.width)//2;py=(index//cols)*size+size-4-part.height;out.alpha_composite(part,(px,py));uv.append([(px-4)/out.width,(py-4)/out.height,(part.width+8)/out.width,(part.height+8)/out.height])
    out.save(root/'assets/runtime'/f'{name}.png',optimize=True)
    frames[name]=uv
    provenance=root/'assets'/f'{name}.provenance.json';data=json.loads(provenance.read_text(encoding='utf-8'));data.update({'runtime':f'runtime/{name}.png','runtimeSize':list(out.size),'runtimeCell':size,'packing':'Uniform family scale, measured alpha bounds, transparent padding and shared feet baseline; original generated pixels preserved.'});provenance.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(name,out.size)
frames_path.write_text(json.dumps(frames,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
