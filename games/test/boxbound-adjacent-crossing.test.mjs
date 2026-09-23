import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){return next(s.startsWith('./')&&!/\.[a-z]+$/i.test(s)?s+'.ts':s,c);}});
const {loadWorldMap,installWorldMap}=await import('../boxbound/world-map.ts');
installWorldMap(await loadWorldMap(new URL('../boxbound/levels/index.json',import.meta.url),async u=>JSON.parse(readFileSync(u))));
const {createGame,advanceGame}=await import('../boxbound/levels.ts');
const {reversePlayerCrossing}=await import('../boxbound/model.ts');
const {spaceTransform,transformPoint}=await import('../boxbound/space-view.ts');
const {remember}=await import('../boxbound/history.ts');

test('Reference 5 exit into an adjacent blue box composes both physical edges without moving the red box',()=>{
 const before=createGame(),room='pp-reference5-la',red=before.boxes.find(b=>b.id===room+'-1'),blue=before.boxes.find(b=>b.id===room+'-2');
 red.pos=[3,0,4];blue.pos=[3,0,3];before.boxes.find(b=>b.id===room+'-3').pos=[3,0,5];
 const gateway=before.boxes.find(b=>b.levelEntry&&b.inside===room);
 before.player={room,pos:[4,0,0],facing:[0,0,-1],route:[{box:gateway.id,from:gateway.room,entry:[...gateway.pos]}]};
 const result=advanceGame(before,{type:'move',dir:[0,0,-1]}),after=result.state;
 assert.ok(result.changed);assert.equal(after.player.room,blue.inside);assert.deepEqual(after.boxes,before.boxes);
 assert.deepEqual(result.playerCrossing.steps,[{container:red.id,entering:false},{container:blue.id,entering:true}]);
 const transform=spaceTransform(before,after,result.playerCrossing);
 assert.equal(transform.scale,1/3);
 // The red map touches the blue map's southern edge, entirely outside its floor.
 const redCenter=transformPoint([0,0,0],transform);
 assert.equal(redCenter[2],3);assert.ok(redCenter[2]-before.rooms[room].size*transform.scale/2>=after.rooms[blue.inside].size/2);
 const start=transformPoint([0,0,-4],transform);assert.ok(Math.abs(start[2]-5/3)<1e-10);
 const reverse=reversePlayerCrossing(result.playerCrossing),back=spaceTransform(after,before,reverse);
 assert.deepEqual(reverse.steps,[{container:blue.id,entering:false},{container:red.id,entering:true}]);
 for(const p of [[0,0,-4],[2,1,3]])transformPoint(transformPoint(p,transform),back).forEach((v,i)=>assert.ok(Math.abs(v-p[i])<1e-9));
 const history=[];remember(history,before,false,[],false,result.playerCrossing);result.playerCrossing.steps[0].container='changed';
 assert.equal(history[0].playerCrossing.steps[0].container,red.id);
});
