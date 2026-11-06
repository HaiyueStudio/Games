/** Build step: pack the cleaned 9×4 reference plus our flower/back sprites into one GPU texture. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runChromeWebGpuFixture } from '../../../../Engine/scripts/webgpu-gate/chrome-runner.mjs';
const assets = new URL('./', import.meta.url), root = join(tmpdir(), 'haiyue-mahjong-reference-pack');
mkdirSync(root, { recursive: true }); writeFileSync(join(root, 'index.html'), '<!doctype html><html><body></body></html>');
const data = name => 'data:image/png;base64,' + readFileSync(new URL(name, assets)).toString('base64');
await runChromeWebGpuFixture({ root, fixture: 'index.html', timeoutMs: 30000, interact: async cdp => {
  for (let n = 0; n < 100; n++) { const r = await cdp.call('Runtime.evaluate', { expression: "location.pathname==='/index.html'&&!!document.body", returnByValue: true }); if (r.result?.result?.value) break; await new Promise(r => setTimeout(r, 50)); }
  const r = await cdp.call('Runtime.evaluate', { expression: `(async()=>{
    const load=async url=>{const image=new Image();image.src=url;await image.decode();return image};
    const [fronts,supplement]=await Promise.all([load(${JSON.stringify(data('reference-tiles-clean.png'))}),load(${JSON.stringify(data('tiles-supplement.png'))})]);
    const canvas=document.createElement('canvas');canvas.width=1152;canvas.height=1152;
    const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
    const honorColumns=[5,2,6,0,3,4,1];
    for(let id=0;id<43;id++){
      const x=id%8*144+8,y=Math.floor(id/8)*192+8;
      if(id<34){const col=id<27?id%9:honorColumns[id-27],row=id<27?Math.floor(id/9):3;
        const cw=fronts.width/9,ch=fronts.height/4;ctx.drawImage(fronts,col*cw+1,row*ch+1,cw-2,ch-2,x,y,128,176);
      }else ctx.drawImage(supplement,x,y,128,176,x,y,128,176);
    }
    const result=document.createElement('pre');result.id='result';result.dataset.status='passed';result.textContent='{}';document.body.appendChild(result);
    return canvas.toDataURL('image/png').split(',')[1];
  })()`, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text);
  writeFileSync(new URL('tiles-atlas.png', assets), Buffer.from(r.result.result.value, 'base64'));
} });
const files = ['reference-tiles-clean.png', 'tiles-supplement.png', 'pack-reference-atlas.mjs', 'tiles-atlas.png', 'tiles-atlas.json'];
writeFileSync(new URL('tiles-atlas.provenance.json', assets), JSON.stringify({ version: 2, artwork: 'User-provided traditional mahjong fronts, watermark removed; original HaiyueStudio flowers and jade back', sourceImage: 'reference-tiles-clean.png', editTool: 'built-in image_gen', prompt: 'Remove only the bottom-right watermark; restore the White Dragon border and ivory face from the clean duplicate. Preserve the complete 9×4 grid, all glyphs, pip counts, colors and shading.', packer: 'pack-reference-atlas.mjs', rasterSize: [1152, 1152], sourceLayout: { columns: 9, rows: 4, honorColumns: [5, 2, 6, 0, 3, 4, 1] }, sha256: Object.fromEntries(files.map(f => [f, createHash('sha256').update(readFileSync(new URL(f, assets))).digest('hex')])) }, null, 2) + '\n');
console.log('Packed 34 reference fronts, eight flowers and one back into the 1152×1152 atlas.');
