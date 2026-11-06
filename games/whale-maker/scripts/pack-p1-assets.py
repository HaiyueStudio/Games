"""Deterministic atlas slicing/downscaling of the generated source images."""
from pathlib import Path
from PIL import Image
import json, shutil
from collections import deque

def action_parts(im, cols, rows):
    # Generated actions spill slightly beyond nominal cell edges. Measure the
    # complete connected figure before packing so tails/heads are not clipped
    # and a neighbouring hat fragment cannot change a rolling pose's baseline.
    w,h=im.size;alpha=im.getchannel('A').tobytes();seen=bytearray(w*h);figures={}
    for seed,a in enumerate(alpha):
        if a<32 or seen[seed]:continue
        q=deque([seed]);seen[seed]=1;left=right=seed%w;top=bottom=seed//w;count=0
        while q:
            k=q.popleft();x=k%w;y=k//w;count+=1;left=min(left,x);right=max(right,x);top=min(top,y);bottom=max(bottom,y)
            for yy in range(max(0,y-1),min(h,y+2)):
                for xx in range(max(0,x-1),min(w,x+2)):
                    n=yy*w+xx
                    if not seen[n] and alpha[n]>=32:seen[n]=1;q.append(n)
        if count<w*h/(cols*rows)*.1:continue
        row=min(rows-1,int((top+bottom+1)/2/h*rows))
        # Two adjacent attack weapons touch in the final source row. Their
        # complete bodies remain separated by the nominal column boundary.
        boxes=[(left,top,right+1,bottom+1)]
        if right-left>w/cols*1.5:
            cut=round(round((left+right+1)/2/w*cols)*w/cols)
            boxes=[(left,top,cut,bottom+1),(cut,top,right+1,bottom+1)]
        for box in boxes:
            col=min(cols-1,int((box[0]+box[2])/2/w*cols));key=row*cols+col
            if key in figures:raise RuntimeError(f'Overlapping action components: {key}')
            figures[key]=im.crop((max(0,box[0]-2),max(0,box[1]-2),min(w,box[2]+2),min(h,box[3]+2)))
    if len(figures)!=cols*rows:raise RuntimeError(f'Expected {cols*rows} complete action figures, got {len(figures)}')
    return [figures[n] for n in range(cols*rows)]

root=Path(__file__).resolve().parents[1]
generated=Path('C:/Users/Administrator/.codex/generated_images/01a17ab1-32a5-79f0-809d-53eebcbbd817')
specs=[('p1-creatures','exec-551c6c6b-002b-445d-90ea-a7a3d8a50cbf.png',8,8,72,8),('p1-costumes','exec-127e6ab4-6cba-45a1-8d12-1402df79085d.png',8,8,112,6),('p1-special','exec-af7c4b30-700a-4bb1-8b81-f86de18b63e0.png',8,2,96,2),('p1-actions','exec-03e73502-65cd-48da-9d25-ab1705e51fac.png',8,8,112,8)]
frames_path=root/'assets/runtime/frames.json'
frames=json.loads(frames_path.read_text(encoding='utf-8'))
for name,source,cols,rows,size,used_rows in specs:
    dest=root/'assets'/f"{name+'-v2' if name=='p1-costumes' else name}.png"
    if not dest.exists():shutil.copyfile(generated/source,dest)
    im=Image.open(dest).convert('RGBA');cell_w,cell_h=(168,128) if name=='p1-actions' else (size,size);out=Image.new('RGBA',(cols*cell_w,used_rows*cell_h));uv=[]
    parts=action_parts(im,cols,rows) if name=='p1-actions' else []
    if not parts:
        for y in range(used_rows):
            for x in range(cols):
                part=im.crop((round(x*im.width/cols),round(y*im.height/rows),round((x+1)*im.width/cols),round((y+1)*im.height/rows)))
                bbox=part.getchannel('A').point(lambda a:255 if a>16 else 0).getbbox()
                if not bbox:raise RuntimeError(f'Empty generated frame {name}:{y*cols+x}')
                parts.append(part.crop(bbox))
    # One common scale per costume/creature, preserving head and limb size
    # through crouching, carrying and attack poses.
    group=16 if name=='p1-costumes' else 8
    for index,part in enumerate(parts):
            x,y=index%cols,index//cols
            family=parts[index//group*group:(index//group+1)*group]
            # A horizontal long jump has a wider silhouette, not a smaller head.
            # Actions keep the first pose's body scale and receive wider cells.
            factor=(size-8)/(max(family[0].size) if name=='p1-actions' else max(max(p.width,p.height) for p in family))
            part=part.resize((max(1,round(part.width*factor)),max(1,round(part.height*factor))),Image.Resampling.LANCZOS)
            if part.width+8>cell_w or part.height+8>cell_h:raise RuntimeError(f'Frame overflows packing cell: {name}:{index}')
            px=x*cell_w+(cell_w-part.width)//2;py=y*cell_h+cell_h-4-part.height
            out.alpha_composite(part,(px,py))
            if name=='p1-actions':
                rect=(x*cell_w+(cell_w-size)//2,y*cell_h+cell_h-size,size,size) if index%8==0 else (px-4,py-4,part.width+8,part.height+8)
                uv.append([rect[0]/out.width,rect[1]/out.height,rect[2]/out.width,rect[3]/out.height])
    out.save(root/'assets/runtime'/f'{name}.png',optimize=True)
    frames[name]=uv or [[x/cols,y/used_rows,1/cols,1/used_rows] for y in range(used_rows) for x in range(cols)]
    (root/'assets'/f'{name}.provenance.json').write_text(json.dumps({'generator':'built-in image_gen','generated':'2026-10-29','source':source,'grid':[cols,rows],'runtimeGrid':[cols,used_rows],'runtimeCell':[cell_w,cell_h],'referenceSize':size,'processing':'Only deterministic atlas slicing, connected alpha-bound measurement, transparent padding and downscaling; no painted replacements. Unused supplemental rows removed from costumes.','promptDocument':'P1_ASSETS.md'},ensure_ascii=False,indent=2),encoding='utf-8')
    print(name,out.size)
frames_path.write_text(json.dumps(frames,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
