import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {createRoundedBox3D,createCylinder3D} from '@haiyue/engine/geometry';
registerHooks({resolve(s,c,next){return next(s.startsWith('./')&&!/\.[a-z]+$/i.test(s)?s+'.ts':s,c);}});
const {transition}=await import('../boxbound/model.ts');
const {containmentTransform,transformPoint,composeSpace}=await import('../boxbound/space-view.ts');
const {decorationParts,DECORATION_BEVEL_SEGMENTS,DECORATION_RADIAL_SEGMENTS}=await import('../boxbound/decoration-mesh.ts');
const room=(id,size=5)=>({id,name:id,size,walls:[],goals:[],home:null,level:0,hint:'',planar:true});
const box=(id,room,pos,inside=null,more={})=>({id,room,pos,inside,size:1,fixed:false,required:false,...more});
function fixture(){return {version:1,rooms:{world:room('world',7),a:room('a'),b:room('b')},boxes:[box('a','world',[2,0,3],'a'),box('b','world',[3,0,3],'b',{fixed:true})],player:{room:'a',pos:[4,0,1],facing:[1,0,0],route:[{box:'a',from:'world',entry:[1,0,3]}]},moves:0,completed:[],paradox:'none',message:''};}
const move=(s,d=[1,0,0])=>transition(s,{type:'move',dir:d});
test('Transfer carries player exit fraction into an adjacent blocked box instead of centering',()=>{
 const s=fixture();s.rooms.b.walls=[[0,0,2]];
 const r=move(s);assert.ok(r.changed);assert.equal(r.state.player.room,'b');assert.deepEqual(r.state.player.pos,[0,0,1]);
});
test('Transfer remaps the fraction through a nested occupied entrance',()=>{
 const s=fixture();s.rooms.c=room('c');s.boxes.push(box('c','b',[0,0,1],'c',{fixed:true}));
 const r=move(s);assert.ok(r.changed);assert.equal(r.state.player.room,'c');assert.deepEqual(r.state.player.pos,[0,0,2]);
});
test('Transfer carries a crate and rolls back all contents when the target edge is blocked',()=>{
 const s=fixture();s.player.pos=[3,0,1];s.boxes.push(box('crate','a',[4,0,1]));
 const r=move(s);assert.ok(r.changed);assert.deepEqual(r.state.boxes.find(b=>b.id==='crate').pos,[0,0,1]);assert.equal(r.state.boxes.find(b=>b.id==='crate').room,'b');
 s.rooms.b.walls=[[0,0,1]];const blocked=move(s);assert.equal(blocked.changed,false);assert.deepEqual(blocked.state.boxes,s.boxes);
});
test('mirrored entry, exit and transverse transfer use the reflected coordinates',()=>{
 const s=fixture();s.boxes[0].flipped=true;
 const r=move(s);assert.ok(r.changed);assert.equal(r.state.player.room,'world');assert.deepEqual(r.state.player.pos,[1,0,3]);
 s.player={room:'world',pos:[1,0,3],facing:[1,0,0],route:[]};s.boxes[0].fixed=true;
 const inside=move(s);assert.ok(inside.changed);assert.equal(inside.state.player.room,'a');assert.deepEqual(inside.state.player.pos,[4,0,2]);
 const t=fixture();t.boxes[0].flipped=true;t.boxes[1].pos=[2,0,4];t.player.pos=[1,0,4];
 const trans=move(t,[0,0,1]);assert.ok(trans.changed);assert.deepEqual(trans.state.player.pos,[3,0,0]);
});
test('moving a container through a mirror toggles its orientation; failed pushes preserve it',()=>{
 const s=fixture();s.boxes[1].flipped=true;s.player.pos=[3,0,1];s.boxes.push(box('cargo','a',[4,0,1],'a'));
 const r=move(s);assert.ok(r.changed);const cargo=r.state.boxes.find(b=>b.id==='cargo');assert.equal(cargo.flipped,true);assert.equal(cargo.room,'b');assert.deepEqual(cargo.pos,[4,0,1]);
 s.rooms.b.walls=[[4,0,1]];s.rooms.a.walls=[[0,0,2]];const failed=move(s);assert.equal(failed.changed,false);assert.deepEqual(failed.state.boxes,s.boxes);
});
test('mirror containment transforms are invertible and two reflections restore handedness',()=>{
 const s=fixture();s.boxes[0].flipped=true;
 const up=containmentTransform(s,'a'),down=containmentTransform(s,'a',false),p=[.5,.2,-.8];
 const restored=transformPoint(transformPoint(p,up),down);restored.forEach((v,i)=>assert.ok(Math.abs(v-p[i])<1e-10));
 assert.equal(up.flipX,true);assert.equal(composeSpace(up,down).flipX,undefined);
});
test('decorations stay within low-poly budgets using the same full and preview descriptors',()=>{
 const counts=[];
 for(let kind=1;kind<=5;kind++){
  let count=0;
  for(const p of decorationParts(kind)){
   const [width,height,depth]=p.size;
   const g=p.shape?createCylinder3D({radiusTop:p.shape==='cone'?0:width/2,radiusBottom:width/2,height,radialSegments:DECORATION_RADIAL_SEGMENTS}):createRoundedBox3D({width,height,depth,radius:Math.min(p.radius,...p.size.map(v=>v/2)),segments:DECORATION_BEVEL_SEGMENTS});
   count+=g.indices.length/3;
  }
  counts.push(count);
 }
 assert.deepEqual(counts,[108,216,356,104,552]);
});

const {playerMirrored,viewAction,copyState}=await import('../boxbound/model.ts');
test('entered mirror retains display orientation and screen-right moves right; exit restores it',()=>{
 const s=fixture();s.boxes[0].flipped=true;s.boxes[0].fixed=true;
 s.player={room:'world',pos:[1,0,3],facing:[1,0,0],route:[]};
 const entered=move(s).state;
 assert.equal(playerMirrored(entered),true);
 assert.equal(entered.player.route.at(-1).mirrored,false);
 const right=transition(entered,viewAction(entered,{type:'move',dir:[1,0,0]})).state;
 assert.equal(right.player.pos[0],entered.player.pos[0]-1);
 const left=move(entered).state;
 assert.equal(left.player.room,'world');assert.equal(playerMirrored(left),false);
 assert.equal(playerMirrored(copyState(entered)),true); // undo/save snapshots retain occurrence parity
 assert.equal(playerMirrored(s),false);
});
test('two nested mirror entries cancel and failed entry does not change orientation',()=>{
 const s=fixture();s.boxes[0].flipped=true;s.boxes[0].fixed=true;
 s.player={room:'world',pos:[1,0,3],facing:[1,0,0],route:[]};
 let inside=move(s).state;
 inside.boxes.push(box('inner','a',[3,0,2],'b',{fixed:true,flipped:true}));
 const second=transition(inside,viewAction(inside,{type:'move',dir:[1,0,0]}));
 assert.ok(second.changed);assert.equal(second.state.player.room,'b');assert.equal(playerMirrored(second.state),false);
 inside.rooms={...inside.rooms,b:{...inside.rooms.b,walls:[[0,0,2]]}};
 const blocked=transition(inside,viewAction(inside,{type:'move',dir:[1,0,0]}));
 assert.equal(blocked.changed,false);assert.equal(playerMirrored(blocked.state),true);
});
test('implicit reflected self exits toggle orientation despite an unchanged navigation route',()=>{
 const s=fixture();s.rooms.a.recursiveRoot=true;s.boxes[0].portal=true;s.boxes.push(box('self','a',[2,0,2],'a',{flipped:true}));
 s.player.pos=[4,0,1];s.player.mirrored=false;
 const out=move(s);assert.ok(out.changed);assert.equal(out.state.player.room,'a');
 assert.equal(out.playerCrossing.container,'self');assert.equal(playerMirrored(out.state),true);
 assert.equal(out.state.player.route.length,s.player.route.length);
});
