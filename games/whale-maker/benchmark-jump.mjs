import {registerHooks} from 'node:module';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
registerHooks({resolve(s,c,next){try{return next(s,c);}catch(e){if(s.startsWith('.')&&c.parentURL?.includes('/whale-maker/'))return next(s+'.ts',c);throw e;}}});
const {create,step,EMPTY_INPUT}=await import('./rules/model.ts');
function course(wall=false,corridor=false){const width=80,height=64,floor=60,cells=Array(width*height).fill('.');for(let y=floor;y<height;y++)for(let x=0;x<width;x++)cells[y*width+x]='#';if(wall)for(let y=0;y<floor;y++){cells[y*width+40]='#';if(corridor)cells[y*width+34]='#';}return {version:1,name:'Jump physics measurement',width,height,cells,spawn:[wall?39.1:20,59.2]};}
const tick=(s,input)=>step(s,{...EMPTY_INPUT,...input});
function jump(hold){const s=create(course());s.grounded=true;const start=s.player.y;let top=start,apex=0,downMax=0,land=0;for(let n=0;n<300;n++){tick(s,{jump:n<hold});if(s.player.y<top){top=s.player.y;apex=n+1;}downMax=Math.max(downMax,s.player.vy);if(n>0&&s.grounded){land=n+1;break;}}return {holdTicks:hold,height:start-top,riseSeconds:apex/120,fallSeconds:(land-apex)/120,maximumFallSpeed:downMax};}
function wall(period,run=false,corridor=false){const s=create(course(true,corridor));s.player.y=40;s.grounded=false;let top=s.player.y,axis=1;const kicks=[];for(let n=0;n<2400;n++){
 const before=s.jumpSerial,jump=corridor?s.wall?!s.previous.jump:true:n%period!==period-1;
 tick(s,{axis,jump,grab:run});if(s.jumpSerial!==before){kicks.push({tick:n,y:s.player.y});if(corridor)axis=Math.sign(s.player.vx)||axis;}
 top=Math.min(top,s.player.y);if(s.grounded||s.phase!=='playing'||top<0)break;
 }return {period,run,kicks:kicks.length,maximumHeightGain:40-top,largestRepeatGain:Math.max(0,...kicks.slice(1).map((k,n)=>kicks[n].y-k.y)),kickSamples:kicks.slice(0,8)};}
const result={revision:1,corridorControllerRevision:2,modelSha256:createHash('sha256').update(readFileSync(new URL('./rules/model.ts',import.meta.url))).digest('hex'),normal:[1,6,12,24,60,120].map(jump),singleWall:[false,true].flatMap(run=>[2,8,16,32,64].map(period=>wall(period,run))),corridor:wall(2,true,true)};
const output=resolve(import.meta.dirname,'../../artifacts/whale-jump');mkdirSync(output,{recursive:true});const label=process.argv[2]??'current';if(!/^[a-z0-9-]+$/.test(label))throw Error('Invalid report label');writeFileSync(resolve(output,label+'.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
