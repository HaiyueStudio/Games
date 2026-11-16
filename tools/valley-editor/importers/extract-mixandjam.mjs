// Read only the published scene's navigation components. Never load Unity scripts/assets.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname} from 'node:path';
const [input,output]=process.argv.slice(2);
if(!input||!output)throw new Error('Usage: node extract-mixandjam.mjs SampleScene.unity source.json');
const raw=readFileSync(input,'utf8'),docs=new Map();
for(const m of raw.matchAll(/^--- !u!(\d+) &(\d+).*\r?\n([\s\S]*?)(?=^--- !u!|$(?![\s\S]))/gm))docs.set(m[2],{type:m[1],text:m[3]});
const line=(t,k)=>t.match(new RegExp('^  '+k+': *(.*)$','m'))?.[1]?.trim();
const ref=(t,k)=>line(t,k)?.match(/fileID: (\d+)/)?.[1];
const vec=(t,k)=>['x','y','z'].map(a=>Number(line(t,k)?.match(new RegExp(a+': ([^,}]+)'))?.[1]));
const transforms=new Map([...docs].filter(([,d])=>d.type==='4').map(([id,d])=>[id,{id,go:ref(d.text,'m_GameObject'),parent:ref(d.text,'m_Father'),position:vec(d.text,'m_LocalPosition'),rotation:vec(d.text,'m_LocalEulerAnglesHint'),scale:vec(d.text,'m_LocalScale')}]));
const byGo=new Map([...transforms.values()].map(t=>[t.go,t]));
const name=t=>line(docs.get(t.go).text,'m_Name');
const paths=[...docs].filter(([,d])=>d.type==='114'&&d.text.includes('guid: e30ae3e0af2d2b84d9bb63666912f146')).map(([id,d])=>{
 const t=byGo.get(ref(d.text,'m_GameObject'));if(!t)throw new Error('Missing path transform '+id);
 return {componentId:id,id:t.id,name:name(t),parentId:t.parent,position:t.position,rotation:t.rotation,scale:t.scale,stair:line(d.text,'isStair')==='1',button:line(d.text,'isButton')==='1',moving:line(d.text,'movingGround')==='1',walkOffset:Number(line(d.text,'walkPointOffset')),stairOffset:Number(line(d.text,'stairOffset')),paths:[...d.text.matchAll(/- target: \{fileID: (\d+)\}\r?\n    active: ([01])/g)].map(m=>({target:m[1],active:m[2]==='1'}))};
});
const manager=[...docs.values()].find(d=>d.type==='114'&&d.text.includes('guid: a6bcfb9f957889c458b68fddd59f3d44'))?.text;if(!manager)throw new Error('Missing GameManager');
const conditions=[...manager.matchAll(/- pathConditionName: (.*)\r?\n([\s\S]*?)(?=  - pathConditionName:|  pivots:)/g)].map(m=>({name:m[1].trim(),angles:[...m[2].matchAll(/conditionObject: \{fileID: (\d+)\}\r?\n      eulerAngle: \{x: ([^,]+), y: ([^,]+), z: ([^}]+)\}/g)].map(v=>({pivotId:v[1],rotation:v.slice(2,5).map(Number)})),edges:[...m[2].matchAll(/block: \{fileID: (\d+)\}\r?\n      index: (\d+)/g)].map(v=>{const p=paths.find(p=>p.componentId===v[1]),edge=p?.paths[Number(v[2])];if(!p||!edge)throw new Error('Unresolved conditional edge');return {from:p.id,to:edge.target};})}));
const pivots=[...manager.split('  pivots:')[1].split('  objectsToHide:')[0].matchAll(/fileID: (\d+)/g)].map(m=>{const t=transforms.get(m[1]);return {id:t.id,name:name(t),position:t.position,rotation:t.rotation};});
const hiddenFaces=[...manager.split('  objectsToHide:')[1].matchAll(/fileID: (\d+)/g)].map(m=>{const t=transforms.get(m[1]);return {id:t.id,parentId:t.parent,position:t.position,rotation:t.rotation,scale:t.scale};});
const camera=[...transforms.values()].find(t=>name(t)==='Main Camera'),player=[...transforms.values()].find(t=>name(t)==='Player');
if(paths.length!==31||pivots.length!==2||conditions.length!==7||!camera||!player)throw new Error('Unrecognized source layout; review before conversion.');
for(const p of paths){if(p.scale.some(v=>v!==1)||[...p.position,...p.rotation].some(v=>!Number.isFinite(v))||p.paths.some(e=>!paths.some(p=>p.id===e.target)))throw new Error('Unsupported path '+p.name);}
const data={format:'mixandjam-monument-scene',version:1,source:{repository:'https://github.com/mixandjam/MonumentValley-LevelDesign',scene:'Assets/Scenes/SampleScene.unity',url:'https://raw.githubusercontent.com/mixandjam/MonumentValley-LevelDesign/master/Assets/Scenes/SampleScene.unity',sha256:createHash('sha256').update(raw).digest('hex'),license:'MIT',copyright:'Copyright (c) 2019 Mix and Jam',retrieved:'2026-11-09'},camera:{position:camera.position,rotation:camera.rotation},spawn:player.position,pivots,paths,conditions,hiddenFaces};
mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(data,null,2)+'\n');console.log(`Extracted ${paths.length} paths and ${conditions.length} conditions.`);
