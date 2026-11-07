import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {resolve,dirname,relative} from 'node:path';
import ts from 'typescript';
/** Follow value imports, not erased type references. Offline models and simulators are forbidden. */
export function runtimeBoundary(game=resolve(import.meta.dirname,'..')){
  const visited=new Set(),entries=['main.ts','ai/browser/tfjs.worker.ts','ai/mahjong.worker.ts','ai/coach.worker.ts'];
  function walk(path){
    if(visited.has(path))return;visited.add(path);const name=relative(game,path).split('\\').join('/');
    assert.ok(!name.startsWith('benchmarks/')&&!name.startsWith('training/')&&!['ai/value/simulation.ts','ai/value/weights.ts'].includes(name)&&!name.includes('teacher'),'Offline dependency entered game: '+name);
    const source=ts.createSourceFile(path,readFileSync(path,'utf8'),ts.ScriptTarget.Latest,true);
    const dependency=specifier=>{if(!specifier.startsWith('.'))return;const base=resolve(dirname(path),specifier),target=[base,base+'.ts',base+'.js',resolve(base,'index.ts')].find(p=>existsSync(p)&&/\.[cm]?[jt]sx?$/.test(p));assert.ok(target,'Missing runtime import: '+specifier);walk(target)};
    function visit(node){
      if(ts.isImportDeclaration(node)&&!node.importClause?.isTypeOnly){const bindings=node.importClause?.namedBindings,typesOnly=!node.importClause?.name&&bindings&&ts.isNamedImports(bindings)&&bindings.elements.length>0&&bindings.elements.every(v=>v.isTypeOnly);if(!typesOnly)dependency(node.moduleSpecifier.text);}
      if(ts.isExportDeclaration(node)&&!node.isTypeOnly&&node.moduleSpecifier){const typesOnly=node.exportClause&&ts.isNamedExports(node.exportClause)&&node.exportClause.elements.every(v=>v.isTypeOnly);if(!typesOnly)dependency(node.moduleSpecifier.text);}
      if(ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword&&ts.isStringLiteral(node.arguments[0]))dependency(node.arguments[0].text);
      ts.forEachChild(node,visit);
    }visit(source);
  }
  entries.forEach(entry=>walk(resolve(game,entry)));return {status:'passed',entries,modules:visited.size};
}
