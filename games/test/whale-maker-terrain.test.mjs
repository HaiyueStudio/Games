import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(specifier,context,next){try{return next(specifier,context);}catch(error){if(specifier.startsWith('.')&&context.parentURL?.includes('/whale-maker/'))return next(specifier+'.ts',context);throw error;}}});
const {create,demo,step,respawn,EMPTY_INPUT}=await import('../whale-maker/rules/model.ts');
const {slopeIntersects}=await import('../whale-maker/rules/expansion.ts');
const {terrainPlanes,terrainFrame,TERRAIN_SIZE,drawTerrain}=await import('../whale-maker/rendering/terrain.ts');
const {backdropGround,setCell}=await import('../whale-maker/rules/terrain.ts');
const {clearCells,moveSelection,stampSelection,pasteStamp}=await import('../whale-maker/editor/selection.ts');
const {placePipe}=await import('../whale-maker/rules/levels.ts');
const {placeGlassPipe}=await import('../whale-maker/rules/glass.ts');
const {placeStone}=await import('../whale-maker/rules/adventure.ts');
const {placeCannon}=await import('../whale-maker/rules/advanced.ts');
const tick=(s,input={},n=1)=>{for(let k=0;k<n;k++)step(s,{...EMPTY_INPUT,...input});};
function level(){const l=demo();l.cells.fill('.');delete l.contents;l.properties={};for(let y=15;y<l.height;y++)for(let x=0;x<l.width;x++)l.cells[y*l.width+x]='#';l.cells[14*l.width+95]='E';return l;}
function gradient(){const width=64,height=64,pixels=new Uint8Array(width*height*4);for(let y=0;y<height;y++)for(let x=0;x<width;x++)pixels.set([x*4,y*4,100,255],(y*width+x)*4);return {width,height,pixels};}

function horizonLevel(){const width=40,height=24,cells=Array(width*height).fill('.');for(const y of [10,15])for(let x=1;x<=8;x++)cells[y*width+x]='#';return {version:1,name:'远景缓存',width,height,cells,spawn:[2,8],properties:{}};}

test('unchanged scenery never rereads terrain, and ordinary tile edits keep the cached horizon',()=>{
 const l=horizonLevel();let reads=0;l.cells=new Proxy(l.cells,{get(target,key){if(typeof key==='string'&&/^\d+$/.test(key))reads++;return Reflect.get(target,key);}});
 assert.equal(backdropGround(l),10);assert.ok(reads>100);reads=0;
 for(let n=0;n<60;n++)assert.equal(backdropGround(l),10);assert.equal(reads,0);
 setCell(l,2,'B');reads=0;assert.equal(backdropGround(l),10);assert.equal(reads,0);
 setCell(l,10*l.width+1,'.');reads=0;assert.equal(backdropGround(l),15);assert.ok(reads>100);
});

test('scenery horizon follows multi-cell placement, drag, paste, erase, undo and replacement cell arrays',()=>{
 for(const place of [l=>placePipe(l,1,10,3),l=>placeStone(l,1,10),l=>placeCannon(l,1,10,2),l=>placeGlassPipe(l,10*l.width+1)]){
  const l=horizonLevel();assert.equal(backdropGround(l),10);place(l);assert.equal(backdropGround(l),15);
 }
 const l=horizonLevel(),saved=structuredClone(l),selected=new Set(Array.from({length:8},(_,n)=>10*l.width+n+1));assert.equal(backdropGround(l),10);
 const stamp=stampSelection(l,selected),moved=moveSelection(l,selected,0,8);assert.equal(backdropGround(l),15);
 const pasted=pasteStamp(l,stamp,1,8);assert.equal(backdropGround(l),8);clearCells(l,pasted);assert.equal(backdropGround(l),15);clearCells(l,moved);assert.equal(backdropGround(l),15);
 assert.equal(backdropGround(saved),10);l.cells=saved.cells;assert.equal(backdropGround(l),10);
});

test('giant terrain destruction invalidates the horizon and respawn restores the original ground',()=>{
 const l=horizonLevel();l.cells.fill('.');for(const y of [16,17])for(const x of [2,3])l.cells[y*l.width+x]='#';const s=create(l);Object.assign(s.player,{x:2,y:10,w:2,h:2,vx:0,vy:8});s.power=3;s.fallPeak=12;
 assert.equal(backdropGround(s.level),16);for(let n=0;n<90&&!s.fragments.length;n++)tick(s);assert.ok(s.fragments.length);assert.equal(backdropGround(s.level),17);
 respawn(s);assert.equal(backdropGround(s.level),16);
});

test('continuous coral samples meet on identical opaque texels horizontally and vertically',()=>{
 const planes=terrainPlanes(gradient()),n=TERRAIN_SIZE,at=(f,x,y)=>Array.from(planes[f].pixels.subarray((y*n+x)*4,(y*n+x)*4+4));
 for(let y=0;y<n;y++)for(let parity=0;parity<4;parity++){assert.deepEqual(at(parity,n-1,y),at(parity^1,0,y));assert.equal(at(parity,n-1,y)[3],255);}
 for(let x=0;x<n;x++)for(let parity=0;parity<4;parity++){assert.deepEqual(at(parity,x,n-1),at(parity^2,x,0));assert.equal(at(parity,x,n-1)[3],255);}
});

test('ramp texture masks have filled interiors and transparent air matching both collision diagonals',()=>{
 const planes=terrainPlanes(gradient()),n=TERRAIN_SIZE;
 for(const kind of ['slope-up','slope-down'])for(let parity=0;parity<4;parity++){
  const p=planes[terrainFrame(kind,parity&1,parity>>1)];
  for(let y=2;y<n-2;y+=5)for(let x=2;x<n-2;x+=5){const d=kind==='slope-up'?x+y-(n-1):y-x;if(Math.abs(d)<2)continue;assert.equal(p.pixels[(y*n+x)*4+3],d>0?255:0);}
 }
});

test('connected terrain draws all soil before its exposed grass and leaves map gaps open',()=>{
 const l=level(),w=l.width;l.cells[14*w+6]='slope-up';l.cells[13*w+7]='slope-up';l.cells[14*w+7]='#';l.cells[13*w+8]='#';l.cells[14*w+8]='#';l.cells[15*w+11]='.';const draws=[];
 drawTerrain({sprite:(atlas,frame,x,y,width,height,flip,rotation)=>draws.push({atlas,frame,x,y,width,height,flip,rotation})},l,0,10,48,{x:24,y:148,w:1232,h:576});
 const grass=draws.findIndex(d=>d.frame===12);assert.ok(grass>0);assert.ok(draws.slice(grass).every(d=>d.frame===12));assert.equal(draws.filter(d=>d.frame===12&&d.rotation<0).length,2);assert.equal(draws.some(d=>d.frame!==12&&d.x===24+11*48&&d.y===148+5*48),false);
 // A supporting block under a ramp has soil but no repeated horizontal grass.
 assert.equal(draws.some(d=>d.frame===12&&d.rotation===0&&Math.abs(d.x+ d.width/2-(24+7.5*48))<1&&d.y>148+4*48-10&&d.y<148+4*48+10),false);
});

test('ramp solidity distinguishes the filled triangle from the empty half',()=>{
 const b={x:10.1,y:10.1,w:.1,h:.1,vx:0,vy:0};assert.equal(slopeIntersects('slope-up',10,10,b),false);assert.equal(slopeIntersects('slope-up',10,10,{...b,y:10.85}),true);assert.equal(slopeIntersects('slope-down',10,10,{...b,x:10.8}),false);assert.equal(slopeIntersects('slope-down',10,10,{...b,x:10.1,y:10.8}),true);
});

test('both ramp undersides block upward jumps and their high backs block lateral entry',()=>{
 for(const kind of ['slope-up','slope-down']){
  const l=level();l.cells[10*l.width+10]=kind;const s=create(l);Object.assign(s.player,{x:10.15,y:11.04,vy:-8});s.grounded=false;tick(s,{},3);assert.ok(s.player.y>=11);assert.ok(s.player.vy>=0);
  const side=create(l),direction=kind==='slope-up'?-1:1;Object.assign(side.player,{x:direction<0?11.03:9.32,y:10.45,vy:0,vx:direction*8});side.grounded=false;side.coyote=0;tick(side,{axis:direction},4);assert.equal(side.wall,direction);assert.equal(side.player.vx,0);assert.ok(direction<0?side.player.x>=11:side.player.x+side.player.w<=10);
 }
});

test('air above a ramp stays open and a low ramp ceiling prevents standing into its solid fill',()=>{
 const l=level(),w=l.width;l.cells[10*w+10]='slope-up';const air=create(l);Object.assign(air.player,{x:10.03,y:9.05,vx:0,vy:0});air.grounded=false;air.coyote=0;tick(air,{},3);assert.equal(air.grounded,false);assert.ok(air.player.y>9.05&&air.player.y<9.1);
 for(let x=0;x<l.width;x++)l.cells[12*w+x]='#';const crouch=create(l);crouch.power=1;Object.assign(crouch.player,{x:10.1,y:11.2,h:.8});crouch.grounded=true;crouch.crouching=true;tick(crouch);assert.equal(crouch.crouching,true);assert.equal(crouch.player.h,.8);assert.ok(Math.abs(crouch.player.y+crouch.player.h-12)<1e-8);
});
