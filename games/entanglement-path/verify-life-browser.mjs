import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runChromeWebGpuFixture } from '../../../Engine/scripts/webgpu-gate/chrome-runner.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const output = resolve(root, 'artifacts/entanglement-path'); mkdirSync(output, { recursive: true });
for (const [name, width, height] of [['desktop', 1200, 760], ['portrait', 390, 844]]) {
  const result = await runChromeWebGpuFixture({ root, fixture: 'games/entanglement-path/index.html', query: { verify: 1 },
    timeoutMs: 90000, disableDx12InfoCollection: true, visualCapture: { viewportWidth: width, viewportHeight: height },
    interact: async cdp => {
      const evaluate = async expression => {
        const response = await cdp.call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        if (response.result?.exceptionDetails) throw new Error(response.result.exceptionDetails.exception?.description ?? response.result.exceptionDetails.text);
        return response.result?.result?.value;
      };
      const wait = async (expression, label) => {
        const deadline = Date.now() + 25000;
        while (!await evaluate(expression)) { assert.ok(Date.now() < deadline, label); await new Promise(r => setTimeout(r, 40)); }
      };
      const ready = () => wait('!!window.__entanglementPath?.versus && !__entanglementPath.introActive && !__entanglementPath.versus.loading && !__entanglementPath.versus.toolbar.hidden', 'ready');
      const frames = () => evaluate('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))');
      const click = async point => {
        await cdp.call('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
        await cdp.call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
      };
      const selector = async value => click(await evaluate(`(() => { const r=document.querySelector(${JSON.stringify(value)}).getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`));
      const key = async value => {
        await cdp.call('Input.dispatchKeyEvent', { type: 'keyDown', key: value });
        await cdp.call('Input.dispatchKeyEvent', { type: 'keyUp', key: value });
      };
      const capture = async suffix => {
        await frames(); const response = await cdp.call('Page.captureScreenshot', { format: 'png' });
        writeFileSync(resolve(output, `${name}-life-${suffix}.png`), Buffer.from(response.result.data, 'base64'));
      };
      const snapshot = () => evaluate(`(() => { const v=__entanglementPath.versus, m=v.match; return {
        record:m.record(),lives:m.lives,claimed:[...m.claimed],score:m.human.score,best:v.lifeBest,
        selection:v.selection,rotations:v.rotations,reason:m.endReason,seed:v.seed,cells:m.level.cells
      }; })()`);
      await ready(); await selector('[data-mode="life"]'); await ready();
      await evaluate('__entanglementPath.versus.newMatch(177,0)'); await frames();
      assert.deepEqual(await evaluate(`(() => { const v=__entanglementPath.versus,m=v.match; return {
        mode:v.mode,lives:m.lives,placed:m.human.placed.size,fixed:m.fixed.size,special:m.special.length,
        centerRoutes:m.human.placed.get('0,0').tile.pairs.length,score:m.human.score,claimed:m.claimed.size,
        ai:v.machineChoice===null && v.machineAt===Infinity,turn:m.turn
      }; })()`), {mode:'life',lives:6,placed:7,fixed:7,special:6,centerRoutes:6,score:0,claimed:1,ai:true,turn:'human'});
      assert.ok(await evaluate(`(() => { const v=__entanglementPath.versus;
        window.__lifeInitialNodes=[...v.view.world.nodes]; window.__lifeWorker=v.art.connected.worker;
        const fog=[...v.view.fog.values()][0].getContext('2d');
        return v.levelSelect.hidden && v.view.level.id==='life-open' && v.match.level.unbounded && v.match.level.wallKeys.size===0
          && v.view.map===null && [...v.view.world.nodes.values()].every(n=>n.kind==='play'&&n.ridges===0)
          && fog.getImageData(0,0,1,1).data[3]===0 && fog.getImageData(128,128,1,1).data[3]>0;
      })()`),'dedicated open map has no wall or backdrop boundary, and soft transparent mist');
      const accents=await evaluate(`(() => { const v=__entanglementPath.versus,m=v.match,p=v.view.painter;
        const alpha=[],colors=[];
        for(const id of ['0,0',...m.special.map(c=>c.q+','+c.r)]) {
          const t=m.human.placed.get(id),n=v.view.world.nodes.get(id),role=id==='0,0'?'center':'special';
          const raw=p.terrain(n,t.tile,t.rotation).getContext('2d').getImageData(0,0,256,256).data;
          const surface=p.terrain(n,t.tile,t.rotation,role),ink=surface.getContext('2d').getImageData(0,0,256,256).data;
          let red=0,samples=0;for(let i=0;i<raw.length;i+=4) {if(raw[i+3]!==ink[i+3])alpha.push(i);if(raw[i+3]===255){red+=(ink[i]-ink[i+1])-(raw[i]-raw[i+1]);samples++;}}
          colors.push({role,red:red/samples,cached:surface===p.terrain(n,t.tile,t.rotation,role)});
        }return {alpha:alpha.length,colors};
      })()`);
      assert.equal(accents.alpha,0,'special pigments preserve transparent tile edges');
      assert.ok(accents.colors.every(c=>c.cached&&c.red>(c.role==='special'?40:15)),'cinnabar specials and ochre center visibly differ from ordinary jade terrain');
      const mountainMaterial=await evaluate(`(()=>{
        const v=__entanglementPath.versus,p=v.view.painter,n=[...v.view.world.nodes.values()].find(n=>n.corners===63);
        const variants=[...v.match.level.tileLibrary.slice(0,3),[[0,1],[2,3],[4,5],[6,7],[8,9],[10,11]],[[0,6],[1,7],[2,8],[3,9],[4,10],[5,11]],[[0,7],[1,9],[2,6],[3,11],[4,8],[5,10]]];
        const t=pairs=>({id:213,variant:0,pairs}),a=p.terrain(n,t(variants[3]),0).getContext('2d').getImageData(0,0,256,256).data,b=p.terrain(n,t(variants[4]),0).getContext('2d').getImageData(0,0,256,256).data;
        let dark=0,inside=0,difference=0,outer=0,lo=255,hi=0;
        for(let y=0;y<256;y++)for(let x=0;x<256;x++){
          const i=(y*256+x)*4,r=Math.hypot((x-128)/1.15,y-128),tone=(a[i]+a[i+1]+a[i+2])/3;
          if(r<78){inside++;difference+=Math.abs(a[i]-b[i]);if(tone<155)dark++;lo=Math.min(lo,tone);hi=Math.max(hi,tone);}
          if(r>96&&a[i+3]>240&&b[i+3]>240)outer=Math.max(outer,Math.abs(a[i]-b[i]));
        }
        const c=document.createElement('canvas');c.width=864;c.height=646;const x=c.getContext('2d');x.fillStyle='#f3e8ce';x.fillRect(0,0,c.width,c.height);x.textAlign='center';x.fillStyle='#202825';x.font='23px KaiTi';x.fillText('同一片山势 · 六种河道分区',432,33);
        variants.forEach((pairs,i)=>{const ox=(i%3)*288+16,oy=Math.floor(i/3)*298+52;
          const wet=[{entry:pairs[0][0],exit:pairs[0][1],progress:1,bank:1}];x.drawImage(p.placed(n,t(pairs),0,wet,0),ox,oy,256,256);x.font='18px KaiTi';x.fillText('水路 '+(i+1),ox+128,oy+277);
        });
        return {dark:dark/inside,variation:hi-lo,pathDifference:difference/inside,outer,gallery:c.toDataURL('image/png')};
      })()`);
      assert.ok(mountainMaterial.dark>.07&&mountainMaterial.variation>65,'mountain slopes and ink texture fill the river-separated pockets');
      assert.ok(mountainMaterial.pathDifference>8&&mountainMaterial.outer===0,'different paths carve different mountain interiors while preserving the shared edge');
      writeFileSync(resolve(output,`${name}-mountain-materials.png`),Buffer.from(mountainMaterial.gallery.split(',')[1],'base64'));
      // Compare the final pixels with/without the bloom, including the edge shared with the right-hand special.
      const haloSectors=await evaluate(`(() => { const v=__entanglementPath.versus,view=v.view,m=v.match,region=view.boardRegions.get('human'),now=v.options.now(),halo=view.halo;
        const paint=()=>{const c=document.createElement('canvas');c.width=innerWidth;c.height=innerHeight;const x=c.getContext('2d');x.fillStyle='#f3e8ce';x.fillRect(0,0,c.width,c.height);view.drawBoard(x,m.human,region,v.selection,now,'human');return x.getImageData(0,0,c.width,c.height).data;};
        const empty=document.createElement('canvas');empty.width=empty.height=384;
        let off,on;try{view.halo=empty;off=paint();view.halo=halo;on=paint();}finally{view.halo=halo;}
        const a=view.active,counts=Array(6).fill(0);
        for(let y=Math.max(0,Math.floor(a.y-a.radius*1.6));y<Math.min(innerHeight,a.y+a.radius*1.6);y++)for(let x=Math.max(0,Math.floor(a.x-a.radius*1.6));x<Math.min(innerWidth,a.x+a.radius*1.6);x++) {
          const dx=x-a.x,dy=y-a.y,d=Math.hypot(dx,dy);if(d<a.radius*1.04||d>a.radius*1.55)continue;
          const angle=Math.atan2(dy,dx),side=Math.round(angle/(Math.PI/3)),gap=Math.abs(angle-side*Math.PI/3);if(gap>Math.PI/18)continue;
          const i=(y*innerWidth+x)*4;if(Math.abs(on[i]-off[i])+Math.abs(on[i+1]-off[i+1])+Math.abs(on[i+2]-off[i+2])>4)counts[(side+6)%6]++;
        }return counts;
      })()`);
      assert.ok(haloSectors.every(n=>n>=3),`all six halo sides remain visible over adjacent cells: ${haloSectors}`);
      await capture('start');
      await key('ArrowLeft');
      await click(await evaluate(`(() => { const b=__entanglementPath.versus.view.hits.get('swap'); return {x:b.x+b.w/2,y:b.y+b.h/2}; })()`));
      assert.deepEqual(await evaluate('({lives:__entanglementPath.versus.match.lives,moves:__entanglementPath.versus.match.moves.length,swap:__entanglementPath.versus.selection.swap})'), {lives:6,moves:0,swap:true});
      assert.ok(await evaluate('!!__entanglementPath.versus.view.flight'), 'shared swap animation');
      await key('b'); await key('ArrowRight');
      // Choose a legal real move that reaches a landmark; replay copies never mutate the live board.
      const bonusChoice = await evaluate(`(() => { const m=__entanglementPath.versus.match;
        for(const swap of [false,true]) for(let rotation=0;rotation<6;rotation++) {
          const c=m.constructor.restore(m.level,m.record()); c.play('human',{swap,rotation});
          if(c.lastBonuses.some(b=>b.cell!=='0,0') && !c.winner) return {swap,rotation,bonus:c.lastBonuses.reduce((n,b)=>n+b.count,0),channels:c.claimed.size-m.claimed.size};
        }
        return null;
      })()`);
      assert.ok(bonusChoice, 'fixture offers a new special path');
      await evaluate(`(() => { const v=__entanglementPath.versus,c=${JSON.stringify(bonusChoice)}; if(c.swap) v.swap(); v.rotate(c.rotation); })()`);
      await evaluate(`(()=>{const b=__entanglementPath.versus.match.human;
        window.__scorePlaced={...b.current};window.__scoreOldRoutes=b.routes.map(r=>r.cell+':'+Math.min(r.entry,r.exit)+'-'+Math.max(r.entry,r.exit));
      })()`);
      await click(await evaluate('({x:__entanglementPath.versus.view.active.x,y:__entanglementPath.versus.view.active.y})'));
      await ready(); await frames();
      assert.deepEqual(await evaluate('({lives:__entanglementPath.versus.match.lives,moves:__entanglementPath.versus.match.moves.length,claimed:__entanglementPath.versus.match.claimed.size})'),
        {lives:5+bonusChoice.bonus,moves:1,claimed:1+bonusChoice.channels});
      assert.ok(await evaluate('__entanglementPath.versus.match.lastBonuses.some(b=>b.cell!=="0,0"&&b.count>=2)'), 'special paths grant two lives and schedule +2 feedback');
      assert.ok(await evaluate('__entanglementPath.versus.view.bonuses.size>0'), 'bonus feedback is scheduled');
      assert.ok(await evaluate('(()=>{const v=__entanglementPath.versus;return v.art.connected.worker===__lifeWorker && __lifeInitialNodes.every(([id,n])=>JSON.stringify(v.view.world.nodes.get(id))===JSON.stringify(n));})()'),
        'terrain grows on the same worker without changing explored tiles');
      await capture('bonus');
      assert.ok(await evaluate(`(() => {const v=__entanglementPath.versus,fs=v.view.scores.flights,r=v.view.boardRegions.get('human'),e=v.view.extent,c=v.view.center,h=v.view.level.hexScreen;
        window.__scoreGpuTexture=__entanglementPath.versusOverlay.texture;window.__scoreRecord=JSON.stringify(v.match.record());
        const fresh=v.match.human.routes.filter((a,i,all)=>{const k=a.cell+':'+Math.min(a.entry,a.exit)+'-'+Math.max(a.entry,a.exit);return !__scoreOldRoutes.includes(k)&&all.findIndex(b=>b.cell+':'+Math.min(b.entry,b.exit)+'-'+Math.max(b.entry,b.exit)===k)===i;});
        return fs.length===fresh.length&&fs.length>=2&&fs.reduce((n,f)=>n+f.gain,0)===v.match.human.score&&fs.every((f,i)=>{
          const [q,z]=fresh[i].cell.split(',').map(Number),s=Math.min(r.w/e.w,r.h/e.h),p={x:(2*q+z)*h,y:Math.sqrt(3)*z*h},origin=f.layout().from;
          const water=v.view.paints.get(v.match.human).flow.wetness(fresh[i].cell,f.start).find(w=>w.entry===fresh[i].entry&&w.exit===fresh[i].exit);
          return f.gain===i+1&&Math.hypot(origin.x-(r.x+r.w/2+(p.x-c.x)*s),origin.y-(r.y+r.h/2+(p.y-c.y)*s))<.01&&water.progress>.99999&&(i===0||f.start>fs[i-1].start)&&f.glyph.fragments.length>10;
        });
      })()`),'every new water crossing has its own ordered bitmap score at the correct tile');
      await evaluate(`(()=>{const v=__entanglementPath.versus,t=v.options.now(),fs=v.view.scores.flights,first=fs[0].start;
        window.__scoreRealClock=v.options.now;v.options.now=()=>t;window.__scoreGaps=fs.map(f=>f.start-first);
        fs.forEach((f,i)=>{f.start=t+__scoreGaps[i];f.reach=undefined;});
      })()`);
      const readout=await evaluate(`(()=>{const v=__entanglementPath.versus,total=v.match.human.score,values=[];
        for(let dt=0;dt<=Math.max(...__scoreGaps)+2000;dt+=20)values.push(v.view.scores.display(total,'human',v.options.now()+dt));
        return {values,total};
      })()`);
      assert.equal(readout.values[0],0);assert.equal(readout.values.at(-1),readout.total);
      assert.ok(new Set(readout.values).size>=3&&readout.values.every((n,i)=>!i||n>=readout.values[i-1]),'HUD grows through intermediate scores instead of jumping to the turn total');
      for(const [age,label] of [[290,'score-rise'],[1020,'score-stream'],[1610,'score-arrive']]) {
        await evaluate(`(() => { const v=__entanglementPath.versus;v.view.scores.flights.forEach((f,i)=>{f.start=v.options.now()-${age}+__scoreGaps[i];});v.view.invalidate();v.update(); })()`);
        await capture(label);
        assert.ok(await evaluate('JSON.stringify(__entanglementPath.versus.match.record())===__scoreRecord && __entanglementPath.versusOverlay.texture===__scoreGpuTexture'), 'score animation changes neither gameplay nor the GPU texture');
      }
      assert.ok(await evaluate('__entanglementPath.versus.view.scores.pulse("human",__entanglementPath.versus.options.now())>0'),'score field reacts when the ink arrives');
      await evaluate('(()=>{const v=__entanglementPath.versus;v.view.scores.flights.forEach((f,i)=>{f.start=v.options.now()-(__scoreGaps[1]+290)+__scoreGaps[i];});v.view.invalidate();v.update();})()');
      await capture('sequential-scores');
      await evaluate('(()=>{const v=__entanglementPath.versus;v.view.scores.flights.forEach(f=>{f.start=v.options.now()-2100;});v.view.invalidate();v.update();})()');
      assert.equal(await evaluate('__entanglementPath.versus.view.scores.size'),0,'score trails expire completely');
      assert.equal(await evaluate('__entanglementPath.versus.view.scores.display(__entanglementPath.versus.match.human.score,"human",__entanglementPath.versus.options.now())'),readout.total,'settled readout equals the authoritative score');
      await evaluate('__entanglementPath.versus.options.now=__scoreRealClock');
      await key('ArrowRight'); await key('b');
      await evaluate('__entanglementPath.versus.saves.flush()'); const saved = await snapshot();
      await evaluate('window.__entanglementPath=undefined'); await cdp.call('Page.reload'); await ready();
      assert.deepEqual(await snapshot(),saved,'refresh restores life, claims, score, selection and best');
      assert.equal(await evaluate('__entanglementPath.versus.view.scores.size'),0,'restore never replays old score trails');
      const soloSaved = await evaluate('(async () => JSON.stringify(await __entanglementPath.saves.load()))()');
      // Find a genuine life-depletion history on the real deck, without editing lives or tile rules.
      const plan = await evaluate(`(() => { const v=__entanglementPath.versus,C=v.match.constructor,level=v.match.level;
        let beam=[new C(level,177)];
        for(let depth=0;depth<10;depth++) {
          const next=[];
          for(const m of beam) for(const swap of [false,true]) for(let rotation=0;rotation<6;rotation++) {
            const c=C.restore(level,m.record()); c.play('human',{swap,rotation});
            if(c.endReason==='life') return c.record().moves;
            if(!c.winner) next.push(c);
          }
          next.sort((a,b)=>a.lives-b.lives || b.human.score-a.human.score);
          beam=next.slice(0,60);
        } return null;
      })()`);
      assert.ok(plan?.length>=6,'a real six-life exhaustion history exists');
      await evaluate('__entanglementPath.versus.newMatch(177,0)');
      for(const move of plan) {
        await evaluate(`(() => { const v=__entanglementPath.versus,c=${JSON.stringify(move)};
          if(v.selection.swap!==c.swap) v.swap(); v.rotate((c.rotation-v.selection.rotation+6)%6); })()`);
        await key('Enter');
        await ready();
      }
      const ended=await snapshot(); assert.equal(ended.lives,0); assert.equal(ended.reason,'life');
      assert.ok(ended.score>0); assert.ok(ended.best['life-open']>=ended.score);
      await evaluate('new Promise(r => setTimeout(r,1800))'); // Review settled rivers after the accelerated input sequence.
      await capture('result');
      await evaluate('__entanglementPath.versus.saves.flush()');
      await evaluate('window.__entanglementPath=undefined'); await cdp.call('Page.reload'); await ready();
      assert.deepEqual(await snapshot(),ended,'ended life game and best survive refresh');
      await click({x:width/2,y:height*.82}); await ready();
      assert.deepEqual(await evaluate('({seed:__entanglementPath.versus.seed,lives:__entanglementPath.versus.match.lives,moves:__entanglementPath.versus.match.moves.length,placed:__entanglementPath.versus.match.human.placed.size,bonuses:__entanglementPath.versus.view.bonuses.size})'),
        {seed:177,lives:6,moves:0,placed:7,bonuses:0}, 'click restarts an ended game completely with the same seed');
      const initial=await snapshot();
      await key(']'); assert.deepEqual(await snapshot(),initial,'bounded-map shortcut does not reset the dedicated life map');
      for(const index of [1,2,3,0]) {
        await evaluate(`__entanglementPath.versus.newMatch(177,${index})`); await frames();
        assert.deepEqual(await snapshot(),initial,'bounded shape arguments never alter the dedicated life layout');
      }
      const escape=await evaluate(`(() => { const m=__entanglementPath.versus.match,C=m.constructor,dist=c=>Math.max(Math.abs(c.q),Math.abs(c.r),Math.abs(c.q+c.r));
        let beam=[new C(m.level,177)];
        for(let depth=0;depth<10;depth++) {
          const next=[];
          for(const r of beam)for(const swap of [false,true])for(let rotation=0;rotation<6;rotation++) {
            const c=C.restore(m.level,r.record());c.play('human',{swap,rotation});
            if(!c.winner && dist(c.human.current)>=5)return c.record().moves;
            if(!c.winner)next.push(c);
          }
          next.sort((a,b)=>dist(b.human.current)-dist(a.human.current)||b.lives-a.lives);beam=next.slice(0,100);
        }return null;
      })()`);
      assert.ok(escape,'real seeded paths can pass the former mountain rim');
      for(const move of escape) {
        await evaluate(`(() => { const v=__entanglementPath.versus,c=${JSON.stringify(move)}; if(v.selection.swap!==c.swap)v.swap();v.rotate((c.rotation-v.selection.rotation+6)%6); })()`);
        await key('Enter'); await ready();
      }
      await evaluate('new Promise(r=>setTimeout(r,1000))'); await capture('extended');
      assert.ok(await evaluate(`(() => { const v=__entanglementPath.versus,m=v.match,p=m.human.current,a=v.view.active,r=v.view.boardRegions.get('human');
        return !m.winner && v.view.world.nodes.has(p.q+','+p.r) && v.view.world.nodes.size>37 && v.view.map===null
          && a.x>=r.x && a.x<=r.x+r.w && a.y>=r.y && a.y<=r.y+r.h;
      })()`),'expanded map keeps the current piece visible and playable');
      await evaluate('__entanglementPath.versus.saves.flush()'); const expanded=await snapshot();
      await evaluate('window.__entanglementPath=undefined');await cdp.call('Page.reload');await ready();
      assert.deepEqual(await snapshot(),expanded,'restore rebuilds the same open terrain extent');
      await evaluate(`(async()=>{const v=__entanglementPath.versus,s=await v.saves.load();s.match.version=1;s.levelId='classic';await v.saves.saveNow(s);})()`);
      await evaluate('window.__entanglementPath=undefined');await cdp.call('Page.reload');await ready();
      assert.deepEqual(await evaluate('({lives:__entanglementPath.versus.match.lives,moves:__entanglementPath.versus.match.moves.length,version:__entanglementPath.versus.match.record().version})'),
        {lives:6,moves:0,version:2},'legacy bounded life histories start clean on the new map');
      assert.deepEqual((await snapshot()).best,expanded.best,'map migration keeps saved best records');
      assert.equal(await evaluate('(async () => JSON.stringify(await __entanglementPath.saves.load()))()'),soloSaved,'life games do not overwrite the solo save');
      await key('m'); assert.equal(await evaluate('__entanglementPath.versus.mode'),'solo');
      const payload={status:'passed',checks:['life-mode-button','six-lives-seven-fixed-tiles','shared-input-and-motion','new-path-reward','bonus-feedback',
        'continuous-mountain-textures','path-carved-mountain-pockets','mountain-seam-preservation',
        'per-crossing-bitmap-scores','water-synchronized-score-order','incremental-HUD-score','score-rise-stream-arrival','score-trail-gpu-reuse-and-cleanup',
        'six-sided-unoccluded-halo','cinnabar-special-ochre-center','two-life-special-reward',
        'save-selection-lives-claims-best','real-life-exhaustion','ended-save-restore','click-seeded-restart','independent-unbounded-layout','soft-mist-no-rim',
        'stable-incremental-terrain-worker','past-former-board-edge','expanded-save-restore','legacy-map-migration','independent-solo-save','return-to-solo'],score:ended.score,moves:plan.length};
      await evaluate(`(() => { const n=document.createElement('pre'); n.id='result'; n.hidden=true; n.dataset.status='passed'; n.textContent=${JSON.stringify(JSON.stringify(payload))}; document.body.append(n); })()`);
    },
  });
  assert.equal(result.status,'passed',`${name} life browser regression`);
  assert.equal(result.browserDiagnostics.unclassifiedFailureCount,0);
  delete result.visualCapture.pngBase64;
  writeFileSync(resolve(output,`${name}-life.json`),JSON.stringify(result,null,2));
  console.log(`${name}: life checks passed`);
}
