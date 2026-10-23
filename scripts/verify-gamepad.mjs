import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { runChromeWebGpuFixture } from '../../Engine/scripts/webgpu-gate/chrome-runner.mjs';

const root = resolve(import.meta.dirname, '..'), output = resolve(root, 'artifacts/gamepad');
mkdirSync(output, { recursive: true });
const delay = ms => new Promise(done => setTimeout(done, ms));
const mock = `
if(window===top)window.__pads=[];
Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>top.__pads});
window.__keys=[];
for(const type of ['keydown','keyup'])addEventListener(type,e=>window.__keys.push({type,code:e.code,repeat:e.repeat}));
`;
const provenance = {
  revision: execFileSync('git', ['-c', 'safe.directory='+root.replaceAll('\\','/'), 'rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  generatedAt: new Date().toISOString(), simulatedControllers: true,
  fingerprints: Object.fromEntries(['games/gamepad/runtime.ts','games/gamepad/sampler.ts','games/gamepad/profiles.ts','games/gamepad/lobby.ts','site/app.js'].map(file => [file,createHash('sha256').update(readFileSync(resolve(root,file))).digest('hex')])),
};

async function run(name, fixture, query, exercise) {
  if(process.env.GAMEPAD_CASE && !process.env.GAMEPAD_CASE.split(',').includes(name))return;
  const checks = [];
  const result = await runChromeWebGpuFixture({root, fixture, query, timeoutMs:90000, disableDx12InfoCollection:true,
    mounts:[{prefix:'/site/games',directory:resolve(root,'games')}],
    visualCapture:{viewportWidth:1040,viewportHeight:600},
    interact:async cdp=>{
      const evaluate=async expression=>{
        const r=await cdp.call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
        if(r.result?.exceptionDetails)throw new Error(r.result.exceptionDetails.exception?.description??r.result.exceptionDetails.text);
        return r.result?.result?.value;
      };
      const until=async(expression,label)=>{
        for(let n=0;n<240;n++){try{if(await evaluate(expression))return;}catch{}await delay(100);}
        throw new Error('Timed out: '+label);
      };
      await until('document.readyState === "complete"','initial document');
      await cdp.call('Page.addScriptToEvaluateOnNewDocument',{source:mock});
      await cdp.call('Page.reload');
      await until('!!window.__pads','controller mock');
      const pads=async(states=[{}])=>{
        await evaluate(`window.__pads=${JSON.stringify(states)}.map((s,index)=>s===null?null:({index,connected:true,mapping:'standard',id:'Test pad '+index,axes:s.axes??[0,0,0,0],buttons:Array.from({length:17},(_,b)=>({value:(s.buttons??[]).includes(b)?1:0,pressed:(s.buttons??[]).includes(b),touched:false}))}))`);
        await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))');
        await delay(100);
      };
      const press=async(button)=>{await pads([{buttons:[button]}]);await pads();};
      const check=(condition,label)=>{assert.ok(condition,label);checks.push(label);};
      await exercise({evaluate,until,pads,press,check,cdp});
      await evaluate(`(()=>{let r=document.querySelector('#result');if(!r){r=document.createElement('pre');r.id='result';r.hidden=true;document.body.append(r);}r.dataset.status='passed';r.textContent=${JSON.stringify(JSON.stringify({status:'passed',checks}))};})()`);
    }});
  writeFileSync(resolve(output,name+'.png'),Buffer.from(result.visualCapture.pngBase64,'base64'));
  delete result.visualCapture.pngBase64;
  writeFileSync(resolve(output,name+'.json'),JSON.stringify({...result,provenance},null,2));
  console.log(name+': '+checks.length+' checks passed');
}

await run('input','games/test/fixtures/gamepad/index.html',{},async({evaluate,until,pads,press,check})=>{
  await until('!!window.fixture','input fixture');await pads([{},{}]);
  await pads([{axes:[1,0,0,0],buttons:[0]},{axes:[0,-1,0,0],buttons:[0]}]);
  let events=await evaluate('fixture.events');
  for(const code of ['KeyD','KeyJ','ArrowUp','Enter'])check(events.some(e=>e.type==='keydown'&&e.code===code),'independent player input '+code);
  await pads([]);events=await evaluate('fixture.events');
  for(const code of ['KeyD','KeyJ','ArrowUp','Enter'])check(events.some(e=>e.type==='keyup'&&e.code===code),'disconnect releases '+code);
  await pads();await evaluate('fixture.events.length=0;dispatchEvent(new Event("blur"))');
  await pads([{axes:[1,0,0,0]}]);await evaluate('dispatchEvent(new Event("focus"))');await delay(200);
  check(!(await evaluate('fixture.events')).some(e=>e.type==='keydown'),'focus waits for neutral input');
  await pads();await press(8);await press(0);
  events=await evaluate('fixture.events');check(events.some(e=>e.type==='click'&&e.target==='button'),'virtual pointer clicks DOM controls');
  await pads([{buttons:[0]}]);await pads([{buttons:[0],axes:[.5,0,0,0]}]);await pads();
  events=await evaluate('fixture.events');check(events.some(e=>e.type==='pointermove'&&e.target==='button'),'drag retains its original target');
  await pads([{buttons:[0]}]);await evaluate('dispatchEvent(new Event("blur"))');
  check((await evaluate('fixture.events')).some(e=>e.type==='pointercancel'),'blur cancels virtual pointer capture');
  await evaluate('fixture.dispose()');check(await evaluate('!document.querySelector("[data-gamepad-hint]")&&!document.querySelector("[data-gamepad-cursor]")'),'dispose removes adapter UI');
});

await run('lobby','site/index.html',{},async({evaluate,until,pads,press,check})=>{
  await until('document.querySelectorAll(".card-visual").length===28','manifest catalog');await pads();
  const first=await evaluate('document.querySelector(".gamepad-selected").dataset.gameId');
  await press(15);check(await evaluate('document.querySelector(".gamepad-selected").dataset.gameId')!==first,'D-pad selects another game');
  await press(5);check(await evaluate('document.querySelector(".filters .active").dataset.filter')==='puzzle','RB changes category');
  await press(4);
  check(await evaluate('document.querySelector(".filters .active").dataset.filter')==='all','LB returns to all games');
  await press(15);await press(15);
  await press(0);await until('document.querySelector("#game-dialog").open','game opens');
  check(await evaluate('document.querySelector("#game-frame").dataset.gameId')==='2048','A opens selected game');
  await until('document.querySelector("#game-frame").contentDocument.body.dataset.gamepadActive === "true"','game controller boot');
  await press(15);check(await evaluate('document.querySelector("#game-frame").contentWindow.__keys.some(e=>e.code==="ArrowRight"&&e.type==="keydown")'),'game receives controller input inside iframe');
  await pads([{buttons:[8,4]}]);await pads();
  await until('document.querySelector("#game-frame").dataset.gameId==="tank-battle"','previous game');
  check(true,'Back+LB switches games');
  await until('document.querySelector("#game-frame").contentDocument.body.dataset.gamepadActive === "true"','new game controller boot');
  await pads([{buttons:[8,9]}]);await pads();await until('!document.querySelector("#game-dialog").open','return home');
  check(true,'Back+Start closes iframe and restores lobby');
  check(await evaluate('document.querySelector("#game-frame").getAttribute("src")')==='about:blank','closed game is unloaded');
});

await run('tank-mobile','games/tank-battle/index.html',{verify:1,mobile:1},async({evaluate,until,pads,press,check,cdp})=>{
  await cdp.call('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:1,mobile:true});
  await until('!!window.__tankBattle','mobile tank scene');await pads();await press(0);
  const before=await evaluate('__tankBattle.snapshot()');
  await pads([{axes:[0,-1,0,0],buttons:[0]}]);await delay(350);await pads();
  const after=await evaluate('__tankBattle.snapshot()');
  check(after.mode===1 && after.tick>before.tick,'mobile controller starts a 1P game');
  check(after.tanks.find(t=>t.player===1).y<before.tanks.find(t=>t.player===1).y,'mobile left stick moves the tank');
  check(after.bullets.length>0,'mobile A fires shells');
  await press(9);check(await evaluate('__tankBattle.snapshot().phase')==='paused','Start pauses mobile combat');
  await cdp.call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await delay(300);
  check(await evaluate('__tankBattle.hud().portraitPaused'),'portrait shows rotation prompt');
  const tick=await evaluate('__tankBattle.snapshot().tick');await press(0);
  check(await evaluate('__tankBattle.snapshot().tick')===tick,'portrait cannot resume combat');
  await cdp.call('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:1,mobile:true});await delay(300);await press(0);
  check(await evaluate('__tankBattle.snapshot().phase')==='playing','landscape resumes with A');
  check(await evaluate('document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight'),'landscape controls fit screen');
});

await run('tank-coop','games/tank-battle/index.html',{verify:1},async({evaluate,until,pads,press,check,cdp})=>{
  await cdp.call('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
  await until('!!window.__tankBattle','desktop tank scene');await pads();await press(8);
  for(let i=0;i<30;i++){
    const delta=await evaluate(`(()=>{const b=__tankBattle.hud().buttons.duo,r=document.querySelector('#gui').getBoundingClientRect(),c=document.querySelector('[data-gamepad-cursor]');return [b.x+b.width/2-parseFloat(c.style.left),b.y+b.height/2-parseFloat(c.style.top)]})()`);
    if(delta.every(d=>Math.abs(d)<8))break;
    await pads([{axes:[...delta.map(d=>Math.abs(d)<8?0:Math.sign(d)*(.2+.8*Math.min(1,Math.abs(d)/105))),0,0]}]);
  }
  await pads();await press(0);await press(8);await pads([{},{}]);
  await until('__tankBattle.snapshot().tick>0','GUI starts combat');
  check(await evaluate('__tankBattle.snapshot().mode')===2,'virtual pointer starts 2P through Engine GUI');
  const before=await evaluate('__tankBattle.snapshot()');
  await pads([{axes:[0,-1,0,0],buttons:[0]},{axes:[0,-1,0,0],buttons:[0]}]);await delay(300);await pads([{},{}]);
  const after=await evaluate('__tankBattle.snapshot()');
  writeFileSync(resolve(output,'tank-coop-state.json'),JSON.stringify({before,after,input:await evaluate('({keys:__keys,hint:document.querySelector("[data-gamepad-hint]").textContent,active:document.body.dataset.gamepadActive})')},null,2));
  for(const player of [1,2])check(after.tanks.find(t=>t.player===player).y<before.tanks.find(t=>t.player===player).y,'tank '+player+' responds independently');
  check(after.bullets.some(b=>b.player===1)&&after.bullets.some(b=>b.player===2),'both controllers fire simultaneously');
});

await run('pong','games/pong/index.html',{seed:1985},async({evaluate,until,pads,check})=>{
  await until('!!window.__pong && document.body.dataset.renderStatus === "passed"','Pong render');await pads([{},{}]);
  const before=await evaluate('__pong.snapshot().paddles');
  await pads([{axes:[0,-1,0,0]},{axes:[0,1,0,0]}]);await delay(300);await pads([{},{}]);
  const after=await evaluate('__pong.snapshot().paddles');
  check(after[0]!==before[0]&&after[1]!==before[1],'both Pong controllers move their paddles');
  check((after[0]-before[0])*(after[1]-before[1])<0,'Pong player directions remain independent');
});

await run('minecraft','games/minecraft-lite/index.html',{verify:1,seed:1985},async({evaluate,until,pads,press,check})=>{
  await until('!!window.__minecraftInput && document.body.dataset.renderStatus === "passed"','Minecraft render');await pads();
  const before=await evaluate('__minecraftInput.snapshot()');
  await pads([{axes:[1,0,.6,.4]}]);await delay(300);await pads();
  const after=await evaluate('__minecraftInput.snapshot()');
  check(after.position.some((v,i)=>i!==1&&Math.abs(v-before.position[i])>.1),'left stick moves the first person camera');
  check(Math.abs(after.rotation[0]-before.rotation[0])>.1&&Math.abs(after.rotation[1]-before.rotation[1])>.1,'right stick controls pitch and yaw without pointer lock');
  await press(4);check(await evaluate('__minecraftInput.snapshot().selectedPalette')===1,'LB selects a building material');
  await press(8);check(await evaluate('!document.querySelector("#start-overlay").classList.contains("hidden")'),'Back exposes the menu in pointer mode');
});
