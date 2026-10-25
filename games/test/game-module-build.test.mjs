import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAst} from 'rollup/parseAst';
import {gameModulePlugin} from '../../scripts/rollup-plugin-game-module.mjs';

function chunk(source){return gameModulePlugin('fixture').renderChunk.call({parse:parseAst},source,{isEntry:false},{format:'es'}).code;}
function url(source){return 'data:text/javascript;base64,'+Buffer.from(source).toString('base64');}
test('split game chunks defer side effects, cache within a mount, and recreate state for the next mount',async()=>{
  const module=await import(url(chunk('globalThis.boots=(globalThis.boots||0)+1;let value=0;function increment(){return ++value;}export {increment};')));
  const first={window:{}},second={window:{}};assert.equal(first.window.boots,undefined);
  const instance=module.createGameChunk(first);assert.equal(first.window.boots,1);assert.equal(instance.increment(),1);assert.equal(module.createGameChunk(first),instance);assert.equal(instance.increment(),2);
  assert.equal(module.createGameChunk(second).increment(),1);assert.equal(second.window.boots,1);
});
test('split chunks preserve live named imports, local shadowing, namespace access and lazy boundaries',async()=>{
  const dependency=url(chunk('let value=1;function increment(){value++;return this===undefined;}export {value,increment};'));
  const lazy=url(chunk('globalThis.lazy=(globalThis.lazy||0)+1;export const marker=42;'));
  const code=chunk('import {value,increment} from '+JSON.stringify(dependency)+';import * as namespace from '+JSON.stringify(dependency)+';function read(){return value;}function invoke(){return increment();}function shadow(value){return value;}function object(){return {value};}async function load(){return (await import('+JSON.stringify(lazy)+')).marker;}export {read,invoke,shadow,object,namespace,load};');
  const module=await import(url(code)),environment={window:{}},instance=module.createGameChunk(environment);
  assert.equal(instance.read(),1);assert.equal(instance.invoke(),true);assert.equal(instance.read(),2);assert.equal(instance.namespace.value,2);assert.equal(instance.shadow(9),9);assert.deepEqual(instance.object(),{value:2});
  assert.equal(environment.window.lazy,undefined);assert.equal(await instance.load(),42);assert.equal(environment.window.lazy,1);
});
test('one-file game outputs export mountGame without executing the bootstrap at import time',()=>{
  const result=gameModulePlugin('sample').renderChunk.call({parse:parseAst},'(function(){window.booted=true;})();',{isEntry:true},{format:'iife'}).code;
  assert.match(result,/export const mountGame=gameModule.mountGame/);assert.match(result,/createGameModule\("sample",import.meta.url,async environment=>/);assert.match(result,/startStandalone\(gameModule,import.meta.url\)/);
});
test('game module adapters track asynchronous entry bootstrap without changing later event callbacks',()=>{
  const entry={isEntry:true,facadeModuleId:'main.ts'},context={parse:parseAst};
  const source='void boot();function later(){return boot();}';
  const split=gameModulePlugin('sample',true).renderChunk.call(context,source,entry,{format:'es'}).code;
  const single=gameModulePlugin('sample').renderChunk.call(context,'(function(){'+source+'})();',entry,{format:'iife'}).code;
  for(const result of [split,single]){assert.match(result,/trackBoot\?\?\(value=>value\)\)\(boot\(\)\)/);assert.match(result,/function later\(\)\{return boot\(\);\}/);parseAst(result);}
});
test('game chunks can declare browser-global names without colliding with the host bindings',async()=>{
  const module=await import(url(chunk('function location(){return "codec";}const document=42;function read(){return document;}export {location,read};'))),instance=module.createGameChunk({window:{}});
  assert.equal(instance.location(),'codec');assert.equal(instance.read(),42);
});
