import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {readdirSync,readFileSync} from 'node:fs';
import {resolve,basename} from 'node:path';
import ts from 'typescript';
registerHooks({resolve(s,c,next){try{return next(s,c);}catch(e){if(s.startsWith('.')&&c.parentURL?.includes('/whale-maker/'))return next(s+'.ts',c);throw e;}}});
const {create,step,validate,EMPTY_INPUT}=await import('../whale-maker/rules/model.ts');
const {PLAYER_POWERS,isPlayerPower}=await import('../whale-maker/rules/player-body.ts');
const {validP2Property}=await import('../whale-maker/rules/p2-schema.ts');
const {P2_CHOICES}=await import('../whale-maker/editor/p2-settings.ts');
const {grantPower}=await import('../whale-maker/rules/power.ts');
const {makeItem}=await import('../whale-maker/rules/body-factory.ts');
const {changeArea}=await import('../whale-maker/rules/p2-areas.ts');
const {equipShellHelmet,boneRest,mountBoneShell}=await import('../whale-maker/rules/shell-equipment.ts');
const {killPlayer,hurtPlayer}=await import('../whale-maker/rules/player-damage.ts');
const {equipWearable}=await import('../whale-maker/rules/p2-wearables.ts');
function level(){const width=60,height=24,cells=Array(width*height).fill('.');for(let y=20;y<height;y++)for(let x=0;x<width;x++)cells[y*width+x]='#';cells[19*width+58]='E';return {version:1,name:'公共规则',width,height,cells,spawn:[2,19.2]};}

test('registered forms flow through level validation and checkpoint editor choices together',()=>{
 for(const power of PLAYER_POWERS){const l=level();l.condition={kind:'power',power};assert.equal(validate(l).condition.power,power);assert.equal(validP2Property('checkpointPower',power),true);assert.ok(P2_CHOICES.checkpointPower.includes(power));}
 for(const value of [-1,Math.max(...PLAYER_POWERS)+1,1.5,NaN,'1',null]){assert.equal(isPlayerPower(value),false);assert.equal(validP2Property('checkpointPower',value),false);const l=level();l.condition={kind:'power',power:value};assert.throws(()=>validate(l));}
});

test('power changes, simulation and area travel agree on basin versus bone-shell geometry',()=>{
 for(const kind of ['bone-shell','basin'])for(const power of [0,1,2,3,4,5,6,7]){
  const l=level();l.areas={side:level()};const s=create(l),item=makeItem(kind,10,19);item.held=true;s.items=[item];s.riding=item;
  const feet=s.player.y+s.player.h;grantPower(s,power);const h=s.player.h;assert.equal(h,kind==='basin'?.55:power?2:.8);assert.equal(s.player.y+s.player.h,feet);
  step(s,{...EMPTY_INPUT});assert.equal(s.player.h,h,'the next step must not repair a different power-change height');
  assert.equal(changeArea(s,'side',create),true);assert.equal(s.player.h,h);assert.equal(s.items.filter(i=>i===item).length,1);
 }
});

test('all lethal causes tear down actions and inventory exactly once, while bone rest protects them',()=>{
 for(const cause of ['crush','fall','contact']){
  const s=create(level()),held=makeItem('wood-crate',2,18),hull=makeItem('bone-shell',2,19);held.held=hull.held=true;s.held=held;s.riding=hull;s.items=[held,hull];grantPower(s,2);equipShellHelmet(s,'spike-shell-helmet');equipWearable(s,'cannon-box');
  s.starTime=10;s.invincible=3;s.motion='dive';s.charge=1;s.pendingShot=true;s.bonePound=true;s.dust=[{x:2,y:20,age:0,direction:1,size:1}];
  killPlayer(s,cause);assert.equal(s.phase,'dead');assert.equal(s.deaths,1);assert.equal(s.power,0);assert.equal(s.shellHelmet,null);assert.equal(s.wearable,null);assert.equal(s.riding,null);assert.equal(s.held,null);assert.equal(held.held,false);assert.equal(hull.held,false);assert.equal(s.bonePound,false);assert.equal(s.motion,'none');assert.equal(s.pendingShot,false);assert.equal(s.dust.length,0);assert.equal(s.effects.filter(f=>f.kind==='helmet').length,1);
  killPlayer(s,cause);hurtPlayer(s);assert.equal(s.deaths,1);assert.equal(s.events.filter(e=>e.kind==='death').length,1);
  const resting=create(level()),shell=makeItem('bone-shell',2,19);resting.items=[shell];mountBoneShell(resting,shell);boneRest(resting);killPlayer(resting,cause);assert.equal(resting.phase,'playing');assert.equal(resting.riding,shell);assert.equal(resting.deaths,0);
 }
});

test('rule features have no runtime import cycles or reverse dependency on the expansion aggregator',()=>{
 const root=resolve(import.meta.dirname,'../whale-maker/rules'),graph=new Map();
 for(const file of readdirSync(root).filter(f=>f.endsWith('.ts'))){
  const source=ts.createSourceFile(file,readFileSync(resolve(root,file),'utf8'),ts.ScriptTarget.Latest,true),edges=[];
  for(const node of source.statements){
   if(!ts.isImportDeclaration(node)&&!ts.isExportDeclaration(node)||!node.moduleSpecifier||!ts.isStringLiteral(node.moduleSpecifier))continue;
   if(node.isTypeOnly||ts.isImportDeclaration(node)&&node.importClause?.isTypeOnly)continue;
   const bindings=ts.isImportDeclaration(node)?node.importClause?.namedBindings:node.exportClause;
   if(bindings&&(ts.isNamedImports(bindings)||ts.isNamedExports(bindings))&&!(ts.isImportDeclaration(node)&&node.importClause?.name)&&bindings.elements.length&&bindings.elements.every(e=>e.isTypeOnly))continue;
   const path=node.moduleSpecifier.text;if(path.startsWith('./'))edges.push(basename(path)+'.ts');
  }
  if(file!=='model.ts')assert.equal(edges.includes('expansion.ts'),false,`${file} must use services or an owned feature module`);
  graph.set(file,edges);
 }
 const visited=new Set(),active=[];
 function visit(file){assert.equal(active.includes(file),false,`runtime cycle: ${[...active,file].join(' -> ')}`);if(visited.has(file))return;active.push(file);for(const edge of graph.get(file)??[])if(graph.has(edge))visit(edge);active.pop();visited.add(file);}
 for(const file of graph.keys())visit(file);
});
