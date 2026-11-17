import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {validateEvidence} from './evidence.mjs';
registerHooks({resolve(s,c,next){return next(/^\.{1,2}\//.test(s)&&!/\.[a-z0-9]+$/i.test(s)?s+'.ts':s,c)}});
const output=resolve(process.argv[2]??'artifacts/guobiao-mahjong/strength/development'),source=resolve(output,'source'),bytes=readFileSync(resolve(output,'report.json')),report=JSON.parse(bytes),hash=data=>createHash('sha256').update(data).digest('hex');
for(const [name,expected] of Object.entries(report.fingerprints))assert.equal(hash(readFileSync(resolve(source,name))),expected,'Archived source mismatch: '+name);
const records=readdirSync(resolve(output,'matches')).filter(f=>f.endsWith('.json')).map(f=>({name:f,bytes:readFileSync(resolve(output,'matches',f))})),counts=validateEvidence(report,records.map(r=>JSON.parse(r.bytes)));
const {createScorer}=await import(pathToFileURL(resolve(source,'rules/scorer.ts'))),{replayMatch}=await import(pathToFileURL(resolve(source,'rules/replay.ts'))),scorer=await createScorer(readFileSync(resolve(source,'assets/mcr.wasm')));
for(const record of records){const g=JSON.parse(record.bytes),s=replayMatch(g.replay,scorer);assert.equal(s.phase,'match-over');assert.deepEqual(s.results,g.results);for(const [i,p] of s.players.entries())for(const key of ['fan','score','wins'])assert.equal(p[key],g.seats[i][key],record.name+' '+key);}
writeFileSync(resolve(output,'validation.json'),JSON.stringify({schemaVersion:1,generatedAt:new Date().toISOString(),status:'passed',runKey:report.runKey,reportSha256:hash(bytes),matches:Object.fromEntries(records.map(r=>[r.name,hash(r.bytes)])),checks:['complete-seed-seat-coverage','zero-provider-faults','normalized-metrics','source-fingerprints','all-replayed-actions-legal','eight-fan-wins','zero-sum-settlement'],...counts},null,2)+'\n');
console.log(`Validated ${counts.matches} complete matches / ${counts.hands} hands / ${counts.decisions} legal actions.`);
