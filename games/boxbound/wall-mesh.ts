import { entrances, type Room, type Vec } from './model';
import { wallRuns } from './visuals';

export interface SurfaceMesh {
  key: string;
  positions: number[];
  normals: number[];
  indices: number[];
  scale?: number;
  flipX?: boolean;
}
export interface ArchedWall {
  min: Vec;
  max: Vec;
  center: Vec;
  size: Vec;
  body: SurfaceMesh;
  roof: SurfaceMesh;
}
const STEPS = 4;
const SHOULDER = 0.76;
const CROWN = 1.06;
const empty = (key: string): SurfaceMesh => ({key, positions: [], normals: [], indices: []});

/** Game-specific wall model: a shared curved roof over the barrier footprint.
 * Internal cell edges have no side faces; roof heights/normals use the same
 * perimeter-distance field on both sides of a join, including L/T junctions.
 */
export function archedWalls(room: Room): ArchedWall[] {
  const occupied = new Set(room.walls.map(p => p.join(',')));
  const cells = (room.barriers ?? []).filter(p => occupied.has(p.join(','))).slice().sort((a,b)=>a[1]-b[1]||a[2]-b[2]||a[0]-b[0]);
  const forbidden = new Set(cells.map(p => p.join(',')));
  const runs = wallRuns({...room, walls: cells});
  const groups = runs.map((run, i): ArchedWall => {
    const min = [...run.min] as Vec, max = [...run.max] as Vec;
    // Include door jamb extensions in the bounds used for culling/occlusion.
    for (const door of entrances(room)) {
      const inset = (1 - door.width) / 2, axis = door.direction[0] ? 0 : 2, across = axis === 0 ? 2 : 0;
      const edge = door.direction[axis]! > 0 ? room.size - 1 : 0, mid = Math.floor(room.size / 2);
      if (min[1] > 0 || min[axis]! > edge || max[axis]! <= edge) continue;
      if (max[across] === mid - .5) max[across] += inset;
      if (min[across] === mid + .5) min[across] -= inset;
    }
    max[1] += CROWN - 1;
    return {min, max, center: min.map((v,j)=>(v+max[j]!)/2) as Vec,
      size: min.map((v,j)=>max[j]!-v) as Vec,
      body: empty(`body/${i}`), roof: empty(`roof/${i}`)};
  });
  type Edge = {a: [number,number]; b: [number,number]; normal: Vec};
  const patches = cells.map(([x,y,z]) => {
    let x0=x-.5,x1=x+.5,z0=z-.5,z1=z+.5;
    for(const door of entrances(room)) {
      if(y!==0)continue;
      const inset=(1-door.width)/2, mid=Math.floor(room.size/2);
      if(door.direction[2] && z===(door.direction[2]>0?room.size-1:0)) {
        if(x===mid-1)x1+=inset;if(x===mid+1)x0-=inset;
      }
      if(door.direction[0] && x===(door.direction[0]>0?room.size-1:0)) {
        if(z===mid-1)z1+=inset;if(z===mid+1)z0-=inset;
      }
    }
    const edges: Edge[]=[];
    if(!forbidden.has([x-1,y,z].join(',')))edges.push({a:[x0,z0],b:[x0,z1],normal:[-1,0,0]});
    if(!forbidden.has([x+1,y,z].join(',')))edges.push({a:[x1,z1],b:[x1,z0],normal:[1,0,0]});
    if(!forbidden.has([x,y,z-1].join(',')))edges.push({a:[x1,z0],b:[x0,z0],normal:[0,0,-1]});
    if(!forbidden.has([x,y,z+1].join(',')))edges.push({a:[x0,z1],b:[x1,z1],normal:[0,0,1]});
    const group=groups[runs.findIndex(r=>x>=r.min[0]&&x<r.max[0]&&y>=r.min[1]&&y<r.max[1]&&z>=r.min[2]&&z<r.max[2])]!;
    return {x,y,z,x0,x1,z0,z1,edges,group,covered:occupied.has([x,y+1,z].join(','))};
  });
  for(const patch of patches) {
    const {x,y,z,x0,x1,z0,z1,group,covered}=patch;
    // Only nearby boundary segments can affect this roof; distant solid areas
    // saturate at the crown. This keeps generation bounded on large maps.
    const nearby=patches.filter(p=>p.y===y&&Math.abs(p.x-x)<=2&&Math.abs(p.z-z)<=2);
    const edges=nearby.flatMap(p=>p.edges);
    const height=(px:number,pz:number)=>{
      if(!nearby.some(p=>px>=p.x0&&px<=p.x1&&pz>=p.z0&&pz<=p.z1))return y+SHOULDER;
      let distance=.5;
      for(const e of edges){
        const ax=Math.min(e.a[0],e.b[0]),bx=Math.max(e.a[0],e.b[0]);
        const az=Math.min(e.a[1],e.b[1]),bz=Math.max(e.a[1],e.b[1]);
        distance=Math.min(distance,Math.hypot(px-Math.max(ax,Math.min(bx,px)),pz-Math.max(az,Math.min(bz,pz))));
      }
      return y+SHOULDER+(CROWN-SHOULDER)*Math.sqrt(Math.max(0,1-(1-distance*2)**2));
    };
    const vertex=(mesh:SurfaceMesh,p:Vec,n:Vec)=>{
      mesh.positions.push(...p.map((v,i)=>v-group.center[i]!));mesh.normals.push(...n);
    };
    if(!covered){
      const offset=group.roof.positions.length/3;
      for(let j=0;j<=STEPS;j++)for(let i=0;i<=STEPS;i++){
        const px=x0+(x1-x0)*i/STEPS,pz=z0+(z1-z0)*j/STEPS,e=.001;
        const dx=(height(px+e,pz)-height(px-e,pz))/(2*e), dz=(height(px,pz+e)-height(px,pz-e))/(2*e);
        const length=Math.hypot(dx,1,dz);
        vertex(group.roof,[px,height(px,pz),pz],[-dx/length,1/length,-dz/length]);
      }
      for(let j=0;j<STEPS;j++)for(let i=0;i<STEPS;i++){
        const a=offset+j*(STEPS+1)+i,b=a+1,c=a+STEPS+1,d=c+1;
        group.roof.indices.push(a,c,b,b,c,d);
      }
    }
    for(const edge of patch.edges){
      const offset=group.body.positions.length/3,top=y+(covered?1:SHOULDER);
      const [ax,az]=edge.a,[bx,bz]=edge.b;
      vertex(group.body,[ax,y,az],edge.normal);vertex(group.body,[bx,y,bz],edge.normal);
      vertex(group.body,[ax,top,az],edge.normal);vertex(group.body,[bx,top,bz],edge.normal);
      group.body.indices.push(offset,offset+1,offset+2,offset+1,offset+3,offset+2);
    }
  }
  // Canonical local model identity lets equal strips in unrelated rooms share
  // one GPU geometry and an instanced draw. World position/map ID is irrelevant.
  for (const group of groups) for (const mesh of [group.body,group.roof]) {
    let a=2166136261,b=0x9e3779b9;
    const feed=(n:number)=>{a=Math.imul(a^n,16777619);b=Math.imul(b^n,2246822519);};
    for(const values of [mesh.positions,mesh.normals]){feed(values.length);for(const v of values)feed(Math.round(v*1e6));}
    feed(mesh.indices.length);for(const i of mesh.indices)feed(i);
    mesh.key=`arched/${a>>>0}/${b>>>0}/${mesh.positions.length}/${mesh.indices.length}`;
  }
  return groups;
}
