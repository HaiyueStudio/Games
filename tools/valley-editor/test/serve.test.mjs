import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

// Exercise the real npm serve entry point, including its root and directory URLs.
test('serve keeps relative editor assets and map parameters working at every entry URL',async t=>{
  const child=spawn(process.execPath,[fileURLToPath(new URL('../serve.mjs',import.meta.url)),'0'],{cwd:fileURLToPath(new URL('../',import.meta.url)),stdio:['ignore','pipe','pipe']});
  t.after(async()=>{if(child.exitCode===null){const stopped=once(child,'exit');child.kill();await stopped;}});
  const base=await new Promise((resolve,reject)=>{
    let output='';const timeout=setTimeout(()=>reject(new Error(`Server startup timed out: ${output}`)),10000);
    const fail=error=>{clearTimeout(timeout);reject(error);};child.once('error',fail);child.once('exit',code=>fail(new Error(`Server exited: ${code}: ${output}`)));
    child.stderr.on('data',chunk=>{output+=chunk;});
    child.stdout.on('data',chunk=>{output+=chunk;const match=output.match(/http:\/\/127\.0\.0\.1:\d+/);if(match){clearTimeout(timeout);resolve(match[0]);}});
  });
  const query='?demo=sea&verify=1';
  for(const [entry,expected] of [['/','/tools/valley-editor/index.html'],['/tools/valley-editor','/tools/valley-editor/'],['/tools/valley-editor/','/tools/valley-editor/'],['/tools/valley-editor/index.html','/tools/valley-editor/index.html']]){
    const initial=await fetch(base+entry+query,{redirect:'manual'});
    if(entry!==expected){assert.equal(initial.status,302,entry);assert.equal(initial.headers.get('location'),expected+query);}else assert.equal(initial.status,200,entry);
    await initial.body?.cancel();
    const page=await fetch(base+entry+query);assert.equal(page.url,base+expected+query);assert.equal(page.status,200);
    const html=await page.text(),css=html.match(/<link[^>]+href="([^"]+)"/)[1],js=html.match(/<script[^>]+src="([^"]+)"/)[1];
    for(const [asset,mime] of [[css,'text/css'],[js,'text/javascript'],['../../games/valley-of-light/assets/traveler.gltf','model/gltf+json']]){
      const response=await fetch(new URL(asset,page.url));assert.equal(response.status,200,`${entry}: ${asset}`);assert.ok(response.headers.get('content-type')?.startsWith(mime),asset);assert.ok((await response.arrayBuffer()).byteLength>0,asset);
    }
  }
  const missing=await fetch(base+'/tools/valley-editor/missing.js');assert.equal(missing.status,404);
});
