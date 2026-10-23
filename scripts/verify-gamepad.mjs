import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
  dirtyWorkingTree: execFileSync('git', ['-c', 'safe.directory='+root.replaceAll('\\','/'), 'status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim().length > 0,
  fingerprints: Object.fromEntries(['games/gamepad/runtime.ts','games/gamepad/sampler.ts','games/gamepad/profiles.ts','games/gamepad/lobby.ts','site/app.js','site/index.html','site/styles.css','site/catalog/details.js','site/state/library.js','site/ui/library.js','site/ui/player.css','games/tank-battle/game/TankBattle.ts','games/tank-battle/ui/TankBattleHud.ts','games/tank-battle/rendering/render.ts','games/tank-battle/index.html','games/session/GameEngine.ts','games/session/SessionPause.ts','games/session/ReturnDialog.ts','games/session/GameReturnController.ts','games/session/audio.ts','games/triangle-calendar-puzzle/game/TriangleCalendarGame.ts','games/triangle-calendar-puzzle/game/model.ts','games/triangle-calendar-puzzle/ui/CalendarHud.ts','games/triangle-calendar-puzzle/rendering/CalendarBoard.ts','games/triangle-calendar-puzzle/save/saveState.ts'].map(file => [file,createHash('sha256').update(readFileSync(resolve(root,file))).digest('hex')])),
};

async function run(name, fixture, query, exercise) {
  if(process.env.GAMEPAD_CASE && !process.env.GAMEPAD_CASE.split(',').includes(name))return;
  const checks = [];
  const gameId = /^games\/([^/]+)\/index\.html$/.exec(fixture)?.[1];
  const entry = gameId ? `games/${gameId}/${['mugen','gravity-maze'].includes(gameId)?'dist/':''}bundle.js` : null;
  const inputs = Object.fromEntries([fixture,entry].filter(file=>file&&existsSync(resolve(root,file))).map(file=>[file,createHash('sha256').update(readFileSync(resolve(root,file))).digest('hex')]));
  const result = await runChromeWebGpuFixture({root, fixture, query, timeoutMs:90000, disableDx12InfoCollection:true,
    mounts:[{prefix:'/site/games',directory:resolve(root,'games')}],
    visualCapture:{viewportWidth:1040,viewportHeight:600},
    interact:async cdp=>{
      cdp.on('Runtime.consoleAPICalled', event => {
        if(event.type!=='error')return;
        for(const arg of event.args??[])if(arg.objectId)void cdp.call('Runtime.callFunctionOn',{objectId:arg.objectId,functionDeclaration:'function(){return this.message}',returnByValue:true})
          .then(result=>{const message=result.result?.result?.value;if(message)console.error('Browser error detail: '+message);}).catch(()=>{});
      });
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
  writeFileSync(resolve(output,name+'.json'),JSON.stringify({...result,provenance,fixture:{path:fixture,query,inputs}},null,2));
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
  await pads();await press(11);await press(0);
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
  await pads([{buttons:[11,4]}]);await pads();
  await until('document.querySelector("#game-frame").dataset.gameId==="tank-battle"','previous game');
  check(true,'R3+LB switches games');
  await until('document.querySelector("#game-frame").contentDocument.body.dataset.gamepadActive === "true"','new game controller boot');
  await press(8);await until('document.querySelector("#game-frame").contentDocument.body.dataset.gameReturnOpen==="true"','return confirmation');
  check(await evaluate('document.querySelector("#game-dialog").open'),'Back does not leave without confirmation');
  await press(15);await press(0);await until('!document.querySelector("#game-dialog").open','return home');
  check(true,'confirmed Back closes iframe and restores lobby');
  check(await evaluate('document.querySelector("#game-frame").getAttribute("src")')==='about:blank','closed game is unloaded');
});

await run('lobby-os','site/index.html',{},async({evaluate,until,pads,press,check,cdp})=>{
  await cdp.call('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await until('document.querySelectorAll(".card-visual").length===28','OS catalog');await pads();
  await press(15);
  check(await evaluate('document.querySelector("#spotlight-title").textContent')==='铁甲前线','controller selection updates the featured game');
  await press(2);
  check(await evaluate('document.querySelector("#favorite-count").textContent')==='1','X favorites the current game');
  await press(3);
  check(await evaluate('!document.querySelector("#empty-state").hidden'),'Y opens the real empty recent list');
  await press(3);
  check(await evaluate('document.querySelectorAll(".card-visual").length')===1,'Y leaves the empty view for favorites');
  await press(2);
  check(await evaluate('!document.querySelector("#empty-state").hidden'),'removing the last favorite shows the empty state');
  await press(5);
  check(await evaluate('document.querySelector(".filters .active").dataset.filter')==='puzzle','category navigation works with zero cards');
  await press(3);
  await evaluate('document.querySelector("#game-search").focus()');
  await cdp.call('Input.insertText',{text:'铁甲'});await delay(250);
  check(await evaluate('document.activeElement.id==="game-search" && document.querySelectorAll(".card-visual").length===1'),'idle gamepad does not steal search input focus');
  await cdp.call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await cdp.call('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  check(await evaluate('document.querySelectorAll(".card-visual").length')===28,'Escape clears search and restores card focus');
  await cdp.call('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});
  check(await evaluate('document.querySelector("#spotlight-title").textContent')==='铁甲前线','keyboard arrows update the selected game');
  await evaluate('[...document.querySelectorAll(".card-visual")].find(button=>button.dataset.gameId==="2048").focus()');
  await press(2);await press(0);
  await until('document.querySelector("#game-frame").contentDocument?.readyState==="complete" && document.querySelector("#game-frame").dataset.gameId==="2048"','game document loaded');
  await evaluate('document.querySelector("#game-frame").contentWindow.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}))');
  await until('!document.querySelector("#game-dialog").open','Escape from embedded game');
  check(await evaluate('document.activeElement.dataset.gameId')==='2048','closing the game restores the selected card focus');
  await evaluate('document.querySelector("[data-view=recent]").click()');
  check(await evaluate('document.querySelectorAll(".card-visual").length===1 && document.querySelector(".card-visual").dataset.gameId==="2048"'),'recent list contains only actually launched games');
  await cdp.call('Page.reload');
  await until('document.querySelectorAll(".card-visual").length===28','reloaded catalog');
  check(await evaluate('document.querySelector("#favorite-count").textContent')==='1','favorites persist after reload');
  await evaluate('document.querySelector("[data-view=recent]").click()');
  check(await evaluate('document.querySelector(".card-visual").dataset.gameId')==='2048','launch history persists after reload');
  await evaluate('document.querySelector("[data-view=all]").click();document.querySelector(".card-visual").focus()');
  check(await evaluate('document.documentElement.scrollWidth<=innerWidth && document.documentElement.scrollHeight<=innerHeight'),'desktop shell fits viewport');
});

await run('lobby-mobile','site/index.html',{},async({evaluate,until,check,cdp})=>{
  await until('document.querySelectorAll(".card-visual").length===28','mobile catalog');
  for(const [width,height] of [[390,844],[844,390],[320,568]]){
    await cdp.call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});await delay(200);
    check(await evaluate('document.documentElement.scrollWidth<=innerWidth && document.documentElement.scrollHeight<=innerHeight'),`${width}x${height} shell fits viewport`);
    check(await evaluate('document.querySelector("#game-grid").clientHeight>60'),`${width}x${height} game shelf remains usable`);
    check(await evaluate('(()=>{const a=document.querySelector("#spotlight-play").getBoundingClientRect(),b=document.querySelector("#spotlight").getBoundingClientRect();return a.bottom<=b.bottom&&a.right<=b.right})()'),`${width}x${height} launch action stays inside preview`);
    await evaluate('document.querySelector("[data-view=favorites]").click()');
    check(await evaluate('!document.querySelector("#empty-state").hidden'),`${width}x${height} touch navigation shows empty favorites`);
    await evaluate('document.querySelector("#empty-reset").click()');
    const shot = await cdp.call('Page.captureScreenshot', { format: 'png' });
    writeFileSync(resolve(output, `lobby-${width}x${height}.png`), Buffer.from(shot.result.data, 'base64'));
  }
  await cdp.call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
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

await run('tank-menu','games/tank-battle/index.html',{verify:1},async({evaluate,until,pads,press,check,cdp})=>{
  await cdp.call('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
  await until('!!window.__tankBattle','desktop tank menu');await pads();
  check(await evaluate('document.querySelectorAll("canvas").length')===1,'battlefield and HUD share one canvas');
  check(await evaluate('__tankBattle.hud().battlefieldRenderer')==='engine-gui','battlefield uses Engine GUI');
  check(await evaluate('__tankBattle.hud().selectedMenu')==='solo','new game defaults to 1P');
  await pads([{axes:[0,1,0,0]}]);await pads();
  check(await evaluate('__tankBattle.hud().selectedMenu')==='duo','left stick selects 2P');
  await press(12);check(await evaluate('__tankBattle.hud().selectedMenu')==='solo','D-pad up selects 1P');
  await press(13);check(await evaluate('__tankBattle.hud().selectedMenu')==='duo','D-pad down selects 2P');
  await pads([{buttons:[0]}]);await delay(600);
  check(await evaluate('__tankBattle.snapshot().mode===2 && !__tankBattle.hud().menuVisible'),'A confirms 2P');
  check(await evaluate('__tankBattle.snapshot().tick>20 && !__tankBattle.snapshot().bullets.some(b=>b.player)'),'holding confirm neither restarts nor fires');
  await pads();await press(9);
  check(await evaluate('__tankBattle.snapshot().phase')==='paused','Start opens pause menu');
  check(await evaluate('__tankBattle.hud().selectedMenu')==='resume','pause selects Continue');
  const paused=await evaluate('__tankBattle.snapshot().tick');
  await pads([]);await delay(150);check(await evaluate('__tankBattle.snapshot().tick')===paused,'disconnect keeps paused game frozen');
  await pads();await press(0);check(await evaluate('__tankBattle.snapshot().phase')==='playing','A resumes selected Continue');
  await press(9);await press(13);
  check(await evaluate('__tankBattle.hud().selectedMenu')==='solo','pause menu can choose new 1P');
  await press(0);check(await evaluate('__tankBattle.snapshot().mode')===1,'A starts selected 1P');
  await press(9);await press(12);
  check(await evaluate('__tankBattle.hud().selectedMenu')==='duo','selection wraps among visible menu buttons');
  const shot=await cdp.call('Page.captureScreenshot',{format:'png'});
  writeFileSync(resolve(output,'tank-menu-selected.png'),Buffer.from(shot.result.data,'base64'));
  await press(9);check(await evaluate('__tankBattle.snapshot().phase')==='playing','Start resumes without activating selected new game');
  check(await evaluate('__tankBattle.snapshot().mode')===1,'Start preserves current mode');
});

await run('tank-return','games/tank-battle/index.html',{verify:1},async({evaluate,until,pads,press,check,cdp})=>{
  await until('!!window.__tankBattle','tank ready');await pads();await press(0);
  await until('__tankBattle.snapshot().tick>5','combat started');
  await press(8);const tick=await evaluate('__tankBattle.snapshot().tick');await delay(500);
  check(await evaluate('__tankBattle.snapshot().tick')===tick,'Back freezes actual combat ticks');
  await press(9);check(await evaluate('__gameReturn.snapshot().active'),'Start cannot bypass return confirmation');
  await cdp.call('Input.dispatchKeyEvent',{type:'keyDown',key:'j',code:'KeyJ'});
  await cdp.call('Input.dispatchKeyEvent',{type:'keyUp',key:'j',code:'KeyJ'});
  check(await evaluate('!__gameReturn.snapshot().active'),'keyboard confirm on default action resumes');
  await until('__tankBattle.snapshot().tick>'+tick,'combat resumes');
  await press(9);check(await evaluate('__tankBattle.snapshot().phase')==='paused','original pause state set');
  await press(8);await press(1);check(await evaluate('__tankBattle.snapshot().phase')==='paused','cancel preserves an already paused game');
  const pausedTick=await evaluate('__tankBattle.snapshot().tick');await delay(250);check(await evaluate('__tankBattle.snapshot().tick')===pausedTick,'original pause still freezes gameplay');
  await pads([{},{}]);await pads([{}, {buttons:[8]}]);await pads([{},{}]);
  check(await evaluate('__gameReturn.snapshot().active'),'second controller Back also opens the shared window');
  await pads([{}, {buttons:[1]}]);await pads([{},{}]);
  check(await evaluate('!__gameReturn.snapshot().active'),'second controller can cancel');
  await press(8);
  const click=await evaluate('(()=>{const b=__gameReturn.snapshot().buttons.cancel,r=document.querySelector("canvas").getBoundingClientRect();return {x:r.left+b.x+b.width/2,y:r.top+b.y+b.height/2}})()');
  await evaluate('window.__returnClicks=0;document.addEventListener("click",()=>__returnClicks++)');
  await cdp.call('Input.dispatchMouseEvent',{type:'mousePressed',...click,button:'left',buttons:1,clickCount:1});
  await cdp.call('Input.dispatchMouseEvent',{type:'mouseReleased',...click,button:'left',buttons:0,clickCount:1});await delay(150);
  check(await evaluate('!__gameReturn.snapshot().active && __returnClicks===0'),'mouse Continue does not click through into the game');
  check(await evaluate('(()=>{let received=false;document.addEventListener("wheel",()=>received=true,{once:true});document.dispatchEvent(new WheelEvent("wheel",{bubbles:true,cancelable:true,deltaY:1}));return received})()'),'Continue restores wheel input without requiring another click');
  await cdp.call('Input.dispatchKeyEvent',{type:'keyDown',key:'w',code:'KeyW'});await press(8);await press(1);
  const downs=await evaluate('__keys.filter(k=>k.type==="keydown"&&k.code==="KeyW").length');
  await cdp.call('Input.dispatchKeyEvent',{type:'keyDown',key:'w',code:'KeyW',autoRepeat:true});
  check(await evaluate('__keys.filter(k=>k.type==="keydown"&&k.code==="KeyW").length')===downs,'held keyboard input waits for release after confirmation');
  await cdp.call('Input.dispatchKeyEvent',{type:'keyUp',key:'w',code:'KeyW'});
});

await run('tank-coop','games/tank-battle/index.html',{verify:1},async({evaluate,until,pads,press,check,cdp})=>{
  await cdp.call('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
  await until('!!window.__tankBattle','desktop tank scene');await pads();await press(11);
  for(let i=0;i<30;i++){
    const delta=await evaluate(`(()=>{const b=__tankBattle.hud().buttons.duo,r=document.querySelector('#gui').getBoundingClientRect(),c=document.querySelector('[data-gamepad-cursor]');return [b.x+b.width/2-parseFloat(c.style.left),b.y+b.height/2-parseFloat(c.style.top)]})()`);
    if(delta.every(d=>Math.abs(d)<8))break;
    await pads([{axes:[...delta.map(d=>Math.abs(d)<8?0:Math.sign(d)*(.2+.8*Math.min(1,Math.abs(d)/105))),0,0]}]);
  }
  await pads();await press(0);await press(11);await pads([{},{}]);
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
  await press(11);check(await evaluate('!document.querySelector("#start-overlay").classList.contains("hidden")'),'R3 exposes the menu in pointer mode');
});

await run('piano-return','games/piano/index.html',{verify:1},async({evaluate,until,pads,press,check,cdp})=>{
  await until('!!document.querySelector("#auto-play") && !document.querySelector("#auto-play").disabled','MIDI catalog ready');await pads();
  const button=await evaluate('(()=>{const r=document.querySelector("#auto-play").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()');
  await cdp.call('Input.dispatchMouseEvent',{type:'mousePressed',...button,button:'left',buttons:1,clickCount:1});
  await cdp.call('Input.dispatchMouseEvent',{type:'mouseReleased',...button,button:'left',buttons:0,clickCount:1});
  await until('document.querySelector("#playback-progress").value>0.001','MIDI starts with real user activation');
  const before=await evaluate('document.querySelector("#playback-progress").value');await delay(400);
  const speed=await evaluate('document.querySelector("#playback-progress").value')-before;
  await press(8);const paused=await evaluate('document.querySelector("#playback-progress").value');await delay(1200);
  check(await evaluate('document.querySelector("#playback-progress").value')===paused,'Back freezes the independent MIDI playback loop');
  await press(1);await delay(200);const resumed=await evaluate('document.querySelector("#playback-progress").value');
  check(resumed>paused,'cancel resumes MIDI playback');
  check(resumed-paused<speed*2.2,'resuming excludes time spent in return confirmation');
});

await run('triangle-calendar','games/triangle-calendar-puzzle/index.html',{verify:1},async({evaluate,until,pads,press,check,cdp})=>{
  await until('!!window.__triangleCalendar && __gameReturn.snapshot().gameFrames>4','Engine calendar ready');await pads();
  check(await evaluate('document.querySelectorAll("canvas").length===1 && !document.querySelector("svg")'),'calendar uses a single Engine canvas');
  const initial=await evaluate('__triangleCalendar.snapshot()');
  check(initial.pieces.length===11&&initial.targets.length===3,'calendar keeps 11 pieces and three date targets');
  const mouse=async(type,point,button='left')=>{
    const r=await evaluate('(()=>{const r=document.querySelector("canvas").getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()');
    await cdp.call('Input.dispatchMouseEvent',{type,x:r.x+point.x*r.width/1200,y:r.y+point.y*r.height/760,button,buttons:type==='mouseReleased'?0:1,clickCount:type==='mouseMoved'?0:1});await delay(100);
  };
  const first=initial.pieces[0];await mouse('mousePressed',first.center);await mouse('mouseReleased',first.center);
  check(await evaluate('__triangleCalendar.snapshot().selected')===first.id,'triangle hit testing selects a piece');
  await press(2);check(await evaluate('__triangleCalendar.snapshot().pieces[0].rotation')===(first.rotation+1)%6,'controller X rotates sixty degrees');
  await press(3);check(await evaluate('__triangleCalendar.snapshot().pieces[0].flipped')!==first.flipped,'controller Y flips piece');
  const beforeDrag=await evaluate('__triangleCalendar.snapshot().pieces[0]');
  await mouse('mousePressed',beforeDrag.center);await mouse('mouseMoved',{x:beforeDrag.pivotX+25,y:beforeDrag.pivotY+35});await mouse('mouseReleased',{x:beforeDrag.pivotX+25,y:beforeDrag.pivotY+35});
  const moved=await evaluate('__triangleCalendar.snapshot().pieces[0]');
  check(Math.abs(moved.pivotX-beforeDrag.pivotX-25)<1&&Math.abs(moved.pivotY-beforeDrag.pivotY-35)<1,'pointer drag updates Engine mesh position');
  await mouse('mousePressed',moved.center);await mouse('mouseMoved',{x:moved.pivotX+30,y:moved.pivotY+20});await press(8);
  check(await evaluate('!__triangleCalendar.snapshot().dragging && __gameReturn.snapshot().active'),'Back cancels in-progress drag and opens confirmation');
  check(await evaluate('__triangleCalendar.snapshot().pieces[0].pivotX')===moved.pivotX,'interrupted drag restores previous placement');
  await mouse('mouseReleased',moved.center);await press(1);
  const saved=await evaluate('__triangleCalendar.snapshot().pieces[0]');await delay(600);await cdp.call('Page.reload');
  await until('!!window.__triangleCalendar && __gameReturn.snapshot().gameFrames>4','calendar restores after reload');
  check(JSON.stringify(await evaluate('__triangleCalendar.snapshot().pieces[0]'))===JSON.stringify(saved),'reload restores orientation, position and occupancy');
  await mouse('mousePressed',{x:735,y:86});await mouse('mouseReleased',{x:735,y:86});
  check(await evaluate('__triangleCalendar.snapshot().pieces.every(p=>p.rotation===0&&!p.flipped&&!p.placed)'),'Engine GUI reset clears the pieces');
  await mouse('mousePressed',{x:735,y:42});await mouse('mouseReleased',{x:735,y:42});
  const canvasRect=await evaluate('(()=>{const r=document.querySelector("canvas").getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()');
  await cdp.call('Input.dispatchMouseEvent',{type:'mouseWheel',x:canvasRect.x+735*canvasRect.width/1200,y:canvasRect.y+90*canvasRect.height/760,deltaX:0,deltaY:-1000});await delay(200);
  const shot=await cdp.call('Page.captureScreenshot',{format:'png'});writeFileSync(resolve(output,'triangle-calendar-gui.png'),Buffer.from(shot.result.data,'base64'));
  await mouse('mousePressed',{x:735,y:79});await mouse('mouseReleased',{x:735,y:79});
  check(await evaluate('__triangleCalendar.snapshot().month')===1,'Engine GUI date popup selects January');
  check(await evaluate('__triangleCalendar.snapshot().targets.includes("month:1")'),'date control updates board target');
});

// The same Back/confirm/cancel contract is exercised against every manifest game.
const returnGames = JSON.parse(readFileSync(resolve(root,'games/manifest.json'),'utf8')).entries;
for (const game of returnGames) await run('return-'+game.id,'games/'+game.id+'/index.html',{gamepadVerify:1},async({evaluate,until,pads,press,check,cdp})=>{
  await until('window.__gameReturn?.snapshot().ready','session engine ready');
  await delay(1000);await pads();
  const canvasCount=await evaluate('document.querySelectorAll("canvas").length');
  await press(8);await until('__gameReturn.snapshot().active','Back opens confirmation');
  check(await evaluate('__gameReturn.snapshot().paused'),'Back pauses the session');
  check(await evaluate('__gameReturn.snapshot().selected')==='cancel','default action continues game');
  check(await evaluate('__gameReturn.snapshot().canvasCount')===canvasCount,'confirmation reuses existing canvas');
  const frames=await evaluate('__gameReturn.snapshot().gameFrames');await delay(500);
  check(await evaluate('__gameReturn.snapshot().gameFrames')===frames,'all game Engine update loops remain frozen');
  await pads([]);await delay(200);check(await evaluate('__gameReturn.snapshot().active'),'disconnect leaves confirmation paused');
  await pads();await press(15);check(await evaluate('__gameReturn.snapshot().selected')==='confirm','D-pad selects return home');
  const dialog=await evaluate('__gameReturn.snapshot()');
  writeFileSync(resolve(output,'return-'+game.id+'-dialog.json'),JSON.stringify(dialog,null,2));
  check(dialog.buttons.confirm.width>0 && dialog.buttons.confirm.height>0,'Engine lays out visible dialog controls');
  const shot=await cdp.call('Page.captureScreenshot',{format:'png'});
  writeFileSync(resolve(output,'return-'+game.id+'-dialog.png'),Buffer.from(shot.result.data,'base64'));
  await press(1);check(await evaluate('!__gameReturn.snapshot().active && !__gameReturn.snapshot().paused'),'B cancels confirmation');
  await until('__gameReturn.snapshot().gameFrames>'+frames,'game frame loop resumes');check(true,'cancel resumes previous update loop');
  await press(8);await press(0);check(await evaluate('!__gameReturn.snapshot().active'),'A on default choice continues');
  await press(8);await press(15);
  // Do not await a frame promise in the document that confirmation is about to unload.
  await evaluate('window.__pads[0].buttons[0]={value:1,pressed:true,touched:false}');
  await until('!location.pathname.includes("/games/") && !!document.querySelector("#game-grid")','confirmed return loads homepage');
  check(true,'confirmed return reaches actual standalone homepage');
});
