import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { runChromeWebGpuFixture } from '../../Engine/scripts/webgpu-gate/chrome-runner.mjs';
import { createPortablePixelRecord, comparePortablePixelRecords } from '../../Engine/scripts/visual-regression/portable-pixels.mjs';
import { decodePng } from '../../Engine/scripts/visual-regression/png.mjs';
import { runRollupOnce } from './shared-rollup-runner.mjs';
import { rotateSimulatorCamera } from './simulator-camera.mjs';

const root = resolve(import.meta.dirname, '..'), output = resolve(root, 'artifacts/gamepad');
const catalog = JSON.parse(readFileSync(resolve(root, 'games/manifest.json'), 'utf8')).entries.filter(entry=>entry.launcher!==false);
const catalogCount = catalog.length;
mkdirSync(output, { recursive: true });
if (!process.env.GAMEPAD_CASE || process.env.GAMEPAD_CASE.split(',').includes('input')) await runRollupOnce({cwd:root,config:'rollup.gamepad-fixture.config.js',expectedOutputs:['artifacts/gamepad/fixture.js'],label:'gamepad input fixture',timeoutMs:120000});
const delay = ms => new Promise(done => setTimeout(done, ms));
const mock = `
if(window===top)window.__pads=[];
Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>top.__pads});
window.__keys=[];
for(const type of ['keydown','keyup'])addEventListener(type,e=>window.__keys.push({type,code:e.code,repeat:e.repeat}));
if(typeof GPUDevice!=='undefined'){
 window.__previewTextures={created:0,live:0,peak:0,sizes:[]};
 const createTexture=GPUDevice.prototype.createTexture;
 GPUDevice.prototype.createTexture=function(descriptor){
  const texture=createTexture.call(this,descriptor);
  if(descriptor.label==='Game OS card preview slot'){
   const stats=window.__previewTextures;stats.created++;stats.live++;stats.peak=Math.max(stats.peak,stats.live);stats.sizes.push([texture.width,texture.height]);
   const destroy=texture.destroy.bind(texture);let destroyed=false;
   texture.destroy=()=>{if(!destroyed){destroyed=true;stats.live--;}destroy();};
  }
  return texture;
 };
 const create=GPUDevice.prototype.createShaderModule;
 GPUDevice.prototype.createShaderModule=function(descriptor){
  const module=create.call(this,descriptor);
  if(descriptor.label?.startsWith('Game OS wallpaper'))void module.getCompilationInfo().then(info=>{
   const errors=info.messages.filter(message=>message.type==='error');
   if(errors.length)console.error(descriptor.label+': '+errors.map(error=>error.lineNum+':'+error.linePos+' '+error.message).join(' | '));
  });
  return module;
 };
}
`;
const provenance = {
  revision: execFileSync('git', ['-c', 'safe.directory='+root.replaceAll('\\','/'), 'rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  generatedAt: new Date().toISOString(), simulatedControllers: true,
  dirtyWorkingTree: execFileSync('git', ['-c', 'safe.directory='+root.replaceAll('\\','/'), 'status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim().length > 0,
  fingerprints: Object.fromEntries(['games/gamepad/runtime.ts','games/gamepad/sampler.ts','games/gamepad/profiles.ts','games/gamepad/lobby.ts','site/app.js','site/index.html','site/styles.css','site/catalog/details.js','site/state/library.js','index.html','site/catalog/paths.js','games/launcher/GameOS.ts','games/launcher/DesktopGui.ts','games/launcher/layout.ts','games/launcher/Aurora.ts','games/tank-battle/game/TankBattle.ts','games/tank-battle/ui/TankBattleHud.ts','games/tank-battle/rendering/render.ts','games/tank-battle/index.html','games/session/GameEngine.ts','games/session/SessionPause.ts','games/session/ReturnDialog.ts','games/session/GameReturnController.ts','games/session/audio.ts','games/triangle-calendar-puzzle/game/TriangleCalendarGame.ts','games/triangle-calendar-puzzle/game/model.ts','games/triangle-calendar-puzzle/ui/CalendarHud.ts','games/triangle-calendar-puzzle/rendering/CalendarBoard.ts','games/triangle-calendar-puzzle/save/saveState.ts'].map(file => [file,createHash('sha256').update(readFileSync(resolve(root,file))).digest('hex')])),
};

async function run(name, fixture, query, exercise) {
  if(process.env.GAMEPAD_CASE && !process.env.GAMEPAD_CASE.split(',').includes(name))return;
  const checks = [];
  const gameId = /^games\/([^/]+)\/index\.html$/.exec(fixture)?.[1];
  const entry = gameId ? `games/${gameId}/${gameId==='gravity-maze'?'dist/':''}bundle.js` : null;
  const sourceInputs = gameId ? readdirSync(resolve(root, 'games', gameId), { recursive: true }).filter(file => /\.(ts|html|css|svg)$/.test(file)).map(file => `games/${gameId}/${file}`) : [];
  sourceInputs.push('games/shared/input/pointerCapture.ts', 'games/shared/ui/GameHud.ts', 'games/shared/ui/ProjectedLabel.ts', 'games/shared/rendering/fitPerspectiveCamera.ts', 'games/gamepad/ui/ControllerOverlay.ts');
  sourceInputs.push('games/manifest.json');
  sourceInputs.push('games/session/ReturnDialog.ts', 'games/session/returnDialogArt.ts', 'games/launcher/buttonStyle.ts');
  if (!gameId) sourceInputs.push('site/assets/haiyue-logo.png');
  if (name.startsWith('lobby-artwork')) sourceInputs.push(...catalog.map(game=>'site/'+game.thumbnail));
  if (name === 'lobby-glass') sourceInputs.push('games/test/fixtures/launcher/glass-checker.svg');
  sourceInputs.push('games/gamepad/connections.ts', 'games/gamepad/connectionMonitor.ts', 'games/gamepad/ui/ConnectionNotifications.ts', 'games/gamepad/ui/connectionNoticeArt.ts');
  if (gameId === 'jigsaw-puzzle') sourceInputs.push('games/test/fixtures/jigsaw/portrait.svg', 'games/test/fixtures/jigsaw/broken.svg', 'games/test/fixtures/jigsaw/rim-colors.svg', 'games/save/SingleSlotGameSave.ts',
    'games/jigsaw-puzzle/assets/wood-ui.png', 'games/jigsaw-puzzle/assets/wood-ui.provenance.json', 'games/session/audio.ts', 'scripts/generate-jigsaw-audio.mjs',
    ...readdirSync(resolve(root,'games/jigsaw-puzzle/assets/audio')).map(file=>`games/jigsaw-puzzle/assets/audio/${file}`));
  if (gameId === 'fruit-ninja') sourceInputs.push('games/fruit-ninja/assets/fruits.png', 'games/fruit-ninja/assets/fruits-extra.png', 'games/fruit-ninja/assets/items.png', 'games/fruit-ninja/assets/dojo-backdrop.png', 'games/fruit-ninja/assets/dojo-gui.png', 'games/fruit-ninja/assets/provenance.json', 'games/fruit-ninja/assets/fruits-extra.provenance.json', 'games/fruit-ninja/assets/dojo.provenance.json');
  if (gameId === 'fruit-ninja') sourceInputs.push(...readdirSync(resolve(root, 'games/fruit-ninja/assets/audio')).map(file => `games/fruit-ninja/assets/audio/${file}`), 'games/session/audio.ts', 'scripts/generate-fruit-audio.mjs');
  if (gameId === 'icosahedron-minesweeper') sourceInputs.push(...readdirSync(resolve(root, 'games/shared/minesweeper'), { recursive: true }).filter(file => file.endsWith('.ts')).map(file => `games/shared/minesweeper/${file}`));
  if (!gameId) sourceInputs.push('site/gamepad.js', 'site/game-host.js', 'site/simulator.js', 'scripts/simulator-camera.mjs', 'site/catalog/paths.js', ...['launcher','host','simulator'].flatMap(folder=>readdirSync(resolve(root,'games',folder)).filter(file=>file.endsWith('.ts')).map(file=>`games/${folder}/${file}`)),...readdirSync(resolve(root,'site/core')).filter(file=>file.endsWith('.js')).map(file=>'site/core/'+file));
  if (!gameId) for (const id of ['2048','fruit-ninja']) sourceInputs.push(...readdirSync(resolve(root,'games',id),{recursive:true}).filter(file=>/\.(?:ts|html|css|js)$/.test(file)).map(file=>'games/'+id+'/'+file));
  const inputs = Object.fromEntries([fixture,entry,...sourceInputs].filter(file=>file&&existsSync(resolve(root,file))).map(file=>[file,createHash('sha256').update(readFileSync(resolve(root,file))).digest('hex')]));
  const result = await runChromeWebGpuFixture({root, fixture, query, timeoutMs:90000, disableDx12InfoCollection:true,
    visualCapture:{viewportWidth:1040,viewportHeight:600},
    interact:async cdp=>{
      cdp.on('Runtime.consoleAPICalled', event => {
        if(event.type!=='error')return;
        for(const arg of event.args??[])if(arg.objectId)void cdp.call('Runtime.callFunctionOn',{objectId:arg.objectId,functionDeclaration:'function(){const messages=[];let error=this;for(let i=0;error&&i<8;i++,error=error.cause)messages.push(error.message??String(error));return messages.join("\\nCaused by: ")}',returnByValue:true})
          .then(result=>{const message=result.result?.result?.value;if(message)console.error('Browser error detail: '+message);}).catch(()=>{});
      });
      const evaluate=async expression=>{
        const r=await cdp.call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
        if(r.result?.exceptionDetails)throw new Error(r.result.exceptionDetails.exception?.description??r.result.exceptionDetails.text);
        return r.result?.result?.value;
      };
      const until=async(expression,label)=>{
        for(let n=0;n<240;n++){try{if(await evaluate(expression))return;}catch{}await delay(100);}
        const state=await evaluate('window.__gameOS??null').catch(()=>null);
        const input=await evaluate('({events:window.__desktopPointerLog,inner:[innerWidth,innerHeight],canvas:document.querySelector("canvas")?.getBoundingClientRect().toJSON(),active:document.activeElement?.outerHTML})').catch(()=>null);
        writeFileSync(resolve(output,name+'-timeout.json'),JSON.stringify({label,state,input},null,2));
        const shot=await cdp.call('Page.captureScreenshot',{format:'png'});writeFileSync(resolve(output,name+'-timeout.png'),Buffer.from(shot.result.data,'base64'));
        throw new Error('Timed out: '+label+' (snapshot: '+name+'-timeout.json)');
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

for(const mobile of [false,true])await run('icosahedron-pointer'+(mobile?'-mobile':''),'games/icosahedron-minesweeper/index.html',{gamepadVerify:1},async({evaluate,until,pads,press,check,cdp})=>{
  await until('!!window.__icosahedronInput','icosahedron input fixture');await pads();
  await until('__icosahedronInput.pointer!==null&&!!window.__controllerPointer','virtual crosshair');
  if(mobile){await cdp.call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:false});await delay(250);await pads();}
  check(await evaluate('(()=>{const p=__icosahedronInput.pointer,r=document.querySelector("canvas").getBoundingClientRect();return p.x>=r.left&&p.x<r.right&&p.y>=r.top&&p.y<r.bottom})()'),'idle cursor remains inside the canvas after viewport changes');
  check(await evaluate('__icosahedronInput.hovered===__icosahedronInput.picked'),'initial stationary crosshair agrees with its ray, including gaps between tiles');
  const before=await evaluate('__icosahedronInput.pointer');
  await pads([{axes:[-.5,0,0,0],buttons:[11]}]);await pads([{axes:[-.5,0,0,0]}]);await pads();
  check((await evaluate('__icosahedronInput.pointer.x'))<before.x-10,'R3 release while moving cannot disable the left stick or demand another neutral cycle');
  const aim=async(predicate='true')=>{
    const cell=await evaluate(`(()=>{const r=document.querySelector('canvas').getBoundingClientRect();return __icosahedronInput.cells.find(c=>c.front&&c.state==='hidden'&&c.point.y>r.top+175&&c.point.y<r.bottom-40&&c.point.x>r.left+30&&c.point.x<r.right-30&&(${predicate}))})()`);
    assert.ok(cell,'front-facing target for controller fixture');
    await cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:cell.point.x,y:cell.point.y,button:'none',buttons:0});await pads();
    return cell;
  };
  let cell=await aim();
  check(await evaluate(`__icosahedronInput.picked===${cell.id}&&__icosahedronInput.hovered===${cell.id}&&__icosahedronInput.highlighted.length===1`),'mouse and gamepad share the same face beneath their pointer');
  check(await evaluate('(()=>{const a=__controllerPointer.center,b=__icosahedronInput.pointer;return __controllerPointer.visible&&Math.hypot(a.x-b.x,a.y-b.y)<.5})()'),'rendered crosshair center matches ray coordinates at the current DPI');
  const parked=await evaluate('__icosahedronInput.pointer');await delay(180);
  check(await evaluate(`Math.hypot(__icosahedronInput.pointer.x-${parked.x},__icosahedronInput.pointer.y-${parked.y})<.01`),'neutral stick does not drift');
  const oldPick=await evaluate('__icosahedronInput.picked');
  for(let step=0;step<5&&await evaluate('__icosahedronInput.picked')===oldPick;step++){await pads([{buttons:[5]}]);await pads();}
  check(await evaluate(`__icosahedronInput.picked!==${oldPick}&&__icosahedronInput.hovered===__icosahedronInput.picked`),'zoom re-picks a changed face beneath a stationary crosshair');
  await aim();const beforeShift=await evaluate('__icosahedronInput.picked');
  await evaluate(`document.querySelector('canvas').style.transform='translateX(${mobile?32:64}px)'`);await pads();
  check(await evaluate(`__icosahedronInput.picked!==${beforeShift}&&__icosahedronInput.hovered===__icosahedronInput.picked`),'canvas offset re-picks selection without any pointer or projection movement');
  await evaluate('document.querySelector("canvas").style.transform=""');await pads();
  check(await evaluate('__icosahedronInput.hovered===__icosahedronInput.picked'),'restoring the canvas position restores matching selection');
  cell=await aim('!c.mine');
  await press(1);
  check(await evaluate(`__icosahedronInput.flags===1&&__icosahedronInput.cells[${cell.id}].state==='flagged'`),'B plants exactly one flag on the crosshair face');
  await press(1);
  check(await evaluate(`__icosahedronInput.flags===0&&__icosahedronInput.cells[${cell.id}].state==='hidden'`),'B removes the same flag and restores the face highlight');
  await press(0);
  check(await evaluate(`__icosahedronInput.cells[${cell.id}].state==='revealed'&&__icosahedronInput.opened>0`),'A reveals the face beneath the displayed crosshair');
  await press(3);await aim();
  const drag=await evaluate('({camera:__icosahedronInput.camera,opened:__icosahedronInput.opened})');
  await pads([{buttons:[0]}]);await pads([{axes:[.45,.2,0,0],buttons:[0]}]);
  check(await evaluate('__icosahedronInput.gesture&&__icosahedronInput.highlighted.length===0'),'orbit drag temporarily clears hover without leaving an old selected face');
  await pads();
  check(await evaluate(`!__icosahedronInput.gesture&&__icosahedronInput.opened===${drag.opened}&&__icosahedronInput.camera.theta!==${drag.camera.theta}&&__icosahedronInput.hovered===__icosahedronInput.picked`),'drag release restores selection using the final camera without revealing a tile');
  await aim();await pads([{axes:[0,0,-.45,0]}]);await pads();
  check(await evaluate('__icosahedronInput.hovered===__icosahedronInput.picked'),'right-stick movement shares the same picking position');
  await press(8);await until('__gameReturn.snapshot().active','return dialog pauses the board');await press(1);
  await until('!__gameReturn.snapshot().active','return cancelled');await pads();
  await pads([{axes:[-.4,0,0,0]}]);await pads();
  check(await evaluate('__icosahedronInput.pointer!==null&&__icosahedronInput.hovered===__icosahedronInput.picked'),'canceling the return dialog resumes cursor movement and selection');
});

await run('icosahedron-pointer-host','site/index.html',{gamepadVerify:1,game:'icosahedron-minesweeper'},async({evaluate,until,pads,press,check,cdp})=>{
  const probe='haiyueGameOS.game.debug.__icosahedronInput';
  await until('__gameHost?.id==="icosahedron-minesweeper"&&__gameHost.phase==="playing"&&!!haiyueGameOS.game.debug.__icosahedronInput','sphere mounted from the homepage');
  await pads();await until(`${probe}.pointer!==null`,'hosted controller');
  const cell=await evaluate(`${probe}.cells.find(c=>c.front&&!c.mine&&c.point.y>175&&c.point.y<innerHeight-40)`);
  assert.ok(cell,'hosted front face');
  await cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:cell.point.x,y:cell.point.y,button:'none',buttons:0});await pads();
  check(await evaluate(`${probe}.picked===${cell.id}&&${probe}.hovered===${cell.id}`),'homepage-mounted game shares the crosshair and highlight coordinates');
  await press(1);
  check(await evaluate(`${probe}.cells[${cell.id}].state==='flagged'&&${probe}.flags===1`),'hosted virtual pointer reaches the game canvas through its ShadowRoot');
  await press(1);
  const before=await evaluate(`${probe}.pointer.x`);await press(11);await pads([{axes:[-.4,0,0,0]}]);await pads();
  check(await evaluate(`${probe}.pointer.x<${before}-5&&${probe}.hovered===${probe}.picked`),'R3 and subsequent stick movement remain aligned in the hosted game');
  await pads([{buttons:[11,9]}]);await pads();
  await until('haiyueGameOS.game.debug.__gameReturn?.snapshot().active','R3 plus Start host chord');
  check(await evaluate('__gameHost.id==="icosahedron-minesweeper"'),'pointer-only mode preserves the R3 plus Start return confirmation');
  await press(1);await until('!haiyueGameOS.game.debug.__gameReturn.snapshot().active','host return canceled');await pads();
  check(await evaluate(`${probe}.pointer!==null&&!${probe}.gesture`),'canceling hosted return leaves no captured virtual gesture');
});

async function clickDesktop(context, id) {
  if (id.startsWith('game-')) await context.until('!__gameOS.shelf.animating','carousel card stops moving before clicking');
  if (id.startsWith('game-')) for (let attempt=0;attempt<8;attempt++) {
    const view=await context.evaluate(`({node:__gameOS.nodes.find(node=>node.id===${JSON.stringify(id)}),shelf:__gameOS.shelf})`);
    assert.ok(view.node, 'native GUI control '+id);
    const center=view.node.rect.x+view.node.rect.width/2;
    if(center>view.shelf.x+12&&center<view.shelf.x+view.shelf.width-12)break;
    await context.cdp.call('Input.dispatchMouseEvent',{type:'mouseWheel',x:view.shelf.x+view.shelf.width/2,y:view.shelf.y+view.shelf.height/2,deltaX:center-(view.shelf.x+view.shelf.width/2),deltaY:0});
    await delay(300);await context.until('!__gameOS.shelf.animating','requested card scrolls into view');
  }
  const node = await context.evaluate(`__gameOS.nodes.find(node=>node.id===${JSON.stringify(id)})`);
  assert.ok(node, 'native GUI control '+id);
  const point={x:node.rect.x+node.rect.width/2,y:node.rect.y+node.rect.height/2};
  await context.cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',...point,button:'none',buttons:0});
  await context.cdp.call('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',buttons:1,clickCount:1});
  await delay(80);
  await context.cdp.call('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',buttons:0,clickCount:1});
  await delay(150);
}
async function desktopKey(cdp,key,code,keyCode) {
  await cdp.call('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode:keyCode});
  await cdp.call('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode:keyCode});
}

await run('lobby','site/index.html',{verify:1},async(context)=>{
  const {evaluate,until,pads,press,check}=context;
  await until(`__gameOS?.games.length===${catalogCount}&&__gameOS.frames>2`,'native catalog');await pads();
  const first=await evaluate('__gameOS.selected');await press(15);
  check(await evaluate('__gameOS.selected')!==first,'D-pad selects another Engine GUI cover');
  const previous=await evaluate('__gameOS.selected');await press(5);check(await evaluate('__gameOS.selected')!==previous,'RB advances the carousel');
  await press(4);check(await evaluate('__gameOS.selected')===previous,'LB returns to the previous game');
  for(let index=0;index<catalogCount&&await evaluate('__gameOS.selected')!=='2048';index++)await press(15);
  await press(0);await until('__gameHost.id==="2048"&&__gameHost.phase==="playing"','game module opens');
  check(await evaluate('document.querySelectorAll("iframe").length===0&&__gameHost.id==="2048"'),'A mounts selected game directly without an iframe');
  await until('document.querySelector("#game-host .game-mount")?.shadowRoot.querySelector("#game-document").dataset.gamepadActive==="true"','game controller boot');
  const stopped=await evaluate('__gameOS.frames');await delay(300);
  check(await evaluate('__gameOS.frames')===stopped,'launcher does not render behind the game');
  await press(15);check(await evaluate('__keys.some(event=>event.code==="ArrowRight"&&event.type==="keydown")'),'game receives independent controller input');
  await pads([{buttons:[11,4]}]);await pads();
  await until('__gameHost.id==="tank-battle"&&__gameHost.phase==="playing"','previous game module');
  const switched=await evaluate('__gameOS.frames');await delay(200);check(await evaluate('__gameOS.frames')===switched,'desktop stops again after the shared loading screen completes');
  await until('document.querySelector("#game-host .game-mount")?.shadowRoot.querySelector("#game-document").dataset.gamepadActive==="true"','new controller boot');
  await press(8);await until('window.haiyueGameOS.game.debug.__gameReturn?.snapshot().active','return confirmation');
  check(await evaluate('__gameHost.id==="tank-battle"'),'Back waits for Engine confirmation');
  await press(15);await press(0);await until('!__gameHost.mounted&&__gameOS.running','return to native desktop');
  await until('__gameOS.focused==="game-tank-battle"','native card focus restored after return');
  check(await evaluate('__gameOS.focused')==='game-tank-battle','return restores the selected Engine GUI card');
});

await run('lobby-glass','site/index.html',{verify:1},async({evaluate,until,check,cdp})=>{
  const fixture=readFileSync(resolve(root,'games/test/fixtures/launcher/glass-checker.svg')),intercepts=[];
  await cdp.call('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await cdp.call('Network.enable');await cdp.call('Network.setCacheDisabled',{cacheDisabled:true});
  cdp.on('Fetch.requestPaused',event=>{intercepts.push(event.request.url);void cdp.call('Fetch.fulfillRequest',{requestId:event.requestId,responseCode:200,
    responseHeaders:[{name:'Content-Type',value:'image/svg+xml'},{name:'Cache-Control',value:'no-store'}],body:fixture.toString('base64')});});
  await cdp.call('Fetch.enable',{patterns:[{urlPattern:'*/screenshots/*',requestStage:'Request'}]});
  await cdp.call('Page.reload');await until(`__gameOS?.games.length===${catalogCount}&&__gameOS.backdrop.gpu.blurBuilds>0&&__gameOS.frames>15`,'checkerboard glass fixture');
  await until('__gameOS.artwork.pending===0&&__gameOS.artwork.cards.every(card=>card.ready)','visible checkerboard previews');await delay(250);
  const state=await evaluate('__gameOS'),shot=Buffer.from((await cdp.call('Page.captureScreenshot',{format:'png'})).result.data,'base64'),pixels=decodePng(shot);
  writeFileSync(resolve(output,'lobby-glass-fixture.png'),shot);
  const light=(x,y)=>{const offset=(y*pixels.width+x)*4;return (pixels.data[offset]+pixels.data[offset+1]+pixels.data[offset+2])/3;};
  // Four-pixel differences measure the 16px checker, rather than amplifying one-LSB GPU quantization in dark areas.
  const energy=(x0,y0,width,height)=>{let gradient=0,mean=0,count=0;for(let y=y0;y<y0+height-4;y++)for(let x=x0;x<x0+width-4;x++){
    const value=light(x,y);mean+=value;gradient+=(Math.abs(value-light(x+4,y))+Math.abs(value-light(x,y+4)))/2;count++;
  }return {mean:mean/count,gradient:gradient/count,normalized:gradient/(mean+count)};};
  const regions={top:energy(900,24,200,30),middle:energy(900,440,200,50),bottom:energy(900,836,200,22)};
  check(intercepts.length>0&&intercepts.length<=state.artwork.capacity+3&&intercepts.length<catalogCount,'glass fixture supplies provenance-tracked high-frequency images only for the visible artwork window and wallpaper');
  check(regions.middle.normalized>.05&&regions.top.normalized<regions.middle.normalized*.2,'header background removes high-frequency detail while the central wallpaper remains sharp');
  check(regions.bottom.normalized<regions.middle.normalized*.2,'lower wallpaper has a genuine Gaussian blur rather than only a dark translucent fill');
  const band=(x,y,width,height)=>{let total=0;for(let row=y;row<y+height;row++)for(let column=x;column<x+width;column++)total+=light(column,row);return total/(width*height);};
  const cards=state.nodes.filter(n=>n.id.startsWith('game-')&&n.rect.x>=state.shelf.x&&n.rect.x+n.rect.width<=state.shelf.x+state.shelf.width),first=cards[0].rect,last=cards.at(-1).rect;
  const leftFade=band(Math.ceil(first.x+5),Math.ceil(first.y+35),7,50),leftSolid=band(Math.ceil(first.x+70),Math.ceil(first.y+35),7,50);
  const rightFade=band(Math.floor(last.x+last.width-12),Math.ceil(last.y+35),7,50),rightSolid=band(Math.floor(last.x+last.width-75),Math.ceil(last.y+35),7,50);
  check(leftSolid-leftFade>25&&rightSolid-rightFade>25,'both carousel edges progressively fade real card pixels into the wallpaper');
  const icon=state.nodes.find(n=>n.id==='view-all').rect,sharpInk={peakGreen:0,edgeContrast:0};
  for(let y=Math.ceil(icon.y);y<icon.y+icon.height-1;y++)for(let x=Math.ceil(icon.x);x<icon.x+icon.width-1;x++){
    const offset=(y*pixels.width+x)*4;sharpInk.peakGreen=Math.max(sharpInk.peakGreen,pixels.data[offset+1]);
    sharpInk.edgeContrast=Math.max(sharpInk.edgeContrast,Math.abs(pixels.data[offset+1]-pixels.data[offset+5]));
  }
  check(sharpInk.peakGreen>200&&sharpInk.edgeContrast>60,'native mint navigation glyphs retain bright pixels and sharp one-pixel edges above the frosted background');
  const gpu=state.backdrop.gpu;await delay(600);
  check(await evaluate(`__gameOS.backdrop.gpu.blurBuilds===${gpu.blurBuilds}&&__gameOS.backdrop.gpu.uploads===${gpu.uploads}`),'unchanged wallpaper reuses its blur without extra background renders or uploads');
  writeFileSync(resolve(output,'lobby-glass-metrics.json'),JSON.stringify({regions,leftFade,leftSolid,rightFade,rightSolid,sharpInk,gpu,fixtureSha256:createHash('sha256').update(fixture).digest('hex')},null,2));
  await cdp.call('Fetch.disable');
});

await run('lobby-artwork','site/index.html',{verify:1},async(context)=>{
  const {evaluate,until,check,cdp}=context,requests=[];
  await cdp.call('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await cdp.call('Network.enable');await cdp.call('Network.setCacheDisabled',{cacheDisabled:true});
  cdp.on('Network.requestWillBeSent',event=>{if(event.request.url.includes('/screenshots/'))requests.push(event.request.url);});
  await cdp.call('Page.reload');await until(`__gameOS?.games.length===${catalogCount}&&__gameOS.artwork.cards.length>0&&__gameOS.artwork.pending===0&&__gameOS.artwork.cards.every(card=>card.ready)`,'cold visible artwork window');
  const initial=await evaluate('__gameOS'),gpuInitial=await evaluate('__previewTextures');
  check(new Set(requests).size===initial.artwork.sourceCount&&requests.length<catalogCount,'cold load requests only the visible previews, overscan and selected wallpaper');
  check(initial.artwork.capacity===9&&gpuInitial.live<=9&&gpuInitial.created===initial.artwork.slots,'actual WebGPU texture allocation follows the 1440px viewport budget');
  check(gpuInitial.sizes.every(([width,height])=>width===512&&height===320),'HD source artwork is downsampled into reusable 512 by 320 card textures');
  const shelf=initial.shelf,point={x:shelf.x+shelf.width/2,y:shelf.y+shelf.height/2};
  for(let step=0;step<8;step++){
    await cdp.call('Input.dispatchMouseEvent',{type:'mouseWheel',...point,deltaX:900,deltaY:0});
    await until('!__gameOS.shelf.animating','artwork scroll settles');
    await until('__gameOS.artwork.pending===0&&__gameOS.artwork.cards.every(card=>card.ready)','new visible previews ready');
    const state=await evaluate('__gameOS'),gpu=await evaluate('__previewTextures');
    check(gpu.created<=initial.artwork.capacity&&gpu.live<=state.artwork.capacity&&state.artwork.sourceCount<=state.artwork.capacity+3&&state.artwork.inFlight<=2,`scroll ${step+1} reuses textures and evicts decoded off-screen images`);
    const visible=state.nodes.filter(node=>node.id.startsWith('game-')&&node.rect.x<state.shelf.x+state.shelf.width&&node.rect.x+node.rect.width>state.shelf.x).map(node=>node.id.slice(5));
    check(visible.every(id=>state.artwork.cards.some(card=>card.id===id&&card.ready)),`scroll ${step+1} covers every intersecting card`);
  }
  check(new Set(requests).size===catalogCount,'scrolling through the full carousel eventually loads every real preview');
  const end=await evaluate('__gameOS');check(end.artwork.sourceCount<catalogCount/2,'decoded artwork cache does not retain the catalogue after browsing it');
  const idle=await evaluate('({gpu:__previewTextures.created,uploads:__gameOS.artwork.uploads,requests:__gameOS.artwork.requests})');await delay(500);
  check(await evaluate(`__previewTextures.created===${idle.gpu}&&__gameOS.artwork.uploads===${idle.uploads}&&__gameOS.artwork.requests===${idle.requests}`),'idle carousel performs no allocations, uploads or repeated requests');
  await cdp.call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await until('__gameOS.artwork.capacity===5&&__gameOS.artwork.pending===0&&__gameOS.artwork.retired===0','mobile artwork budget');
  check(await evaluate('__previewTextures.live<=5&&__gameOS.artwork.sourceCount<=8'),'viewport shrink retires excess GPU slots and decoded images');
  await clickDesktop(context,'view-favorites');await until('__gameOS.games.length===0&&__previewTextures.live===0&&__gameOS.artwork.pending===0','empty filtered artwork window');
  check(await evaluate('__gameOS.artwork.slots===0&&__gameOS.artwork.sourceCount<=3'),'empty carousel releases every card texture while retaining the wallpaper');
  await clickDesktop(context,'view-all');await until('__gameOS.artwork.cards.length>0&&__gameOS.artwork.pending===0&&__gameOS.artwork.cards.every(card=>card.ready)','artwork restored after filter');
  check(await evaluate('__previewTextures.live<=5'),'returning to all games rebuilds only the mobile-sized pool');
  const final=await evaluate('({artwork:__gameOS.artwork,gpu:__previewTextures})');
  writeFileSync(resolve(output,'lobby-artwork-metrics.json'),JSON.stringify({initial:initial.artwork,gpuInitial,end:end.artwork,final,requests},null,2));
});

await run('lobby-artwork-races','site/index.html',{verify:1},async(context)=>{
  const {evaluate,until,check,cdp}=context,held=[],served=[];
  let hold=true,breakUrl='',broken=false;
  const fulfill=async event=>{
    const path=new URL(event.request.url).pathname.replace(/^\//,''),bytes=readFileSync(resolve(root,path));
    const corrupt=event.request.url===breakUrl&&!broken;if(corrupt)broken=true;
    served.push({path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),corrupt});
    try{await cdp.call('Fetch.fulfillRequest',{requestId:event.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:path.endsWith('.webp')?'image/webp':'image/png'},{name:'Cache-Control',value:'no-store'}],body:(corrupt?Buffer.from('deliberately invalid image fixture'):bytes).toString('base64')});}
    catch(error){if(!/Invalid InterceptionId|Invalid interceptionId|Invalid requestId/i.test(String(error)))throw error;}
  };
  const errors=[];
  cdp.on('Fetch.requestPaused',event=>{if(hold)held.push(event);else void fulfill(event).catch(error=>errors.push(String(error)));});
  await cdp.call('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await cdp.call('Network.enable');await cdp.call('Network.setCacheDisabled',{cacheDisabled:true});
  await cdp.call('Fetch.enable',{patterns:[{urlPattern:'*/screenshots/*',requestStage:'Request'}]});
  await cdp.call('Page.reload');await until(`__gameOS?.games.length===${catalogCount}&&__gameOS.artwork.inFlight===2`,'two held image requests');
  check(held.length===2,'cold image loading starts only two concurrent requests');
  const first=await evaluate('__gameOS'),point={x:first.shelf.x+first.shelf.width/2,y:first.shelf.y+first.shelf.height/2};
  breakUrl=held[1].request.url;
  await cdp.call('Input.dispatchMouseEvent',{type:'mouseWheel',...point,deltaX:6500,deltaY:0});
  await until('!__gameOS.shelf.animating&&__gameOS.shelf.scrollX>5000&&__gameOS.artwork.cancelled>0','fling evicts pending off-screen loads');
  check(await evaluate('__gameOS.artwork.inFlight<=2&&__gameOS.artwork.sourceCount<=__gameOS.artwork.capacity+3'),'rapid scroll keeps pending loads and source cache bounded');
  // Return old responses in reverse order after their cards have left the resident window.
  hold=false;for(const event of [...held].reverse())await fulfill(event);
  await until('__gameOS.artwork.pending===0&&__gameOS.artwork.cards.every(card=>card.ready)&&!__gameOS.backdrop.waiting','late image responses reconciled');
  const after=await evaluate('__gameOS');
  check(after.artwork.cards.every(card=>after.nodes.find(node=>node.id==='game-'+card.id).rect.x>0||!card.visible),'late responses leave textures assigned to the current visible window');
  check(await evaluate('__previewTextures.created<=__gameOS.artwork.capacity'),'rapid request replacement still reuses the original GPU texture pool');
  // A bad image must settle on the card placeholder without a per-frame retry loop.
  broken=false;
  await cdp.call('Input.dispatchMouseEvent',{type:'mouseWheel',...point,deltaX:-6500,deltaY:0});
  await until('__gameOS.shelf.scrollX<1&&!__gameOS.shelf.animating&&__gameOS.artwork.pending===0&&__gameOS.artwork.failed.length===1','broken preview settles');
  const failed=await evaluate('__gameOS.artwork');await delay(500);
  check(await evaluate(`__gameOS.artwork.requests===${failed.requests}&&__gameOS.artwork.failed.length===1`),'image decode failure does not spin or repeatedly request the broken preview');
  await cdp.call('Input.dispatchMouseEvent',{type:'mouseWheel',...point,deltaX:6500,deltaY:0});
  await until('__gameOS.shelf.scrollX>5000&&!__gameOS.shelf.animating&&__gameOS.artwork.pending===0','broken preview leaves the window');
  await cdp.call('Input.dispatchMouseEvent',{type:'mouseWheel',...point,deltaX:-6500,deltaY:0});
  await until('__gameOS.shelf.scrollX<1&&!__gameOS.shelf.animating&&__gameOS.artwork.pending===0&&__gameOS.artwork.cards.every(card=>card.ready)','preview retries after leaving and re-entering the window');
  check(await evaluate('__gameOS.artwork.failed.length===0'),'returning to a previously failed card recovers its real preview');
  check(errors.length===0,'request interception completed without unexpected errors');
  const shot=await cdp.call('Page.captureScreenshot',{format:'png'});writeFileSync(resolve(output,'lobby-artwork-races-before-dispose.png'),Buffer.from(shot.result.data,'base64'));
  const beforeDispose=await evaluate('({artwork:__gameOS.artwork,gpu:__previewTextures})');
  await evaluate('dispatchEvent(new PageTransitionEvent("pagehide",{persisted:false}))');
  await until('__previewTextures.live===0','artwork pool disposal');
  check(await evaluate('__gameOS.artwork.slots===0&&__gameOS.artwork.sourceCount===0'),'destroy clears every preview texture and image callback');
  writeFileSync(resolve(output,'lobby-artwork-races-metrics.json'),JSON.stringify({held:held.map(event=>event.request.url),after:after.artwork,beforeDispose,served},null,2));
  await cdp.call('Fetch.disable');
});

await run('lobby-os','site/index.html',{verify:1},async(context)=>{
  const {evaluate,until,pads,press,check,cdp}=context;
  await cdp.call('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await until(`__gameOS?.games.length===${catalogCount}&&__gameOS.frames>5`,'desktop initialized');await pads();
  check(await evaluate('document.querySelectorAll("canvas").length===1&&!document.querySelector("button,nav,header,main,dialog,svg,hy-notification")'),'one canvas with no hidden DOM interface');
  check(await evaluate('__gameOS.nodes.every(node=>!["sidebar","edition","context","status","nav-caption","sidebar-note","sidebar-help","input-status"].includes(node.id))'),'desktop omits the sidebar, edition and auxiliary labels');
  check(await evaluate('["brand-logo","brand"].every(id=>__gameOS.nodes.some(node=>node.id===id&&node.type==="GuiImage"))'),'crescent logo and glass wordmark use native GUI artwork');
  check(await evaluate('["view-all","view-favorites","devices"].every(id=>{const node=__gameOS.nodes.find(node=>node.id===id);return node?.type==="GuiButton"&&node.text===""&&node.rect.y<78})'),'three icon controls live in the top bar');
  check(await evaluate('__gameOS.nodes.every(node=>!["collection-title","visible-count"].includes(node.id)&&!node.id.startsWith("category-"))'),'carousel has no list heading, game count or category filters');
  check(await evaluate('__gameOS.shelf.y>innerHeight*.65&&__gameOS.nodes.find(n=>n.id==="game-"+__gameOS.games[0]).rect.width===200'),'smaller desktop cards sit near the bottom edge');
  const first=await evaluate('__gameOS.selected');await press(15);
  check(await evaluate('__gameOS.selected')!==first,'controller updates native featured game');
  await press(2);check(await evaluate('__gameOS.favorites')===1,'X favorites current game');
  await press(3);check(await evaluate('__gameOS.view==="recent"&&__gameOS.games.length===0'),'Y opens actual empty history');
  await press(3);check(await evaluate('__gameOS.view==="favorites"&&__gameOS.games.length===1'),'Y opens favorites');
  await press(2);check(await evaluate('__gameOS.games.length')===0,'last favorite removal shows native empty state');
  await press(5);check(await evaluate('__gameOS.games.length===0&&__gameOS.category==="all"'),'shoulder navigation preserves an empty view without applying hidden filters');
  await clickDesktop(context,'view-all');await clickDesktop(context,'search-toggle');
  await cdp.call('Input.insertText',{text:'铁甲'});await delay(200);
  check(await evaluate('__gameOS.editing&&__gameOS.games.length===1&&__gameOS.games[0]==="tank-battle"'),'native search supports Chinese text while idle gamepad preserves focus');
  check(await evaluate('!document.querySelector("input:not([data-haiyue-text-input]),textarea:not([data-haiyue-text-input])")'),'only Engine-owned invisible IME responder exists');
  await desktopKey(cdp,'Escape','Escape',27);
  check(await evaluate('__gameOS.games.length')===catalogCount,'Escape clears native search');
  await desktopKey(cdp,'ArrowRight','ArrowRight',39);
  check(await evaluate('__gameOS.selected')!==first,'keyboard navigation selects native cards');
  await clickDesktop(context,'favorite');
  await clickDesktop(context,'game-2048');
  await until('__gameHost.id==="2048"&&__gameHost.phase==="playing"','game module mounted');
  await desktopKey(cdp,'Escape','Escape',27);
  await until('!__gameHost.mounted&&__gameOS.running','Escape returns to desktop');
  await until('__gameOS.focused==="game-2048"','native focus after returning to desktop');
  check(await evaluate('__gameOS.focused')==='game-2048','return restores native focus');
  await press(3);
  check(await evaluate('__gameOS.games.length===1&&__gameOS.games[0]==="2048"'),'history contains launched games only');
  await cdp.call('Page.reload');await until(`__gameOS?.games.length===${catalogCount}&&__gameOS.frames>3`,'reloaded native desktop');
  check(await evaluate('__gameOS.favorites')===1,'favorites persist');
  await pads();await press(3);check(await evaluate('__gameOS.games[0]')==='2048','history persists');
  await clickDesktop(context,'view-all');await pads([]);await delay(300);
  const capture=async()=>Buffer.from((await cdp.call('Page.captureScreenshot',{format:'png'})).result.data,'base64');
  await until('!!__gameOS.backdrop.current&&!__gameOS.backdrop.transitioning&&!__gameOS.shelf.animating','selected game backdrop and carousel settle');
  const idleGpu=await evaluate('__gameOS.backdrop.gpu');
  const firstImage=await capture();await delay(700);
  const idle=comparePortablePixelRecords(createPortablePixelRecord(firstImage),createPortablePixelRecord(await capture()));
  check(idle.meanAbsoluteError<.1,'selected game background is still while idle, with no animated shader');
  check(await evaluate(`__gameOS.backdrop.gpu.draws===${idleGpu.draws}&&__gameOS.backdrop.gpu.uploads===${idleGpu.uploads}&&__gameOS.backdrop.gpu.blurBuilds===${idleGpu.blurBuilds}`),'idle wallpaper performs no transition draws, blur rebuilds or image uploads');
  await desktopKey(cdp,'ArrowRight','ArrowRight',39);
  await until('__gameOS.backdrop.transitioning&&__gameOS.backdrop.progress>.35&&__gameOS.backdrop.progress<.7','horizontal zoom intermediate frame');
  const midpoint=await evaluate('__gameOS.backdrop'), middleImage=await capture();
  await until('!__gameOS.backdrop.transitioning&&__gameOS.backdrop.current===__gameOS.backdrop.requested','crossfade completes');
  const nextImage=await capture();
  const changed=comparePortablePixelRecords(createPortablePixelRecord(firstImage),createPortablePixelRecord(nextImage));
  writeFileSync(resolve(output,'lobby-wallpaper-a.png'),firstImage);writeFileSync(resolve(output,'lobby-wallpaper-mid.png'),middleImage);writeFileSync(resolve(output,'lobby-wallpaper-b.png'),nextImage);
  writeFileSync(resolve(output,'lobby-wallpaper-diagnostic.json'),JSON.stringify({changed,midpoint,final:await evaluate('__gameOS.backdrop')},null,2));
  check(changed.meanAbsoluteError>1.5&&changed.changedChannelRatio>.05,'selecting another game visibly replaces the full screen backdrop');
  const [before,middle,after]=[firstImage,middleImage,nextImage].map(decodePng);
  // Compare real GPU pixels against the supplied formula using independently decoded source images.
  // These points lie below the hero controls and above the lower glass region.
  const measurements=[];
  for(let y=430;y<=570;y+=35)for(let x=80;x<1400;x+=64){
    const offset=(y*before.width+x)*4;
    measurements.push({p:[(x+.5)/before.width,(y+.5)/before.height],before:[...before.data.slice(offset,offset+3)],middle:[...middle.data.slice(offset,offset+3)],after:[...after.data.slice(offset,offset+3)]});
  }
  const zoom=await evaluate(`(async()=>{
    const observations=${JSON.stringify(measurements)},urls=${JSON.stringify([midpoint.current,midpoint.incoming])},aspect=${before.width/before.height};
    const images=await Promise.all(urls.map(async url=>{const image=new Image();image.src=url;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const c=canvas.getContext('2d');c.drawImage(image,0,0);return {width:canvas.width,height:canvas.height,data:c.getImageData(0,0,canvas.width,canvas.height).data};}));
    function sample(image,p){const ratio=image.width/image.height,w=Math.min(1,aspect/ratio),h=Math.min(1,ratio/aspect);
      const x=Math.max(0,Math.min(image.width-1,((1-w)/2+p[0]*w)*image.width-.5)),y=Math.max(0,Math.min(image.height-1,((1-h)/2+p[1]*h)*image.height-.5));
      const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;return [0,1,2].map(channel=>{const at=(column,row)=>image.data[(Math.min(row,image.height-1)*image.width+Math.min(column,image.width-1))*4+channel];return (at(ix,iy)*(1-fx)+at(ix+1,iy)*fx)*(1-fy)+(at(ix,iy+1)*(1-fx)+at(ix+1,iy+1)*fx)*fy;});
    }
    const shade=[3,9,20];let referenceError=0;
    const points=observations.map(point=>{const colors=images.map(image=>sample(image,point.p));let numerator=0,denominator=0;
      colors.forEach((color,index)=>color.forEach((value,channel)=>{const d=value-shade[channel];numerator+=d*(point[index?'after':'before'][channel]-shade[channel]);denominator+=d*d;}));
      const opacity=Math.max(0,Math.min(1,numerator/Math.max(1,denominator)));
      colors.forEach((color,index)=>color.forEach((value,channel)=>{referenceError+=Math.abs(opacity*value+(1-opacity)*shade[channel]-point[index?'after':'before'][channel]);}));
      return {...point,opacity,colors};});
    const smooth=value=>{const t=Math.max(0,Math.min(1,value));return t*t*(3-2*t);};
    function error(progress,mode){let difference=0;for(const point of points){const x=smooth(mode==='uniform'?progress:progress*2+point.p[0]-1);
      const a=mode==='fade'?point.colors[0]:sample(images[0],point.p.map(value=>(value-.5)*(1-x)+.5));
      const b=mode==='fade'?point.colors[1]:sample(images[1],point.p.map(value=>(value-.5)*x+.5));
      for(let channel=0;channel<3;channel++)difference+=Math.abs(point.opacity*(a[channel]*(1-x)+b[channel]*x)+(1-point.opacity)*shade[channel]-point.middle[channel]);
    }return difference/(points.length*3);}
    const best={zoom:{error:Infinity},fade:{error:Infinity},uniform:{error:Infinity}};
    // Screenshot presentation can lag the JS snapshot by a few frames; fit only this small time window.
    for(let t=Math.max(0,${midpoint.progress}-.15);t<=Math.min(1,${midpoint.progress}+.15);t+=.005)for(const mode of ['zoom','fade','uniform']){const value=error(t,mode);if(value<best[mode].error)best[mode]={error:value,progress:t};}
    return {referenceError:referenceError/(points.length*6),samples:points.length,best};
  })()`);
  const blend={progress:midpoint.progress,...zoom,gpu:midpoint.gpu};
  writeFileSync(resolve(output,'lobby-wallpaper-zoom.json'),JSON.stringify(blend,null,2));
  check(midpoint.effect==='horizontal-zoom'&&zoom.referenceError<4&&zoom.best.zoom.error<5.5,'real GPU background pixels match the supplied position-dependent zoom formula');
  check(zoom.best.zoom.error<zoom.best.fade.error*.6&&zoom.best.zoom.error<zoom.best.uniform.error*.6,'GPU transition zooms both image coordinates and advances by horizontal position rather than using a plain fade or uniform zoom');
  check(await evaluate('["wallpaper-a","wallpaper-shade"].every(id=>{const rect=__gameOS.nodes.find(node=>node.id===id).rect;return rect.x===0&&rect.y===0&&rect.width===innerWidth&&rect.height===innerHeight})'),'game image and readability shade cover the entire canvas');
  writeFileSync(resolve(output,'lobby-wallpaper-a.png'),firstImage);writeFileSync(resolve(output,'lobby-wallpaper-mid.png'),middleImage);writeFileSync(resolve(output,'lobby-wallpaper-b.png'),nextImage);
  for(let index=0;index<4;index++)await desktopKey(cdp,'ArrowRight','ArrowRight',39);
  await until('!__gameOS.backdrop.transitioning&&__gameOS.backdrop.current===__gameOS.backdrop.requested','latest rapid selection wins');
  const finalSelection=await evaluate('__gameOS.selected'), finalBackdrop=await evaluate('__gameOS.backdrop');
  check(!finalBackdrop.waiting&&finalBackdrop.current.endsWith('/'+catalog.find(game=>game.id===finalSelection).thumbnail),'rapid selections settle on the latest selected game picture');
  await delay(100);
  // Six retained textures: shade, sharp output, small input, blurred output, glass composite and current image.
  check(await evaluate('__gameOS.backdrop.gpu.liveTextures<=6'),'rapid transitions reuse their glass textures and release obsolete image textures without a noise texture');
  await cdp.call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await delay(250);
  const reducedGpu=await evaluate('__gameOS.backdrop.gpu');
  await desktopKey(cdp,'ArrowRight','ArrowRight',39);await delay(100);
  check(await evaluate('!__gameOS.backdrop.transitioning&&__gameOS.backdrop.current===__gameOS.backdrop.requested'),'reduced motion changes game images immediately');
  check(await evaluate(`__gameOS.backdrop.gpu.draws===${reducedGpu.draws}&&__gameOS.backdrop.gpu.uploads<=${reducedGpu.uploads+1}`),'reduced motion skips zoom and only uploads the new image once for its static glass background');
  await until('__gameOS.notices.length===0&&!__gameOS.shelf.animating','temporary notices and carousel settle before the still comparison');
  const still=await capture();await delay(500);
  const reduced=comparePortablePixelRecords(createPortablePixelRecord(still),createPortablePixelRecord(await capture()));
  check(await evaluate('!__gameOS.motion')&&reduced.meanAbsoluteError<.1,'reduced motion keeps the selected game background still');
  await cdp.call('Emulation.setEmulatedMedia',{features:[]});
  writeFileSync(resolve(output,'lobby-wallpaper-metrics.json'),JSON.stringify({idle,changed:{...changed,status:'passed',comparison:'expected-difference'},blend,reduced},null,2));
});

await run('lobby-settings','site/index.html',{verify:1},async(context)=>{
  const {evaluate,until,check,cdp,pads,press}=context;
  await cdp.call('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await until('__gameOS?.ready&&__gameOS.logo.loaded','supplied brand artwork');
  const expectedLogo=createHash('sha256').update(readFileSync(resolve(root,'site/assets/haiyue-logo.png'))).digest('hex');
  check(await evaluate(`(async()=>{const icon=document.querySelector('link[rel="icon"]');const bytes=await(await fetch(icon.href)).arrayBuffer();const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');return icon.href===__gameOS.logo.url&&hash===${JSON.stringify(expectedLogo)};})()`),'native logo and favicon use the exact same supplied PNG bytes');
  check(await evaluate('__gameOS.nodes.some(n=>n.id==="search-toggle")&&!__gameOS.nodes.some(n=>n.id==="search")&&!__gameOS.searchExpanded'),'search initially shows only its icon on desktop');
  await until('__gameOS.backdrop.current&&!__gameOS.backdrop.transitioning&&__gameOS.backdrop.gpu.blurBuilds>0','stable search background');
  const searchIcon=await evaluate('__gameOS.nodes.find(n=>n.id==="search-toggle").rect');
  const collapsedSearchImage=decodePng(Buffer.from((await cdp.call('Page.captureScreenshot',{format:'png'})).result.data,'base64'));
  await cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:searchIcon.x+searchIcon.width/2,y:searchIcon.y+searchIcon.height/2,button:'none',buttons:0});
  await until('__gameOS.searchReveal===1','search hover expansion');
  check(await evaluate('(()=>{const input=__gameOS.nodes.find(n=>n.id==="search");return input.rect.x>innerWidth/2&&input.rect.y+input.rect.height<78&&input.backgroundColor==="transparent"&&input.borderColor==="transparent"&&!__gameOS.editing})()'),'hover expands a transparent top-right search without stealing keyboard focus');
  const hoverSearch=await evaluate('__gameOS.nodes.find(n=>n.id==="search").rect');
  await cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:hoverSearch.x+hoverSearch.width/2,y:hoverSearch.y+hoverSearch.height/2,button:'none',buttons:0});await delay(350);
  check(await evaluate('__gameOS.searchExpanded&&__gameOS.searchReveal===1'),'moving from the search icon into the field keeps it open');
  const searchImage=await cdp.call('Page.captureScreenshot',{format:'png'}),expandedSearchBytes=Buffer.from(searchImage.result.data,'base64');writeFileSync(resolve(output,'lobby-search-expanded.png'),expandedSearchBytes);
  writeFileSync(resolve(output,'lobby-search-expanded.json'),JSON.stringify(await evaluate('__gameOS'),null,2));
  const expandedSearchImage=decodePng(expandedSearchBytes);let searchInk=0;
  for(let y=Math.ceil(hoverSearch.y+4);y<hoverSearch.y+hoverSearch.height-4;y++)for(let x=Math.ceil(hoverSearch.x+6);x<hoverSearch.x+130;x++){
    const offset=(y*expandedSearchImage.width+x)*4;
    if(expandedSearchImage.data[offset]>collapsedSearchImage.data[offset]+30&&expandedSearchImage.data[offset+1]>collapsedSearchImage.data[offset+1]+30)searchInk++;
  }
  check(hoverSearch.width===220&&searchInk>40,'expanded search displays readable placeholder pixels across its full input width');
  let counterInk=0;
  for(let y=Math.ceil(hoverSearch.y+4);y<hoverSearch.y+hoverSearch.height-4;y++)for(let x=Math.ceil(hoverSearch.x+hoverSearch.width-46);x<hoverSearch.x+hoverSearch.width-8;x++){
    const offset=(y*expandedSearchImage.width+x)*4;
    if(expandedSearchImage.data[offset]>collapsedSearchImage.data[offset]+30&&expandedSearchImage.data[offset+1]>collapsedSearchImage.data[offset+1]+30)counterInk++;
  }
  check(counterInk<3,'expanded search has no character-limit counter on its right edge');
  await cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:10,y:150,button:'none',buttons:0});
  await until('__gameOS.searchReveal===0&&!__gameOS.nodes.some(n=>n.id==="search")','empty search collapses after leaving');
  check(await evaluate('__gameOS.shelf.axis==="horizontal"&&__gameOS.shelf.contentWidth>innerWidth&&__gameOS.shelf.scrollY===0'),'all games use a single native horizontal viewport');
  await desktopKey(cdp,'End','End',35);await until('!__gameOS.shelf.animating','last game scrolls into view');
  check(await evaluate('(()=>{const state=__gameOS,card=state.nodes.find(n=>n.id==="game-"+state.selected).rect,s=state.shelf;return card.x>=s.x-1&&card.x+card.width<=s.x+s.width+1})()'),'keyboard End fully reveals the final carousel card');
  await desktopKey(cdp,'Home','Home',36);await until('!__gameOS.shelf.animating','first carousel card');
  await clickDesktop(context,'carousel-next');await until('!__gameOS.shelf.animating','next carousel game');
  check(await evaluate('__gameOS.selected===__gameOS.games[1]'),'next arrow selects the adjacent game and updates its backdrop');
  const selected=await evaluate('__gameOS.selected');
  await clickDesktop(context,'settings');await until('__gameOS.settingsOpen&&__gameOS.nodes.find(n=>n.id==="settings-effects").rect.width>0','native settings dialog');
  check(await evaluate('!document.querySelector("button,dialog,select")'),'settings switches and modal create no DOM controls');
  await pads();await press(2);await press(3);await press(5);
  check(await evaluate(`__gameOS.selected===${JSON.stringify(selected)}&&__gameOS.favorites===0&&__gameOS.view==="all"&&__gameOS.category==="all"`),'settings modal blocks underlying controller favorites, views and categories');
  await clickDesktop(context,'settings-effects');
  check(await evaluate('!haiyueGameOS.audio.preferences.effects&&haiyueGameOS.audio.preferences.music&&__gameOS.nodes.find(n=>n.id==="settings-effects").checked===false'),'sound effects switch changes only the effects preference');
  await clickDesktop(context,'settings-music');await until('!haiyueGameOS.audio.music','background loop stops');
  check(await evaluate('!haiyueGameOS.audio.preferences.effects&&!haiyueGameOS.audio.preferences.music'),'music can be disabled independently');
  await clickDesktop(context,'settings-effects');
  check(await evaluate('haiyueGameOS.audio.preferences.effects&&!haiyueGameOS.audio.preferences.music'),'effects can run while background music remains disabled');
  await press(1);await until('!__gameOS.settingsOpen','controller B closes settings');
  check(await evaluate(`__gameOS.selected===${JSON.stringify(selected)}&&!__gameHost.route.game`),'closing settings preserves the selected game without launching it');
  await cdp.call('Page.reload');await until('__gameOS?.ready','stored settings after reload');
  check(await evaluate('haiyueGameOS.audio.preferences.effects&&!haiyueGameOS.audio.preferences.music&&!haiyueGameOS.audio.unlocked'),'independent settings persist without automatic audio playback');
  for(const [width,height]of[[1440,900],[390,844],[844,390],[320,568]]){
    await cdp.call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600});await delay(200);
    await evaluate(`window.__desktopPointerLog=[];if(!window.__pointerLogInstalled){window.__pointerLogInstalled=true;for(const type of ['pointerdown','pointerup','click'])window.addEventListener(type,event=>window.__desktopPointerLog.push({type,x:event.clientX,y:event.clientY,target:event.target?.id}),true);}`);
    await clickDesktop(context,'search-toggle');await until('__gameOS.editing','header search');await cdp.call('Input.insertText',{text:'铁甲'});await delay(150);check(await evaluate('__gameOS.games.length===1&&__gameOS.games[0]==="tank-battle"'),`${width} icon search filters real games`);await desktopKey(cdp,'Escape','Escape',27);
    await clickDesktop(context,'settings');await until('__gameOS.settingsOpen','settings reopens');
    check(await evaluate('__gameOS.nodes.filter(n=>["settings-close","settings-effects","settings-music"].includes(n.id)).every(n=>n.rect.x>=0&&n.rect.y>=0&&n.rect.x+n.rect.width<=innerWidth&&n.rect.y+n.rect.height<=innerHeight)'),`${width} settings controls remain inside the canvas`);
    const image=await cdp.call('Page.captureScreenshot',{format:'png'});writeFileSync(resolve(output,`lobby-settings-${width}.png`),Buffer.from(image.result.data,'base64'));
    await desktopKey(cdp,'Escape','Escape',27);check(await evaluate('!__gameOS.settingsOpen'),`${width} Escape closes the modal`);
  }
});

await run('lobby-mobile','site/index.html',{verify:1},async(context)=>{
  const {evaluate,until,check,cdp}=context;
  await until(`__gameOS?.games.length===${catalogCount}&&__gameOS.frames>2`,'mobile catalog');
  for(const [width,height]of[[390,844],[844,390],[640,360],[320,568]]){
    await cdp.call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});await delay(250);
    check(await evaluate('document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight'),`${width}x${height} no DOM overflow`);
    check(await evaluate('__gameOS.shelf.height>=60'),`${width}x${height} usable native scroll shelf`);
    check(await evaluate('["brand-logo","brand","view-all","view-favorites","devices","search-toggle","settings"].every(id=>{const rect=__gameOS.nodes.find(node=>node.id===id).rect;return rect.x>=0&&rect.x+rect.width<=innerWidth&&rect.y+rect.height<=(innerWidth<600?112:62)})'),`${width}x${height} top bar artwork and icons stay inside the viewport`);
    check(await evaluate('(()=>{const button=__gameOS.nodes.find(node=>node.id==="play").rect,hero=__gameOS.hero;return button.x>=hero.x&&button.y>=hero.y&&button.x+button.width<=hero.x+hero.width&&button.y+button.height<=hero.y+hero.height})()'),`${width}x${height} launch control fits preview`);
    check(await evaluate('(()=>{const title=__gameOS.nodes.find(node=>node.id==="hero-title").rect,play=__gameOS.nodes.find(node=>node.id==="play").rect;return title.y+title.height<=play.y})()'),`${width}x${height} game title and launch row do not overlap`);
    await clickDesktop(context,'view-favorites');check(await evaluate('__gameOS.view==="favorites"&&__gameOS.games.length===0'),`${width}x${height} native empty favorites`);
    await clickDesktop(context,'empty-reset');check(await evaluate('__gameOS.games.length')===catalogCount,`${width}x${height} browse all button works`);
    const shelf=await evaluate('__gameOS.shelf');
    await cdp.call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:shelf.x+shelf.width*.8,y:shelf.y+shelf.height/2,id:0}]});
    await cdp.call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:shelf.x+shelf.width*.2,y:shelf.y+shelf.height/2,id:0}]});
    await cdp.call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await delay(200);
    check(await evaluate('__gameOS.shelf.scrollX>0&&__gameOS.shelf.scrollY===0'),`${width}x${height} touch scroll uses the native horizontal axis`);
    await clickDesktop(context,'view-all');
    const shot=await cdp.call('Page.captureScreenshot',{format:'png'});writeFileSync(resolve(output,`lobby-${width}x${height}.png`),Buffer.from(shot.result.data,'base64'));
  }
});

await run('lobby-cards','site/index.html',{verify:1},async(context)=>{
  const {evaluate,until,check,cdp}=context;
  await cdp.call('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await until(`__gameOS?.games.length===${catalogCount}&&__gameOS.frames>5`,'image-only card catalog');
  await until('__gameOS.artwork.pending===0&&__gameOS.artwork.cards.every(card=>card.ready)','initial visible artwork');
  await delay(400);
  const snapshot=()=>evaluate('__gameOS'), capture=async(name)=>{
    const bytes=Buffer.from((await cdp.call('Page.captureScreenshot',{format:'png'})).result.data,'base64');
    if(name)writeFileSync(resolve(output,name+'.png'),bytes);return bytes;
  };
  const initial=await snapshot(), first=initial.games[0], second=initial.games[1];
  check(initial.nodes.filter(node=>node.id.startsWith('game-')).length<=initial.artwork.capacity+1,'only the artwork window and keyboard selection belong to the live GUI tree');
  const details=state=>state.nodes.filter(node=>state.games.some(game=>['caption','title','genre','dimension','input','glow'].some(prefix=>node.id===`${prefix}-${game}`)));
  check(!initial.selectionActive&&details(initial).length===0,'initial cards contain preview images without metadata or glow');
  await until('!!__gameOS.backdrop.current&&!__gameOS.backdrop.transitioning','initial card wallpaper');
  const defaultImage=await capture('lobby-cards-default');let restingPixels=decodePng(defaultImage);
  const secondCard=initial.nodes.find(node=>node.id==='game-'+second).rect;
  check(initial.nodes.find(node=>node.id==='game-'+second).button.radius>16,'carousel cards use a larger corner radius');
  const brightness=(x,y)=>{const offset=(Math.floor(y)*restingPixels.width+Math.floor(x))*4;return (restingPixels.data[offset]+restingPixels.data[offset+1]+restingPixels.data[offset+2])/3;};
  check(brightness(secondCard.x+28,secondCard.y+4)-brightness(secondCard.x+3,secondCard.y+3)>80,'real thumbnail pixels have transparent rounded corners rather than a square cover hiding the card radius');
  await cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:secondCard.x+secondCard.width/2,y:secondCard.y+secondCard.height/2,button:'none',buttons:0});
  await until(`__gameOS.previewGame==='${second}'&&__gameOS.backdrop.transitioning`,'hover immediately starts the wallpaper crossfade');
  await until(`__gameOS.nodes.some(node=>node.id==='title-${second}')`,'hover card caption');await delay(300);
  await until(`__gameOS.hoverCards.some(card=>card.id==='${second}'&&card.amount>.99)`,'hover card reaches its raised pose');
  let state=await snapshot();
  check(state.nodes.some(node=>node.id==='genre-'+second)&&state.nodes.some(node=>node.id==='dimension-'+second)&&state.nodes.some(node=>node.id==='input-'+second),'hover reveals title and genre/dimension/controller tags');
  const hoverGlow=state.nodes.find(node=>node.id==='glow-'+second);
  check(state.selected===first&&!state.selectionActive&&hoverGlow?.opacity>.25&&hoverGlow.opacity<.4,'hover adds a subtle bloom without latching a selection');
  const hovered=state.hoverCards.find(card=>card.id===second);
  check(hovered.scale>1.04&&hovered.scale<1.05&&hovered.rotation<0&&hovered.rotation>-.025&&hovered.lift<0,'hover gently scales, tilts and lifts the complete card');
  check(JSON.stringify(state.nodes.find(node=>node.id==='game-'+second).rect)===JSON.stringify(secondCard),'hover presentation keeps the native hit region stable without layout shifts');
  await until('!__gameOS.backdrop.transitioning&&__gameOS.backdrop.current===__gameOS.backdrop.requested','hover wallpaper completes');
  const hoverImage=await capture('lobby-cards-hover');let hoveredPixels=decodePng(hoverImage);
  const wallpaper=comparePortablePixelRecords(createPortablePixelRecord(defaultImage),createPortablePixelRecord(hoverImage));
  check(wallpaper.meanAbsoluteError>1.5&&wallpaper.changedChannelRatio>.05,'hover changes real full-screen wallpaper pixels while selection stays unchanged');
  check(['input','mobile','keyboard'].every(prefix=>state.nodes.some(node=>node.id===prefix+'-'+second&&node.type==='GuiImage')),'controller, mobile and keyboard support use native GUI icons');
  const badgeColors={};
  for(const prefix of ['genre','dimension','input','mobile','keyboard']){
    const rectangle=state.nodes.find(node=>node.id===prefix+'-'+second).rect;let vivid=0,total=0;
    for(let row=Math.ceil(rectangle.y+2);row<rectangle.y+rectangle.height-2;row++)for(let column=Math.ceil(rectangle.x+2);column<rectangle.x+rectangle.width-2;column++){
      const index=(row*hoveredPixels.width+column)*4,channels=[hoveredPixels.data[index],hoveredPixels.data[index+1],hoveredPixels.data[index+2]];
      if(Math.max(...channels)-Math.min(...channels)>80)vivid++;total++;
    }
    badgeColors[prefix]=vivid/total;check(badgeColors[prefix]>.35,prefix+' badge has vivid GPU colors rather than a grey background');
  }
  writeFileSync(resolve(output,'lobby-badge-colors.json'),JSON.stringify(badgeColors,null,2));
  await cdp.call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await until('__gameOS.hoverCards.length===0','flat card on the same hovered wallpaper');
  restingPixels=decodePng(await capture('lobby-cards-flat-preview'));
  await cdp.call('Emulation.setEmulatedMedia',{features:[]});
  await until(`__gameOS.hoverCards.some(card=>card.id==='${second}'&&card.amount>.99)`,'hover pose with unchanged wallpaper');
  hoveredPixels=decodePng(await capture('lobby-cards-hover'));
  const brightTop=(pixels,column)=>{
    for(let row=Math.floor(secondCard.y)-12;row<secondCard.y+12;row++){
      const offset=(row*pixels.width+Math.round(column))*4;
      if(pixels.data[offset]>110&&pixels.data[offset+1]>150&&pixels.data[offset+2]>110)return row;
    }
    return null;
  };
  const left=secondCard.x+24,right=secondCard.x+secondCard.width-24;
  const tilt={restLeft:brightTop(restingPixels,left),restRight:brightTop(restingPixels,right),hoverLeft:brightTop(hoveredPixels,left),hoverRight:brightTop(hoveredPixels,right)};
  writeFileSync(resolve(output,'lobby-card-tilt.json'),JSON.stringify(tilt,null,2));
  check(Object.values(tilt).every(value=>value!==null)&&Math.abs(tilt.restLeft-tilt.restRight)<=1&&tilt.hoverLeft-tilt.hoverRight>=2&&tilt.hoverRight<tilt.restRight,'GPU pixels show the card enlarged and rotated rather than only reporting a hover pose');
  await cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:secondCard.x+secondCard.width+8,y:secondCard.y+secondCard.height/2,button:'none',buttons:0});await delay(800);
  check(await evaluate(`__gameOS.previewGame==='${second}'&&__gameOS.backdrop.current===__gameOS.backdrop.requested&&!__gameOS.backdrop.transitioning`),'dwelling in the gap between cards preserves the preview instead of crossfading to the first game');
  const previewUrl=await evaluate('__gameOS.backdrop.current');
  await evaluate(`window.__previewTrace=[];window.__tracePreview=true;requestAnimationFrame(function trace(){if(!window.__tracePreview)return;window.__previewTrace.push({current:__gameOS.backdrop.current,incoming:__gameOS.backdrop.incoming,requested:__gameOS.backdrop.requested});requestAnimationFrame(trace)});`);
  for(const id of [initial.games[2],initial.games[3],second]){
    const rect=initial.nodes.find(node=>node.id==='game-'+id).rect;
    await cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:rect.x+rect.width/2,y:rect.y+rect.height/2,button:'none',buttons:0});
  }
  await until(`__gameOS.previewGame==='${second}'&&!__gameOS.backdrop.transitioning&&__gameOS.backdrop.current===__gameOS.backdrop.requested`,'rapid hover keeps the final preview');
  await evaluate('window.__tracePreview=false');
  check(await evaluate(`window.__previewTrace.every(frame=>![frame.current,frame.incoming,frame.requested].includes(${JSON.stringify(initial.backdrop.current)}))`),'rapid inter-card hover never inserts the first game into a preview transition');
  check((await snapshot()).backdrop.current===previewUrl,'rapid hover finishes on the latest hovered background');
  check(await evaluate(`__gameOS.selected==='${first}'&&!__gameOS.selectionActive&&!__gameHost.route.game`),'rapidly passing several cards previews the final game without changing selection or launching');
  await cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:10,y:10,button:'none',buttons:0});
  await until('__gameOS.nodes.every(node=>!node.id.startsWith("title-"))','hover caption fades away');
  await until('__gameOS.hoverCards.length===0','card smoothly returns to its resting pose');
  await until('__gameOS.previewGame===""&&!__gameOS.backdrop.transitioning&&__gameOS.backdrop.current===__gameOS.backdrop.requested','leaving hover restores the selected wallpaper');
  check((await snapshot()).backdrop.current===initial.backdrop.current,'leaving the carousel restores the selected game background');
  await cdp.call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await delay(150);
  await cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:secondCard.x+secondCard.width/2,y:secondCard.y+secondCard.height/2,button:'none',buttons:0});await delay(150);
  state=await snapshot();
  check(state.hoverCards.length===0&&state.nodes.some(node=>node.id==='title-'+second),'reduced motion reveals metadata without scaling or tilting cards');
  const before=decodePng(await capture());
  await desktopKey(cdp,'ArrowRight','ArrowRight',39);
  await until(`__gameOS.selectionActive&&__gameOS.nodes.some(node=>node.id==='glow-${second}')`,'keyboard selection bloom');
  await delay(250);state=await snapshot();
  check(state.nodes.find(node=>node.id==='glow-'+second).opacity>.99,'selection retains a stronger bloom than the hover preview');
  check(state.selected===second&&state.nodes.some(node=>node.id==='title-'+second),'keyboard selection retains the card information');
  const glow=state.nodes.find(node=>node.id==='glow-'+second).rect, selected=state.nodes.find(node=>node.id==='game-'+second).rect;
  check(glow.x<selected.x&&glow.y<selected.y&&glow.width>selected.width&&glow.height>selected.height,'selected border has an exterior bloom halo');
  const after=decodePng(await capture('lobby-cards-selected'));
  let gain=0,brightened=0,samples=0;
  for(let row=Math.floor(selected.y-9);row<selected.y+selected.height+9;row++)for(let column=Math.floor(selected.x-9);column<selected.x+selected.width+9;column++){
    const horizontal=column>selected.x+18&&column<selected.x+selected.width-18&&(row<selected.y-3||row>selected.y+selected.height+3);
    const vertical=row>selected.y+18&&row<selected.y+selected.height-18&&(column<selected.x-3||column>selected.x+selected.width+3);
    if((!horizontal&&!vertical)||column<0||row<0||column>=after.width||row>=after.height)continue;
    const index=(row*after.width+column)*4+1,delta=after.data[index]-before.data[index];
    gain+=Math.max(0,delta);if(delta>3)brightened++;samples++;
  }
  const bloom={meanGreenGain:gain/samples,brightenedRatio:brightened/samples,samples};
  check(bloom.meanGreenGain>3&&bloom.brightenedRatio>.25,'GPU pixels outside the card brighten with a soft bloom, beyond the thin focus border');
  writeFileSync(resolve(output,'lobby-card-bloom.json'),JSON.stringify(bloom,null,2));
  await cdp.call('Emulation.setEmulatedMedia',{features:[]});await delay(100);
  await cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:secondCard.x+secondCard.width/2,y:secondCard.y+secondCard.height/2,button:'none',buttons:0});
  await until(`__gameOS.hoverCards.some(card=>card.id==='${second}'&&card.amount>.99)`,'selected card also animates on hover');
  state=await snapshot();check(state.selected===second&&state.nodes.some(node=>node.id==='glow-'+second),'hover movement retains the selected card bloom and information');
  await capture('lobby-cards-selected-hover');
  await cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:10,y:10,button:'none',buttons:0});
  await until('__gameOS.hoverCards.length===0','selected card returns without a retained tilt');
  const shelf=(await snapshot()).shelf, point={x:shelf.x+shelf.width/2,y:shelf.y+shelf.height/2};
  await cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',...point,button:'none',buttons:0});
  await cdp.call('Input.dispatchMouseEvent',{type:'mouseWheel',...point,deltaX:0,deltaY:360});await delay(40);
  const early=(await snapshot()).shelf;await delay(150);const later=(await snapshot()).shelf;
  check(early.scrollX>0&&early.scrollX<350&&early.animating,'wheel input starts a smooth bounded horizontal animation');
  check(later.scrollX>early.scrollX+5&&later.scrollX<361,'carousel continues moving after wheel input stops');
  await until('!__gameOS.shelf.animating','wheel inertia settles');
  check(Math.abs((await snapshot()).shelf.scrollX-360)<1,'horizontal scrolling settles without overshoot');
  await clickDesktop(context,'view-all');
  check((await snapshot()).shelf.scrollX===0&&!(await snapshot()).shelf.animating,'returning to the library resets and cancels scroll momentum');
  await cdp.call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await delay(200);
  await evaluate(`window.__scrollEvents=[];for(const type of ['pointerdown','pointermove','pointerup','pointercancel'])document.querySelector('canvas').addEventListener(type,event=>window.__scrollEvents.push({type:event.type,y:event.clientY,time:event.timeStamp}));`);
  const mobileShelf=(await snapshot()).shelf, touchY=mobileShelf.y+mobileShelf.height/2, touchTime=Date.now()/1000;
  await cdp.call('Input.dispatchTouchEvent',{type:'touchStart',timestamp:touchTime,touchPoints:[{x:mobileShelf.x+mobileShelf.width*.85,y:touchY,id:0}]});
  for(const [index,fraction] of [.72,.55,.35].entries()){
    await delay(20);await cdp.call('Input.dispatchTouchEvent',{type:'touchMove',timestamp:touchTime+(index+1)*.04,touchPoints:[{x:mobileShelf.x+mobileShelf.width*fraction,y:touchY,id:0}]});
  }
  await cdp.call('Input.dispatchTouchEvent',{type:'touchEnd',timestamp:touchTime+.14,touchPoints:[]});
  const released=(await snapshot()).shelf.scrollX;await delay(120);const coasted=(await snapshot()).shelf.scrollX;
  writeFileSync(resolve(output,'lobby-scroll-touch.json'),JSON.stringify({released,coasted,shelf:(await snapshot()).shelf,events:await evaluate('window.__scrollEvents')},null,2));
  check(coasted>released+1,'touch release also coasts with native Engine inertia');
  check(await evaluate('!__gameHost.route.game&&!document.querySelector("iframe")'),'scrolling across cards does not launch a game');
  await capture('lobby-scroll-momentum');
  await clickDesktop(context,'view-all');
  await cdp.call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await delay(100);
  const reducedShelf=(await snapshot()).shelf;
  await cdp.call('Input.dispatchMouseEvent',{type:'mouseWheel',x:reducedShelf.x+reducedShelf.width/2,y:reducedShelf.y+reducedShelf.height/2,deltaX:0,deltaY:120});await delay(100);
  check(Math.abs((await snapshot()).shelf.scrollX-120)<1&&!(await snapshot()).shelf.animating,'reduced motion keeps horizontal wheel scrolling immediate');
  await cdp.call('Emulation.setEmulatedMedia',{features:[]});
  await desktopKey(cdp,'End','End',35);
  await until('__gameOS.selected===__gameOS.games.at(-1)&&__gameOS.focused==="game-"+__gameOS.selected&&!__gameOS.shelf.animating','keyboard jumps to a previously unmounted card');
  await until('__gameOS.artwork.pending===0&&__gameOS.artwork.cards.filter(card=>card.visible).every(card=>card.ready)','distant carousel artwork');
  state=await snapshot();
  const lastCard=state.nodes.find(node=>node.id==='game-'+state.selected).rect;
  check(lastCard.x>=state.shelf.x&&lastCard.x+lastCard.width<=state.shelf.x+state.shelf.width+1,'the last selected card is laid out inside the viewport after remount');
  check(state.nodes.filter(node=>node.id.startsWith('game-')).length<=state.artwork.capacity+1,'scrolling through the catalog keeps the GUI card budget bounded');
  await desktopKey(cdp,'Home','Home',36);
  await until('__gameOS.selected===__gameOS.games[0]&&__gameOS.focused==="game-"+__gameOS.selected&&!__gameOS.shelf.animating','keyboard remounts the first card');
  await clickDesktop(context,'view-all');
  await until('__gameOS.nodes.every(node=>!node.id.startsWith("title-"))','recycled selection caption finishes fading');
  check((await snapshot()).nodes.every(node=>!node.id.startsWith('title-')),'recycled cards do not retain a previous selection caption');
});

for(const [name,fixture,expected]of[['lobby-root','index.html','/games/2048/index.html'],['lobby-published','artifacts/pages/index.html','/artifacts/pages/games/2048/index.html']]){
  await run(name,fixture,{verify:1},async(context)=>{
    const {evaluate,until,check,cdp}=context;
    await until('__gameOS?.logo.loaded','entrypoint logo and favicon');
    check(await evaluate('document.querySelector("link[rel=icon]").href===__gameOS.logo.url'),'entrypoint native logo and browser favicon share the same image URL');
    const requests=[];cdp.on('Network.requestWillBeSent',event=>requests.push(new URL(event.request.url).pathname));
    await cdp.call('Network.enable');
    await until(`__gameOS?.games.length===${catalogCount}&&__gameOS.frames>2`,'catalog resolves from entrypoint');
    await clickDesktop(context,'game-2048');
    await until('__gameHost.id==="2048"&&__gameHost.phase==="playing"','game module loads');
    check(await evaluate('new URL(document.querySelector("#game-host .game-mount").shadowRoot.querySelector("canvas").ownerDocument.location.href).pathname')===new URL(fixture,'http://test/').pathname,'mounted canvas belongs to the current document');
    check(await evaluate('!!window.haiyueGameOS.game.canvas&&!document.querySelector("iframe")'),'resolved game has its real canvas without a nested document');
    check(requests.includes(expected)&&requests.includes(expected.replace('index.html','bundle.js')),'game layout and dynamic module resolve inside the correct server or publication directory');
    await desktopKey(cdp,'Escape','Escape',27);
    await until('!__gameHost.mounted&&__gameOS.running','entrypoint return');
  });
}
await run('lobby-direct','site/index.html',{verify:1,game:'2048'},async({evaluate,until,check,cdp})=>{
  await until('__gameHost?.id==="2048"&&__gameHost.phase==="playing"','direct game module link');
  const frames=await evaluate('__gameOS.frames');await delay(400);check(await evaluate('!__gameOS.running&&!__gameOS.loading')&&await evaluate('__gameOS.frames')===frames,'direct link stops the desktop after unified loading');
  await desktopKey(cdp,'Escape','Escape',27);
  await until('__gameOS.running&&__gameOS.frames>2&&!__gameHost.mounted','direct return');
  check(await evaluate('__gameOS.selected')==='2048','direct return selects the launched card');
});
await run('lobby-routes','site/index.html',{verify:1},async(context)=>{
  const {evaluate,until,check,cdp}=context,requests=[];let pending=null;
  cdp.on('Network.requestWillBeSent',event=>requests.push(new URL(event.request.url).pathname));
  await cdp.call('Network.enable');
  await until(`__gameOS?.games.length===${catalogCount}&&__gameOS.frames>2`,'route catalog');
  check(!requests.some(path=>/\/games\/[^/]+\/(?:dist\/)?bundle\.js$/.test(path)),'opening the game library downloads no game modules');
  cdp.on('Fetch.requestPaused',event=>{pending=event.requestId;});
  await cdp.call('Fetch.enable',{patterns:[{urlPattern:'*/games/2048/bundle.js*',requestStage:'Response'}]});
  await evaluate('haiyueGameOS.navigate("2048");true');await until('__gameOS.loading&&__gameHost.phase==="loading"','native code loading screen');
  for(let attempt=0;attempt<100&&!pending;attempt++)await delay(50);check(!!pending,'only the selected game bundle is dynamically requested');
  await desktopKey(cdp,'Escape','Escape',27);await until('__gameHost.phase==="desktop"&&!__gameHost.mounted','cancel pending code load');
  await evaluate('haiyueGameOS.navigate("fruit-ninja");true');await until('__gameHost.id==="fruit-ninja"&&__gameHost.phase==="playing"','another game can start while prior code is pending');
  await cdp.call('Fetch.continueRequest',{requestId:pending});await cdp.call('Fetch.disable');await delay(350);
  check(await evaluate('__gameHost.id==="fruit-ninja"&&document.querySelectorAll("#game-host .game-mount").length===1'),'a stale import cannot boot or remove the new game container');
  await evaluate('window.__routeEngine=haiyueGameOS.game.engine;haiyueGameOS.navigate("2048");true');await until('__gameHost.id==="2048"&&__gameHost.phase==="playing"','reopen cached deferred module');
  check(await evaluate('__routeEngine.state==="destroyed"'),'switching routes destroys the old game engine');
  await evaluate('history.back();true');await until('__gameHost.id==="fruit-ninja"&&__gameHost.phase==="playing"','browser back mounts the previous game');
  await evaluate('history.forward();true');await until('__gameHost.id==="2048"&&__gameHost.phase==="playing"','browser forward mounts the next game');
  check(!requests.some(path=>/\/games\/(?!2048\/|fruit-ninja\/)[^/]+\/(?:dist\/)?bundle\.js$/.test(path)),'route transitions never fetch unrelated game bundles');
  await desktopKey(cdp,'Escape','Escape',27);await until('__gameOS.running&&!__gameHost.mounted','route return');
  check(await evaluate('!document.querySelector("#game-host,iframe")'),'cancel and browser history leave no nested pages or abandoned hosts');
});

await run('lobby-devices','site/index.html',{verify:1},async(context)=>{
  const {evaluate,until,check,cdp}=context;
  await cdp.call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await until(`__gameOS?.games.length===${catalogCount}`,'device catalog');
  await clickDesktop(context,'devices');await until('__gameOS.simulatorHome?.mode==="pad"','native tablet home');
  check(await evaluate('!document.querySelector("iframe")&&!__gameHost.route.game'),'device icon desktop does not boot a nested game page');
  const screen=await evaluate('__gameOS.simulatorHome.screen'),touchX=screen.x+screen.width*.8,touchY=screen.y+screen.height*.45;
  await cdp.call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:touchX,y:touchY,id:0}]});
  await cdp.call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:screen.x+screen.width*.2,y:touchY,id:0}]});
  await cdp.call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await until('__gameOS.simulatorHome.page===1&&Math.abs(__gameOS.simulatorHome.offset-1)<.01','swipe changes the icon page');
  check(await evaluate('__gameOS.simulatorHome.pages>=2'),'all manifest games are reachable through multiple device icon pages');
  await desktopKey(cdp,'ArrowLeft','ArrowLeft',37);await until('__gameOS.simulatorHome.page===0&&__gameOS.simulatorHome.offset<.01','keyboard returns to first page');
  const shot=await cdp.call('Page.captureScreenshot',{format:'png'});writeFileSync(resolve(output,'simulator-pad-home.png'),Buffer.from(shot.result.data,'base64'));
  await clickDesktop(context,'sim-icon-2048');await until('__gameHost.id==="2048"&&__gameHost.simulator?.frames>3','game renders in tablet RTT screen');
  check(await evaluate('__gameHost.mode==="texture"&&__gameHost.simulator.texture.width===820&&__gameHost.simulator.texture.height===1080'),'tablet uses a real independent game RTT target');
  check(await evaluate('document.querySelectorAll("iframe").length===0&&!__gameOS.running'),'game texture presentation replaces iframe embedding and stops desktop rendering');
  const before=await evaluate('JSON.stringify(haiyueGameOS.game.debug.__forge2048.snapshot().board)');
  await desktopKey(cdp,'ArrowLeft','ArrowLeft',37);await delay(450);await desktopKey(cdp,'ArrowDown','ArrowDown',40);await delay(450);
  check(await evaluate('JSON.stringify(haiyueGameOS.game.debug.__forge2048.snapshot().board)')!==before,'keyboard input reaches the actual game inside the RTT device');
  const won=await evaluate('haiyueGameOS.game.debug.__forge2048.snapshot().phase==="won"');
  const playedBoard=await evaluate('JSON.stringify(haiyueGameOS.game.debug.__forge2048.snapshot().board)');
  const restart=await evaluate('haiyueGameOS.game.debug.__forge2048.snapshot().buttons.'+(won?'keep':'restart'));
  const point=await evaluate(`haiyueGameOS.simulator.projectGame(${(restart.x+restart.width/2)/820},${(restart.y+restart.height/2)/1080})`);
  await evaluate('haiyueGameOS.game.canvas.addEventListener("pointerdown",event=>{window.__devicePrimary=event.isPrimary;},{once:true});true');
  await cdp.call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...point,id:0}]});
  await cdp.call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await delay(250);
  check(await evaluate('__devicePrimary===true'),'simulated touch retains primary-pointer semantics required by match-3 and cube gestures');
  const touchBoard=await evaluate('JSON.stringify(haiyueGameOS.game.debug.__forge2048.snapshot().board)');
  await desktopKey(cdp,'ArrowRight','ArrowRight',39);await delay(400);await desktopKey(cdp,'ArrowUp','ArrowUp',38);await delay(400);
  check(won?await evaluate('JSON.stringify(haiyueGameOS.game.debug.__forge2048.snapshot().board)')!==touchBoard:touchBoard!==playedBoard,'real tablet touch activates the actual game GUI so gameplay can continue');
  const tablet=await cdp.call('Page.captureScreenshot',{format:'png'});writeFileSync(resolve(output,'simulator-pad-game.png'),Buffer.from(tablet.result.data,'base64'));
  const rotateGame=async(mode,width,height)=>{
    await until('!haiyueGameOS.game.debug.__forge2048.snapshot().busy','board animations settle before orientation');
    await evaluate('window.__rotationInstance=haiyueGameOS.game;window.__rotationBoard=JSON.stringify(haiyueGameOS.game.debug.__forge2048.snapshot().board);true');
    await rotateSimulatorCamera(context,'landscape');await until(`__gameHost.simulator.texture.width===${height}&&__gameHost.simulator.texture.height===${width}`,'real '+mode+' landscape target');
    check(await evaluate('haiyueGameOS.game===__rotationInstance&&JSON.stringify(haiyueGameOS.game.debug.__forge2048.snapshot().board)===__rotationBoard'),mode+' rotation resizes the current game without losing board progress');
    check((await evaluate('haiyueGameOS.simulator.pixels()')).colors>20,mode+' landscape draws actual game pixels');
    const muted=await evaluate('haiyueGameOS.game.debug.__forge2048.snapshot().muted');
    const point=await evaluate('(()=>{const game=haiyueGameOS.game,snapshot=game.debug.__forge2048.snapshot(),button=snapshot.buttons.sound;return haiyueGameOS.simulator.projectGame((button.x+button.width/2)/snapshot.viewport.width,(button.y+button.height/2)/snapshot.viewport.height);})()');
    await cdp.call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...point,id:0}]});await cdp.call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await delay(150);
    check(await evaluate('haiyueGameOS.game.debug.__forge2048.snapshot().muted')!==muted,mode+' landscape perspective touch activates the actual game GUI');
    const shot=await cdp.call('Page.captureScreenshot',{format:'png'});writeFileSync(resolve(output,'simulator-'+mode+'-landscape.png'),Buffer.from(shot.result.data,'base64'));
    await rotateSimulatorCamera(context,'portrait');await until(`__gameHost.simulator.texture.width===${width}`,'return to '+mode+' portrait');
    check(await evaluate('haiyueGameOS.game===__rotationInstance&&JSON.stringify(haiyueGameOS.game.debug.__forge2048.snapshot().board)===__rotationBoard'),mode+' round-trip rotation preserves the same game state');
  };
  await rotateGame('pad',820,1080);
  const control=await evaluate('__gameHost.simulator.nodes.find(node=>node.id==="sim-phone").rect');
  await evaluate('window.__previousGame=haiyueGameOS.game.engine;true');
  await cdp.call('Input.dispatchMouseEvent',{type:'mousePressed',x:control.x+control.width/2,y:control.y+control.height/2,button:'left',buttons:1,clickCount:1});
  await cdp.call('Input.dispatchMouseEvent',{type:'mouseReleased',x:control.x+control.width/2,y:control.y+control.height/2,button:'left',buttons:0,clickCount:1});
  await until('__gameHost.route.device==="phone"&&__gameHost.simulator?.frames>3','phone game RTT');
  check(await evaluate('__previousGame.state==="destroyed"&&__gameHost.simulator.texture.width===390&&__gameHost.simulator.texture.height===760'),'switching device replaces and disposes the prior render target and game');
  const phone=await cdp.call('Page.captureScreenshot',{format:'png'});writeFileSync(resolve(output,'simulator-phone-game.png'),Buffer.from(phone.result.data,'base64'));
  await rotateGame('phone',390,760);
  await desktopKey(cdp,'Escape','Escape',27);await until('__gameOS.simulatorHome?.mode==="phone"&&!__gameHost.mounted','Escape returns to phone icon home');
  await clickDesktop(context,'sim-desktop');await until('__gameOS.running&&!__gameHost.route.device','return to native game library');
  check(await evaluate('!document.querySelector("#device-simulator,#game-host,iframe")'),'return disposes the simulator canvas and mounted game container');
});

for(const [name,fixture] of [['simulator-external','simulator/index.html'],['simulator-published','artifacts/pages/simulator/index.html']]){
  await run(name,fixture,{verify:1},async(context)=>{
    const {evaluate,until,check,cdp}=context;
    await until('__gameOS?.simulatorHome?.mode==="pad"','external native device desktop');
    check(await evaluate('__gameHost.route.device==="pad"&&!document.querySelector("iframe")'),'external simulator uses the same native device and route components');
    await clickDesktop(context,'sim-icon-2048');await until('__gameHost.id==="2048"&&__gameHost.simulator?.frames>3','external simulator renders a real game texture');
    check(await evaluate('__gameHost.simulator.texture.width===820'),'external simulator resolves independently built game modules');
    await desktopKey(cdp,'Escape','Escape',27);await until('__gameOS.simulatorHome&&!__gameHost.mounted','external simulator returns to its icon home');
  });
}
await run('standalone-home','games/tank-battle/index.html',{verify:1},async({evaluate,until,pads,press,check,cdp})=>{
  await until('!!window.__tankBattle','independent game ready');await pads();await press(8);
  await until('__gameReturn.snapshot().active','independent return confirmation');
  const point=await evaluate('(()=>{const button=__gameReturn.snapshot().buttons.confirm,canvas=document.querySelector("canvas").getBoundingClientRect();return{x:canvas.x+button.x+button.width/2,y:canvas.y+button.y+button.height/2};})()');
  await cdp.call('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',buttons:1,clickCount:1});await cdp.call('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',buttons:0,clickCount:1});
  await until('location.pathname==="/index.html"&&document.body.dataset.osReady==="true"','independent game returns to actual game library');
  check(await evaluate('!document.querySelector("iframe,#game-host")'),'independent pages preserve their return navigation and release the old renderer');
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

await run('return-dialog-ui','games/2048/index.html',{gamepadVerify:1},async({evaluate,until,pads,press,check,cdp})=>{
  await until('window.__gameReturn?.snapshot().ready&&__gameReturn.snapshot().gameFrames>3','return dialog visual fixture');await pads();
  const capture=async name=>{const bytes=Buffer.from((await cdp.call('Page.captureScreenshot',{format:'png'})).result.data,'base64');if(name)writeFileSync(resolve(output,name+'.png'),bytes);return decodePng(bytes);};
  const point=async(choice,edge=false)=>evaluate(`(()=>{const s=__gameReturn.snapshot(),b=s.buttons.${choice},r=document.querySelector('canvas').getBoundingClientRect();return {x:r.x+(b.x+${edge?'12':'b.width/2'})*r.width/s.viewport.width,y:r.y+(b.y+b.height/2)*r.height/s.viewport.height};})()`);
  for(const [width,height]of[[1440,900],[390,844],[844,390],[320,568],[844,240]]){
    await cdp.call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600});await delay(300);
    await press(8);await until('__gameReturn.snapshot().active&&__gameReturn.snapshot().buttons.cancel.width>0','styled return modal');await delay(150);
    const state=await evaluate('__gameReturn.snapshot()'),r=state.dialog,frames=state.gameFrames;
    check(state.glass&&state.selected==='cancel'&&r.width<=480&&r.x>=0&&r.y>=0&&r.x+r.width<=state.viewport.width+1&&r.y+r.height<=state.viewport.height+1,`${width} glass return dialog is centered inside the visible canvas and defaults to continue`);
    check(Object.values(state.buttons).every(b=>b.width>=90&&b.height>=34&&b.x>=r.x&&b.x+b.width<=r.x+r.width&&b.y>=r.y&&b.y+b.height<=r.y+r.height),`${width} both return actions have generous, unclipped hit regions`);
    check(state.styles.cancel.radius===12&&state.styles.confirm.radius===12&&state.styles.cancel.background==='#bcefc8',`${width} return dialog uses the shared mint primary and glass secondary controls`);
    const resting=await capture('return-dialog-'+width),sample=await point('cancel',true),target=await point('cancel');
    await cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',...target,button:'none',buttons:0});await delay(230);
    check(await evaluate('__gameReturn.snapshot().styles.cancel.hovered'),'return dialog receives native pointer hover while gameplay input is isolated');
    const hovered=await capture(width===1440?'return-dialog-hover':null),offset=(Math.floor(sample.y)*hovered.width+Math.floor(sample.x))*4;
    check([0,1,2].reduce((sum,c)=>sum+Math.abs(hovered.data[offset+c]-resting.data[offset+c]),0)>20,`${width} actual button pixels brighten on hover`);
    await cdp.call('Input.dispatchMouseEvent',{type:'mousePressed',...target,button:'left',buttons:1,clickCount:1});
    check(await evaluate('__gameReturn.snapshot().styles.cancel.pressed'),'return action has a visible native pressed state');
    await cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:2,y:2,button:'none',buttons:1});
    await cdp.call('Input.dispatchMouseEvent',{type:'mouseReleased',x:2,y:2,button:'left',buttons:0,clickCount:1});await delay(150);
    check(await evaluate(`__gameReturn.snapshot().active&&__gameReturn.snapshot().paused&&__gameReturn.snapshot().gameFrames===${frames}&&!__gameReturn.snapshot().styles.cancel.pressed`),'dragging off an action cancels the click and GUI animation never resumes gameplay');
    await desktopKey(cdp,'Escape','Escape',27);await until('!__gameReturn.snapshot().active','keyboard cancels return dialog');
  }
  await pads();await press(8);await until('__gameReturn.snapshot().active','reduced motion return dialog');
  await cdp.call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await delay(150);
  check(await evaluate('__gameReturn.snapshot().styles.cancel.duration===0&&__gameReturn.snapshot().styles.confirm.duration===0'),'return dialog respects reduced-motion settings');
  await desktopKey(cdp,'Enter','Enter',13);check(await evaluate('!__gameReturn.snapshot().active&&!__gameReturn.snapshot().paused'),'Enter on the default action resumes the game');
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

await run('tank-coop','games/tank-battle/index.html',{verify:1,gamepadVerify:1},async({evaluate,until,pads,press,check,cdp})=>{
  await cdp.call('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
  await until('!!window.__tankBattle','desktop tank scene');await pads();await press(11);
  await until('window.__controllerPointer?.visible','Engine GUI controller pointer');
  for(let i=0;i<30;i++){
    const delta=await evaluate(`(()=>{const b=__tankBattle.hud().buttons.duo,c=__controllerPointer.center;return [b.x+b.width/2-c.x,b.y+b.height/2-c.y]})()`);
    if(delta.every(d=>Math.abs(d)<8))break;
    await pads([{axes:[...delta.map(d=>Math.abs(d)<8?0:Math.sign(d)*(.2+.8*Math.min(1,Math.abs(d)/105))),0,0]}]);
  }
  await pads();await press(0);await press(11);await pads([{},{}]);
  await until('__tankBattle.snapshot().tick>0','GUI starts combat');
  check(await evaluate('__tankBattle.snapshot().mode')===2,'virtual pointer starts 2P through Engine GUI');
  const before=await evaluate('__tankBattle.snapshot()');
  await pads([{axes:[0,-1,0,0],buttons:[0]},{axes:[0,-1,0,0],buttons:[0]}]);await delay(300);await pads([{},{}]);
  const after=await evaluate('__tankBattle.snapshot()');
  writeFileSync(resolve(output,'tank-coop-state.json'),JSON.stringify({before,after,input:await evaluate('({keys:__keys,pointer:__controllerPointer,active:document.body.dataset.gamepadActive})')},null,2));
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
  await until('!location.pathname.includes("/games/") && !!document.querySelector("#os-desktop")','confirmed return loads homepage');
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

for (const game of ['sudoku', 'tank-battle']) await run('notifications-'+game, `games/${game}/index.html`, {gamepadVerify:1}, async({evaluate,until,pads,press,check,cdp}) => {
  await until('__gameReturn.snapshot().ready && __gameReturn.snapshot().gameFrames>3', 'notification renderer ready');
  const canvasCount=await evaluate('document.querySelectorAll("canvas").length');
  await pads([{buttons:[0]}]);
  await until('window.__controllerNotifications?.some(n=>n.text==="手柄 1 已连接")', 'held input still reports connection');
  check(true,'connection does not wait for neutral controls');
  await until('__controllerNotifications[0]?.opacity===1','game notification finishes its entrance');
  check(await evaluate('__controllerNotifications[0].appearance==="glass"&&__controllerNotifications[0].icon&&__controllerNotifications[0].accent==="#9ff3d5"'),'game overlay uses the shared glass notification skin and controller icon');
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
  check(await evaluate('__gameReturn.snapshot().notifications.some(n=>!n.connected&&n.appearance==="glass"&&n.accent==="#ffc58b")'),'pause dialog uses the same amber disconnect notification');
  await until('__gameReturn.snapshot().notifications.every(n=>n.opacity===1)','paused notifications finish entering');
  check(await evaluate('__gameReturn.snapshot().notifications.every(n=>n.rect.width>100&&n.rect.height>30)'),'modal lays out every foreground notification with a visible rectangle');
  const pausedShot=await cdp.call('Page.captureScreenshot',{format:'png'});writeFileSync(resolve(output,`notifications-${game}-paused.png`),Buffer.from(pausedShot.result.data,'base64'));
  const frames=await evaluate('__gameReturn.snapshot().gameFrames');
  await delay(5200);
  check(await evaluate('__gameReturn.snapshot().notifications.length')===0,'notification expires while gameplay remains paused');
  check(await evaluate('__gameReturn.snapshot().gameFrames')===frames,'notification does not resume simulation');
  check(await evaluate('document.querySelectorAll("canvas").length')===canvasCount,'notification reuses existing canvases');
  check(await evaluate('!document.querySelector("hy-notification,[data-gamepad-notification]")'),'game notifications are Engine GUI, not DOM');
  await pads();await press(1);check(await evaluate('!__gameReturn.snapshot().active'),'resume still works after reconnection');
});

await run('notifications-lobby','site/index.html',{verify:1},async({evaluate,until,pads,check,cdp})=>{
  await until('__gameOS?.ready&&__gameOS.frames>2','Engine notification surface ready');
  await pads([{buttons:[0]}]);
  check(await evaluate('__gameOS.notices.length')===1,'homepage reports connection even while a button is held');
  check(await evaluate('__gameOS.nodes.some(node=>node.id==="notice-0"&&node.text==="手柄 1 已连接")'),'homepage native notification follows physical connection');
  check(await evaluate('!document.querySelector("hy-notification,button,nav")'),'homepage notification uses native Engine GUI');
  await until('__gameOS.notifications[0]?.opacity===1','notification finishes its entrance');
  check(await evaluate('__gameOS.notifications[0].appearance==="glass"&&__gameOS.notifications[0].icon&&__gameOS.notifications[0].detail.length>0&&__gameOS.notifications[0].accent==="#9ff3d5"&&__gameOS.notifications[0].pointerFilter==="ignore"'),'native lobby notice includes the glass skin, controller icon, supporting text and mint status');
  const remaining=await evaluate('__gameOS.notifications[0].remaining');await delay(250);
  check(await evaluate(`__gameOS.notifications[0].remaining<${remaining}`),'countdown advances in real time');
  const shot=await cdp.call('Page.captureScreenshot',{format:'png'});writeFileSync(resolve(output,'notifications-lobby-connected.png'),Buffer.from(shot.result.data,'base64'));
  await delay(5200);
  check(await evaluate('__gameOS.notices.length')===0,'homepage connection notification expires after five seconds');
  await pads([]);
  check(await evaluate('__gameOS.notices.some(notice=>notice.message==="手柄 1 已断开")'),'homepage reports disconnect');
  await until('__gameOS.notifications[0]?.opacity===1&&!__gameOS.notifications[0].connected','disconnected notice finishes its entrance');
  check(await evaluate('__gameOS.notifications[0].accent==="#ffc58b"&&__gameOS.notifications[0].detail.includes("重新连接")'),'disconnect uses a warm amber accent and reconnection hint');
  const disconnected=await cdp.call('Page.captureScreenshot',{format:'png'});writeFileSync(resolve(output,'notifications-lobby-disconnected.png'),Buffer.from(disconnected.result.data,'base64'));
  await pads([{buttons:[0]}]);
  check(await evaluate('__gameOS.notices.length')===1,'rapid reconnect replaces the previous notification');
  await pads([]);await delay(5200);
  check(await evaluate('__gameOS.notices.length')===0,'homepage disconnect notification also expires');
  for(const [width,height] of [[390,844],[640,360],[320,568]]){
    await cdp.call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await pads([{}, {}, {}, {}]);
    await until('__gameOS.notifications.length===4&&__gameOS.notifications.every(n=>n.opacity===1)','four notices finish entering');
    check(await evaluate(`__gameOS.notifications.every(n=>n.rect.x>=0&&n.rect.y>=0&&n.rect.x+n.rect.width<=${width}&&n.rect.y+n.rect.height<=${height})`),`${width}x${height} stacks four notices within the viewport`);
    const shot=await cdp.call('Page.captureScreenshot',{format:'png'});writeFileSync(resolve(output,`notifications-lobby-${width}x${height}.png`),Buffer.from(shot.result.data,'base64'));
    if(width===640){
      const state=await evaluate('__gameOS'),pixels=decodePng(Buffer.from(shot.result.data,'base64')),notice=state.notifications[2],x=Math.round(state.shelf.x+state.shelf.width),y=Math.floor(notice.rect.y+notice.rect.height*.65);
      const delta=[0,1,2].reduce((total,channel)=>total+Math.abs(pixels.data[(y*pixels.width+x-2)*4+channel]-pixels.data[(y*pixels.width+x+2)*4+channel]),0);
      check(delta<20,'notification glass remains continuous where it crosses the carousel edge fade');
    }
    await pads([]);
  }
  await cdp.call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await pads([{}]);
  check(await evaluate('__gameOS.notifications.every(n=>n.opacity===1)'),'reduced motion presents notices without slide or fade');
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
  let held=false;
  const mouse=(x,y,type='mouseMoved')=>{
    if(type==='mousePressed')held=true;if(type==='mouseReleased')held=false;
    return cdp.call('Input.dispatchMouseEvent',{type,x,y,button:type==='mouseMoved'?'none':'left',buttons:held?1:0,clickCount:type==='mouseMoved'?0:1});
  };
  await cdp.call('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32});
  await cdp.call('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});
  await until('__fruitNinja.items.filter(n=>n.kind==="fruit"&&Math.abs(n.vy)<400&&n.screen.y>130&&n.screen.y<400).length>=2','two fruit in first wave');
  const pair=(await evaluate('__fruitNinja.items')).filter(n=>n.kind==='fruit').sort((a,b)=>a.screen.x-b.screen.x).slice(0,2);
  const a=pair[0].screen,b=pair[1].screen,dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);
  await mouse(5,5);await mouse(a.x-dx/length*55,a.y-dy/length*55);await mouse(a.x-dx/length*55,a.y-dy/length*55,'mousePressed');await mouse(a.x,a.y);await mouse(b.x,b.y);
  const combo=await evaluate('__fruitNinja');
  check(combo.combo.count>=2,'one physical swipe combines hits across pointer events');
  check(combo.combo.bonus===5*combo.combo.count*(combo.combo.count-1)/2,'progressive combo bonus');
  check(combo.score===combo.combo.count*10+combo.combo.bonus,'base score and bonus awarded exactly once');
  await until('__gameHud.nodes.some(n=>n.visible&&n.text.includes("连切 · 额外"))','Engine GUI combo feedback');check(true,'combo shown in same-canvas GUI');
  const shot=await cdp.call('Page.captureScreenshot',{format:'png'});writeFileSync(resolve(output,'fruit-ninja-combo.png'),Buffer.from(shot.result.data,'base64'));
  await mouse(b.x,b.y,'mouseReleased');
  check(await evaluate('__fruitNinja.combo.count')===0,'releasing the mouse ends the combo');
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
  let held=false;
  const mouse=(type,p)=>{
    if(type==='mousePressed')held=true;if(type==='mouseReleased')held=false;
    return cdp.call('Input.dispatchMouseEvent',{type,x:p.x,y:p.y,button:type==='mouseMoved'?'none':'left',buttons:held?1:0,clickCount:type==='mouseMoved'?0:1});
  };
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
    await mouse('mousePressed',{x:item.screen.x-24,y:item.screen.y});
    await mouse('mouseMoved',{x:item.screen.x+24,y:item.screen.y});
    await mouse('mouseReleased',{x:item.screen.x+24,y:item.screen.y});
    return { item, remaining: s.remaining };
  };
  check((await state()).remaining===60,'ready screen starts with sixty seconds');
  check((await state()).art.background&&(await state()).art.gui,'generated dojo background and GUI atlas are decoded before play');
  check((await state()).audio.backend.buffers===9&&(await state()).audio.backend.error===null,'all nine WAV sounds are decoded before play');
  check((await state()).audio.backend.state==='locked'&&Object.values((await state()).audio.played).every(count=>count===0),'sound stays locked and silent before user activation');
  const menuShot=await cdp.call('Page.captureScreenshot',{format:'png'});writeFileSync(resolve(output,'fruit-ninja-dojo-menu.png'),Buffer.from(menuShot.result.data,'base64'));
  check(await evaluate('document.querySelectorAll("canvas").length===1&&!document.querySelector("button,select")'),'one canvas; Engine GUI controls');
  await button('开始游戏');await until('__fruitNinja.phase==="playing"','start via Engine GUI');
  await until('__fruitNinja.audio.played.button===1&&__fruitNinja.audio.backend.state==="running"','first GUI click unlocks and plays its sound');
  check((await state()).effects.texturesReady,'all atlases and splashes are GPU-ready before play');
  await until('__fruitNinja.items.some(n=>n.kind==="fruit"&&Math.abs(n.vy)<250)','fruit for hover regression');
  check((await state()).audio.played.throw>0,'fruit wave triggers a throw whoosh');
  const hover=(await state()).items.find(item=>item.kind==='fruit'&&Math.abs(item.vy)<350);
  await mouse('mouseMoved',{x:hover.screen.x-30,y:hover.screen.y});await mouse('mouseMoved',{x:hover.screen.x+30,y:hover.screen.y});
  check((await state()).score===0&&(await state()).effects.trail===0,'hovering over fruit neither cuts nor draws a trail');
  check((await state()).audio.played.splash===0,'hovering cannot trigger juice audio');
  await cut('fruit');await until('__fruitNinja.score>0','pressed mouse drag slices fruit');
  check((await state()).audio.played.splash>0,'slicing fruit plays a wet splash');
  check((await state()).effects.fragments>0,'cut creates separate fruit halves');
  await until('__fruitNinja.effects.particles>0','Engine juice particles');check((await state()).effects.particles>=80,'dense juice burst emitted');
  check((await state()).effects.trail>0,'pressed mouse movement creates a blade trail');
  check((await state()).effects.stains>0,'fruit juice reaches the background');
  const shot=await cdp.call('Page.captureScreenshot',{format:'png'});writeFileSync(resolve(output,'fruit-ninja-play.png'),Buffer.from(shot.result.data,'base64'));
  await mouse('mouseMoved',{x:10,y:10});
  await mouse('mouseMoved',{x:120,y:220});await mouse('mousePressed',{x:120,y:220});
  for(let i=0;i<=12;i++) await mouse('mouseMoved',{x:120+i*18,y:220-Math.sin(i/12*Math.PI)*55});
  const trailShot=await cdp.call('Page.captureScreenshot',{format:'png'});writeFileSync(resolve(output,'fruit-ninja-trail.png'),Buffer.from(trailShot.result.data,'base64'));
  await mouse('mouseReleased',{x:336,y:220});
  await delay(1200);check((await state()).effects.trail===0,'trail expires after release');
  check((await state()).effects.stains>0&&(await state()).effects.particles===0,'background juice remains after the airborne droplets disappear');
  const flowing=(await state()).effects.juice[0];
  check(flowing.flows.some(flow=>flow.visible&&flow.length>0),'juice runs down from the splatter');
  await delay(400);
  check((await state()).effects.juice[0].flows.some((flow,i)=>flow.length>flowing.flows[i].length),'juice trails lengthen as time advances');
  const stains=await cdp.call('Page.captureScreenshot',{format:'png'});writeFileSync(resolve(output,'fruit-ninja-stains.png'),Buffer.from(stains.result.data,'base64'));
  await cut('fruit');
  const variants=(await state()).effects.juice;
  check(new Set(variants.map(mark=>JSON.stringify([mark.variant,mark.angle,mark.stretch,mark.squash]))).size>1,'separate cuts create different splash shapes and proportions');
  check(variants.reduce((sum,mark)=>sum+mark.flows.length,0)<=(await state()).effects.dripCapacity,'juice drip geometry stays inside the fixed pool');
  await delay(700);const varietyShot=await cdp.call('Page.captureScreenshot',{format:'png'});writeFileSync(resolve(output,'fruit-ninja-juice-variety.png'),Buffer.from(varietyShot.result.data,'base64'));
  await button('暂停');const paused=(await state()).remaining, pausedJuice=(await state()).effects.juice, pausedAudio=(await state()).audio.played;await delay(500);
  check((await state()).remaining===paused,'GUI pause freezes round clock');
  check((await state()).audio.backend.voices===0&&(await state()).audio.played.throw===pausedAudio.throw,'pause stops gameplay voices and has no throw backlog');
  check(JSON.stringify((await state()).effects.juice)===JSON.stringify(pausedJuice),'pause freezes juice flow and falling droplets');await button('继续游戏');
  await pads();await press(8);await until('document.body.dataset.gameReturnOpen==="true"','Back return dialog');
  const time=(await state()).remaining;await delay(400);check((await state()).remaining===time,'shared return dialog pauses the round');
  check((await state()).audio.backend.voices===0&&(await state()).audio.backend.state==='suspended','system return dialog suspends the audio context');
  await press(1);await until('document.body.dataset.gameReturnOpen!=="true"','return cancelled');
  const resumed=(await state()).remaining;await delay(250);check(resumed-(await state()).remaining<1,'return dialog time excluded after resume');
  await pads([{axes:[.9,0,0,0]}]);check((await state()).effects.trail===0,'controller hover does not cut');await pads();
  await pads([{axes:[-.9,0,0,0],buttons:[0]}]);check((await state()).effects.trail>0,'holding A with the controller stick produces blade movement');await pads();
  await press(2);check((await state()).phase==='paused','controller X pauses');await press(2);check((await state()).phase==='playing','controller X resumes');await pads([]);
  const clockCut=await cut('clock');await delay(80);
  check((await state()).remaining>clockCut.remaining+9,'slicing stopwatch adds ten seconds');
  check(!(await state()).items.some(item=>item.id===clockCut.item.id),'stopwatch is consumed once');
  for(let attempt=0;attempt<10&&(await state()).phase==='playing';attempt++) {
    await cut('bomb');
    if(attempt===0){
      check((await state()).audio.played.bomb>0,'bomb hit plays the explosion sound');
      await until('__fruitNinja.effects.explosions.length>0 && Math.hypot(__fruitNinja.effects.shake.x,__fruitNinja.effects.shake.y)>1','bomb blast and camera shake');
      check((await state()).effects.explosions.length<=(await state()).effects.blastCapacity,'bomb effects use a bounded pool');
      const explosion=await cdp.call('Page.captureScreenshot',{format:'png'});writeFileSync(resolve(output,'fruit-ninja-explosion.png'),Buffer.from(explosion.result.data,'base64'));
      await evaluate('dispatchEvent(new KeyboardEvent("keydown",{code:"KeyP"}))');
      const frozen=(await state()).effects;await delay(200);
      check(JSON.stringify((await state()).effects.explosions)===JSON.stringify(frozen.explosions)&&JSON.stringify((await state()).effects.shake)===JSON.stringify(frozen.shake),'pause freezes blast age and camera position');
      await evaluate('dispatchEvent(new KeyboardEvent("keydown",{code:"KeyP"}))');await delay(220);
      const smoke=await cdp.call('Page.captureScreenshot',{format:'png'});writeFileSync(resolve(output,'fruit-ninja-explosion-smoke.png'),Buffer.from(smoke.result.data,'base64'));
      await delay(1200);
      check((await state()).effects.explosions.length===0&&Math.hypot((await state()).effects.shake.x,(await state()).effects.shake.y)===0,'blast expires and camera settles exactly');
    }
    await delay(120);
  }
  check((await state()).bombs===3&&(await state()).phase==='over'&&(await state()).reason==='bombs','third sliced bomb ends the game');
  check((await state()).effects.particles>0,'bomb explosion emits particles');
  await until('__fruitNinja.audio.played.over===1','game ending cue plays once after the last explosion');
  check((await state()).audio.backend.voices<=12&&(await state()).audio.backend.error===null,'audio stays inside the voice budget without playback errors');
  const best=(await state()).best;check(best>0,'completed score updates best');
  await button('再来一局');check((await state()).bombs===0&&(await state()).score===0&&(await state()).remaining>59&&(await state()).effects.stains===0,'restart resets bombs score timer and background juice');
  check((await state()).effects.explosions.length===0&&Math.hypot((await state()).effects.shake.x,(await state()).effects.shake.y)===0,'restart clears explosions and camera shake');
  check((await state()).effects.juice.length===0,'restart clears all juice trails and droplets');
  check((await state()).audio.played.over===1&&(await state()).audio.active,'restart starts a fresh audio session without replaying the ending');
  for(const [width,height] of [[390,844],[844,390],[1440,900]]) {
    await button('暂停');await cdp.call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:width<900?2:1,mobile:width<900});await delay(150);
    check(await evaluate(`__gameHud.nodes.filter(n=>n.visible&&n.type==='GuiButton').every(n=>n.rect.x>=0&&n.rect.y>=0&&n.rect.x+n.rect.width<=${width}+1&&n.rect.y+n.rect.height<=${height}+1)`),'GUI fits '+width+'x'+height);
    check(await evaluate(`__fruitNinja.effects.viewport.width===${width}&&__fruitNinja.effects.viewport.height===${height}`),'particles use screen pixels without stretch '+width+'x'+height);
    const menuCapture=await cdp.call('Page.captureScreenshot',{format:'png'});writeFileSync(resolve(output,`fruit-ninja-menu-${width}x${height}.png`),Buffer.from(menuCapture.result.data,'base64'));
    await button('继续游戏');
    await until(`['fruit','bomb'].every(kind=>__fruitNinja.items.some(item=>item.kind===kind&&item.screen.y>__fruitNinja.view.y+40&&item.screen.y<__fruitNinja.view.y+__fruitNinja.view.height-60))`,'visible fruit and bomb at '+width+'x'+height);
    const sizing=await state(), targets=sizing.items.filter(item=>item.kind!=='clock');
    check(targets.every(item=>item.screen.size>=72-.01&&item.screen.size<=110+.01),'fruit and bomb sizes stay readable and bounded '+width+'x'+height);
    check(targets.every(item=>Math.abs(item.screen.size/item.screen.radius-2.65)<.001),'visual size and hit radius match '+width+'x'+height);
    const oldSize=46*2.65*sizing.view.scale;
    check(targets.every(item=>width<600?item.screen.size>oldSize*1.5:item.screen.size<oldSize*.8),'phone targets enlarge and desktop targets shrink '+width+'x'+height);
    writeFileSync(resolve(output,`fruit-ninja-sizing-${width}x${height}.json`),JSON.stringify({viewport:{width,height},view:sizing.view,oldSize,items:targets},null,2));
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
  check((await state()).audio.backend.buffers===9&&(await state()).audio.backend.voices===0&&(await state()).audio.backend.state==='locked','reload recreates nine buffers with no old voices or autoplay');
});

await run('jigsaw-smoke','games/jigsaw-puzzle/index.html',{gamepadVerify:1,seed:1042},async({evaluate,until,check,cdp})=>{
  await until('window.__jigsaw?.ready && !__jigsaw.busy','jigsaw ready');
  check(await evaluate('__jigsaw.art.wood && __jigsaw.art.woodDesk && __jigsaw.audio.backend.buffers===4 && __jigsaw.audio.backend.voices===0 && __jigsaw.audio.backend.state==="locked"'),'wood GUI/tabletop and four preloaded effects without autoplay');
  check(await evaluate('document.querySelectorAll("canvas").length===1 && __gameHud.nodes.filter(n=>n.type==="GuiButton").length===9'),'shared engine canvas and GUI');
  check(await evaluate('__jigsaw.groups.length===20'),'default 4x5 puzzle');
  await cdp.call('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await delay(500);
  const overview=await cdp.call('Page.captureScreenshot',{format:'png'});
  writeFileSync(resolve(output,'jigsaw-curved-overview.png'),Buffer.from(overview.result.data,'base64'));
  writeFileSync(resolve(output,'jigsaw-wood-ui.png'),Buffer.from(overview.result.data,'base64'));
  const floor=decodePng(Buffer.from(overview.result.data,'base64')),desk=await evaluate('__jigsaw.view');
  const grain=[24,120,230,343,456,640,800,980,1130].map(x=>{
    const i=(Math.round(desk.y+10)*floor.width+x)*4;return [...floor.data.subarray(i,i+3)];
  });
  check(grain.every(c=>c[0]>c[2]+10) && Math.max(...grain.map(c=>c[0]))-Math.min(...grain.map(c=>c[0]))>5,'middle work area renders visible warm wood grain');
  const state=await evaluate('__jigsaw');
  const width=Math.min(600,450*state.image.width/state.image.height)/state.cols;
  const height=width*state.cols*state.image.height/state.image.width/state.rows;
  for(const sign of [1,-1]) {
    const p=state.pieces.find(p=>p.edges.includes(sign)),side=p.edges.indexOf(sign);
    const normal=[[0,-1],[1,0],[0,1],[-1,0]][side],extent=side%2?width:height;
    const offset=(extent/2+sign*.16*Math.min(width,height))*state.view.scale;
    const point={x:p.screen.x+normal[0]*offset,y:p.screen.y+normal[1]*offset};
    await cdp.call('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',buttons:1,clickCount:1});
    check(await evaluate('__jigsaw.selected')===(sign===1?p.id:null),sign===1?'curved protruding tab is draggable':'curved socket stays outside the hit silhouette');
    await cdp.call('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',buttons:0,clickCount:1});
  }
  const piece=await evaluate('__jigsaw.pieces.find(p=>p.row>0&&p.col>0&&p.row<__jigsaw.rows-1&&p.col<__jigsaw.cols-1)');
  await cdp.call('Input.dispatchMouseEvent',{type:'mouseWheel',x:piece.screen.x,y:piece.screen.y,deltaX:0,deltaY:-650});
  await delay(300);
  check(await evaluate('__jigsaw.view.scale')>1,'curved contours and bevel can be inspected at enlarged scale');
  const detail=await cdp.call('Page.captureScreenshot',{format:'png'});
  writeFileSync(resolve(output,'jigsaw-curved-detail.png'),Buffer.from(detail.result.data,'base64'));
});

await run('jigsaw-color-rims','games/jigsaw-puzzle/index.html',{gamepadVerify:1,seed:1042},async({evaluate,until,check,cdp})=>{
  await until('window.__jigsaw?.ready && !__jigsaw.busy','jigsaw ready');
  await cdp.call('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await delay(250);
  const click=async point=>{
    await cdp.call('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',buttons:1,clickCount:1});
    await cdp.call('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',buttons:0,clickCount:1});
    await delay(100);
  };
  for(const [index,value] of [[0,2],[1,3]]) {
    const n=(await evaluate('__gameHud.nodes')).filter(n=>n.type==='GuiSelect')[index];
    await click({x:n.rect.x+n.rect.width/2,y:n.rect.y+n.rect.height/2});
    await click({x:n.rect.x+30,y:n.rect.y+n.rect.height+4+(value-1)*30-Math.max(0,n.value-4)*30+15});
  }
  const document=await cdp.call('DOM.getDocument');
  const input=await cdp.call('DOM.querySelector',{nodeId:document.result.root.nodeId,selector:'#image-upload'});
  await cdp.call('DOM.setFileInputFiles',{nodeId:input.result.nodeId,files:[resolve(root,'games/test/fixtures/jigsaw/rim-colors.svg')]});
  await until('__jigsaw.rows===2 && __jigsaw.cols===3 && __jigsaw.image.width===900 && __jigsaw.image.height===600 && !__jigsaw.busy','colored rim fixture');
  await delay(250);
  const state=await evaluate('__jigsaw'),height=400/2*state.view.scale;
  const capture=await cdp.call('Page.captureScreenshot',{format:'png'}),png=Buffer.from(capture.result.data,'base64');
  writeFileSync(resolve(output,'jigsaw-color-rims.png'),png);
  const pixels=decodePng(png);
  const pixel=(x,y)=>{
    const offset=(Math.round(y)*pixels.width+Math.round(x))*4;
    return [...pixels.data.subarray(offset,offset+3)];
  };
  const light=rgb=>rgb.reduce((sum,n)=>sum+n,0);
  const chroma=rgb=>(Math.max(...rgb)-Math.min(...rgb))/Math.max(1,Math.max(...rgb));
  for(const piece of state.pieces) {
    const center=pixel(piece.screen.x,piece.screen.y),direction=piece.row===0?1:-1;
    const edge=piece.screen.y-direction*height/2;
    const band=Array.from({length:3},(_,i)=>pixel(piece.screen.x,edge+direction*(i+2)));
    const rim=band.sort((a,b)=>direction*(light(b)-light(a)))[0];
    check(center[piece.col]===Math.max(...center),'fixture keeps source color in piece '+piece.id);
    check(direction*(light(rim)-light(center))>3,(piece.row===0?'highlight brightens':'shadow darkens')+' image at piece '+piece.id);
    check(chroma(rim)>chroma(center)*.65,'rim retains local image saturation at piece '+piece.id);
  }
});

await run('jigsaw-play','games/jigsaw-puzzle/index.html',{gamepadVerify:1,seed:1042},async({evaluate,until,pads,press,check,cdp})=>{
  await until('window.__jigsaw?.ready && !__jigsaw.busy','jigsaw ready');
  const state = () => evaluate('__jigsaw');
  const committed = s => ({ rows:s.rows,cols:s.cols,allowRotation:s.allowRotation,image:s.image,moves:s.moves,groups:s.groups,
    pieces:s.pieces.map(p=>({id:p.id,center:p.center,edges:p.edges})) });
  const reloadSaved = async label => {
    await until('__jigsaw.saveStatus==="saved"','autosave committed');
    const before=committed(await state());
    await cdp.call('Page.reload');await until('window.__jigsaw?.ready && !__jigsaw.busy && __jigsaw.saveStatus==="saved"','progress restored');
    check(JSON.stringify(committed(await state()))===JSON.stringify(before),label);
    await pads();
  };
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
  check((await state()).audio.played['ui-click']>=3,'wood buttons and settings play UI clicks after user gesture');
  await button('−');await button('−');
  await merge(0,1);
  let s=await state();check(s.groups.some(g=>g.pieces.includes(0)&&g.pieces.includes(1)),'neighbor pieces snap into one group');
  check(s.audio.played['piece-click']>0 && s.audio.played.snap>0 && s.audio.played.complete===0,'piece selection and real merges play distinct sounds');
  const before=s.pieces.slice(0,2).map(p=>p.screen),p=before[0];
  await drag(p,{x:p.x+40,y:p.y+20});s=await state();
  const dx=s.pieces[0].screen.x-before[0].x,dy=s.pieces[0].screen.y-before[0].y;
  check(Math.hypot(dx,dy)>5 && before.every((p,i)=>Math.abs(s.pieces[i].screen.x-p.x-dx)<1 && Math.abs(s.pieces[i].screen.y-p.y-dy)<1),'joined pieces drag as a rigid group');
  const angle=s.groups.find(g=>g.pieces.includes(0)).angle;await key('KeyR');
  check((await state()).groups.find(g=>g.pieces.includes(0)).angle===angle,'rotation-disabled mode ignores rotate input');
  const beforeArrange=(await state()).groups.map(({x,y,...g})=>g);
  await button('整理');const arranged=(await state()).groups;
  for(let i=0;i<8;i++)await button('整理');
  check(JSON.stringify((await state()).groups)===JSON.stringify(arranged),'repeated arrange clicks keep positions stable instead of spreading pieces');
  check(JSON.stringify((await state()).groups.map(({x,y,...g})=>g))===JSON.stringify(beforeArrange),'arrange preserves joined members, angles and stacking order');
  await reloadSaved('Engine autosave restores joined groups, moved positions, seeded cuts and move count');
  // Restoring fits the saved arrangement to the viewport; leave room for the following drags.
  await button('−');await button('−');
  await merge(0,2);await merge(0,3);check((await state()).complete,'all pieces can be assembled');
  await until('__jigsaw.audio.played.complete===1','completion cue');
  await delay(250);check((await state()).audio.played.complete===1,'final merge plays one completion cue');
  await reloadSaved('completed puzzle stays completed after reopening');
  check((await state()).audio.played.complete===0 && (await state()).audio.backend.voices===0,'restored completed puzzle has no completion autoplay');
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
  await reloadSaved('rotated joined groups retain orientation and stacking order after reopening');
  await press(3);check(await evaluate('__gameHud.nodes.some(n=>n.type==="GuiImage"&&n.visible)'),'controller Y opens original image');await press(3);
  await pads([]);
  s=await state();const start=s.pieces[0].screen;
  await drag(start,{x:start.x+30,y:start.y+10},false);
  await pads();await press(8);await until('document.body.dataset.gameReturnOpen==="true"','Back pauses jigsaw');
  check(!(await state()).dragging,'return dialog cancels active piece drag');
  check((await state()).audio.paused && (await state()).audio.backend.voices===0 && (await state()).audio.pending===0,'return dialog clears active and pending audio');
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
  await reloadSaved('uploaded local image and its puzzle restore after reload; invalid upload leaves the save intact');
  const committedGroups=(await state()).groups.map(({order,...g})=>g);
  const pending=(await state()).pieces[0].screen;
  await drag(pending,{x:pending.x+30,y:pending.y+20},false);
  check((await state()).dragging,'save test starts an uncommitted drag');
  await cdp.call('Page.reload');await until('window.__jigsaw?.ready && !__jigsaw.busy','interrupted drag restored');
  check(JSON.stringify((await state()).groups.map(({order,...g})=>g))===JSON.stringify(committedGroups),'reloading during a drag restores committed positions');
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
  await button('整理');const arranged144=(await state()).groups;await button('整理');
  check(JSON.stringify((await state()).groups)===JSON.stringify(arranged144),'144-piece arrangement stays bounded and stable');
  check((await state()).audio.backend.buffers===4 && (await state()).audio.backend.voices<=4,'restarts and uploads retain four buffers and bounded voices');
  check(await evaluate('document.querySelectorAll("canvas").length===1 && !document.querySelector("button,select")'),'all visible controls stay in Engine GUI after restart/upload');
  await reloadSaved('144-piece uploaded puzzle restores every piece after reopening');
  check(await evaluate('__jigsaw.rows===12 && __jigsaw.cols===12 && __jigsaw.allowRotation'),'Engine save restores row/column and rotation preferences');
});

await run('jigsaw-save-unavailable','games/jigsaw-puzzle/index.html',{gamepadVerify:1,seed:1042},async({evaluate,until,check,cdp})=>{
  await until('window.__jigsaw?.ready && !__jigsaw.busy','initial puzzle');
  await cdp.call('Page.addScriptToEvaluateOnNewDocument',{source:'Object.defineProperty(window,"indexedDB",{configurable:true,value:undefined});'});
  await cdp.call('Page.reload');
  await until('window.__jigsaw?.ready && !__jigsaw.busy && __jigsaw.saveStatus==="error"','storage failure is reported');
  check(await evaluate('__gameHud.nodes.some(n=>n.text.includes("自动保存失败"))'),'unavailable Engine backend displays an autosave failure');
  const p=await evaluate('__jigsaw.pieces[0].screen');
  await cdp.call('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',buttons:1,clickCount:1});
  check(await evaluate('__jigsaw.dragging'),'game remains playable when storage is unavailable');
  await cdp.call('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',buttons:0,clickCount:1});
  await evaluate('dispatchEvent(new PageTransitionEvent("pagehide",{persisted:false}))');
  check(await evaluate('__jigsaw.audio.backend.disposed && __jigsaw.audio.backend.buffers===0 && __jigsaw.audio.backend.voices===0 && __jigsaw.audio.backend.audioNodes===0'),'leaving the game disposes every sound buffer and audio node');
});
