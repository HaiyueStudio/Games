import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hudFrame } from '../glass-rush/ui/layout.ts';

test('top-right icon controls remain touch-sized and do not overlap the timer or leaderboard',()=>{
 for(const [w,h] of [[320,568],[390,844],[1280,800],[844,390]]){
  const frame=hudFrame(w,h);
  for(const r of [frame.music,frame.pause]){assert.ok(r.width>=44&&r.height>=44);assert.ok(r.x>=0&&r.y>=0&&r.x+r.width<=w&&r.y+r.height<=h);}
  assert.ok(frame.music.x+frame.music.width<frame.pause.x);assert.ok(frame.timer.x+frame.timer.width<=frame.music.x);
  assert.ok(frame.card.y>frame.pause.y+frame.pause.height);assert.ok(frame.card.x>=0&&frame.card.y+frame.card.height<=h);
  assert.ok(frame.action.height>=44);assert.ok(frame.action.y+frame.action.height<=frame.card.y+frame.card.height);
 }
});
test('vector panel, icon skins and ball counters are declared local assets',()=>{
 const manifest=JSON.parse(readFileSync(new URL('../manifest.json',import.meta.url))).entries.find(entry=>entry.id==='glass-rush');
 for(const name of ['music','music-off','pause','play','life','life-empty','button-icon','button-primary','leaderboard','hud-chip']){
  const asset=`glass-rush/assets/ui/${name}.svg`;assert.ok(manifest.assets.includes(asset));
  const source=readFileSync(new URL(`../${asset}`,import.meta.url),'utf8');assert.ok(source.startsWith('<svg'));assert.ok(!source.includes('<script'));
 }
});
