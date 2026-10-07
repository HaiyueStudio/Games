import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newGarden, collectLotus, advanceGarden, LOTUS_POINTS, LOTUS_BONUS } from '../ink-pinball/gardenRules.ts';
test('flowers score once with a delayed full-set respawn', () => {
 const s=newGarden();assert.equal(collectLotus(s,1,0),250);assert.equal(collectLotus(s,1,.1),0);
 assert.equal(collectLotus(s,0,.2),250);assert.equal(collectLotus(s,2,.3),2250);
 assert.equal(s.collected,7);assert.equal(s.rounds,1);assert.equal(advanceGarden(s,1.29),false);
 assert.equal(collectLotus(s,2,1.29),0);assert.equal(advanceGarden(s,1.3),true);
 assert.equal(s.collected,0);assert.equal(s.rounds,1);assert.equal(collectLotus(s,2,1.31),250);
});
test('all collection orders award the same total over repeated rounds', () => {
 for(const order of [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]]){
  const s=newGarden();let score=0;for(let r=0;r<50;r++){for(const i of order)score+=collectLotus(s,i,r*2);advanceGarden(s,r*2+1);}
  assert.equal(score,50*(LOTUS_POINTS*3+LOTUS_BONUS));assert.equal(s.rounds,50);
 }
});
test('invalid flower indices never modify collection state',()=>{
 const s=newGarden();for(const i of [-1,3,.5,NaN])assert.equal(collectLotus(s,i,0),0);assert.deepEqual(s,newGarden());
});
test('bitmap font covers ten digits with bounded atlas rectangles',()=>{
 const root=new URL('../ink-pinball/assets/',import.meta.url);
 const f=JSON.parse(readFileSync(new URL('brush-digits.fnt.json',root)));const png=readFileSync(new URL('brush-digits.png',root));
 assert.equal(f.scaleW,png.readUInt32BE(16));assert.equal(f.scaleH,png.readUInt32BE(20));
 assert.deepEqual(f.chars.map(g=>g.id),Array.from({length:10},(_,i)=>48+i));
 for(const g of f.chars){assert.ok(g.x>=0&&g.y>=0&&g.width>0&&g.height>0);assert.ok(g.x+g.width<=f.scaleW&&g.y+g.height<=f.scaleH);assert.ok(g.xadvance>0);}
});
