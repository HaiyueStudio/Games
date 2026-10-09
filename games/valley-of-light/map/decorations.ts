import type { MapObject, ObjectColors, Vec3 } from './model';
export interface DecorationMesh { color:keyof ObjectColors; positions:Float32Array; normals:Float32Array }
/** Deterministic, flat-shaded scenery. Each color produces one mesh per object. */
export function decorationMeshes(o:MapObject):DecorationMesh[] {
  type Color=keyof ObjectColors;
  const batches=new Map<Color,{positions:number[];normals:number[]}>();
  const scaled=(p:Vec3):Vec3=>[p[0]*o.length,p[1]*o.rise,p[2]*o.width];
  function triangle(color:Color,a:Vec3,b:Vec3,c:Vec3){
    [a,b,c]=[a,b,c].map(scaled) as [Vec3,Vec3,Vec3];const u=b.map((v,i)=>v-a[i]!) as Vec3,v=c.map((v,i)=>v-a[i]!) as Vec3,n:Vec3=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],size=Math.hypot(...n);if(size<1e-12)return;
    const batch=batches.get(color)??{positions:[],normals:[]};for(const p of [a,b,c]){batch.positions.push(...p);batch.normals.push(...n.map(v=>v/size));}batches.set(color,batch);
  }
  function quad(color:Color,a:Vec3,b:Vec3,c:Vec3,d:Vec3){triangle(color,a,b,c);triangle(color,a,c,d);}
  type Ring={y:number;w:number;d?:number;x?:number;z?:number;turn?:number};
  function loft(color:Color|((ring:number,side:number)=>Color),rings:Ring[],sides=4){
    const points=rings.map(r=>Array.from({length:sides},(_,i)=>{const angle=i*2*Math.PI/sides+(r.turn??Math.PI/4),scale=sides===4?Math.SQRT1_2:.5;return [(r.x??0)+Math.cos(angle)*r.w*scale,r.y,(r.z??0)+Math.sin(angle)*(r.d??r.w)*scale] as Vec3;}));
    for(let j=1;j<points.length;j++)for(let i=0;i<sides;i++){const a=points[j-1]!,b=points[j]!,k=(i+1)%sides;quad(typeof color==='function'?color(j,i):color,a[i]!,b[i]!,b[k]!,a[k]!);}
    for(const j of [0,points.length-1]){const p=points[j]!,c=rings[j]!,center:Vec3=[c.x??0,c.y,c.z??0],key=typeof color==='function'?color(j,0):color;for(let i=0;i<sides;i++){const a=p[i]!,b=p[(i+1)%sides]!;if(j===0)triangle(key,center,a,b);else triangle(key,center,b,a);}}
  }
  function box(color:Color,x:number,y:number,z:number,w:number,h:number,d=w){loft(color,[{x,y,z,w,d},{x,y:y+h,z,w,d}]);}
  if(o.type===13){
    for(const x of [-.3,.3])for(const z of [-.3,.3]){box('base',x,0,z,.12,.035);box('surface',x,.035,z,.065,.425);box('base',x,.43,z,.115,.035);}
    box('base',0,.455,0,1,.035);box('hub',0,.49,0,1.02,.035);
    loft('hub',[{y:.525,w:1.02},{y:.57,w:.84},{y:.66,w:.49},{y:.76,w:.13},{y:.8,w:0}]);
    box('tips',0,.72,0,.025,.265);loft('tips',[{y:.96,w:0},{y:.98,w:.11},{y:1,w:0}]);
    const edge=(i:number,lower:boolean):Vec3=>{const t=i/16;return [.02+t*.82,.943-.09*t+(lower?-(.068-.025*t):0),Math.sin(t*Math.PI*2)*.09];};
    for(let i=0;i<16;i++)quad('spokes',edge(i,true),edge(i,false),edge(i+1,false),edge(i+1,true));
  }else if(o.type===14){
    loft((ring,side)=>side%3===0?'hub':(ring+side)%4===0?'base':'surface',[
      {y:0,w:.62,d:.63,turn:.16},{y:.12,w:.86,d:.8,turn:.1},{y:.57,w:.91,d:.88,x:.025,turn:.22},{y:.88,w:.66,d:.61,x:.045,turn:.12},{y:1,w:.28,d:.27,x:-.015,turn:.22},
    ],6);
  }else if(o.type===15){
    box('base',0,0,0,.76,.05);box('surface',0,.05,0,.64,.47);box('base',0,.48,0,.78,.045);box('spokes',0,.525,0,.84,.035);
    for(const sign of [-1,1]){box('spokes',sign*.37,.56,0,.1,.06,.74);box('spokes',0,.56,sign*.37,.74,.06,.1);}
    for(const x of [-.36,0,.36])for(const z of [-.36,0,.36])if(x!==0||z!==0)box('spokes',x,.61,z,.13,.085);
    loft('hub',[{y:.56,w:.6},{y:1,w:0}]);
  }else if(o.type===16){
    for(const [x,z,h,angle] of [[-.24,-.06,.72,.2],[.18,-.2,1,.6],[.13,.25,.6,-.2]]){
      box('spokes',x!,0,z!,.016,h!*.82);
      for(const sign of [-1,1]){const a:Vec3=[x!,h!*.26,z!],b:Vec3=[x!+sign*.17,h!*.36,z!+.055],c:Vec3=[x!+sign*.23,h!*.31,z!],d:Vec3=[x!+sign*.1,h!*.22,z!-.04];quad('base',a,b,c,d);}
      for(let i=0;i<5;i++){const a=i*Math.PI*2/5+angle!,dx=Math.cos(a),dz=Math.sin(a),center:Vec3=[x!,h!*.9,z!],tip:Vec3=[x!+dx*.19,h!*.87,z!+dz*.19];quad('surface',center,[x!+dx*.1-dz*.055,h!,z!+dz*.1+dx*.055],tip,[x!+dx*.1+dz*.055,h!,z!+dz*.1-dx*.055]);}
      loft('hub',[{x:x!,z:z!,y:h!*.91,w:.085},{x:x!,z:z!,y:h!*.985,w:.06}],6);
    }
  }else if(o.type===18||o.type===19){
    for(const x of [-.4,.4]){
      box('base',x,0,0,.24,.065,1.12);
      box('surface',x,.065,0,.2,o.type===18?.555:.765,1);
      if(o.type===19)box('base',x,.8,0,.25,.07,1.12);
    }
    if(o.type===19)box('hub',0,.87,0,1,.13,1.12);
    else {
      // Real open arch: front/back rings, outer wall and soffit; no plane fills the opening.
      const edge=(angle:number,inner:boolean,z:number):Vec3=>[Math.cos(angle)*(inner?.3:.5),.62+Math.sin(angle)*(inner?.25:.38),z];
      for(let i=0;i<12;i++){
        const a=i*Math.PI/12,b=(i+1)*Math.PI/12,key=i===5||i===6?'hub':'surface';
        const ob=edge(a,false,-.5),ob1=edge(b,false,-.5),ib=edge(a,true,-.5),ib1=edge(b,true,-.5),of=edge(a,false,.5),of1=edge(b,false,.5),inf=edge(a,true,.5),inf1=edge(b,true,.5);
        quad(key,of,of1,inf1,inf);quad(key,ib,ib1,ob1,ob);
        quad(key,ob,ob1,of1,of);quad(key,ib1,ib,inf,inf1);
        if(i===0)quad(key,ib,ob,of,inf);if(i===11)quad(key,ob1,ib1,inf1,of1);
      }
    }
  }
  return [...batches].map(([color,data])=>({color,positions:new Float32Array(data.positions),normals:new Float32Array(data.normals)}));
}
export function decorationBounds(o:MapObject):Vec3[] {
  const vertices=decorationMeshes(o).flatMap(m=>Array.from({length:m.positions.length/3},(_,i)=>Array.from(m.positions.slice(i*3,i*3+3)) as Vec3));
  if(!vertices.length)return [[0,0,0]];
  const min=[0,1,2].map(i=>Math.min(...vertices.map(p=>p[i]!))),max=[0,1,2].map(i=>Math.max(...vertices.map(p=>p[i]!)));
  return [min[0]!,max[0]!].flatMap(x=>[min[1]!,max[1]!].flatMap(y=>[min[2]!,max[2]!].map(z=>[x,y,z] as Vec3)));
}
