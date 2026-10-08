/** Serializable input to the valley static-geometry worker. Source meshes remain picking proxies. */
export interface StaticPrimitive {
  positions:Float32Array; normals:Float32Array|null; indices:Uint16Array|Uint32Array|null;
  matrix:number[]; box:boolean; color:string; cullMode:'none'|'front'|'back'; frontFace:'ccw'|'cw';
}
export interface StaticBatch {
  positions:Float32Array; normals:Float32Array; indices:Uint32Array;
  color:string; cullMode:'none'|'front'|'back'; frontFace:'ccw'|'cw';
}
export interface StaticCompilation {
  batches:StaticBatch[];
  stats:{sourceMeshes:number;sourceTriangles:number;meshes:number;triangles:number;removedFaces:number;mergedFaces:number;buildMs:number};
}
/** Self-contained so the same tested compiler can run in a module worker without engine dependencies. */
export function compileStaticPaths(input:StaticPrimitive[]):StaticCompilation {
  const started=performance.now(),epsilon=1e-6;
  type Face={axis:number;sign:number;plane:number;u0:number;u1:number;v0:number;v1:number;key:string};
  type Output={color:string;cullMode:StaticBatch['cullMode'];frontFace:StaticBatch['frontFace'];p:number[];n:number[];i:number[]};
  const outputs=new Map<string,Output>(),faces:Face[]=[];
  const quant=(n:number)=>Math.round(n/epsilon),near=(a:number,b:number)=>Math.abs(a-b)<epsilon;
  const transform=(m:number[],x:number,y:number,z:number)=>[m[0]!*x+m[4]!*y+m[8]!*z+m[12]!,m[1]!*x+m[5]!*y+m[9]!*z+m[13]!,m[2]!*x+m[6]!*y+m[10]!*z+m[14]!];
  let sourceTriangles=0,removedFaces=0,mergedFaces=0;
  for(const part of input){
    const key=JSON.stringify([part.color.toLowerCase(),part.cullMode,part.frontFace]);
    let out=outputs.get(key);if(!out){out={color:part.color,cullMode:part.cullMode,frontFace:part.frontFace,p:[],n:[],i:[]};outputs.set(key,out);}
    const m=part.matrix,p=part.positions;
    sourceTriangles+=(part.indices?.length??p.length/3)/3;
    // Cofactors give the inverse-transpose normal matrix, including non-uniform group scales.
    const a=[m[0]!,m[1]!,m[2]!],b=[m[4]!,m[5]!,m[6]!],c=[m[8]!,m[9]!,m[10]!];
    const cross=(x:number[],y:number[])=>[x[1]!*y[2]!-x[2]!*y[1]!,x[2]!*y[0]!-x[0]!*y[2]!,x[0]!*y[1]!-x[1]!*y[0]!];
    const na=cross(b,c),nb=cross(c,a),nc=cross(a,b),det=a.reduce((sum,v,i)=>sum+v*na[i]!,0);
    const axes=[a,b,c].map(col=>col.map((v,i)=>Math.abs(v)>epsilon?i:-1).filter(i=>i>=0));
    const aligned=part.box&&part.cullMode==='back'&&part.frontFace==='ccw'&&det>epsilon&&axes.every(x=>x.length===1)&&new Set(axes.flat()).size===3;
    if(aligned){
      const low=[Infinity,Infinity,Infinity],high=[-Infinity,-Infinity,-Infinity];
      for(let j=0;j<p.length;j+=3){const point=transform(m,p[j]!,p[j+1]!,p[j+2]!);for(let k=0;k<3;k++){low[k]=Math.min(low[k]!,point[k]!);high[k]=Math.max(high[k]!,point[k]!);}}
      for(let axis=0;axis<3;axis++)for(const sign of [-1,1]){const u=(axis+1)%3,v=(axis+2)%3;faces.push({axis,sign,plane:(sign>0?high:low)[axis]!,u0:low[u]!,u1:high[u]!,v0:low[v]!,v1:high[v]!,key});}
    }else{
      const offset=out.p.length/3;
      for(let j=0;j<p.length;j+=3){out.p.push(...transform(m,p[j]!,p[j+1]!,p[j+2]!));const n=part.normals, x=n?.[j]??0,y=n?.[j+1]??1,z=n?.[j+2]??0;
        const v=[0,1,2].map(k=>(na[k]!*x+nb[k]!*y+nc[k]!*z)/(det||1)),len=Math.hypot(...v)||1;out.n.push(...v.map(x=>x/len));}
      if(part.indices)for(const index of part.indices)out.i.push(offset+index);else for(let i=0;i<p.length/3;i++)out.i.push(offset+i);
    }
  }
  // Only real, complete face-to-face contacts qualify. Screen-aligned optical seams never do.
  const contacts=new Map<string,Face[]>();
  for(const f of faces){const key=[f.axis,...[f.plane,f.u0,f.u1,f.v0,f.v1].map(quant)].join(',');const list=contacts.get(key)??[];
    const match=list.findIndex(g=>g.sign===-f.sign&&['plane','u0','u1','v0','v1'].every(k=>near(g[k as 'plane'],f[k as 'plane'])));
    if(match>=0){list.splice(match,1);removedFaces+=2;}else list.push(f);contacts.set(key,list);
  }
  const planes=new Map<string,Face[]>();
  for(const list of contacts.values())for(const f of list){const key=[f.key,f.axis,f.sign,quant(f.plane)].join(':');const group=planes.get(key)??[];group.push(f);planes.set(key,group);}
  // Merge rectangular coplanar neighbors in both directions. Gaps, bends and colors are preserved.
  for(let rects of planes.values()){
    let changed=true;
    while(changed){changed=false;for(const vertical of [false,true]){
      const rows=new Map<string,Face[]>();
      for(const f of rects){const key=(vertical?[f.u0,f.u1]:[f.v0,f.v1]).map(quant).join(',');const row=rows.get(key)??[];row.push(f);rows.set(key,row);}
      const merged:Face[]=[];
      for(const row of rows.values()){
        const start=vertical?'v0':'u0',end=vertical?'v1':'u1',fixed0=vertical?'u0':'v0',fixed1=vertical?'u1':'v1';
        row.sort((a,b)=>a[start]-b[start]);let previous:Face|null=null;
        for(const f of row){if(previous&&near(previous[end],f[start])&&near(previous.plane,f.plane)&&near(previous[fixed0],f[fixed0])&&near(previous[fixed1],f[fixed1])){previous[end]=f[end];changed=true;mergedFaces++;}else{previous={...f};merged.push(previous);}}
      }rects=merged;
    }}
    for(const f of rects){const out=outputs.get(f.key)!,offset=out.p.length/3,u=(f.axis+1)%3,v=(f.axis+2)%3,n=[0,0,0];n[f.axis]=f.sign;
      for(const [x,y] of [[f.u0,f.v0],[f.u1,f.v0],[f.u1,f.v1],[f.u0,f.v1]]){const p=[0,0,0];p[f.axis]=f.plane;p[u]=x!;p[v]=y!;out.p.push(...p);out.n.push(...n);}
      for(const i of f.sign>0?[0,1,2,0,2,3]:[0,2,1,0,3,2])out.i.push(offset+i);
    }
  }
  const batches=[...outputs.values()].filter(o=>o.i.length).map(o=>({color:o.color,cullMode:o.cullMode,frontFace:o.frontFace,positions:new Float32Array(o.p),normals:new Float32Array(o.n),indices:new Uint32Array(o.i)}));
  return {batches,stats:{sourceMeshes:input.length,sourceTriangles,meshes:batches.length,triangles:batches.reduce((n,b)=>n+b.indices.length/3,0),removedFaces,mergedFaces,buildMs:performance.now()-started}};
}

/** Heavy topology work is isolated in a disposable, capability-specific module worker. */
export function startStaticCompilation(input:StaticPrimitive[],ready:(result:StaticCompilation)=>void,failed:(message:string)=>void):()=>void {
  let worker:Worker|null=null,url:string|null=null,timer:ReturnType<typeof setTimeout>|null=null;
  const dispose=()=>{if(timer!==null)clearTimeout(timer);worker?.terminate();worker=null;if(url)URL.revokeObjectURL(url);url=null;};
  try{
    const source=`const compile=${compileStaticPaths.toString()};self.onmessage=event=>{try{const result=compile(event.data);self.postMessage(result,result.batches.flatMap(b=>[b.positions.buffer,b.normals.buffer,b.indices.buffer]));}catch(error){self.postMessage({error:String(error)});}};`;
    url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));worker=new Worker(new URL(url),{type:'module',name:'valley-static-paths'});
    worker.onmessage=event=>{dispose();if(event.data.error)failed(event.data.error);else ready(event.data as StaticCompilation);};
    worker.onerror=event=>{dispose();failed(event.message||'静态路径合并失败');};
    timer=setTimeout(()=>{dispose();failed('静态路径合并超时');},30000);
    worker.postMessage(input,input.flatMap(p=>[p.positions.buffer,...(p.normals?[p.normals.buffer]:[]),...(p.indices?[p.indices.buffer]:[])]));
  }catch(error){dispose();failed(String(error));}
  return dispose;
}
