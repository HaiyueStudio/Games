import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { registerHooks } from 'node:module';

registerHooks({ resolve(specifier, context, nextResolve) { const relativeWithoutExtension = /^\.{1,2}\//u.test(specifier) && !/\.[a-z0-9]+$/iu.test(specifier); return nextResolve(relativeWithoutExtension ? `${specifier}.ts` : specifier, context); } });

const [{ createMugenVfs }, { buildMugenImportGraph }, { parseMugenExpression }] = await Promise.all([
  import('../../import/vfs/MugenVfs.ts'),
  import('../../import/text/DependencyGraph.ts'),
  import('../../import/cns/ExpressionParser.ts'),
]);

const root = resolve(process.argv[2] ?? new URL('../../charactors/Petra_Johanna_Lagerkvist/', import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/u, value => value.slice(1)));
const files = [];
const visit = directory => { for (const entry of readdirSync(directory, { withFileTypes: true })) { const path = join(directory, entry.name); if (entry.isDirectory()) visit(path); else if (entry.isFile()) files.push(path); } };
visit(root);
const vfs = await createMugenVfs(files.map(path => ({ path: relative(root, path).replaceAll('\\', '/'), bytes: new Uint8Array(readFileSync(path)) })));
const graph = await buildMugenImportGraph(vfs, { entryDef: 'Petra_Johanna_Lagerkvist.def', entryKind: 'character' });
const failures = [];
let accepted = 0;
for (const resource of graph.resources) {
  const document = resource.document;
  if (!document) continue;
  for (const token of document.tokens) {
    if (token.kind !== 'assignment' || token.foldedKey !== 'triggerall' && !/^trigger\d+$/u.test(token.foldedKey)) continue;
    try { parseMugenExpression(token.value, document, token); accepted += 1; }
    catch (error) { const diagnostic = error?.diagnostics?.[0]; failures.push({ path: document.canonicalPath, line: token.valueSpan.line, source: token.value, code: diagnostic?.code ?? error?.name ?? 'Error', message: diagnostic?.message ?? error?.message ?? String(error) }); }
  }
}
const byMessage = new Map();
for (const failure of failures) { const key = `${failure.code}: ${failure.message}`; const entry = byMessage.get(key) ?? { code: failure.code, message: failure.message, count: 0, samples: [] }; entry.count += 1; if (entry.samples.length < 5) entry.samples.push({ path: failure.path, line: failure.line, source: failure.source }); byMessage.set(key, entry); }
const result = { schemaVersion: 1, character: 'Petra_Johanna_Lagerkvist', total: accepted + failures.length, accepted, failed: failures.length, groups: [...byMessage.values()].sort((left, right) => right.count - left.count || left.message.localeCompare(right.message)) };
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
process.exitCode = failures.length === 0 ? 0 : 1;
