import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){try{return next(s,c);}catch(e){if(s.startsWith('.')&&c.parentURL?.includes('/whale-maker/'))return next(s+'.ts',c);throw e;}}});
const {create,step,validate,EMPTY_INPUT,respawn,solid}=await import('../whale-maker/rules/model.ts');
const {placePipe}=await import('../whale-maker/rules/levels.ts');
const {makeItem}=await import('../whale-maker/rules/expansion.ts');
const {placeGlassPipe,glassCells,glassRoutes,glassMouths,worldGlassPath,editGlassEnd,DEFAULT_GLASS_PATH,glassRouteGeometry,glassIntersects,curvedGlassCell}=await import('../whale-maker/rules/glass.ts');
const {objectCells,moveSelection,stampSelection,pasteStamp,clearCells}=await import('../whale-maker/editor/selection.ts');
const tick=(s,i={})=>step(s,{...EMPTY_INPUT,...i});
function course(path=DEFAULT_GLASS_PATH){const width=100,height=24,cells=Array(width*height).fill('.');for(let y=15;y<height;y++)for(let x=0;x<width;x++)cells[y*width+x]='#';cells[14*width+95]='E';const l={version:1,name:'连续管道',width,height,cells,spawn:[2,14.2],properties:{}};assert.equal(placeGlassPipe(l,8*width+8,path),true);return l;}
function atMouth(s,end=0){const route=glassRoutes(s.level)[0],mouth=glassMouths(worldGlassPath(s.level,route.anchor,route.path))[end],n=mouth.normal,extent=n[0]?s.player.w/2:s.player.h/2;s.player.x=mouth.point[0]+n[0]*extent-s.player.w/2;s.player.y=mouth.point[1]+n[1]*extent-s.player.h/2;s.player.vx=s.player.vy=0;s.grounded=true;return n[1]<0?{down:true}:n[1]>0?{interact:true}:{axis:-n[0]};}

test('glass travel is a continuous round trip through both bends at bounded speed in every power state',()=>{
 for(const power of [0,1,2])for(const end of [0,1]){
  const l=course(),s=create(l);s.power=power;s.player.h=power?1.4:.8;tick(s,atMouth(s,end));assert.ok(s.pipe?.glass);assert.ok(s.pipe.path.length>25);
  let old=[s.player.x,s.player.y],middle=false,diagonal=false,frames=0;
  while(s.pipe&&frames++<900){tick(s,{axis:end?-1:1,down:true,fire:true,spin:true});const moved=Math.hypot(s.player.x-old[0],s.player.y-old[1]);assert.ok(moved<=.051,'each frame moves along the tube, without teleporting');old=[s.player.x,s.player.y];if(s.player.x>11&&s.player.x<14&&s.player.y>9)middle=true;if(s.pipe&&Math.abs(Math.sin(s.pipe.angle)*Math.cos(s.pipe.angle))>.1)diagonal=true;if(s.pipe&&Math.abs(Math.cos(s.pipe.angle))>.99)assert.equal(s.pipe.flip,Math.cos(s.pipe.angle)<0);}
  assert.ok(frames>150&&frames<900);assert.ok(middle&&diagonal);assert.ok(Math.abs(s.player.x+s.player.w/2-(end?9:17))<.01);assert.ok(s.player.y+s.player.h<=8);assert.equal(s.phase,'playing');assert.equal(s.power,power);assert.equal(s.shots.length,0);assert.ok(s.pipeWait>0);assert.deepEqual(l,course());
 }
});

test('horizontal and downward mouths use their matching entry directions and permit reverse travel',()=>{
 for(const path of [[[0,0],[8,0]],[[0,0],[0,3]]])for(const end of [0,1]){
  const s=create(course(path)),input=atMouth(s,end),x=s.player.x,y=s.player.y;tick(s);assert.equal(s.pipe,null);Object.assign(s.player,{x,y,vx:0,vy:0});tick(s,input);assert.ok(s.pipe?.glass);const target=[...s.pipe.to];for(let n=0;n<900&&s.pipe;n++)tick(s);assert.equal(s.pipe,null);assert.ok(Math.abs(s.player.x+s.player.w/2-target[0])<1e-8);assert.ok(Math.abs(s.player.y+s.player.h-target[1])<1e-8);
 }
});

test('carried objects rotate around the hands through bends and are retained until exit or reset',()=>{
 for(const kind of ['spring-v','pow','basin','shell']){
  const s=create(course());const item=kind==='shell'?{x:0,y:0,w:.8,h:.5,vx:0,vy:0,alive:true,held:true,cooldown:0,kind}:makeItem(kind,2,14);item.held=true;if(kind==='shell')s.enemies.push(item);else s.items.push(item);s.held=item;
  tick(s,{...atMouth(s),grab:true});for(let n=0;n<180;n++){tick(s,{grab:true});const a=s.pipe.angle;assert.ok(Math.abs(item.x+item.w/2-(s.player.x+s.player.w/2+Math.cos(a)*.45))<1e-8);assert.ok(Math.abs(item.y+item.h/2-(s.player.y+s.player.h/2+Math.sin(a)*.45))<1e-8);assert.equal(s.held,item);assert.equal(item.alive,true);}
  respawn(s);assert.equal(s.pipe,null);assert.equal(s.held,null);assert.equal(s.pipeWait,0);
 }
});

test('a blocked outlet returns the player through the tube, and disconnected warps cannot override it',()=>{
 const blocked=course();blocked.cells[7*blocked.width+16]='#';const s=create(blocked);tick(s,atMouth(s));assert.ok(s.pipe);let turned=false;for(let n=0;n<900&&s.pipe;n++){tick(s);turned ||= (s.pipe?.glassReturns??0)>0;}assert.ok(turned);assert.equal(s.pipe,null);assert.ok(Math.abs(s.player.x+s.player.w/2-9)<.01);assert.equal(s.phase,'playing');
 const l=course();l.warps=[{from:[8,8],to:[80,8]}];const other=create(l);tick(other,atMouth(other));for(let n=0;n<900&&other.pipe;n++)tick(other);assert.ok(other.player.x>16&&other.player.x<18);
});

function blockMouth(s,end,tile='#'){
 const mouth=glassRouteGeometry(s.level)[0].mouths[end],n=mouth.normal,p=s.player,extent=n[0]?p.w/2:p.h/2,c=[mouth.point[0]+n[0]*(extent+.003),mouth.point[1]+n[1]*(extent+.003)],ids=[];
 for(let y=Math.floor(c[1]-p.h/2+.001);y<=Math.floor(c[1]+p.h/2-.001);y++)for(let x=Math.floor(c[0]-p.w/2+.001);x<=Math.floor(c[0]+p.w/2-.001);x++){const id=y*s.level.width+x;s.level.cells[id]=tile;ids.push(id);}return ids;
}
test('blocked horizontal and vertical ends turn around without overlap, teleporting or losing held items',()=>{
 for(const path of [DEFAULT_GLASS_PATH,[[0,0],[8,0]],[[0,0],[0,3]]])for(const end of [0,1])for(const power of [0,1]){
  const s=create(course(path));s.power=power;s.player.h=power?2:.8;const blocked=blockMouth(s,1-end),pow=makeItem('pow',2,14);pow.held=true;s.items.push(pow);s.held=pow;
  const input=atMouth(s,end),start=[s.player.x,s.player.y];tick(s,input);assert.ok(s.pipe,JSON.stringify({path,end,power,notice:s.notice}));let turned=false,frames=0,previous=[...start];
  while(s.pipe&&frames++<1200){tick(s);const p=s.player;assert.ok(Math.hypot(p.x-previous[0],p.y-previous[1])<=.051);previous=[p.x,p.y];turned ||= (s.pipe?.glassReturns??0)>0;for(const id of blocked){const x=id%s.level.width,y=Math.floor(id/s.level.width);assert.ok(!(p.x<x+1-.001&&p.x+p.w>x+.001&&p.y<y+1-.001&&p.y+p.h>y+.001));}assert.equal(s.held,pow);assert.ok(pow.alive);}
  assert.ok(turned);assert.equal(s.pipe,null);assert.ok(Math.hypot(s.player.x-start[0],s.player.y-start[1])<.01);assert.ok(s.pipeWait>0);assert.equal(s.phase,'playing');
 }
});
test('outlet availability is checked at arrival, including newly closed exits and reopened ones',()=>{
 for(const closedInitially of [false,true]){const s=create(course());const ids=closedInitially?blockMouth(s,1):[];tick(s,atMouth(s));for(let n=0;n<100;n++)tick(s);if(closedInitially)for(const id of ids)s.level.cells[id]='.';else blockMouth(s,1);let returns=0;for(let n=0;n<1000&&s.pipe;n++){tick(s);returns=Math.max(returns,s.pipe?.glassReturns??0);}assert.equal(s.pipe,null);assert.equal(returns,closedInitially?0:1);assert.ok(Math.abs(s.player.x+s.player.w/2-(closedInitially?17:9))<.01);}
});
test('a closed entry refuses entry; if both ends close in transit, the character turns again until one opens',()=>{
 const closed=create(course());blockMouth(closed,0);tick(closed,atMouth(closed));assert.equal(closed.pipe,null);assert.match(closed.notice,/入口被挡/);
 const s=create(course());const far=blockMouth(s,1);tick(s,atMouth(s));for(let n=0;n<600&&(s.pipe?.glassReturns??0)<1;n++)tick(s);assert.equal(s.pipe.glassReturns,1);blockMouth(s,0);for(let n=0;n<600&&(s.pipe?.glassReturns??0)<2;n++)tick(s);assert.equal(s.pipe.glassReturns,2);for(const id of far)s.level.cells[id]='.';for(let n=0;n<600&&s.pipe;n++)tick(s);assert.equal(s.pipe,null);assert.ok(s.player.x>16);
});

test('continuous glass routes select, move, copy, paste and erase as complete objects with relative paths',()=>{
 const l=course([[0,0],[0,5],[8,5],[8,0]]),anchor=8*l.width+8,path=structuredClone(l.properties[anchor].path),cells=glassCells(l,anchor,path);assert.ok(cells.length>20);assert.ok(cells.every(id=>solid(l.cells[id])));assert.deepEqual(new Set(objectCells(l,10,13)),new Set(cells));
 const moved=moveSelection(l,new Set(cells),3,1),next=9*l.width+11;assert.deepEqual(l.properties[next].path,path);assert.equal(l.properties[anchor],undefined);assert.deepEqual(validate(l),l);
 const stamp=stampSelection(l,moved);const pasted=pasteStamp(l,stamp,30,8);assert.deepEqual(l.properties[8*l.width+30].path,path);assert.deepEqual(validate(l),l);clearCells(l,pasted);assert.equal(l.properties[8*l.width+30],undefined);assert.ok([...pasted].every(id=>l.cells[id]==='.'));
});

test('pipe end controls extend, turn and retract without mutating the route on a failed edit',()=>{
 const l=course(),id=8*l.width+8;assert.equal(editGlassEnd(l,id,0,-1),true);assert.deepEqual(l.properties[id].path.at(-1),[8,-2]);assert.equal(editGlassEnd(l,id,1,0),true);assert.deepEqual(l.properties[id].path.at(-1),[11,-2]);assert.deepEqual(validate(l),l);assert.equal(editGlassEnd(l,id,0,0,true),true);assert.deepEqual(l.properties[id].path.at(-1),[8,-2]);
 l.cells[6*l.width+19]='?';const before=structuredClone(l);assert.equal(editGlassEnd(l,id,1,0),false);assert.deepEqual(l,before);
});

test('prepared glass geometry follows in-place edits, replacement, add, move, paste, erase and undo',()=>{
 const l=course([[0,0],[0,5],[8,5],[8,0]]),anchor=8*l.width+8,initial=glassRouteGeometry(l),saved=structuredClone(l);
 l.properties[2*l.width+2]={length:4,speed:1};assert.equal(glassRouteGeometry(l),initial,'unrelated properties do not rebuild tube geometry');
 l.properties={...l.properties};assert.equal(glassRouteGeometry(l),initial);
 const path=l.properties[anchor].path;path[3][1]=2;assert.notDeepEqual(glassRouteGeometry(l)[0].points,initial[0].points,'mutating coordinates invalidates prepared bends');path[3][1]=0;
 assert.deepEqual(glassRouteGeometry(l)[0].points,initial[0].points);
 assert.ok(editGlassEnd(l,anchor,0,-1));assert.notDeepEqual(glassRouteGeometry(l)[0].points,initial[0].points);
 const moved=moveSelection(l,new Set(glassCells(l,anchor,l.properties[anchor].path)),3,1),route=glassRouteGeometry(l)[0];assert.equal(route.anchor,9*l.width+11);
 const stamp=stampSelection(l,moved),pasted=pasteStamp(l,stamp,40,8);assert.equal(glassRouteGeometry(l).length,2);clearCells(l,pasted);assert.equal(glassRouteGeometry(l).length,1);clearCells(l,moved);assert.equal(glassRouteGeometry(l).length,0);assert.equal(glassIntersects(l,{x:12,y:10,w:1,h:1,vx:0,vy:0}),false);
 assert.deepEqual(glassRouteGeometry(saved)[0].points,initial[0].points,'undo/new level identity has independent geometry');
 assert.equal(curvedGlassCell(saved,8,8),true);assert.equal(curvedGlassCell(saved,2,15),false);
});

test('cached tube strokes preserve the original render commands at gameplay and editor scales',async()=>{
 const {createHash}=await import('node:crypto'),{drawGlassRoutes}=await import('../whale-maker/rendering/glass.ts');
 const l={version:1,name:'render regression',width:100,height:40,cells:Array(4000).fill('.'),spawn:[2,14],properties:{}};assert.ok(placeGlassPipe(l,1030,[[0,0],[0,5],[10,5],[10,0]]));
 // Recorded from the uncached renderer before optimization, including draw order,
 // culling, transparency, rim positions and all bend edge coordinates.
 for(const [cam,cy,z,opacity,expected]of [[20,8,48,.58,'045270b3625f9b17ac3e9451e61b93c06b6f0462f3c946e130c0a1f6d409d921'],[30,10,36,.22,'f529c554daf4a42ef61300a5f5d7c1f01c92fe78759a8436374920da19de199e']]){
  const commands=[],scene={board:{x:24,y:148,width:1232,height:576},fill(...args){commands.push(['fill',...args]);},sprite(...args){commands.push(['sprite',...args]);}};
  for(let n=0;n<2;n++){commands.length=0;drawGlassRoutes(scene,l,cam,cy,z,{x:24,y:148},opacity);assert.equal(createHash('sha256').update(JSON.stringify(commands)).digest('hex'),expected);}
 }
});

test('old paired glass mouths upgrade to one visible pipe while keeping the saved blueprint unchanged',()=>{
 const l=course();clearCells(l,glassCells(l,8*l.width+8,l.properties[8*l.width+8].path));placePipe(l,8,8,3,true);placePipe(l,20,8,3,true);l.properties={[8*l.width+8]:{link:5,plant:true},[8*l.width+20]:{link:5,plant:true}};const original=structuredClone(l),s=create(l);assert.equal(glassRoutes(s.level).length,1);assert.equal(s.level.cells[11*l.width+14],'glass-body');assert.equal(s.enemies.filter(e=>e.kind==='plant').length,2);assert.deepEqual(l,original);assert.deepEqual(s.startLevel,original);respawn(s);assert.equal(glassRoutes(s.level).length,1);
});

test('path validation rejects diagonals, short elbows, self crossings, invalid numbers and missing tube cells',()=>{
 for(const path of [[[1,0],[8,0]],[[0,0],[3,3]],[[0,0],[0,2],[8,2],[8,0]],[[0,0],[0,6],[8,6],[8,0],[0,0]],[[0,0],[0,6],[8,6],[8,1],[1,1]],[[0,0],[0,NaN]],[[0,0],[300,0]]]){const l=course();l.properties[8*l.width+8].path=path;assert.throws(()=>validate(l));}
 const missing=course();missing.cells[11*missing.width+11]='.';assert.throws(()=>validate(missing));assert.deepEqual(validate(JSON.parse(JSON.stringify(course()))),course());
 const orphan=course();orphan.cells[2*orphan.width+2]='glass-body';assert.throws(()=>validate(orphan));
});

test('transit frames stay within the generated sheet and retain uniform scale against each row reference',async()=>{
 const {readFile}=await import('node:fs/promises'),frames=JSON.parse(await readFile(new URL('../whale-maker/assets/frames.json',import.meta.url),'utf8')),png=await readFile(new URL('../whale-maker/assets/transit-v2.png',import.meta.url)),width=png.readUInt32BE(16),height=png.readUInt32BE(20),{actorRect}=await import('../whale-maker/rendering/poses.ts');assert.equal(frames.transit.length,16);assert.equal(frames.clear.length,4);for(const uv of [...frames.transit,...frames.clear])assert.ok(uv[0]>=0&&uv[1]>=0&&uv[0]+uv[2]<=1.000001&&uv[1]+uv[3]<=1.000001);for(let n=0;n<16;n+=4){const uv=frames.transit[n],ref={width:uv[2]*width,height:uv[3]*height};for(let k=0;k<4;k++){const f=frames.transit[n+k],size={width:f[2]*width,height:f[3]*height},rect=actorRect(size,ref,100,100,80);assert.ok(Math.abs(rect.width/size.width-rect.height/size.height)<1e-12);assert.ok(Math.abs(rect.width/size.width-80/Math.max(ref.width,ref.height))<1e-12);}}
});
