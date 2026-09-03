import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { registerHooks } from 'node:module';

registerHooks({ resolve(specifier, context, nextResolve) { const relativeWithoutExtension = /^\.{1,2}\//u.test(specifier) && !/\.[a-z0-9]+$/iu.test(specifier); return nextResolve(relativeWithoutExtension ? `${specifier}.ts` : specifier, context); } });

const [{ createMugenVfs }, { buildMugenImportGraph }, { parseMugenStateDocuments }, { parseMugenTextFile }] = await Promise.all([
  import('../../import/vfs/MugenVfs.ts'),
  import('../../import/text/DependencyGraph.ts'),
  import('../../import/cns/CnsParser.ts'),
  import('../../import/text/MugenTextParser.ts'),
]);

const OUTPUT_TYPES = new Set(['assertspecial', 'forcefeedback', 'envshake', 'screenbound', 'gamemakeanim', 'fallenvshake', 'trans', 'appendtoclipboard', 'displaytoclipboard', 'palfx', 'afterimage', 'afterimagetime', 'bgpalfx', 'makedust']);
const root = resolve(process.argv[2] ?? new URL('../../charactors/Petra_Johanna_Lagerkvist/', import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/u, value => value.slice(1)));
const files = [];
const visit = directory => { for (const entry of readdirSync(directory, { withFileTypes: true })) { const path = join(directory, entry.name); if (entry.isDirectory()) visit(path); else if (entry.isFile()) files.push(path); } };
visit(root);
const vfs = await createMugenVfs(files.map(path => ({ path: relative(root, path).replaceAll('\\', '/'), bytes: new Uint8Array(readFileSync(path)) })));
const graph = await buildMugenImportGraph(vfs, { entryDef: 'Petra_Johanna_Lagerkvist.def', entryKind: 'character' });
const counts = new Map();
const syntheticSections = [];
let allControllers = 0;
for (const resource of graph.resources) {
  const document = resource.document;
  if (!document) continue;
  for (const section of document.sections) {
    if (!/^state\s+-?\d+\s*,/iu.test(section.name.trim())) continue;
    allControllers += 1;
    const assignments = document.tokens.slice(section.tokenStart, section.tokenEnd).filter(token => token.kind === 'assignment');
    const typeToken = assignments.find(token => token.foldedKey === 'type');
    const foldedType = typeToken?.value.trim().replace(/\s+/gu, '').toLowerCase();
    if (!foldedType || !OUTPUT_TYPES.has(foldedType)) continue;
    syntheticSections.push(`[State 0, census-${syntheticSections.length}]\n${assignments.map(assignment => `${assignment.key} = ${assignment.value}`).join('\n')}`);
    const entry = counts.get(foldedType) ?? { type: typeToken.value.trim(), count: 0, parameters: new Map(), samples: [] };
    entry.count += 1;
    for (const assignment of assignments) {
      if (assignment === typeToken || assignment.foldedKey === 'triggerall' || /^trigger\d+$/u.test(assignment.foldedKey) || assignment.foldedKey === 'persistent' || assignment.foldedKey === 'ignorehitpause') continue;
      const parameter = entry.parameters.get(assignment.foldedKey) ?? { count: 0, values: new Map() };
      parameter.count += 1;
      const normalizedValue = assignment.value.trim();
      parameter.values.set(normalizedValue, (parameter.values.get(normalizedValue) ?? 0) + 1);
      entry.parameters.set(assignment.foldedKey, parameter);
    }
    if (entry.samples.length < 5) entry.samples.push({ path: document.canonicalPath, line: section.header.span.line, section: section.name });
    counts.set(foldedType, entry);
  }
}
const controllers = [...counts.entries()].sort((left, right) => right[1].count - left[1].count || left[0].localeCompare(right[0])).map(([foldedType, entry]) => ({
  foldedType,
  type: entry.type,
  count: entry.count,
  parameters: Object.fromEntries([...entry.parameters.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([name, parameter]) => [name, { count: parameter.count, values: [...parameter.values.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])).slice(0, 20).map(([value, count]) => ({ value, count })) }])),
  samples: entry.samples,
}));
const outputControllers = controllers.reduce((sum, entry) => sum + entry.count, 0);
const syntheticText = `[StateDef 0]\ntype = S\nmovetype = I\nphysics = N\n\n${syntheticSections.join('\n\n')}\n`;
const syntheticVfs = await createMugenVfs([{ path: 'g06a-output-census.cns', bytes: new TextEncoder().encode(syntheticText) }]);
const stateProgram = parseMugenStateDocuments([parseMugenTextFile(syntheticVfs.require('g06a-output-census.cns'), 'utf-8')]);
const parsedControllers = stateProgram.states.reduce((sum, state) => sum + state.controllers.length, 0);
const result = { schemaVersion: 1, character: 'Petra_Johanna_Lagerkvist', documents: graph.resources.filter(resource => resource.document).map(resource => resource.canonicalPath), allControllers, parsedControllers, outputControllers, controllers };
const baseline = JSON.parse(readFileSync(new URL('./baseline.json', import.meta.url), 'utf8'));
const observedClosure = { allControllers, parsedControllers, outputControllers, controllers: Object.fromEntries(controllers.map(controller => [controller.foldedType, { count: controller.count, parameters: Object.keys(controller.parameters) }])) };
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (JSON.stringify(observedClosure) !== JSON.stringify(baseline)) { process.stderr.write('G06-A Petra output controller census differs from baseline.\n'); process.exitCode = 1; }
