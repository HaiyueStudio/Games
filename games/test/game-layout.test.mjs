import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
const root=new URL('../../',import.meta.url);
const manifest=JSON.parse(readFileSync(new URL('games/manifest.json',root),'utf8'));

test('manifest entries stay stable and game implementation lives in feature folders',()=>{
  for(const game of manifest.entries){
    const directory=new URL(`games/${game.id}/`,root);
    assert.ok(existsSync(new URL(`games/${game.entry}`,root)),game.id);
    const files=readdirSync(directory,{withFileTypes:true});
    const rootSources=files.filter(file=>file.isFile()&&file.name.endsWith('.ts')).map(file=>file.name);
    assert.deepEqual(rootSources.sort(),game.id==='mugen'?['charactorPreview.ts','main.ts']:['main.ts'],`${game.id}: root is reserved for public entry points`);
    assert.ok(files.some(file=>file.isDirectory()&&!['assets','dist','audio','_unity_ref'].includes(file.name)),`${game.id}: expected implementation folders`);
  }
});

test('pinball verification fingerprints still refer to real relocated sources',()=>{
  for(const game of ['pinball','ink-pinball']){
    const script=readFileSync(new URL(`scripts/verify-${game}.mjs`,root),'utf8');
    const list=/fingerprints: Object\.fromEntries\(\[([^\]]+)\]/.exec(script)[1];
    for(const match of list.matchAll(/'([^']+)'/g))assert.ok(existsSync(new URL(`games/${game}/${match[1]}`,root)),`${game}: ${match[1]}`);
  }
});
