import MagicString from 'magic-string';
import { attachScopes } from '@rollup/pluginutils';

function environmentBindings(context = 'environment', declared = () => false) {
  const names = ['window','document','location','navigator','fetch','requestAnimationFrame','cancelAnimationFrame','setTimeout','clearTimeout','setInterval','clearInterval','ResizeObserver','MutationObserver','Worker','Image','AudioContext','Event','KeyboardEvent','PointerEvent','MouseEvent','WheelEvent','matchMedia','console'].filter(name => !declared(name));
  const aliases = { globalThis: `${context}.window??${context}`, self: `${context}.window??${context}.self`, parent: `${context}.window??${context}.parent`, top: `${context}.window??${context}.top`, webkitAudioContext: `${context}.AudioContext` };
  const constants = Object.entries(aliases).filter(([name]) => !declared(name)).map(([name, value]) => `${name}=${value}`);
  const sizes = ['innerWidth','innerHeight','devicePixelRatio'].filter(name => !declared(name));
  return `const {${names.join(',')}}=${context};\n${constants.length ? 'const '+constants.join(',')+';\n' : ''}${sizes.length ? 'let '+sizes.map(name=>`${name}=${context}.window?.${name}??${name==='devicePixelRatio'?1:0}`).join(',')+';\n'+context+'.onViewportChange?.(()=>{'+sizes.map(name=>`${name}=${context}.window.${name};`).join('')+'});\n' : ''}`;
}

export function gameModulePlugin(id, nested = false) {
  return { name: 'haiyue-mountable-game', renderChunk(code, chunk, options) {
    const source = new MagicString(code), runtime = `${nested ? '../../../' : '../../'}site/game-host.js`;
    const track = (statements, context) => {
      for (const node of statements) if (node.type === 'ExpressionStatement') {
        const expression = node.expression.type === 'UnaryExpression' && node.expression.operator === 'void' ? node.expression.argument : node.expression;
        if (expression.type !== 'CallExpression') continue;
        source.prependLeft(expression.start, `(${context}.trackBoot??(value=>value))(`); source.appendRight(expression.end, ')');
      }
    };
    if (options.format === 'es') {
      const ast = this.parse(code), imports = [], setup = [], exports = [], references = new Map();
      const rootScope = attachScopes(ast);
      let context = '__haiyueEnvironment'; while (rootScope.contains(context)) context += '_';
      if (chunk.isEntry && !/worker\.ts$/.test(chunk.facadeModuleId ?? '')) track(ast.body, context);
      for (const node of ast.body) {
        if (node.type === 'ImportDeclaration') {
          const name = `__gameDependency${imports.length}`; imports.push(`import {createGameChunk as ${name}} from ${JSON.stringify(node.source.value)};`);
          const namespace = `__gameImports${imports.length}`; setup.push(`const ${namespace}=${name}(${context});`);
          for (const specifier of node.specifiers) references.set(specifier.local.name, specifier.type === 'ImportNamespaceSpecifier' ? namespace : `${namespace}[${JSON.stringify(specifier.type === 'ImportDefaultSpecifier' ? 'default' : specifier.imported.name)}]`);
          source.remove(node.start, node.end);
        } else if (node.type === 'ExportNamedDeclaration') {
          if (node.declaration) {
            source.remove(node.start, node.declaration.start);
            const names = node.declaration.type === 'VariableDeclaration' ? node.declaration.declarations.map(item => item.id.name) : [node.declaration.id.name];
            for (const name of names) exports.push({ exported: name, local: name });
          } else {
            for (const specifier of node.specifiers) exports.push({ exported: specifier.exported.name, local: specifier.local.name });
            source.remove(node.start, node.end);
          }
        } else if (node.type === 'ExportDefaultDeclaration') throw new Error('Game chunks require named exports.');
      }
      const walk = (node, parent, scope = rootScope) => {
        if (!node || typeof node !== 'object') return;
        scope = node.scope ?? scope;
        if (node.type === 'ImportDeclaration' || node.type === 'ExportNamedDeclaration' && !node.declaration) return;
        if (node.type === 'ImportExpression') source.appendLeft(node.end, `.then(module=>module.createGameChunk(${context}))`);
        if (node.type === 'Property' && node.shorthand && node.value.type === 'Identifier' && references.has(node.value.name) && !scope.contains(node.value.name)) {
          source.overwrite(node.start, node.end, `${node.key.name}:(0,${references.get(node.value.name)})`); return;
        }
        if (node.type === 'Identifier' && references.has(node.name) && !scope.contains(node.name)) {
          const property = parent && ['MemberExpression', 'Property', 'PropertyDefinition', 'MethodDefinition'].includes(parent.type) && (parent.key === node || parent.property === node) && !parent.computed;
          const label = parent && ['LabeledStatement', 'BreakStatement', 'ContinueStatement', 'ExportSpecifier'].includes(parent.type);
          if (!property && !label) source.overwrite(node.start, node.end, `(0,${references.get(node.name)})`);
        }
        for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(child => walk(child, node, scope)); else if (value?.type) walk(value, node, scope);
      }; walk(ast, null);
      const properties = exports.map(({ exported, local }) => `${JSON.stringify(exported)}:{enumerable:true,get:()=>${references.get(local) ?? local}}`).join(',');
      source.prepend(`${imports.join('\n')}\nconst gameChunkCache=new WeakMap();\nexport function createGameChunk(${context}){if(gameChunkCache.has(${context}))return gameChunkCache.get(${context});const chunkExports={};gameChunkCache.set(${context},chunkExports);\n${environmentBindings(context, name=>rootScope.contains(name))}Object.defineProperties(chunkExports,{${properties}});\n${setup.join('\n')}\n`);
      source.append('\nreturn chunkExports;}\n');
      if (chunk.isEntry && /worker\.ts$/.test(chunk.facadeModuleId ?? '')) source.append('createGameChunk(globalThis);\n');
      else if (chunk.isEntry) {
        source.prepend(`import {createGameModule,startStandalone} from '${runtime}';\n`);
        source.append(`const gameModule=createGameModule(${JSON.stringify(id)},import.meta.url,createGameChunk);\nexport const mountGame=gameModule.mountGame;\nstartStandalone(gameModule,import.meta.url);\n`);
      }
    } else {
      const ast = this.parse(code);
      for (const node of ast.body) if (node.type === 'ExpressionStatement' && node.expression.type === 'CallExpression' && node.expression.callee.type === 'FunctionExpression') track(node.expression.callee.body.body, 'environment');
      source.prepend(`import {createGameModule,startStandalone} from '${runtime}';\nconst gameModule=createGameModule(${JSON.stringify(id)},import.meta.url,async environment=>{\n${environmentBindings()}`);
      source.append('\n});\nexport const mountGame=gameModule.mountGame;\nstartStandalone(gameModule,import.meta.url);\n');
    }
    return { code: source.toString(), map: source.generateMap({ hires: true }) };
  } };
}
