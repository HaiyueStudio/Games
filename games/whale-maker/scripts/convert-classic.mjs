// Translate public level coordinate facts into our own tile schema. No source
// graphics, engine macros or warp-world behavior are shipped with the game.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import vm from 'node:vm';
const root=resolve(import.meta.dirname,'../../..'),out=resolve(import.meta.dirname,'../levels');mkdirSync(out,{recursive:true});
const FLOOR=15;
const converted=[];
for(let stage=1;stage<=4;stage++){
 const context={PlayMarioJas:{PlayMarioJas:{settings:{maps:{library:{}}}}}};
 vm.runInNewContext(readFileSync(resolve(root,`artifacts/whale-v30-1-${stage}-reference.js`),'utf8'),context,{timeout:1000});
 const data=context.PlayMarioJas.PlayMarioJas.settings.maps.library[`1-${stage}`];
 const width=stage===1?240:stage===2?240:stage===3?176:160,height=stage<=2?40:18;
 const level={version:1,name:`1-${stage} · ${['珍珠海岸','珊瑚地窟','月夜云台','尖刺龟堡'][stage-1]}`,classicStage:stage,backdrop:stage>=3?'night':stage===2?'castle':'coast',finish:stage===4?'castle':'flag',width,height,spawn:[2,14.2],cells:Array(width*height).fill('.'),contents:{},properties:{}};
 const set=(x,y,t)=>{x=Math.floor(x);y=Math.floor(y);if(x>=0&&x<width&&y>=0&&y<height)level.cells[y*width+x]=t;};
 const rect=(x,y,w,h,t)=>{for(let j=0;j<h;j++)for(let i=0;i<w;i++)set(x+i,y+j,t);};
 const contents={Mushroom:'auto',Mushroom1Up:'growth',Coin:'coin',Star:'star'};
 const block=(o,ox=0)=>{
  const x=Math.floor((o.x??0)/8)+ox,y=Math.round(FLOOR-(o.y??0)/8),w=Math.max(1,(o.width??8)/8),h=Math.max(1,(o.height??8)/8);
  const property=p=>level.properties[y*width+x]=p;
  if(o.thing==='Brick'||o.thing==='Block'){const reward=o.contents;set(x,y,o.hidden?'hidden-block':o.thing==='Block'||reward?'?':'B');if(reward||o.thing==='Block')level.contents[y*width+x]=contents[reward]??'coin';}
  else if(o.thing==='Stone')rect(x,y,w,h,'#');
  else if(o.thing==='Goomba'||o.thing==='Koopa'){
   set(x,y,o.thing==='Goomba'?'J':'T');
   if(o.smart||o.floating)property({smart:!!o.smart,...(o.floating?{flight:[FLOOR-(o.end??88)/8,FLOOR-(o.begin??8)/8]}:{})});
  }else if(o.thing==='Coin')set(x,y,'o');
  else if(o.thing==='CastleBlock'){set(x,y,'#');if(o.fireballs){set(x,y,'firebar');property({length:o.fireballs,speed:(o.speed??1)*(o.direction===1?-1:1)*1.4,phase:0});}}
  else if(o.thing==='Platform'&&!o.nocollidechar){
   set(x,y,'moving-platform');property({length:w,axis:o.floating?'y':'x',range:o.floating?[FLOOR-(o.end??56)/8,FLOOR-(o.begin??-4)/8]:[(o.begin??o.x)/8,(o.end??o.x+48)/8],speed:2});
  }
 };
 const macro=(o,ox=0)=>{
  const x=Math.floor((o.x??0)/8)+ox,y=Math.round(FLOOR-(o.y??0)/8),w=(o.width??8)/8;
  if(o.macro==='Fill')for(let j=0;j<(o.ynum??1);j++)for(let i=0;i<(o.xnum??1);i++)block({...o,macro:undefined,x:(o.x??0)+i*(o.xwidth??8),y:(o.y??0)+j*(o.yheight??8)},ox);
  else if(o.macro==='Floor')rect(x,y,w,18-y,'#');
  else if(o.macro==='Ceiling')rect(x,4,w,1,'B');
  else if(o.macro==='Pipe'){
   const h=(o.height??16)/8,top=FLOOR-h;rect(x,top,2,h,'p');set(x,top,'P');set(x+1,top,'Q');for(let j=1;j<h;j++)set(x+1,top+j,'q');if(o.piranha)level.properties[top*width+x]={plant:true};
  }else if(o.macro==='Tree'){rect(x,y,w,1,'=');if(o.solidTrunk)rect(x+1,y+1,Math.max(1,w-2),18-y-1,'#');}
  else if(o.macro==='PlatformGenerator')for(let n=0;n<3;n++){const row=4+n*4;set(x,row,'moving-platform');level.properties[row*width+x]={length:w,axis:'y',range:[3,17],speed:(o.direction??1)*2,loop:true};}
  else if(o.macro==='Water')rect(x,y,w,height-y,'lava');
  else if(o.macro==='EndOutsideCastle')set(x,14,'E');
  else if(o.macro==='StartInsideCastle'){rect(0,9,3,9,'#');rect(3,10,1,8,'#');rect(4,11,1,7,'#');rect(5,12,8,6,'#');level.spawn=[1,8.2];}
  else if(o.macro==='EndInsideCastle'){
   // Expanded from macroEndInsideCastle: 104/8 decks at y=24/8,
   // shore at x+104/8 and the release switch on that shore.
   rect(x+13,15,width-x-13,3,'#');rect(x,15,13,3,'lava');rect(x+13,11,3,4,'#');rect(x+14,5,2,3,'#');
   rect(x,12,13,1,'bridge');const id=10*width+x+8;set(x+8,10,'turtle-boss');set(x+9,10,'boss-body');set(x+8,11,'boss-body');set(x+9,11,'boss-body');level.properties[id]={link:1};set(x+13,10,'bridge-bell');set(x+23,14,'E');
  }else if(o.thing)block(o,ox);
 };
 const area=data.areas[stage===2?1:0];
 for(const o of area.creation){if(stage===2&&(o.x??0)>=1344)continue;macro(o);}
 if(stage===2){
  // Same-stage exit. Replace the original sideways entry by the game's existing
  // down-to-enter pipe, preserving its position; there is no world-skip room.
  rect(166,4,2,11,'#');rect(168,0,6,18,'#');
  rect(164,10,2,2,'p');set(164,10,'P');set(165,10,'Q');set(165,11,'q');
  for(const o of data.areas[3].creation)macro(o,176);
  level.warps=[{from:[164,10],to:[177,13]}];
 }
 if(stage<=2){
  // Same-stage coin room below the main map: all entrances return to this
  // stage, never to another world. Sideways exits use a down-entry pipe.
  level.playHeight=18;level.rooms=[{x:0,y:26,w:18,h:14}];
  const bonus=data.areas[stage===1?1:2].creation;
  for(const o of bonus){
   if(o.macro==='Floor')rect(0,38,18,2,'#');
   else if(o.macro==='Ceiling')rect((o.x??0)/8,27,(o.width??8)/8,1,'B');
   else if(o.macro==='Fill')for(let j=0;j<(o.ynum??1);j++)for(let i=0;i<(o.xnum??1);i++){
    const bx=Math.floor(((o.x??0)+i*(o.xwidth??8))/8),by=Math.round(38-((o.y??0)+j*(o.yheight??8))/8);set(bx,by,o.thing==='Coin'?'o':'B');
   }else if(o.thing==='Brick'){const bx=Math.floor(o.x/8),by=Math.round(38-o.y/8);set(bx,by,o.contents?'?':'B');if(o.contents)level.contents[by*width+bx]=contents[o.contents]??'coin';}
  }
  rect(0,26,1,12,'B');rect(16,26,2,12,'B');rect(13,36,2,2,'p');set(13,36,'P');set(14,36,'Q');set(14,37,'q');
  if(stage===2){
   // The original sideways exit sat below a wall. Open a two-tile-high
   // approach arch for the existing vertical pipe, including tall/giant forms.
   const old=34*width+12,content=level.contents[old];
   for(let by=33;by<=35;by++)for(let bx=11;bx<=14;bx++){const id=by*width+bx;if(['B','?'].includes(level.cells[id])){set(bx,by,'.');delete level.contents[id];}}
   if(content){set(12,32,'?');level.contents[32*width+12]=content;}
  }
  const from=stage===1?[57,11]:[100,12],to=stage===1?[164,13]:[113,13];
  (level.warps??=[]).push({from,to:[2.5,38]},{from:[13,36],to});
 }
 // Markers can overlap source coordinates; discard metadata only if overwritten.
 for(const id of Object.keys(level.contents))if(!['?','hidden-block'].includes(level.cells[id]))delete level.contents[id];
 for(const id of Object.keys(level.properties))if(level.cells[id]==='.')delete level.properties[id];
 writeFileSync(resolve(out,`world-1-${stage}.json`),JSON.stringify(level)+'\n');
 converted.push(level);
 console.log(level.name,width,level.cells.filter(t=>t!=='.').length);
}
writeFileSync(resolve(out,'classic-data.ts'),`// Generated coordinate conversion; see CLASSIC_WORLD.md and scripts/convert-classic.mjs.\nimport type { Level } from '../rules/model';\nexport const classicData:Level[]=${JSON.stringify(converted)};\n`);
