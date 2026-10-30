// Repeatable CPU work measurements; excludes asset loading, GPU and presentation.
import {registerHooks} from 'node:module';
import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
import {writeFileSync,readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
registerHooks({resolve(s,c,next){try{return next(s,c);}catch(e){if(s.startsWith('.')&&c.parentURL?.includes('/whale-maker/'))return next(s+'.ts',c);throw e;}}});
const {create,demo,step,EMPTY_INPUT}=await import('./rules/model.ts');
const {placeGlassPipe}=await import('./rules/glass.ts');
const {makeEnemy}=await import('./rules/expansion.ts');
const {drawGlassRoutes}=await import('./rendering/glass.ts');
const {WhaleAudio}=await import('./audio/WhaleAudio.ts');
function stress(){
 const width=300,height=32,cells=Array(width*height).fill('.'),l={version:1,name:'性能场景',width,height,cells,spawn:[2,25.2],properties:{}};
 for(let y=26;y<height;y++)for(let x=0;x<width;x++)cells[y*width+x]='#';cells[25*width+295]='E';
 for(let x=10;x<280;x+=18)placeGlassPipe(l,16*width+x);
 for(let x=1;x<299;x+=2){cells[3*width+x]='firebar';l.properties[3*width+x]={length:1,speed:1};}
 return l;
}
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
function measure(run,iterations){for(let n=0;n<2;n++)run();const samples=[];let value;for(let n=0;n<7;n++){const start=performance.now();value=run();samples.push((performance.now()-start)/iterations);}samples.sort((a,b)=>a-b);return {medianMs:samples[3],minMs:samples[0],maxMs:samples.at(-1),value};}
const physics={};
for(const id of [0,2,4,'stress']){
 const l=id==='stress'?stress():demo(id),template=create(l);
 if(id==='stress')for(let n=0;n<24;n++)template.enemies.push(makeEnemy(n%2?'duck':'turtle',5+n*.8,25));
 const run=()=>{let s;for(let batch=0;batch<4;batch++){s=structuredClone(template);s.invincible=1000;for(let n=0;n<240;n++)step(s,{...EMPTY_INPUT,axis:n<120?1:-1,jump:n%90<35,grab:true});}return digest(s);};
 physics[id]=measure(run,960);
}
const l=stress(),scene={board:{x:24,y:148,width:1232,height:576},count:0,fill(){this.count++;},sprite(){this.count++;}};
const render=measure(()=>{scene.count=0;for(let n=0;n<800;n++)drawGlassRoutes(scene,l,(n%100)/10,12,48,{x:24,y:148});return scene.count;},800);
const backend={unlock(){},suspend(){},play(){return true;},stop(){},stopEffects(){},musicVolume(){},dispose(){},snapshot(){return {state:'running'};}},audio=new WhaleAudio(backend),s=create(demo());audio.unlock();audio.update(s,{paused:false,editing:false,hidden:false,sessionPaused:false},0);
for(let n=1;n<=64;n++)s.events.push({serial:n,kind:'coin',x:2,time:0});s.eventSerial=64;audio.events(s);
const idleAudio=measure(()=>{for(let n=0;n<100000;n++)audio.events(s);return audio.snapshot().played;},100000);
const result={node:process.version,physics,glassDraw:render,idleAudio};
if(process.argv[3]){
 const reference=JSON.parse(readFileSync(process.argv[3],'utf8'));
 for(const id of Object.keys(physics))assert.equal(physics[id].value,reference.physics[id].value,'simulation state changed: '+id);
 assert.equal(render.value,reference.glassDraw.value,'visible tube command count changed');assert.deepEqual(idleAudio.value,reference.idleAudio.value,'idle playback changed');
}
console.log(JSON.stringify(result,null,2));if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify(result,null,2)+'\n');
