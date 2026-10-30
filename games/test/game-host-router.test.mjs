import test from 'node:test';
import assert from 'node:assert/strict';
import {GameRouter,readGameRoute,routeUrl,gameModuleUrl} from '../host/GameRouter.ts';
import {gameStyles,deviceMediaMatches} from '../host/styles.ts';
import {deviceLayout,iconLabelHeight,iconRectangle,swipePage,gameRectangle} from '../simulator/layout.ts';
import {isGameCancellation} from '../host/cancellation.ts';
import {publishGameModule} from '../../scripts/preview-layout.mjs';
import {canPresentGame} from '../host/readiness.ts';

test('game routes round-trip browser prefixes, query state and independent lazy module URLs',()=>{
  const url='http://localhost:5500/work/Games/index.html?verify=1&seed=42';
  const route={game:'fruit-ninja',device:'phone'},next=routeUrl(url,route);
  assert.deepEqual(readGameRoute(next),route);assert.equal(new URL(next).searchParams.get('seed'),'42');
  assert.deepEqual(readGameRoute(routeUrl(next,{game:null,device:null})),{game:null,device:null});
  assert.equal(gameModuleUrl('2048','http://test/prefix/games/'),'http://test/prefix/games/2048/bundle.js');
  assert.equal(gameModuleUrl('gravity-maze','http://test/prefix/games/'),'http://test/prefix/games/gravity-maze/dist/bundle.js');
  assert.throws(()=>gameModuleUrl('../private','http://test/games/'),/Invalid/);
});

test('router imports only the chosen game, reuses its code, and destroys instances on return',async()=>{
  const imports=[],instances=[];
  const router=new GameRouter(async url=>{imports.push(url);return{async mountGame(options){const instance={disposed:false,dispose(){this.disposed=true;},options};instances.push(instance);return instance;}};});
  await router.mount('first','first.js',{root:{}});router.clear();assert.equal(instances[0].disposed,true);
  await router.mount('first','first.js',{root:{}});assert.deepEqual(imports,['first.js']);
  await router.mount('second','second.js',{root:{}});assert.equal(instances[1].disposed,true);assert.deepEqual(imports,['first.js','second.js']);router.dispose();assert.equal(instances[2].disposed,true);
});

test('stale imports cannot boot, and in-flight mounts receive abort without replacing a newer route',async()=>{
  let resolveImport,resolveMount,booted=false,signal;
  const router=new GameRouter(url=>url==='slow.js'?new Promise(resolve=>{resolveImport=resolve;}):Promise.resolve({mountGame:async options=>{signal=options.signal;return new Promise(resolve=>{resolveMount=resolve;});}}));
  const slow=router.mount('slow','slow.js',{root:{}});router.clear();resolveImport({mountGame(){booted=true;}});assert.equal(await slow,null);assert.equal(booted,false);
  const mounting=router.mount('mounting','mount.js',{root:{}});await new Promise(resolve=>setImmediate(resolve));router.clear();assert.equal(signal.aborted,true);
  const instance={disposed:false,dispose(){this.disposed=true;}};resolveMount(instance);assert.equal(await mounting,null);assert.equal(instance.disposed,true);assert.equal(router.instance,null);
});

test('failed module imports can be retried instead of poisoning the loader cache',async()=>{
  const urls=[];let attempts=0;const router=new GameRouter(async url=>{urls.push(url);if(++attempts===1)throw new Error('offline');return{mountGame:async()=>({dispose(){}})};});
  await assert.rejects(router.mount('retry','retry.js',{root:{}}),/offline/);await router.mount('retry','retry.js',{root:{}});assert.equal(attempts,2);router.dispose();
  assert.deepEqual(urls,['retry.js','retry.js?haiyueRetry=1']);
});
test('readiness waits for bootstrap, resources and the first running frame, but accepts explicitly stopped screenshots',()=>{
  const engine={state:'ready',runningForHost:true};
  assert.equal(canPresentGame(engine,false,0,0),false);assert.equal(canPresentGame(engine,true,1,0),false);assert.equal(canPresentGame(engine,true,0,1),false);
  assert.equal(canPresentGame(engine,true,0,0),true);assert.equal(canPresentGame({...engine,runningForHost:false},false,0,0),true);
  assert.equal(canPresentGame({...engine,state:'destroyed'},true,0,0),false);assert.equal(canPresentGame(null,false,0,0),false);
  for(const status of ['starting','loading','pending','initializing'])assert.equal(canPresentGame(engine,true,0,0,[status]),false);
  assert.equal(canPresentGame(engine,true,0,0,['passed']),true);
});
test('caller cancellation reaches the owned game without cancelling other router generations',async()=>{
  let signal;
  const router=new GameRouter(async()=>({mountGame:async options=>{signal=options.signal;return {dispose(){}};}})),controller=new AbortController();
  await router.mount('game','game.js',{root:{},signal:controller.signal});controller.abort();assert.equal(signal.aborted,true);
  await router.mount('game','game.js',{root:{}});assert.equal(signal.aborted,false);router.dispose();
});
test('published modules keep runtime imports inside their flattened Pages root',()=>{
  assert.equal(publishGameModule("import {mountGame} from '../../site/game-host.js';"),"import {mountGame} from '../../game-host.js';");
  assert.equal(publishGameModule("import {mountGame} from '../../../site/game-host.js';"),"import {mountGame} from '../../../game-host.js';");
  assert.equal(publishGameModule("import './chunks/renderer.js';"),"import './chunks/renderer.js';");
});

test('hosted styles remain container-local and retain real game-relative asset URLs',()=>{
  const css='html,body{height:100dvh;width:100vw;background:url(./assets/body.png);position:fixed}.body-text{color:white}@media(max-width:700px){canvas{width:90vw}}@media(pointer:coarse) and(max-width:700px){button{display:block}}';
  const result=gameStyles(css,'http://test/games/demo/index.html',true);
  assert.match(result,/#game-document,#game-document/);assert.match(result,/http:\/\/test\/games\/demo\/assets\/body.png/);assert.match(result,/\.body-text/);
  assert.match(result,/var\(--game-height\)/);assert.match(result,/position:absolute/);assert.match(result,/@container game-viewport \(max-width:700px\)/);
  assert.match(result,/\(min-width:0px\) and\(max-width:700px\)/);
});

test('device input reports touch and viewport media without overriding reduced-motion preferences',()=>{
  const fallback=query=>query.includes('prefers-reduced-motion');
  assert.equal(deviceMediaMatches('(pointer:coarse) and (max-width:700px)',390,760,fallback),true);
  assert.equal(deviceMediaMatches('(pointer:coarse) and (max-width:700px)',820,1080,fallback),false);
  assert.equal(deviceMediaMatches('(pointer:fine)',390,760,fallback),false);
  assert.equal(deviceMediaMatches('(orientation:portrait)',390,760,fallback),true);
  assert.equal(deviceMediaMatches('(prefers-reduced-motion:reduce)',390,760,fallback),true);
});

test('phone and pad frames, icons and swipe limits stay within their owning viewport',()=>{
  for(const [width,height]of[[320,568],[390,844],[844,390],[1440,900]])for(const mode of ['pad','phone']){
    const layout=deviceLayout(width,height,mode);assert.ok(layout.body.x>=0&&layout.body.y+layout.body.height<=height-42);
    for(let index=0;index<layout.pages;index++){const icon=iconRectangle(index,layout.screen,layout.columns,layout.rows);assert.ok(icon.x>=0&&icon.x+icon.width<=layout.screen.width+.1&&icon.y+icon.height+iconLabelHeight(layout.screen,layout.rows)+4<=layout.screen.height);}
  }
  assert.equal(swipePage(0,100,300,3),0);assert.equal(swipePage(0,-100,300,3),1);assert.equal(swipePage(2,-100,300,3),2);assert.equal(swipePage(1,5,300,3),1);
  assert.deepEqual(gameRectangle({x:100,y:200,width:400,height:800},{x:0,y:.25,width:1,height:.5}),{x:100,y:400,width:400,height:400});
});
test('expected teardown cancellation is distinct from genuine runtime or GPU errors',()=>{
  assert.equal(isGameCancellation(new DOMException('cancelled','AbortError')),true);
  assert.equal(isGameCancellation({code:'E_ENGINE_INVALID_STATE',context:{state:'destroyed'}}),true);
  assert.equal(isGameCancellation({code:'E_ENGINE_INVALID_STATE',context:{state:'initializing'}}),false);
  assert.equal(isGameCancellation({message:'destroyed GPUBuffer used in a pass'}),false);
  assert.equal(isGameCancellation(new Error('shader compilation failed')),false);
});
