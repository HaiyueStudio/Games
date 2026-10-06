from pathlib import Path
from PIL import Image, ImageDraw
import numpy as np
import hashlib,json
root=Path(__file__).resolve().parents[2]
records=[]
for source,target in [('hull-generated.png','boss-quantum-dreadnought.png'),('turret-generated.png','fx-quantum-turret.png')]:
 path=root/'masters/quantum-turrets'/source
 rgb=np.array(Image.open(path).convert('RGB'))
 # Only neutral, bright pixels connected to the outside belong to the baked matte.
 neutral=rgb.max(axis=2).astype(int)-rgb.min(axis=2).astype(int)
 candidate=(neutral<38)&(rgb.min(axis=2)>120)
 mask=Image.fromarray((candidate*255).astype('uint8')).copy()
 ImageDraw.floodfill(mask,(0,0),128,thresh=0)
 removed=np.array(mask)==128
 assert .2<float(removed.mean())<.8, 'unexpected matte coverage'
 alpha=np.where(removed,0,255).astype('uint8')
 result=Image.fromarray(np.dstack((rgb,alpha)))
 result.save(root/target)
 records.append(dict(source=source,target=target,sourceSha256=hashlib.sha256(path.read_bytes()).hexdigest(),resultSha256=hashlib.sha256((root/target).read_bytes()).hexdigest(),clearPixels=int(removed.sum()),totalPixels=int(removed.size),retainedRgbUnchanged=True))
 print(target,round(float(removed.mean())*100,2),'percent transparent')
(root/'masters/quantum-turrets/alpha-preparation.json').write_text(json.dumps(records,indent=2)+'\n')
