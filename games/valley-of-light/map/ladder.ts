import type { MapObject, Vec3 } from './model';
/** Rails and rungs share two meshes regardless of rung count. */
export function ladderMeshes(o:MapObject):Array<{color:'surface'|'hub';positions:Float32Array;normals:Float32Array}> {
  const batches={surface:{positions:[] as number[],normals:[] as number[]},hub:{positions:[] as number[],normals:[] as number[]}};
  function box(color:'surface'|'hub',center:Vec3,size:Vec3){
    const batch=batches[color];
    for(let axis=0;axis<3;axis++)for(const sign of [-1,1]){
      const u=(axis+1)%3,v=(axis+2)%3,n=[0,0,0];n[axis]=sign;
      const corners=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>{const p=[...center];p[axis]!+=sign*size[axis]!/2;p[u]!+=a!*size[u]!/2;p[v]!+=b!*size[v]!/2;return p;});
      for(const i of sign>0?[0,1,2,0,2,3]:[0,2,1,0,3,2]){batch.positions.push(...corners[i]!);batch.normals.push(...n);}
    }
  }
  for(const x of [-o.width/2,o.width/2])box('surface',[x,o.rise/2+.12,0],[.055,o.rise+.32,.09]);
  for(let i=0;i<=o.steps;i++)box('hub',[0,i*o.rise/o.steps,.045],[o.width+.055,.055,.15]);
  return (['surface','hub'] as const).map(color=>({color,positions:new Float32Array(batches[color].positions),normals:new Float32Array(batches[color].normals)}));
}
