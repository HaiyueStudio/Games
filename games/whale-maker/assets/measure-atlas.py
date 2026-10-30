"""Measure largest alpha component per cell, preserving original generated pixels."""
from PIL import Image
from pathlib import Path
import json
root = Path(__file__).parent
result = {}
for name in ['characters', 'world', 'expansion', 'actions', 'coins', 'tokens', 'eating', 'shell', 'checkpoint', 'cheer', 'gadgets', 'creatures', 'environment', 'motion', 'transit', 'clear']:
    image = Image.open(root / ('transit-v2.png' if name=='transit' else name + '.png')).convert('RGBA')
    width, height = image.size
    full_alpha = image.getchannel('A').tobytes()
    frames = []
    columns = 1 if name == 'shell' else 2 if name == 'clear' else 3 if name == 'coins' else 4
    row_count = 2 if name in ['eating', 'cheer'] else columns
    for index in range(columns * row_count):
        # Actions use unequal-height rows in the original generated composition.
        rows = [0, .329, .531, .797, 1] if name == 'actions' else [i / row_count for i in range(row_count + 1)]
        x0, y0 = round(index % columns * width / columns), round(rows[index // columns] * height)
        x1, y1 = round((index % columns + 1) * width / columns), round(rows[index // columns + 1] * height)
        alpha = image.getchannel('A').crop((x0, y0, x1, y1))
        w, h = alpha.size
        data = alpha.tobytes()
        remaining = {i for i, a in enumerate(data) if a > 40}
        largest = []
        while remaining:
            start = remaining.pop()
            component = [start]
            stack = [start]
            while stack:
                p = stack.pop()
                neighbors = []
                if p % w: neighbors.append(p - 1)
                if p % w < w - 1: neighbors.append(p + 1)
                if p >= w: neighbors.append(p - w)
                if p < w * (h - 1): neighbors.append(p + w)
                for n in neighbors:
                    if n in remaining:
                        remaining.remove(n)
                        stack.append(n)
                        component.append(n)
            if len(component) > len(largest): largest = component
        left, right = min(p % w for p in largest), max(p % w for p in largest) + 1
        top, bottom = min(p // w for p in largest), max(p // w for p in largest) + 1
        if name == 'shell':
            left, top = max(0, left-2), max(0, top-2)
            right, bottom = min(w, right+2), min(h, bottom+2)
        if name in ['tokens', 'eating', 'checkpoint', 'cheer', 'gadgets', 'creatures', 'motion', 'transit']:
            seed = (y0 + largest[0] // w) * width + x0 + largest[0] % w
            todo, seen = [seed], {seed}
            while todo:
                pos = todo.pop()
                for n in (pos-1,pos+1,pos-width,pos+width):
                    if n<0 or n>=width*height or abs(n%width-pos%width)>1 or n in seen or full_alpha[n]<=40: continue
                    seen.add(n);todo.append(n)
            left,top = min(n%width for n in seen)-x0,min(n//width for n in seen)-y0
            right,bottom = max(n%width for n in seen)+1-x0,max(n//width for n in seen)+1-y0
        frames.append([round((x0 + left) / width, 6), round((y0 + top) / height, 6), round((right - left) / width, 6), round((bottom - top) / height, 6)])
    if name == 'world':
        # The cloud extends 12 pixels left of its nominal cell. Follow its whole
        # connected silhouette across that cell boundary, retaining antialiasing.
        alpha = image.getchannel('A').tobytes()
        seed = round(.9 * height) * width + round(.625 * width)
        todo, seen = [seed], {seed}
        while todo:
            pos = todo.pop()
            for n in (pos - 1, pos + 1, pos - width, pos + width):
                if n < 0 or n >= width * height or abs(n % width - pos % width) > 1 or n in seen or alpha[n] <= 40: continue
                seen.add(n); todo.append(n)
        left, top = max(0,min(n % width for n in seen)-2), max(0,min(n // width for n in seen)-2)
        right, bottom = min(width,max(n % width for n in seen)+3), min(height,max(n // width for n in seen)+3)
        frames[14] = [left / width, top / height, (right-left) / width, (bottom-top) / height]
    if name in ['eating', 'cheer']:
        for row in [0,1]:
            group=frames[row*4:row*4+4]
            canvas_width,canvas_height=max(f[2] for f in group),max(f[3] for f in group)
            for i,f in enumerate(group): frames[row*4+i]=[f[0]+f[2]/2-canvas_width/2,f[1]+f[3]-canvas_height,canvas_width,canvas_height]
    if name in ['expansion', 'actions']:
        # Keep the same source box for all four walking frames in a row. This
        # preserves body scale and foot baseline rather than resizing each pose.
        for row in [0, 1]:
            group = frames[row * 4:row * 4 + 4]
            left = min(f[0] - i / 4 for i, f in enumerate(group))
            top = min(f[1] for f in group)
            right = max(f[0] - i / 4 + f[2] for i, f in enumerate(group))
            bottom = max(f[1] + f[3] for f in group)
            for i in range(4): frames[row * 4 + i] = [i / 4 + left, top, right - left, bottom - top]
        if name == 'actions':
            for start in [8, 12]:
                group = frames[start:start + 3]
                left = min(f[0] - i / 4 for i, f in enumerate(group))
                top = min(f[1] for f in group)
                right = max(f[0] - i / 4 + f[2] for i, f in enumerate(group))
                bottom = max(f[1] + f[3] for f in group)
                for i in range(3): frames[start + i] = [i / 4 + left, top, right - left, bottom - top]
    if name in ['coins', 'tokens']:
        # Every turning coin keeps one common canvas, including narrow edge views.
        group = frames[:8 if name == 'coins' else 16]
        canvas_width = max(f[2] for f in group)
        canvas_height = max(f[3] for f in group)
        for i, f in enumerate(group): frames[i] = [f[0] + f[2] / 2 - canvas_width / 2, f[1] + f[3] - canvas_height, canvas_width, canvas_height]
    if name in ['creatures', 'motion', 'environment', 'gadgets']:
        groups = [list(range(i,i+4)) for i in range(0,16,4)] if name == 'creatures' else [list(range(4)),list(range(4,8)),[8,9],[10,11],[12,13],[14,15]] if name == 'motion' else [[12,13,14,15]] if name == 'environment' else [[11,12],[13,14]]
        for ids in groups:
            group=[frames[i] for i in ids];cw,ch=max(f[2] for f in group),max(f[3] for f in group)
            for i in ids:
                f=frames[i];frames[i]=[f[0]+f[2]/2-cw/2,f[1]+f[3]-ch,cw,ch]
        frames=[[max(0,min(1-f[2],f[0])),max(0,min(1-f[3],f[1])),f[2],f[3]] for f in frames]
    result[name] = frames
# The adventure sheet has unequal row heights in the original composition.
image=Image.open(root/'adventure.png').convert('RGBA')
width,height=image.size
rows=[0,.267,.535,.785,1]
frames=[]
for index in range(16):
    x0=round(index%4*width/4);x1=round((index%4+1)*width/4)
    y0=round(rows[index//4]*height);y1=round(rows[index//4+1]*height)
    box=image.getchannel('A').crop((x0,y0,x1,y1)).point(lambda a:255 if a>50 else 0).getbbox()
    left,top,right,bottom=box
    left=max(0,left-1);top=max(0,top-1);right=min(x1-x0,right+1);bottom=min(y1-y0,bottom+1)
    frames.append([(x0+left)/width,(y0+top)/height,(right-left)/width,(bottom-top)/height])
for ids in [[1,2],[3,4,5],list(range(8,12)),list(range(12,16))]:
    cw=max(frames[i][2] for i in ids);ch=max(frames[i][3] for i in ids)
    for i in ids:
        f=frames[i];frames[i]=[max(0,min(1-cw,f[0]+f[2]/2-cw/2)),max(0,min(1-ch,f[1]+f[3]-ch)),cw,ch]
result['adventure']=frames
from advanced_frames import measure_advanced
result.update(measure_advanced(root))
(root / 'frames.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
print(f'Measured {sum(len(frames) for frames in result.values())} frames without modifying image pixels.')
