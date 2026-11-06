"""Measure new generated atlases. Never modify source PNG pixels."""
from pathlib import Path
from PIL import Image
import json
import numpy as np

def components(image, threshold):
    """Run-length connected components, used only to find complete sprite bounds."""
    mask=np.asarray(image.getchannel('A'))>threshold
    parents, boxes, previous = [], [], []
    def root(i):
        while parents[i]!=i:
            parents[i]=parents[parents[i]]
            i=parents[i]
        return i
    def union(a,b):
        a,b=root(a),root(b)
        if a==b:return
        parents[b]=a
        x,y,r,bt,area=boxes[b]
        c=boxes[a]
        boxes[a]=[min(c[0],x),min(c[1],y),max(c[2],r),max(c[3],bt),c[4]+area]
    for y,row in enumerate(mask):
        edges=np.flatnonzero(np.diff(np.pad(row.astype(np.int8),(1,1))))
        current=[]
        j=0
        for left,right in zip(edges[::2],edges[1::2]):
            left,right=int(left),int(right)
            i=len(parents);parents.append(i);boxes.append([left,y,right,y+1,right-left])
            while j<len(previous) and previous[j][1]<=left:j+=1
            k=j
            while k<len(previous) and previous[k][0]<right:
                union(i,previous[k][2]);k+=1
            current.append((left,right,i))
        previous=current
    return [box for i,box in enumerate(boxes) if parents[i]==i and box[4]>80]

SPECS = {
    'mechanics': ([0, .25, .5, .72, 1], [[0,1], [4,5], [6,7,8,9], [10,11,15]], 110),
    'motion2': ([0, .31, .56, .785, 1], [[0,1], [5,6], [8,9], [13,14]], 110),
    'squid2': ([0,1], [[0,1,2,3]], 60),
    'fire-base': ([0,.55,1], [[0,1,2,3], [4,5,6,7]], 60),
    'fire-actions': ([0,.31,.55,.805,1], [[0,1,2,3], [4,5,6,7], [8,9,10,11], [12,13,14,15]], 60),
    'fire-motion': ([0,.315,.545,.78,1], [[0,1,2,3], [4,5,6,7], [8,9], [12,13]], 60),
    'fire-extra': ([0,.31,.53,.78,1], [[0,1,2,3], [4,5,6,7], [8,9,10,11], [12,13,14,15]], 60),
    'devices': ([0,.4,.685,1], [[2,3], [4,5,6,7], [8,9]], 60),
}

def measure_advanced(root):
    result = {}
    for name, (rows, groups, threshold) in SPECS.items():
        image = Image.open(root / (name + '.png')).convert('RGBA')
        width, height = image.size
        complete=components(image,threshold) if name!='mechanics' else None
        frames = []
        for n in range((len(rows)-1)*4):
            x0, x1 = round(n%4*width/4), round((n%4+1)*width/4)
            y0, y1 = round(rows[n//4]*height), round(rows[n//4+1]*height)
            if complete:
                box=max(complete,key=lambda b:max(0,min(x1,b[2])-max(x0,b[0]))*max(0,min(y1,b[3])-max(y0,b[1]))*b[4]/((b[2]-b[0])*(b[3]-b[1])))
                left,top,right,bottom,_=box
            else:
                left,top,right,bottom=image.getchannel('A').crop((x0,y0,x1,y1)).point(lambda a:255 if a>threshold else 0).getbbox()
                left+=x0;right+=x0;top+=y0;bottom+=y0
            frames.append([left/width,top/height,(right-left)/width,(bottom-top)/height])
        for ids in groups:
            cw, ch = max(frames[i][2] for i in ids), max(frames[i][3] for i in ids)
            for i in ids:
                f=frames[i]
                frames[i]=[max(0,min(1-cw,f[0]+f[2]/2-cw/2)),max(0,min(1-ch,f[1]+f[3]-ch)),cw,ch]
        if name=='mechanics':
            frames[13]=[.36,.742,.12,.09]
        result[name]=frames
    return result

if __name__=='__main__':
    root=Path(__file__).parent
    path=root/'frames.json'
    frames=json.loads(path.read_text(encoding='utf-8'))
    frames.update(measure_advanced(root))
    path.write_text(json.dumps(frames,indent=2)+'\n',encoding='utf-8')
    print('Measured advanced atlas UV rectangles; PNGs unchanged.')
