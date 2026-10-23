import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { runChromeWebGpuFixture } from '../../Engine/scripts/webgpu-gate/chrome-runner.mjs';

const root = resolve(import.meta.dirname, '..'), output = resolve(root, 'artifacts/gamepad');
const catalogCount = JSON.parse(readFileSync(resolve(root, 'games/manifest.json'), 'utf8')).entries.length;
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
  const sourceInputs = gameId ? readdirSync(resolve(root, 'games', gameId), { recursive: true }).filter(file => /\.(ts|html|css|svg)$/.test(file)).map(file => `games/${gameId}/${file}`) : [];
  sourceInputs.push('games/shared/input/pointerCapture.ts', 'games/shared/ui/GameHud.ts', 'games/shared/ui/ProjectedLabel.ts', 'games/shared/rendering/fitPerspectiveCamera.ts', 'games/gamepad/ui/ControllerOverlay.ts');
  sourceInputs.push('games/manifest.json');
  sourceInputs.push('games/gamepad/connections.ts', 'games/gamepad/connectionMonitor.ts', 'games/gamepad/ui/ConnectionNotifications.ts');
  if (gameId === 'jigsaw-puzzle') sourceInputs.push('games/test/fixtures/jigsaw/portrait.svg', 'games/test/fixtures/jigsaw/broken.svg');
  if (gameId === 'fruit-ninja') sourceInputs.push('games/fruit-ninja/assets/fruits.png', 'games/fruit-ninja/assets/fruits-extra.png', 'games/fruit-ninja/assets/items.png', 'games/fruit-ninja/assets/provenance.json', 'games/fruit-ninja/assets/fruits-extra.provenance.json');
  if (fixture === 'site/index.html') sourceInputs.push('site/gamepad.js');
  const inputs = Object.fromEntries([fixture,entry,...sourceInputs].filter(file=>file&&existsSync(resolve(root,file))).map(file=>[file,createHash('sha256').update(readFileSync(resolve(root,file))).digest('hex')]));
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
  await until(`document.querySelectorAll(".card-visual").length===${catalogCount}`,'manifest catalog');await pads();
  const first=await evaluate('document.querySelector(".gamepad-selected").dataset.gameId');
  await press(15);check(await evaluate('document.querySelector(".gamepad-selected").dataset.gameId')!==first,'D-pad selects another game');
  await press(5);check(await evaluate('document.querySelector(".filters .active").dataset.filter')==='puzzle','RB changes category');
  await press(4);
  check(await evaluate('document.querySelector(".filters .active").dataset.filter')==='all','LB returns to all games');
  for(let i=0;i<catalogCount&&await evaluate('document.querySelector(".gamepad-selected").dataset.gameId')!=='2048';i++) await press(15);
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
  await until(`document.querySelectorAll(".card-visual").length===${catalogCount}`,'OS catalog');await pads();
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
  check(await evaluate('document.querySelectorAll(".card-visual").length')===catalogCount,'Escape clears search and restores card focus');
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
  await until(`document.querySelectorAll(".card-visual").length===${catalogCount}`,'reloaded catalog');
  check(await evaluate('document.querySelector("#favorite-count").textContent')==='1','favorites persist after reload');
  await evaluate('document.querySelector("[data-view=recent]").click()');
  check(await evaluate('document.querySelector(".card-visual").dataset.gameId')==='2048','launch history persists after reload');
  await evaluate('document.querySelector("[data-view=all]").click();document.querySelector(".card-visual").focus()');
  check(await evaluate('document.documentElement.scrollWidth<=innerWidth && document.documentElement.scrollHeight<=innerHeight'),'desktop shell fits viewport');
});

await run('lobby-mobile','site/index.html',{},async({evaluate,until,check,cdp})=>{
  await until(`document.querySelectorAll(".card-visual").length===${catalogCount}`,'mobile catalog');
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

await run('sudoku-layout','games/sudoku/index.html',{gamepadVerify:1},async({evaluate,until,check,cdp})=>{
  await until('window.__gameReturn?.snapshot().gameFrames>30','Sudoku initialized');
  for (const [width,height,dpr] of [[1920,1080,1],[2560,1080,1],[1280,720,1],[390,844,2],[844,390,2],[1040,600,2]]) {
    await cdp.call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:dpr,mobile:false});
    await delay(700);
    const rect=await evaluate('(()=>{const c=document.querySelector("canvas"),r=c.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,pixels:[c.width,c.height],overflow:document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight}})()');
    const label=width+'x'+height+'@'+dpr;
    check(Math.abs(rect.width/rect.height-1.5)<.002,label+' keeps square board cells through uniform scaling');
    check(rect.x>=-.5&&rect.y>=-.5&&rect.x+rect.width<=width+.5&&rect.y+rect.height<=height+.5&&!rect.overflow,label+' fits the viewport without clipping');
    check(Math.abs(rect.x-(width-rect.width)/2)<1&&Math.abs(rect.y-(height-rect.height)/2)<1,label+' centers the scene');
    check(Math.abs(rect.pixels[0]/rect.pixels[1]-1.5)<.005,label+' resizes the GPU target consistently');
    const point={x:rect.x+450/900*rect.width,y:rect.y+298.5/600*rect.height};
    await cdp.call('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',buttons:1,clickCount:1});
    await cdp.call('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',buttons:0,clickCount:1});
    await delay(350);
    const shot=await cdp.call('Page.captureScreenshot',{format:'png'});
    writeFileSync(resolve(output,'sudoku-layout-'+label+'.png'),Buffer.from(shot.result.data,'base64'));
  }
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
  await press(11);check(await evaluate('__gameHud.nodes.some(n=>n.type==="GuiButton"&&n.text==="开始游玩"&&n.visible)'),'R3 exposes the menu in pointer mode');
});

await run('piano-return','games/piano/index.html',{verify:1},async({evaluate,until,pads,press,check,cdp})=>{
  await until('window.__gameHud?.nodes.some(n=>n.text==="Auto play"&&!n.disabled)','MIDI catalog ready');await pads();
  const button=await evaluate('(()=>{const r=__gameHud.nodes.find(n=>n.text==="Auto play").rect,c=document.querySelector("canvas").getBoundingClientRect();return {x:c.x+(r.x+r.width/2)*c.width/__gameHud.width,y:c.y+(r.y+r.height/2)*c.height/__gameHud.height}})()');
  await cdp.call('Input.dispatchMouseEvent',{type:'mousePressed',...button,button:'left',buttons:1,clickCount:1});
  await cdp.call('Input.dispatchMouseEvent',{type:'mouseReleased',...button,button:'left',buttons:0,clickCount:1});
  await until('__gameHud.nodes.find(n=>n.type==="GuiProgress").value>0.001','MIDI starts with real user activation');
  const before=await evaluate('__gameHud.nodes.find(n=>n.type==="GuiProgress").value');await delay(400);
  const speed=await evaluate('__gameHud.nodes.find(n=>n.type==="GuiProgress").value')-before;
  await press(8);const paused=await evaluate('__gameHud.nodes.find(n=>n.type==="GuiProgress").value');await delay(1200);
  check(await evaluate('__gameHud.nodes.find(n=>n.type==="GuiProgress").value')===paused,'Back freezes the independent MIDI playback loop');
  await press(1);await delay(200);const resumed=await evaluate('__gameHud.nodes.find(n=>n.type==="GuiProgress").value');
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
  await until('window.__gameReturn?.snapshot().ready && __gameReturn.snapshot().gameFrames>3','session renderer ready');
  await delay(1000);
  for (const [width,height] of [[1440,900],[390,844],[844,390]]) {
    await cdp.call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await delay(400);
    const layout=await evaluate(`(()=>({width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,canvases:[...document.querySelectorAll('canvas')].map(c=>{const r=c.getBoundingClientRect();return {width:r.width,height:r.height,x:r.x,y:r.y,right:r.right,bottom:r.bottom,pixelWidth:c.width,pixelHeight:c.height}}).filter(r=>r.width>0&&r.height>0)}))()`);
    writeFileSync(resolve(output,`return-${game.id}-${width}-layout.json`),JSON.stringify(layout,null,2));
    check(layout.width<=width+1&&layout.height<=height+1,game.id+' page fits '+width);
    check(layout.canvases.every(r=>r.x>=-1&&r.y>=-1&&r.right<=width+1&&r.bottom<=height+1),game.id+' visible canvases fit viewport '+width);
    check(layout.canvases.every(r=>Math.abs(r.width/r.height-r.pixelWidth/r.pixelHeight)<.025),game.id+' canvas aspect is preserved '+width);
  }
  await cdp.call('Emulation.setDeviceMetricsOverride',{width:1040,height:600,deviceScaleFactor:1,mobile:false});await delay(300);await pads();
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


// Verify actual GUI layout and GPU canvas sizes at desktop, portrait and landscape sizes.
const migratedHudGames = ['tetris','pong','match-3','minesweeper','icosahedron-minesweeper','piano','wfc-map','sokoban-3d','gravity-maze','minecraft-lite','pacman','pinball','pad-simulator'];
for (const id of migratedHudGames) await run('gui-'+id, `games/${id}/index.html`, {gamepadVerify:1}, async({evaluate,until,check,cdp,pads}) => {
  await until('window.__gameHud?.width>0 && __gameReturn.snapshot().gameFrames>3', 'engine HUD '+id);
  for (const [width,height,dpr] of [[1440,900,1],[390,844,2],[844,390,2]]) {
    await cdp.call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:dpr,mobile:false});
    await delay(700);
    const layout = await evaluate(`(()=>{const c=document.querySelector('canvas'),r=c.getBoundingClientRect();return {hud:__gameHud,canvas:{x:r.x,y:r.y,width:r.width,height:r.height,backingWidth:c.width,backingHeight:c.height},scroll:{width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight},domControls:[...document.querySelectorAll('button,select,progress,dialog,input:not([type=file])')].filter(n=>n.getBoundingClientRect().width>0).length}})()`);
    check(layout.scroll.width<=width+1 && layout.scroll.height<=height+1, id+' fits '+width+'x'+height);
    check(Math.abs(layout.canvas.backingWidth/layout.canvas.backingHeight-layout.canvas.width/layout.canvas.height)<.015, id+' GPU canvas matches display aspect '+width);
    check(layout.domControls===0,id+' uses no DOM gameplay controls '+width);
    const buttons=layout.hud.nodes.filter(n=>n.type==='GuiButton'&&n.visible);
    check(buttons.every(n=>n.rect.x>=-1&&n.rect.y>=-1&&n.rect.x+n.rect.width<=layout.hud.width+1&&n.rect.y+n.rect.height<=layout.hud.height+1),id+' GUI buttons stay inside the canvas '+width);
    const shot=await cdp.call('Page.captureScreenshot',{format:'png'});writeFileSync(resolve(output,`gui-${id}-${width}.png`),Buffer.from(shot.result.data,'base64'));
    writeFileSync(resolve(output,`gui-${id}-${width}-layout.json`),JSON.stringify(layout,null,2));
  }
  await pads();
  check(await evaluate('!document.querySelector("[data-gamepad-hint],[data-gamepad-cursor]")'), id+' controller feedback creates no DOM overlay');
});

await run('gui-mugen', 'games/mugen/index.html', {gamepadVerify:1}, async({evaluate,until,check,cdp}) => {
  await until('window.__mugenGui?.nodes.some(n=>n.text==="设置"&&!n.disabled)', 'MUGEN menu');
  const click = async text => {
    await until(`__mugenGui.nodes.some(n=>n.type==='GuiButton'&&n.text===${JSON.stringify(text)}&&!n.disabled)`, 'GUI '+text);
    const point=await evaluate(`(()=>{const g=__mugenGui,n=g.nodes.find(n=>n.type==='GuiButton'&&n.text===${JSON.stringify(text)}),c=document.querySelector('#flow-canvas').getBoundingClientRect();return {x:c.x+(n.rect.x+n.rect.width/2)*c.width/g.width,y:c.y+(n.rect.y+n.rect.height/2)*c.height/g.height}})()`);
    await cdp.call('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',buttons:1,clickCount:1});
    await cdp.call('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',buttons:0,clickCount:1});await delay(250);
  };
  await click('设置'); await click('详细按键设置');
  check(await evaluate('__mugenGui.keySettings'),'Engine GUI opens key bindings');
  await click('W');
  await cdp.call('Input.dispatchKeyEvent',{type:'keyDown',key:'q',code:'KeyQ',windowsVirtualKeyCode:81});
  await cdp.call('Input.dispatchKeyEvent',{type:'keyUp',key:'q',code:'KeyQ',windowsVirtualKeyCode:81});await delay(250);
  await click('保存并应用');
  check(await evaluate('document.body.dataset.p1KeyBindings.split(",")[0]==="KeyQ" && !__mugenGui.keySettings'),'GUI saves a real key binding');
  await click('详细按键设置');await click('恢复默认');await click('取消');
  check(await evaluate('document.body.dataset.p1KeyBindings.split(",")[0]==="KeyQ"'),'cancel discards draft bindings');
  await click('恢复默认按键');
  check(await evaluate('document.body.dataset.p1KeyBindings.split(",")[0]==="KeyW"'),'restore defaults applies through GUI');
  for (const [width,height] of [[1440,900],[390,844],[844,390]]) {
    await cdp.call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await delay(500);
    check(await evaluate('!document.querySelector("button,select,dialog")'),'MUGEN has no duplicate DOM controls '+width);
    check(await evaluate('__mugenGui.nodes.filter(n=>n.type==="GuiButton").every(n=>n.rect.x>=0&&n.rect.y>=0&&n.rect.x+n.rect.width<=__mugenGui.width+1&&n.rect.y+n.rect.height<=__mugenGui.height+1)'),'MUGEN settings fit '+width);
    const shot=await cdp.call('Page.captureScreenshot',{format:'png'});writeFileSync(resolve(output,`gui-mugen-${width}.png`),Buffer.from(shot.result.data,'base64'));
  }
});

await run('pinball-physics', 'games/pinball/index.html', {verify:1}, async({evaluate,until,check}) => {
  await until('document.querySelector("#result")?.dataset.status==="passed"', 'pinball physics verification');
  const result=await evaluate('JSON.parse(document.querySelector("#result").textContent)');
  check(result.checks.length>15, 'existing pinball physics and lifecycle cases pass');
});
await run('pinball-touch', 'games/pinball/index.html', {gamepadVerify:1}, async({evaluate,until,check,cdp}) => {
  await until('window.__pinball?.snapshot().ready&&window.__gameHud?.width>0','pinball GUI ready');
  const point=async text=>evaluate(`(()=>{const n=__gameHud.nodes.find(n=>n.type==='GuiButton'&&n.text===${JSON.stringify(text)}),c=document.querySelector('canvas').getBoundingClientRect();return {x:c.x+(n.rect.x+n.rect.width/2)*c.width/__gameHud.width,y:c.y+(n.rect.y+n.rect.height/2)*c.height/__gameHud.height}})()`);
  const mouse=async(type,p)=>{await cdp.call('Input.dispatchMouseEvent',{type,...p,button:'left',buttons:type==='mousePressed'?1:0,clickCount:1});await delay(100);};
  const charge=await point('↓ 蓄力发球');await mouse('mousePressed',charge);await delay(400);
  check(await evaluate('__pinball.snapshot().charge>0.1'),'holding the Engine button charges the ball');
  await mouse('mouseReleased',charge);check(await evaluate('__pinball.snapshot().phase==="playing"'),'releasing the Engine button launches');
  const pause=await point('Ⅱ 暂停');await mouse('mousePressed',pause);await mouse('mouseReleased',pause);
  check(await evaluate('__pinball.snapshot().paused'),'Engine pause button pauses physics');
  const before=await evaluate('__pinball.snapshot().time');await delay(250);check(await evaluate('__pinball.snapshot().time')===before,'paused physics time remains fixed');
  const restart=await point('重开');await mouse('mousePressed',restart);await mouse('mouseReleased',restart);
  check(await evaluate('__pinball.snapshot().phase==="ready"&&!__pinball.snapshot().paused'),'Engine restart resets the game');
});

for (const game of ['sudoku', 'tank-battle', 'mugen']) await run('notifications-'+game, `games/${game}/index.html`, {gamepadVerify:1}, async({evaluate,until,pads,press,check,cdp}) => {
  await until('__gameReturn.snapshot().ready && __gameReturn.snapshot().gameFrames>3', 'notification renderer ready');
  const canvasCount=await evaluate('document.querySelectorAll("canvas").length');
  await pads([{buttons:[0]}]);
  await until('window.__controllerNotifications?.some(n=>n.text==="手柄 1 已连接")', 'held input still reports connection');
  check(true,'connection does not wait for neutral controls');
  await evaluate('(()=>{const e=new Event("gamepadconnected");Object.defineProperty(e,"gamepad",{value:__pads[0]});dispatchEvent(e)})()');
  check(await evaluate('__controllerNotifications.length')===1,'native event and polling do not duplicate notifications');
  await pads();
  await delay(5200);
  check(await evaluate('__controllerNotifications.length')===0,'connected notification closes after five seconds');
  await pads([{},{}]);
  await until('__controllerNotifications.some(n=>n.text==="手柄 2 已连接")', 'second controller identified');
  await pads([]);
  check(await evaluate('__controllerNotifications.length===2 && __controllerNotifications.every(n=>n.text.includes("已断开"))'),'both disconnected controllers are reported');
  await cdp.call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:false});await delay(300);
  check(await evaluate('(()=>{const c=[...document.querySelectorAll("canvas")].sort((a,b)=>b.clientWidth*b.clientHeight-a.clientWidth*a.clientHeight)[0];return __controllerNotifications.every(n=>n.rect.x>=0&&n.rect.y>=0&&n.rect.x+n.rect.width<=c.clientWidth+1&&n.rect.y+n.rect.height<=c.clientHeight+1)})()'),'notifications fit the portrait game canvas');
  const shot=await cdp.call('Page.captureScreenshot',{format:'png'});writeFileSync(resolve(output,`notifications-${game}-portrait.png`),Buffer.from(shot.result.data,'base64'));
  await pads();
  check(await evaluate('__controllerNotifications.some(n=>n.text==="手柄 1 已连接")'),'rapid reconnection updates the same slot');
  await press(8);await until('__gameReturn.snapshot().active','return dialog pauses game');
  await pads([]);
  await until('__gameReturn.snapshot().notifications.some(n=>n.text==="手柄 1 已断开")','disconnect notification inside pause dialog');
  const frames=await evaluate('__gameReturn.snapshot().gameFrames');
  await delay(5200);
  check(await evaluate('__gameReturn.snapshot().notifications.length')===0,'notification expires while gameplay remains paused');
  check(await evaluate('__gameReturn.snapshot().gameFrames')===frames,'notification does not resume simulation');
  check(await evaluate('document.querySelectorAll("canvas").length')===canvasCount,'notification reuses existing canvases');
  check(await evaluate('!document.querySelector("hy-notification,[data-gamepad-notification]")'),'game notifications are Engine GUI, not DOM');
  await pads();await press(1);check(await evaluate('!__gameReturn.snapshot().active'),'resume still works after reconnection');
});

await run('notifications-lobby','site/index.html',{},async({evaluate,until,pads,check,cdp})=>{
  await until('!!document.querySelector("hy-notification")','Haiyue notification component ready');
  await pads([{buttons:[0]}]);
  check(await evaluate('document.querySelector("hy-notification").size')===1,'homepage reports connection even while a button is held');
  check(await evaluate('document.querySelector("#input-status").textContent.includes("已连接")'),'homepage status follows physical connection');
  const shot=await cdp.call('Page.captureScreenshot',{format:'png'});writeFileSync(resolve(output,'notifications-lobby-connected.png'),Buffer.from(shot.result.data,'base64'));
  await delay(5200);
  check(await evaluate('document.querySelector("hy-notification").size')===0,'homepage connection notification expires after five seconds');
  await pads([]);
  check(await evaluate('document.querySelector("hy-notification").shadowRoot.textContent.includes("手柄 1 已断开")'),'homepage reports disconnect');
  await pads([{buttons:[0]}]);
  check(await evaluate('document.querySelector("hy-notification").size')===1,'rapid reconnect replaces the previous notification');
  await pads([]);await delay(5200);
  check(await evaluate('document.querySelector("hy-notification").size')===0,'homepage disconnect notification also expires');
});

await run('notifications-startup','games/tank-battle/index.html',{gamepadVerify:1},async({evaluate,until,check,cdp})=>{
  await cdp.call('Page.addScriptToEvaluateOnNewDocument',{source:`
    __pads=[{index:0,id:'Already connected',connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({value:0,pressed:false,touched:false}))}];
    const requestAdapter=navigator.gpu.requestAdapter.bind(navigator.gpu);
    navigator.gpu.requestAdapter=async options=>{await new Promise(resolve=>setTimeout(resolve,5500));return requestAdapter(options)};
  `});
  await cdp.call('Page.reload');
  await until('window.__controllerNotifications?.some(n=>n.text==="手柄 1 已连接")','already-connected notification after slow GPU startup');
  check(true,'loading longer than five seconds does not consume the startup notification');
  await delay(5200);
  check(await evaluate('__controllerNotifications.length')===0,'startup notification also expires');
});

await run('fruit-combo','games/fruit-ninja/index.html',{gamepadVerify:1,seed:1042},async({evaluate,until,pads,press,check,cdp})=>{
  await until('window.__fruitNinja?.ready','fruit combo ready');
  const mouse=(x,y)=>cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',x,y,button:'none',buttons:0});
  await cdp.call('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32});
  await cdp.call('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});
  await until('__fruitNinja.items.filter(n=>n.kind==="fruit"&&Math.abs(n.vy)<400&&n.screen.y>130&&n.screen.y<400).length>=2','two fruit in first wave');
  const pair=(await evaluate('__fruitNinja.items')).filter(n=>n.kind==='fruit').sort((a,b)=>a.screen.x-b.screen.x).slice(0,2);
  const a=pair[0].screen,b=pair[1].screen,dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);
  await mouse(5,5);await mouse(a.x-dx/length*55,a.y-dy/length*55);await mouse(a.x,a.y);await mouse(b.x,b.y);
  const combo=await evaluate('__fruitNinja');
  check(combo.combo.count>=2,'one physical swipe combines hits across pointer events');
  check(combo.combo.bonus===5*combo.combo.count*(combo.combo.count-1)/2,'progressive combo bonus');
  check(combo.score===combo.combo.count*10+combo.combo.bonus,'base score and bonus awarded exactly once');
  await until('__gameHud.nodes.some(n=>n.visible&&n.text.includes("连切 · 额外"))','Engine GUI combo feedback');check(true,'combo shown in same-canvas GUI');
  const shot=await cdp.call('Page.captureScreenshot',{format:'png'});writeFileSync(resolve(output,'fruit-ninja-combo.png'),Buffer.from(shot.result.data,'base64'));
  await pads();await press(8);await until('document.body.dataset.gameReturnOpen==="true"','combo interrupted by shared pause');
  check(await evaluate('__fruitNinja.combo.count')===0,'return dialog ends combo immediately');
  await press(1);await pads([]);
  await mouse(5,5);check(await evaluate('__fruitNinja.combo.count')===0,'entering HUD ends the swipe');
  const captured=new Set(), names=['banana','strawberry','coconut','grapes'];
  for(let frame=0;frame<240&&captured.size<4;frame++) {
    const state=await evaluate('__fruitNinja');
    for(const fruit of state.items.filter(n=>n.kind==='fruit'&&n.fruit>=4&&Math.abs(n.vy)<400&&n.screen.y>140&&n.screen.y<450)) {
      if(captured.has(fruit.fruit))continue;
      const image=await cdp.call('Page.captureScreenshot',{format:'png'});writeFileSync(resolve(output,`fruit-ninja-${names[fruit.fruit-4]}.png`),Buffer.from(image.result.data,'base64'));captured.add(fruit.fruit);
    }
    await delay(80);
  }
  check(captured.size===4,'banana strawberry coconut and grapes all spawn and render');
  check(await evaluate('document.querySelectorAll("canvas").length')===1,'expanded fruit still uses one visible canvas');
});

await run('fruit-ninja','games/fruit-ninja/index.html',{gamepadVerify:1,seed:1042},async({evaluate,until,pads,press,check,cdp})=>{
  await until('window.__fruitNinja?.ready','fruit game ready');
  const state=()=>evaluate('__fruitNinja');
  const mouse=(type,p)=>cdp.call('Input.dispatchMouseEvent',{type,x:p.x,y:p.y,button:type==='mouseMoved'?'none':'left',buttons:type==='mousePressed'?1:0,clickCount:type==='mouseMoved'?0:1});
  const button=async text=>{
    const node=await evaluate(`__gameHud.nodes.find(n=>n.visible&&n.type==='GuiButton'&&n.text===${JSON.stringify(text)})`);
    assert.ok(node,'GUI button '+text);const p={x:node.rect.x+node.rect.width/2,y:node.rect.y+node.rect.height/2};
    await mouse('mouseMoved',p);await mouse('mousePressed',p);await mouse('mouseReleased',p);await delay(100);
  };
  const cut=async kind=>{
    await until(`__fruitNinja.items.some(n=>n.kind==='${kind}'&&Math.abs(n.vy)<250&&n.screen.y>__fruitNinja.view.y+20&&n.screen.y<__fruitNinja.view.y+__fruitNinja.view.height-30)`,'visible '+kind+' near apex');
    await mouse('mouseMoved',{x:5,y:5});
    const s=await state(), item=s.items.find(n=>n.kind===kind&&Math.abs(n.vy)<350&&n.screen.y>s.view.y+20&&n.screen.y<s.view.y+s.view.height-30);
    if(!item)return cut(kind);
    await mouse('mouseMoved',{x:item.screen.x-24,y:item.screen.y});
    await mouse('mouseMoved',{x:item.screen.x+24,y:item.screen.y});
    return { item, remaining: s.remaining };
  };
  check((await state()).remaining===60,'ready screen starts with sixty seconds');
  check(await evaluate('document.querySelectorAll("canvas").length===1&&!document.querySelector("button,select")'),'one canvas; Engine GUI controls');
  await button('开始游戏');await until('__fruitNinja.phase==="playing"','start via Engine GUI');
  await cut('fruit');await until('__fruitNinja.score>0','mouse hover slices fruit');
  check((await state()).effects.fragments>0,'cut creates separate fruit halves');
  await until('__fruitNinja.effects.particles>0','Engine juice particles');check(true,'juice particles emitted');
  check((await state()).effects.trail>0,'mouse movement creates a blade trail');
  const shot=await cdp.call('Page.captureScreenshot',{format:'png'});writeFileSync(resolve(output,'fruit-ninja-play.png'),Buffer.from(shot.result.data,'base64'));
  await mouse('mouseMoved',{x:10,y:10});
  for(let i=0;i<=12;i++) await mouse('mouseMoved',{x:120+i*18,y:220-Math.sin(i/12*Math.PI)*55});
  const trailShot=await cdp.call('Page.captureScreenshot',{format:'png'});writeFileSync(resolve(output,'fruit-ninja-trail.png'),Buffer.from(trailShot.result.data,'base64'));
  await delay(350);check((await state()).effects.trail===0,'trail expires after movement stops');
  await button('暂停');const paused=(await state()).remaining;await delay(500);
  check((await state()).remaining===paused,'GUI pause freezes round clock');await button('继续游戏');
  await pads();await press(8);await until('document.body.dataset.gameReturnOpen==="true"','Back return dialog');
  const time=(await state()).remaining;await delay(400);check((await state()).remaining===time,'shared return dialog pauses the round');
  await press(1);await until('document.body.dataset.gameReturnOpen!=="true"','return cancelled');
  const resumed=(await state()).remaining;await delay(250);check(resumed-(await state()).remaining<1,'return dialog time excluded after resume');
  await pads([{axes:[.9,0,0,0]}]);check((await state()).effects.trail>0,'controller stick produces blade movement');await pads();
  await press(2);check((await state()).phase==='paused','controller X pauses');await press(2);check((await state()).phase==='playing','controller X resumes');await pads([]);
  const clockCut=await cut('clock');await delay(80);
  check((await state()).remaining>clockCut.remaining+9,'slicing stopwatch adds ten seconds');
  check(!(await state()).items.some(item=>item.id===clockCut.item.id),'stopwatch is consumed once');
  for(let attempt=0;attempt<10&&(await state()).phase==='playing';attempt++) {
    await cut('bomb');
    if(attempt===0){const explosion=await cdp.call('Page.captureScreenshot',{format:'png'});writeFileSync(resolve(output,'fruit-ninja-explosion.png'),Buffer.from(explosion.result.data,'base64'));}
    await delay(120);
  }
  check((await state()).bombs===3&&(await state()).phase==='over'&&(await state()).reason==='bombs','third sliced bomb ends the game');
  check((await state()).effects.particles>0,'bomb explosion emits particles');
  const best=(await state()).best;check(best>0,'completed score updates best');
  await button('再来一局');check((await state()).bombs===0&&(await state()).score===0&&(await state()).remaining>59,'restart resets bombs score and timer');
  for(const [width,height] of [[390,844],[844,390],[1440,900]]) {
    await button('暂停');await cdp.call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<900});await delay(150);
    check(await evaluate(`__gameHud.nodes.filter(n=>n.visible&&n.type==='GuiButton').every(n=>n.rect.x>=0&&n.rect.y>=0&&n.rect.x+n.rect.width<=${width}+1&&n.rect.y+n.rect.height<=${height}+1)`),'GUI fits '+width+'x'+height);
    check(await evaluate(`__fruitNinja.effects.viewport.width===${width}&&__fruitNinja.effects.viewport.height===${height}`),'particles use screen pixels without stretch '+width+'x'+height);
    await button('继续游戏');
    const capture=await cdp.call('Page.captureScreenshot',{format:'png'});writeFileSync(resolve(output,`fruit-ninja-${width}x${height}.png`),Buffer.from(capture.result.data,'base64'));
  }
  await cdp.call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await delay(150);
  await until('__fruitNinja.items.some(n=>n.kind==="fruit"&&Math.abs(n.vy)<400&&n.screen.y>150&&n.screen.y<600)','mobile fruit near apex');
  const beforeTouch=(await state()).score, fruit=(await state()).items.find(n=>n.kind==='fruit'&&Math.abs(n.vy)<500&&n.screen.y>150&&n.screen.y<600);
  await cdp.call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:fruit.screen.x-18,y:fruit.screen.y,id:0}]});
  await cdp.call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:fruit.screen.x-10,y:fruit.screen.y,id:0}]});
  await cdp.call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:fruit.screen.x+18,y:fruit.screen.y,id:0}]});
  await cdp.call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await delay(100);
  check((await state()).score>beforeTouch,'touch swipe slices fruit');
  await cdp.call('Page.reload');await until('window.__fruitNinja?.ready','reload');check((await state()).best===best,'Engine save restores best score');
});

await run('jigsaw-smoke','games/jigsaw-puzzle/index.html',{gamepadVerify:1,seed:1042},async({evaluate,until,check,cdp})=>{
  await until('window.__jigsaw?.ready && !__jigsaw.busy','jigsaw ready');
  check(await evaluate('document.querySelectorAll("canvas").length===1 && __gameHud.nodes.filter(n=>n.type==="GuiButton").length===9'),'shared engine canvas and GUI');
  check(await evaluate('__jigsaw.groups.length===20'),'default 4x5 puzzle');
  await cdp.call('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await delay(500);
});

await run('jigsaw-play','games/jigsaw-puzzle/index.html',{gamepadVerify:1,seed:1042},async({evaluate,until,pads,press,check,cdp})=>{
  await until('window.__jigsaw?.ready && !__jigsaw.busy','jigsaw ready');
  const state = () => evaluate('__jigsaw');
  const mouse = (type,p,buttons=0) => cdp.call('Input.dispatchMouseEvent',{type,x:p.x,y:p.y,button:type==='mouseMoved'?'none':'left',buttons,clickCount:1});
  const click = async p => { await mouse('mousePressed',p,1); await mouse('mouseReleased',p); await delay(140); };
  const node = async (type,text) => (await evaluate('__gameHud.nodes')).find(n=>n.type===type && (text===undefined || n.text===text));
  const center = rect => ({x:rect.x+rect.width/2,y:rect.y+rect.height/2});
  const button = async text => click(center((await node('GuiButton',text)).rect));
  const select = async(index,value) => {
    const n=(await evaluate('__gameHud.nodes')).filter(n=>n.type==='GuiSelect')[index];
    await click(center(n.rect));
    await click({x:n.rect.x+30,y:n.rect.y+n.rect.height+4+(value-1)*30-Math.max(0,n.value-4)*30+15});
  };
  const drag = async (from,to,release=true) => { await mouse('mousePressed',from,1); await mouse('mouseMoved',to,1); if(release)await mouse('mouseReleased',to); await delay(150); };
  const key = async code => { await cdp.call('Input.dispatchKeyEvent',{type:'keyDown',code,key:code.slice(3).toLowerCase()}); await cdp.call('Input.dispatchKeyEvent',{type:'keyUp',code,key:code.slice(3).toLowerCase()}); await delay(120); };
  const merge = async (movingId,targetId) => {
    const s=await state(),a=s.groups.find(g=>g.pieces.includes(movingId)),b=s.groups.find(g=>g.pieces.includes(targetId));
    const p=s.pieces[movingId].screen;
    await drag(p,{x:p.x+(b.x-a.x)*s.view.scale,y:p.y+(b.y-a.y)*s.view.scale});
  };
  await select(0,2);await select(1,2);await button('开始新拼图');
  await until('__jigsaw.rows===2 && __jigsaw.cols===2 && !__jigsaw.busy','GUI starts 2x2');
  check((await state()).groups.length===4,'row/column GUI generates requested pieces');
  await button('−');await button('−');
  await merge(0,1);
  let s=await state();check(s.groups.some(g=>g.pieces.includes(0)&&g.pieces.includes(1)),'neighbor pieces snap into one group');
  const before=s.pieces.slice(0,2).map(p=>p.screen),p=before[0];
  await drag(p,{x:p.x+40,y:p.y+20});s=await state();
  const dx=s.pieces[0].screen.x-before[0].x,dy=s.pieces[0].screen.y-before[0].y;
  check(Math.hypot(dx,dy)>5 && before.every((p,i)=>Math.abs(s.pieces[i].screen.x-p.x-dx)<1 && Math.abs(s.pieces[i].screen.y-p.y-dy)<1),'joined pieces drag as a rigid group');
  const angle=s.groups.find(g=>g.pieces.includes(0)).angle;await key('KeyR');
  check((await state()).groups.find(g=>g.pieces.includes(0)).angle===angle,'rotation-disabled mode ignores rotate input');
  await merge(0,2);await merge(0,3);check((await state()).complete,'all pieces can be assembled');
  await click(center((await node('GuiCheckbox')).rect));await button('开始新拼图');
  await until('__jigsaw.allowRotation && !__jigsaw.busy && __jigsaw.groups.length===4','rotation puzzle');
  await button('−');await button('−');
  // Use only normal pointer/key input to orient pieces before joining them.
  for(let id=0;id<4;id++) {
    s=await state();await click(s.pieces[id].screen);
    let turns=(4-s.groups.find(g=>g.pieces.includes(id)).angle)%4;
    while(turns-->0)await key('KeyR');
  }
  await merge(0,1);s=await state();
  check(s.groups.find(g=>g.pieces.includes(0)).pieces.length>=2,'rotated pieces join after matching orientation');
  const pair=s.pieces.slice(0,2).map(p=>p.screen),pivot={x:(pair[0].x+pair[1].x)/2,y:(pair[0].y+pair[1].y)/2};
  await pads();await press(2);s=await state();
  check(s.groups.find(g=>g.pieces.includes(0)).angle===1,'controller X rotates a joined group');
  check(pair.every((p,i)=>Math.abs(s.pieces[i].screen.x-(pivot.x-(p.y-pivot.y)))<1 && Math.abs(s.pieces[i].screen.y-(pivot.y+(p.x-pivot.x)))<1),'whole-group rotation preserves its pivot and relative positions');
  await press(3);check(await evaluate('__gameHud.nodes.some(n=>n.type==="GuiImage"&&n.visible)'),'controller Y opens original image');await press(3);
  await pads([]);
  s=await state();const start=s.pieces[0].screen;
  await drag(start,{x:start.x+30,y:start.y+10},false);
  await pads();await press(8);await until('document.body.dataset.gameReturnOpen==="true"','Back pauses jigsaw');
  check(!(await state()).dragging,'return dialog cancels active piece drag');
  await press(1);await until('document.body.dataset.gameReturnOpen!=="true"','resume jigsaw');await mouse('mouseReleased',start);await pads([]);
  const doc=await cdp.call('DOM.getDocument'),input=await cdp.call('DOM.querySelector',{nodeId:doc.result.root.nodeId,selector:'#image-upload'});
  let chooser = null;cdp.on('Page.fileChooserOpened',event=>{chooser=event;});
  await cdp.call('Page.setInterceptFileChooserDialog',{enabled:true});await button('上传图片');
  check(chooser?.mode==='selectSingle','Engine GUI upload button opens the native image picker');
  await cdp.call('DOM.setFileInputFiles',{nodeId:input.result.nodeId,files:[resolve(root,'games/test/fixtures/jigsaw/portrait.svg')]});
  await cdp.call('Page.setInterceptFileChooserDialog',{enabled:false});
  await until('__jigsaw.groups.length===4 && !__jigsaw.busy','uploaded image');
  check((await state()).image.width===500 && (await state()).image.height===900,'native upload replaces the landscape image with a portrait');
  const uploaded=await state();
  await cdp.call('DOM.setFileInputFiles',{nodeId:input.result.nodeId,files:[resolve(root,'games/test/fixtures/jigsaw/broken.svg')]});
  await until('!__jigsaw.busy && __gameHud.nodes.some(n=>n.text.includes("图片无法读取"))','invalid image message');
  check(JSON.stringify((await state()).groups)===JSON.stringify(uploaded.groups) && (await state()).image.height===900,'invalid upload preserves the current puzzle');
  await click((await state()).pieces[0].screen);await delay(5100);
  for(const [width,height] of [[390,844],[844,390],[320,640]]) {
    await cdp.call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await delay(250);
    const hud=await evaluate('__gameHud');s=await state();
    check(hud.nodes.filter(n=>n.visible && ['GuiButton','GuiSelect','GuiCheckbox'].includes(n.type)).every(n=>n.rect.x>=0 && n.rect.y>=0 && n.rect.x+n.rect.width<=width+.1 && n.rect.y+n.rect.height<=height+.1),'GUI stays inside '+width+'x'+height);
    check(s.pieces.every(p=>p.screen.x>=s.view.x && p.screen.x<=s.view.x+s.view.width && p.screen.y>=s.view.y && p.screen.y<=s.view.y+s.view.height),'pieces fit '+width+'x'+height);
    const shot=await cdp.call('Page.captureScreenshot',{format:'png'});writeFileSync(resolve(output,`jigsaw-${width}x${height}.png`),Buffer.from(shot.result.data,'base64'));
  }
  await cdp.call('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});await delay(200);
  // Native touch uses the same hit testing and grouped drag path as mouse/controller input.
  s=await state();const touchStart=s.pieces[0].screen;
  await cdp.call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:touchStart.x,y:touchStart.y,id:0}]});
  await cdp.call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:touchStart.x+45,y:touchStart.y+30,id:0}]});
  await cdp.call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await delay(150);
  check(Math.hypot((await state()).pieces[0].screen.x-touchStart.x,(await state()).pieces[0].screen.y-touchStart.y)>10,'touch drag moves a curved piece');
  for(const index of [0,1]) {
    const n=(await evaluate('__gameHud.nodes')).filter(n=>n.type==='GuiSelect')[index];await click(center(n.rect));
    await cdp.call('Input.dispatchMouseEvent',{type:'mouseWheel',x:n.rect.x+30,y:n.rect.y+n.rect.height+30,deltaX:0,deltaY:1000});await delay(100);
    await click({x:n.rect.x+30,y:n.rect.y+n.rect.height+4+105});
  }
  check(await evaluate('__gameHud.nodes.filter(n=>n.type==="GuiSelect").every(n=>n.value===12)'),'GUI dropdown scrolling selects 12 rows and columns');
  await button('开始新拼图');await until('__jigsaw.rows===12 && __jigsaw.cols===12 && !__jigsaw.busy','maximum piece count');
  check((await state()).groups.length===144,'12x12 creates all 144 pieces');
  check(await evaluate('document.querySelectorAll("canvas").length===1 && !document.querySelector("button,select")'),'all visible controls stay in Engine GUI after restart/upload');
  await cdp.call('Page.reload');await until('window.__jigsaw?.ready && !__jigsaw.busy','restored settings');
  check(await evaluate('__jigsaw.rows===12 && __jigsaw.cols===12 && __jigsaw.allowRotation'),'Engine save restores row/column and rotation preferences');
});
