import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runChromeWebGpuFixture } from '../../Engine/scripts/webgpu-gate/chrome-runner.mjs';

const root=resolve(import.meta.dirname,'..'),output=resolve(root,'.artifacts/minesweeper');
const sha256=data=>createHash('sha256').update(data).digest('hex');
const audioSources=['SoundAssets.ts','MinesAudio.ts','BrowserAudio.ts','verifyAudio.ts'].map(name=>`games/shared/minesweeper/audio/${name}`);
const assets=['games/minesweeper/config.json','games/minesweeper/assets/titanium-albedo.png','games/minesweeper/assets/orbit-gui.png',
  ...['click','flag','explosion','button'].map(id=>`games/minesweeper/assets/audio/${id}.wav`)];
const files=['games/minesweeper/app/bootstrap.ts','games/minesweeper/rendering/BoardScene.ts','games/minesweeper/ui/MinesHud.ts',
  'games/minesweeper/verification/verifyMinesweeper.ts','games/minesweeper/index.html','games/minesweeper/bundle.js',
  'games/shared/minesweeper/Theme.ts','games/shared/minesweeper/MinesHud.ts','games/shared/minesweeper/BoardGesture.ts',
  ...audioSources,...assets,'games/minesweeper/assets/audio/generation.json','scripts/generate-minesweeper-audio.mjs','scripts/verify-minesweeper.mjs'];
mkdirSync(output,{recursive:true});
for(const [profile,width,height]of [['desktop',1440,1000],['mobile',390,844]]) {
  const result=await runChromeWebGpuFixture({root,fixture:'games/minesweeper/index.html',query:{verify:1},timeoutMs:60000,
    visualCapture:{viewportWidth:width,viewportHeight:height}});
  assert.equal(result.status,'passed');assert.equal(result.checks.length,36);
  assert.equal(result.audio.backend.buffers,4);assert.equal(result.audio.backend.error,null);assert.equal(result.audio.backend.state,'running');
  for(const id of ['click','flag','explosion','button'])assert.ok(result.audio.played[id]>0,`Real mixer scheduled ${id}`);
  assert.equal(result.browserDiagnostics.unclassifiedFailureCount,0);
  const png=Buffer.from(result.visualCapture.pngBase64,'base64');assert.ok(png.length>20000,'Rendered board must be nonempty');
  writeFileSync(resolve(output,`${profile}.png`),png);delete result.visualCapture.pngBase64;
  result.provenance={schemaVersion:1,generatedAt:new Date().toISOString(),profile,viewport:[width,height],
    revision:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
    dirty:Boolean(execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim()),
    fingerprints:Object.fromEntries(files.map(path=>[path,sha256(readFileSync(resolve(root,path)))])),screenshotSha256:sha256(png)};
  for(const path of assets) {
    const fetched=result.httpProvenance.files.find(entry=>entry.sourcePath===path);
    assert.equal(fetched?.sha256,result.provenance.fingerprints[path],`Browser fetched the exact asset: ${path}`);
    assert.equal(fetched?.byteLength,readFileSync(resolve(root,path)).length);
  }
  writeFileSync(resolve(output,`${profile}.json`),JSON.stringify(result,null,2)+'\n');
  console.log(`${profile}: ${result.checks.length} PBR/mesh/pointer/GUI/save/audio checks passed; ${resolve(output,`${profile}.png`)}`);
}
