// Focused world/terrain CPU measurements, independent of GPU presentation.
import {registerHooks} from 'node:module';
import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
registerHooks({resolve(s,c,next){try{return next(s,c);}catch(e){if(s.startsWith('.')&&c.parentURL?.includes('/whale-maker/'))return next(s+'.ts',c);throw e;}}});
const {create,step,EMPTY_INPUT,overlaps}=await import('./rules/model.ts');
const {makeEnemy,makeItem}=await import('./rules/expansion.ts');
const {switchObstacles}=await import('./rules/switches.ts');
const {backdropGround}=await import('./rules/terrain.ts');
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
function course(){const width=240,height=40,cells=Array(width*height).fill('.');for(let y=30;y<height;y++)for(let x=0;x<width;x++)cells[y*width+x]='#';cells[29*width+235]='E';return {version:1,name:'物体压力场景',width,height,cells,spawn:[2,29.2],properties:{},contents:{},backdrop:'castle'};}
function crowded(){const s=create(course());for(let n=0;n<96;n++){const item=makeItem(['p-switch','basin','pow'][n%3],8+n*2.2,29);item.cooldown=0;s.items.push(item);}for(let n=0;n<24;n++)s.enemies.push(makeEnemy(n%2?'duck':'turtle',6+n*.85,29));s.invincible=1000;return s;}
function measure(run,iterations){for(let n=0;n<2;n++)run();const samples=[];let value;for(let n=0;n<7;n++){const start=performance.now();value=run();samples.push((performance.now()-start)/iterations);}samples.sort((a,b)=>a-b);return {medianMs:samples[3],minMs:samples[0],maxMs:samples.at(-1),value};}
const l=course(),template=crowded();
const ground=measure(()=>{let sum=0;for(let n=0;n<2000;n++)sum+=backdropGround(l);return sum;},2000);
const obstacleQuery=measure(()=>{let hits=0;for(let n=0;n<4000;n++){
 const b={x:5+n%200,y:29.2,w:.8,h:.8,vx:3,vy:0},list=switchObstacles(template,b,false,b.x-2,b.x+3);
 list.sort((a,c)=>a.x-c.x);for(const other of list)if(overlaps(b,other))hits++;
}return hits;},4000);
const physics=measure(()=>{let s;for(let batch=0;batch<2;batch++){s=structuredClone(template);for(let n=0;n<180;n++)step(s,{...EMPTY_INPUT,axis:n<90?1:-1,jump:n%60<25,grab:true});}return hash(s);},360);
const result={node:process.version,ground,obstacleQuery,physics};
if(process.argv[3]){const ref=JSON.parse(readFileSync(process.argv[3],'utf8'));for(const k of ['ground','obstacleQuery','physics'])assert.equal(result[k].value,ref[k].value,k+' changed');}
console.log(JSON.stringify(result,null,2));if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify(result,null,2)+'\n');
