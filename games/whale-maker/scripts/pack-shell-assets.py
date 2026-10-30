"""Pack the generated, unmodified shell atlas into four alpha-preserving runtime samples."""
from pathlib import Path
from PIL import Image
import json

root=Path(__file__).resolve().parents[1]/'assets'
source=root/'shell-equipment.png'
image=Image.open(source).convert('RGBA')
atlas=Image.new('RGBA',(4*104,104))
frames=[]
for index in range(4):
    left=round(index*image.width/4)
    right=round((index+1)*image.width/4)
    cell=image.crop((left,0,right,image.height))
    bounds=cell.getchannel('A').point(lambda a:255 if a>70 else 0).getbbox()
    if bounds is None:raise ValueError(f'Empty shell frame {index}')
    part=cell.crop(bounds)
    scale=96/max(part.size)
    part=part.resize((round(part.width*scale),round(part.height*scale)),Image.Resampling.LANCZOS)
    x=index*104+(104-part.width)//2
    y=100-part.height
    atlas.alpha_composite(part,(x,y))
    frames.append([x/atlas.width,y/atlas.height,part.width/atlas.width,part.height/atlas.height])
target=root/'runtime/shell-equipment.png'
atlas.save(target,optimize=True)
path=root/'runtime/frames.json'
data=json.loads(path.read_text(encoding='utf8'))
data['shell-equipment']=frames
path.write_text(json.dumps(data,indent=2)+'\n',encoding='utf8')
path=root/'runtime/packing.json'
report=json.loads(path.read_text(encoding='utf8'))
old=report.get('shell-equipment',{'sourceBytes':0,'runtimeBytes':0})
entry={'source':source.name,'sourceBytes':source.stat().st_size,'runtimeBytes':target.stat().st_size,'size':list(atlas.size),'used':[0,1,2,3],'removed':[]}
report['shell-equipment']=entry
for key in ['sourceBytes','runtimeBytes']:report['totals'][key]+=entry[key]-old[key]
report['totals']['reduction']=round(1-report['totals']['runtimeBytes']/report['totals']['sourceBytes'],4)
path.write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
print(json.dumps(entry))
