import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve,dirname,relative} from 'node:path';
import {createHash} from 'node:crypto';
const game=resolve(import.meta.dirname,'..'),output=resolve(process.argv[2]??'artifacts/guobiao-mahjong/strength/development'),report=JSON.parse(readFileSync(resolve(output,'report.json'))),archive=resolve(output,'source');
const hash=data=>createHash('sha256').update(data).digest('hex');
for(const [name,expected] of Object.entries(report.fingerprints)){
  const path=resolve(archive,name);if(relative(archive,path).startsWith('..'))throw Error('Invalid source path.');
  const data=readFileSync(existsSync(path)?path:resolve(game,name));if(hash(data)!==expected)throw Error('Source no longer matches evidence: '+name);
  mkdirSync(dirname(path),{recursive:true});writeFileSync(path,data);
}
const supplemental={};
for(const name of ['rules/handAnalysis.ts','model-service/requirements.txt']){const path=resolve(archive,name),data=readFileSync(existsSync(path)?path:resolve(game,name));mkdirSync(dirname(path),{recursive:true});writeFileSync(path,data);supplemental[name]=hash(data);}
writeFileSync(resolve(archive,'manifest.json'),JSON.stringify({schemaVersion:1,archivedAt:new Date().toISOString(),runKey:report.runKey,revision:report.revision,dirty:report.dirty,config:report.config,fingerprints:report.fingerprints,supplemental},null,2)+'\n');
console.log('Archived verified policy/referee/runtime sources in '+archive);
