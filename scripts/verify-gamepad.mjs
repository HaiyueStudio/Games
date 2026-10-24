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
const catalogCount = JSON.parse(readFileSync(resolve(root, 'games/manifest.json'), 'utf8')).entries.filter(entry=>entry.launcher!==false).length;
mkdirSync(output, { recursive: true });
if (!process.env.GAMEPAD_CASE || process.env.GAMEPAD_CASE.split(',').includes('input')) await runRollupOnce({cwd:root,config:'rollup.gamepad-fixture.config.js',expectedOutputs:['artifacts/gamepad/fixture.js'],label:'gamepad input fixture',timeoutMs:120000});
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
  fingerprints: Object.fromEntries(['games/gamepad/runtime.ts','games/gamepad/sampler.ts','games/gamepad/profiles.ts','games/gamepad/lobby.ts','site/app.js','site/index.html','site/styles.css','site/catalog/details.js','site/state/library.js','index.html','site/catalog/paths.js','games/launcher/GameOS.ts','games/launcher/DesktopGui.ts','games/launcher/layout.ts','games/launcher/Aurora.ts','games/tank-battle/game/TankBattle.ts','games/tank-battle/ui/TankBattleHud.ts','games/tank-battle/rendering/render.ts','games/tank-battle/index.html','games/session/GameEngine.ts','games/session/SessionPause.ts','games/session/ReturnDialog.ts','games/session/GameReturnController.ts','games/session/audio.ts','games/triangle-calendar-puzzle/game/TriangleCalendarGame.ts','games/triangle-calendar-puzzle/game/model.ts','games/triangle-calendar-puzzle/ui/CalendarHud.ts','games/triangle-calendar-puzzle/rendering/CalendarBoard.ts','games/triangle-calendar-puzzle/save/saveState.ts'].map(file => [file,createHash('sha256').update(readFileSync(resolve(root,file))).digest('hex')])),
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
  if (gameId === 'jigsaw-puzzle') sourceInputs.push('games/test/fixtures/jigsaw/portrait.svg', 'games/test/fixtures/jigsaw/broken.svg', 'games/test/fixtures/jigsaw/rim-colors.svg', 'games/save/SingleSlotGameSave.ts',
    'games/jigsaw-puzzle/assets/wood-ui.png', 'games/jigsaw-puzzle/assets/wood-ui.provenance.json', 'games/session/audio.ts', 'scripts/generate-jigsaw-audio.mjs',
    ...readdirSync(resolve(root,'games/jigsaw-puzzle/assets/audio')).map(file=>`games/jigsaw-puzzle/assets/audio/${file}`));
  if (gameId === 'fruit-ninja') sourceInputs.push('games/fruit-ninja/assets/fruits.png', 'games/fruit-ninja/assets/fruits-extra.png', 'games/fruit-ninja/assets/items.png', 'games/fruit-ninja/assets/dojo-backdrop.png', 'games/fruit-ninja/assets/dojo-gui.png', 'games/fruit-ninja/assets/provenance.json', 'games/fruit-ninja/assets/fruits-extra.provenance.json', 'games/fruit-ninja/assets/dojo.provenance.json');
  if (gameId === 'fruit-ninja') sourceInputs.push(...readdirSync(resolve(root, 'games/fruit-ninja/assets/audio')).map(file => `games/fruit-ninja/assets/audio/${file}`), 'games/session/audio.ts', 'scripts/generate-fruit-audio.mjs');
  if (!gameId) sourceInputs.push('site/gamepad.js', 'site/game-host.js', 'site/simulator.js', 'scripts/simulator-camera.mjs', 'site/catalog/paths.js', ...['launcher','host','simulator'].flatMap(folder=>readdirSync(resolve(root,'games',folder)).filter(file=>file.endsWith('.ts')).map(file=>`games/${folder}/${file}`)),...readdirSync(resolve(root,'site/core')).filter(file=>file.endsWith('.js')).map(file=>'site/core/'+file));
  if (!gameId) for (const id of ['2048','fruit-ninja','mugen']) sourceInputs.push(...readdirSync(resolve(root,'games',id),{recursive:true}).filter(file=>/\.(?:ts|html|css|js)$/.test(file)).map(file=>'games/'+id+'/'+file));
  const inputs = Object.fromEntries([fixture,entry,...sourceInputs].filter(file=>file&&existsSync(resolve(root,file))).map(file=>[file,createHash('sha256').update(readFileSync(resolve(root,file))).digest('hex')]));
  const result = await runChromeWebGpuFixture({root, fixture, query, timeoutMs:90000, disableDx12InfoCollection:true,
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

async function clickDesktop(context, id) {
  const node = await context.evaluate(`__gameOS.nodes.find(node=>node.id===${JSON.stringify(id)})`);
  assert.ok(node, 'native GUI control '+id);
  const point={x:node.rect.x+node.rect.width/2,y:node.rect.y+node.rect.height/2};
  await context.cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',...point,button:'none',buttons:0});
  await context.cdp.call('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',buttons:1,clickCount:1});
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
  await press(5);check(await evaluate('__gameOS.category')==='puzzle','RB changes category');
  await press(4);check(await evaluate('__gameOS.category')==='all','LB returns to all games');
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

await run('lobby-os','site/index.html',{verify:1},async(context)=>{
  const {evaluate,until,pads,press,check,cdp}=context;
  await cdp.call('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await until(`__gameOS?.games.length===${catalogCount}&&__gameOS.frames>5`,'desktop initialized');await pads();
  check(await evaluate('document.querySelectorAll("canvas").length===1&&!document.querySelector("button,nav,header,main,dialog,svg,hy-notification")'),'one canvas with no hidden DOM interface');
  const first=await evaluate('__gameOS.selected');await press(15);
  check(await evaluate('__gameOS.selected')!==first,'controller updates native featured game');
  await press(2);check(await evaluate('__gameOS.favorites')===1,'X favorites current game');
  await press(3);check(await evaluate('__gameOS.view==="recent"&&__gameOS.games.length===0'),'Y opens actual empty history');
  await press(3);check(await evaluate('__gameOS.view==="favorites"&&__gameOS.games.length===1'),'Y opens favorites');
  await press(2);check(await evaluate('__gameOS.games.length')===0,'last favorite removal shows native empty state');
  await press(5);check(await evaluate('__gameOS.category')==='puzzle','categories remain available in empty views');
  await clickDesktop(context,'view-all');await clickDesktop(context,'search');
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
  await clickDesktop(context,'view-recent');
  check(await evaluate('__gameOS.games.length===1&&__gameOS.games[0]==="2048"'),'history contains launched games only');
  await cdp.call('Page.reload');await until(`__gameOS?.games.length===${catalogCount}&&__gameOS.frames>3`,'reloaded native desktop');
  check(await evaluate('__gameOS.favorites')===1,'favorites persist');
  await clickDesktop(context,'view-recent');check(await evaluate('__gameOS.games[0]')==='2048','history persists');
  await clickDesktop(context,'view-all');await pads([]);await delay(300);
  const capture=async()=>Buffer.from((await cdp.call('Page.captureScreenshot',{format:'png'})).result.data,'base64');
  const firstImage=await capture();await delay(900);const nextImage=await capture();
  const animated=comparePortablePixelRecords(createPortablePixelRecord(firstImage),createPortablePixelRecord(nextImage));
  check(animated.meanAbsoluteError>1.5&&animated.changedChannelRatio>.05,'wallpaper visibly moves across at least five percent of channels');
  writeFileSync(resolve(output,'lobby-wallpaper-a.png'),firstImage);writeFileSync(resolve(output,'lobby-wallpaper-b.png'),nextImage);
  await cdp.call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await delay(250);
  const still=await capture();await delay(500);
  const reduced=comparePortablePixelRecords(createPortablePixelRecord(still),createPortablePixelRecord(await capture()));
  check(await evaluate('!__gameOS.motion')&&reduced.meanAbsoluteError<.1,'reduced motion freezes wallpaper pixels');
  await cdp.call('Emulation.setEmulatedMedia',{features:[]});
  writeFileSync(resolve(output,'lobby-wallpaper-metrics.json'),JSON.stringify({animated:{status:'passed',meanAbsoluteError:animated.meanAbsoluteError,changedChannelRatio:animated.changedChannelRatio},reduced:{status:'passed',meanAbsoluteError:reduced.meanAbsoluteError,changedChannelRatio:reduced.changedChannelRatio}},null,2));
});

await run('lobby-mobile','site/index.html',{verify:1},async(context)=>{
  const {evaluate,until,check,cdp}=context;
  await until(`__gameOS?.games.length===${catalogCount}&&__gameOS.frames>2`,'mobile catalog');
  for(const [width,height]of[[390,844],[844,390],[320,568]]){
    await cdp.call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});await delay(250);
    check(await evaluate('document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight'),`${width}x${height} no DOM overflow`);
    check(await evaluate('__gameOS.shelf.height>=60'),`${width}x${height} usable native scroll shelf`);
    check(await evaluate('(()=>{const button=__gameOS.nodes.find(node=>node.id==="play").rect,hero=__gameOS.hero;return button.x>=hero.x&&button.y>=hero.y&&button.x+button.width<=hero.x+hero.width&&button.y+button.height<=hero.y+hero.height})()'),`${width}x${height} launch control fits preview`);
    await clickDesktop(context,'view-favorites');check(await evaluate('__gameOS.view==="favorites"&&__gameOS.games.length===0'),`${width}x${height} native empty favorites`);
    await clickDesktop(context,'empty-reset');check(await evaluate('__gameOS.games.length')===catalogCount,`${width}x${height} browse all button works`);
    const shelf=await evaluate('__gameOS.shelf');
    await cdp.call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:shelf.x+shelf.width/2,y:shelf.y+shelf.height*.8,id:0}]});
    await cdp.call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:shelf.x+shelf.width/2,y:shelf.y+shelf.height*.2,id:0}]});
    await cdp.call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await delay(200);
    check(await evaluate('__gameOS.shelf.scrollY')>0,`${width}x${height} touch scroll uses Engine GUI`);
    await clickDesktop(context,'view-all');
    const shot=await cdp.call('Page.captureScreenshot',{format:'png'});writeFileSync(resolve(output,`lobby-${width}x${height}.png`),Buffer.from(shot.result.data,'base64'));
  }
});

await run('lobby-cards','site/index.html',{verify:1},async(context)=>{
  const {evaluate,until,check,cdp}=context;
  await cdp.call('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await until(`__gameOS?.games.length===${catalogCount}&&__gameOS.frames>5`,'image-only card catalog');
  await delay(400);
  const snapshot=()=>evaluate('__gameOS'), capture=async(name)=>{
    const bytes=Buffer.from((await cdp.call('Page.captureScreenshot',{format:'png'})).result.data,'base64');
    if(name)writeFileSync(resolve(output,name+'.png'),bytes);return bytes;
  };
  const initial=await snapshot(), first=initial.games[0], second=initial.games[1];
  const details=state=>state.nodes.filter(node=>state.games.some(game=>['caption','title','genre','dimension','input','glow'].some(prefix=>node.id===`${prefix}-${game}`)));
  check(!initial.selectionActive&&details(initial).length===0,'initial cards contain preview images without metadata or glow');
  const restingPixels=decodePng(await capture('lobby-cards-default'));
  const secondCard=initial.nodes.find(node=>node.id==='game-'+second).rect;
  await cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:secondCard.x+secondCard.width/2,y:secondCard.y+secondCard.height/2,button:'none',buttons:0});
  await until(`__gameOS.nodes.some(node=>node.id==='title-${second}')`,'hover card caption');await delay(300);
  await until(`__gameOS.hoverCards.some(card=>card.id==='${second}'&&card.amount>.99)`,'hover card reaches its raised pose');
  let state=await snapshot();
  check(state.nodes.some(node=>node.id==='genre-'+second)&&state.nodes.some(node=>node.id==='dimension-'+second)&&state.nodes.some(node=>node.id==='input-'+second),'hover reveals title and genre/dimension/controller tags');
  check(state.selected===first&&!state.selectionActive&&!state.nodes.some(node=>node.id.startsWith('glow-')),'hover does not latch a selection or a bloom border');
  const hovered=state.hoverCards.find(card=>card.id===second);
  check(hovered.scale>1.04&&hovered.scale<1.05&&hovered.rotation<0&&hovered.rotation>-.025&&hovered.lift<0,'hover gently scales, tilts and lifts the complete card');
  check(JSON.stringify(state.nodes.find(node=>node.id==='game-'+second).rect)===JSON.stringify(secondCard),'hover presentation keeps the native hit region stable without layout shifts');
  const hoveredPixels=decodePng(await capture('lobby-cards-hover'));
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
  await cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:10,y:10,button:'none',buttons:0});
  await until('__gameOS.nodes.every(node=>!node.id.startsWith("title-"))','hover caption fades away');
  await until('__gameOS.hoverCards.length===0','card smoothly returns to its resting pose');
  await cdp.call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await delay(150);
  await cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:secondCard.x+secondCard.width/2,y:secondCard.y+secondCard.height/2,button:'none',buttons:0});await delay(150);
  state=await snapshot();
  check(state.hoverCards.length===0&&state.nodes.some(node=>node.id==='title-'+second),'reduced motion reveals metadata without scaling or tilting cards');
  await cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:10,y:10,button:'none',buttons:0});await delay(100);
  const before=decodePng(await capture());
  await desktopKey(cdp,'ArrowRight','ArrowRight',39);
  await until(`__gameOS.selectionActive&&__gameOS.nodes.some(node=>node.id==='glow-${second}')`,'keyboard selection bloom');
  await delay(250);state=await snapshot();
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
  check(early.scrollY>0&&early.scrollY<350&&early.animating,'wheel input starts a smooth bounded animation');
  check(later.scrollY>early.scrollY+5&&later.scrollY<361,'list continues moving after wheel input stops');
  await until('!__gameOS.shelf.animating','wheel inertia settles');
  check(Math.abs((await snapshot()).shelf.scrollY-360)<1,'wheel scrolling settles without overshoot');
  await clickDesktop(context,'category-puzzle');
  check((await snapshot()).shelf.scrollY===0&&!(await snapshot()).shelf.animating,'filtering resets and cancels scroll momentum');
  await clickDesktop(context,'category-all');
  await cdp.call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await delay(200);
  await evaluate(`window.__scrollEvents=[];for(const type of ['pointerdown','pointermove','pointerup','pointercancel'])document.querySelector('canvas').addEventListener(type,event=>window.__scrollEvents.push({type:event.type,y:event.clientY,time:event.timeStamp}));`);
  const mobileShelf=(await snapshot()).shelf, touchX=mobileShelf.x+mobileShelf.width/2, touchTime=Date.now()/1000;
  await cdp.call('Input.dispatchTouchEvent',{type:'touchStart',timestamp:touchTime,touchPoints:[{x:touchX,y:mobileShelf.y+mobileShelf.height*.85,id:0}]});
  for(const [index,fraction] of [.72,.55,.35].entries()){
    await delay(20);await cdp.call('Input.dispatchTouchEvent',{type:'touchMove',timestamp:touchTime+(index+1)*.04,touchPoints:[{x:touchX,y:mobileShelf.y+mobileShelf.height*fraction,id:0}]});
  }
  await cdp.call('Input.dispatchTouchEvent',{type:'touchEnd',timestamp:touchTime+.14,touchPoints:[]});
  const released=(await snapshot()).shelf.scrollY;await delay(120);const coasted=(await snapshot()).shelf.scrollY;
  writeFileSync(resolve(output,'lobby-scroll-touch.json'),JSON.stringify({released,coasted,shelf:(await snapshot()).shelf,events:await evaluate('window.__scrollEvents')},null,2));
  check(coasted>released+1,'touch release also coasts with native Engine inertia');
  check(await evaluate('!__gameHost.route.game&&!document.querySelector("iframe")'),'scrolling across cards does not launch a game');
  await capture('lobby-scroll-momentum');
  await clickDesktop(context,'category-all');
  await cdp.call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await delay(100);
  const reducedShelf=(await snapshot()).shelf;
  await cdp.call('Input.dispatchMouseEvent',{type:'mouseWheel',x:reducedShelf.x+reducedShelf.width/2,y:reducedShelf.y+reducedShelf.height/2,deltaX:0,deltaY:120});await delay(100);
  check(Math.abs((await snapshot()).shelf.scrollY-120)<1&&!(await snapshot()).shelf.animating,'reduced motion keeps wheel scrolling immediate');
  await cdp.call('Emulation.setEmulatedMedia',{features:[]});
});

for(const [name,fixture,expected]of[['lobby-root','index.html','/games/2048/index.html'],['lobby-published','artifacts/pages/index.html','/artifacts/pages/games/2048/index.html']]){
  await run(name,fixture,{verify:1},async(context)=>{
    const {evaluate,until,check,cdp}=context;
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

await run('lobby-mugen-rtt','site/index.html',{verify:1,game:'mugen',device:'pad'},async({evaluate,until,check,cdp})=>{
  await cdp.call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await until('__gameHost?.id==="mugen"&&__gameHost.simulator?.frames>4','multi-canvas game module and device presenter');
  check(await evaluate('__gameHost.simulator.layers===2'),'multi-canvas sprite world and debug overlay are composited behind the native game HUD');
  await evaluate('window.__mugenRotationInstance=haiyueGameOS.game;true');
  await rotateSimulatorCamera({evaluate,cdp,until},'landscape');
  check(await evaluate('haiyueGameOS.game===__mugenRotationInstance&&__gameHost.simulator.texture.width===1080'),'multi-canvas rotation preserves the mounted game and resizes its device RTT');
  const tap=async text=>{
    const node=await evaluate(`haiyueGameOS.game.debug.__mugenGui.nodes.find(node=>node.text===${JSON.stringify(text)}&&node.visible&&!node.disabled)`);assert.ok(node,'MUGEN control '+text);
    const size=await evaluate('({width:haiyueGameOS.game.canvas.getBoundingClientRect().width,height:haiyueGameOS.game.canvas.getBoundingClientRect().height})'),point=await evaluate(`haiyueGameOS.simulator.projectGame(${(node.rect.x+node.rect.width/2)/size.width},${(node.rect.y+node.rect.height/2)/size.height})`);
    await cdp.call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...point,id:0}]});await cdp.call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await delay(200);
  };
  await tap('AI 对战');await until('haiyueGameOS.game.debug.__mugenGui.screen==="select"','touch opens fighter selection');
  await tap('确认阵容');await until('haiyueGameOS.game.debug.__mugenGui.screen==="stage"','touch confirms fighters');
  await tap('进入战斗');await until('document.querySelector("#game-host .game-mount").shadowRoot.querySelector("#game-document").dataset.gameStatus==="running"','real sprites and combat runtime start');await delay(500);
  check(await evaluate('haiyueGameOS.game.debug.__mugenGui.screen==="fight"&&__gameHost.simulator.frames>10&&__gameHost.simulator.status==="playing"'),'device touch launches the actual multi-canvas fight, not a menu preview or a stale loading screen');
  const fightPixels=await evaluate('haiyueGameOS.simulator.pixels()');
  check(fightPixels.colors>1000&&fightPixels.layerColors.some(colors=>colors>1000),'late fighter resource loads preserve the mounted game and its actual composited sprites, not just the wallpaper');
  const shot=await cdp.call('Page.captureScreenshot',{format:'png'});writeFileSync(resolve(output,'simulator-mugen-fight.png'),Buffer.from(shot.result.data,'base64'));
  await desktopKey(cdp,'Escape','Escape',27);await until('__gameOS.simulatorHome&&!__gameHost.mounted','multi-canvas game cleanup');
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

await run('notifications-lobby','site/index.html',{verify:1},async({evaluate,until,pads,check,cdp})=>{
  await until('__gameOS?.ready&&__gameOS.frames>2','Engine notification surface ready');
  await pads([{buttons:[0]}]);
  check(await evaluate('__gameOS.notices.length')===1,'homepage reports connection even while a button is held');
  check(await evaluate('__gameOS.nodes.find(node=>node.id==="input-status").text.includes("已连接")'),'homepage status follows physical connection');
  check(await evaluate('!document.querySelector("hy-notification,button,nav")'),'homepage notification uses native Engine GUI');
  const shot=await cdp.call('Page.captureScreenshot',{format:'png'});writeFileSync(resolve(output,'notifications-lobby-connected.png'),Buffer.from(shot.result.data,'base64'));
  await delay(5200);
  check(await evaluate('__gameOS.notices.length')===0,'homepage connection notification expires after five seconds');
  await pads([]);
  check(await evaluate('__gameOS.notices.some(notice=>notice.message==="手柄 1 已断开")'),'homepage reports disconnect');
  await pads([{buttons:[0]}]);
  check(await evaluate('__gameOS.notices.length')===1,'rapid reconnect replaces the previous notification');
  await pads([]);await delay(5200);
  check(await evaluate('__gameOS.notices.length')===0,'homepage disconnect notification also expires');
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
