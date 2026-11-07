import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve,dirname,relative} from 'node:path';
import {createHash} from 'node:crypto';
const game=resolve(import.meta.dirname,'..'),data=resolve(process.argv[2]??'artifacts/guobiao-mahjong/value/data-v2'),archive=resolve(data,'source'),reportBytes=readFileSync(resolve(data,'report.json')),report=JSON.parse(reportBytes),hash=b=>createHash('sha256').update(b).digest('hex');
assert.equal(hash(readFileSync(resolve(data,'groups.json'))),report.groupsSha256);
for(const [p,sha] of Object.entries(report.fingerprints)){const target=resolve(archive,p);assert.ok(!relative(archive,target).startsWith('..'),'Invalid source path');const bytes=readFileSync(existsSync(target)?target:resolve(game,p));assert.equal(hash(bytes),sha,'Generator source changed: '+p);mkdirSync(dirname(target),{recursive:true});if(!existsSync(target))writeFileSync(target,bytes);}
const manifest={schemaVersion:1,datasetReportSha256:hash(reportBytes),fingerprints:report.fingerprints,status:'passed'},path=resolve(archive,'manifest.json');
if(existsSync(path))assert.deepEqual(JSON.parse(readFileSync(path)),manifest);else writeFileSync(path,JSON.stringify(manifest,null,2)+'\n');
console.log('Original simulation dataset and generator source archive verified.');
