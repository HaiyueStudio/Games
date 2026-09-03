import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { registerHooks } from 'node:module';
import { resolve } from 'node:path';

registerHooks({ resolve(specifier, context, nextResolve) { const relativeWithoutExtension = /^\.{1,2}\//u.test(specifier) && !/\.[a-z0-9]+$/iu.test(specifier); return nextResolve(relativeWithoutExtension ? `${specifier}.ts` : specifier, context); } });
const { getMugenControllerParameterCensus } = await import('../games/mugen/import/cns/CnsParser.ts');

const docsPath = resolve(process.argv[2] ?? process.env.MUGEN_SCTRLS_DOC ?? 'D:/mugen-1.1b1/docs/sctrls.html');
const html = readFileSync(docsPath, 'utf8');
const census = getMugenControllerParameterCensus();
const sections = new Map();

for (const source of html.split('<div class="section" id="').slice(1)) {
  const id = source.slice(0, source.indexOf('"'));
  const heading = /<h2[^>]*>.*?>([^<]+)<\/a><\/h2>/isu.exec(source)?.[1]?.trim();
  if (!heading) continue;
  const parameters = [...source.matchAll(/<dt>(.*?)<\/dt>/gisu)].flatMap(match => {
    const text = decode(stripTags(match[1])).trim();
    const parameter = /^([A-Za-z][A-Za-z0-9_.]*)\s*=/u.exec(text)?.[1];
    return parameter ? [parameter.toLowerCase()] : [];
  });
  sections.set(normalize(heading), { id, heading, parameters: [...new Set(parameters)].sort() });
}

for (const [target, source] of [['allpalfx', 'palfx'], ['bgpalfx', 'palfx']]) {
  const entry = sections.get(target); const referenced = sections.get(source);
  if (entry && referenced) entry.parameters = referenced.parameters;
}

const entries = census.map(entry => {
  const official = sections.get(entry.sourceName);
  const accepted = new Set(entry.sourceParameters);
  const documented = official?.parameters ?? [];
  return Object.freeze({
    sourceName: entry.sourceName,
    type: entry.type,
    documentationSection: official?.id ?? null,
    documentedParameters: documented,
    acceptedParameters: entry.sourceParameters,
    requiredCompiledParameters: entry.requiredCompiledParameters,
    compatibilityIgnoredParameters: entry.compatibilityIgnoredParameters,
    documentedButRejected: documented.filter(parameter => !accepted.has(parameter)),
  });
});

const report = Object.freeze({
  schemaVersion: 1,
  revision: 'm09-g08-controller-parameter-audit-v1',
  docsSource: Object.freeze({ document: 'MUGEN 1.1b1 docs/sctrls.html', sha256: createHash('sha256').update(html).digest('hex') }),
  controllerCount: entries.length,
  documentedControllerCount: entries.filter(entry => entry.documentationSection !== null).length,
  documentedParameterCount: entries.reduce((sum, entry) => sum + entry.documentedParameters.length, 0),
  acceptedParameterCount: entries.reduce((sum, entry) => sum + entry.acceptedParameters.length, 0),
  rejectedParameterCount: entries.reduce((sum, entry) => sum + entry.documentedButRejected.length, 0),
  entries,
});

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (report.documentedControllerCount !== census.length || report.rejectedParameterCount !== 0) process.exitCode = 1;

function normalize(value) { return value.replace(/[\s_-]+/gu, '').toLowerCase(); }
function stripTags(value) { return value.replace(/<[^>]+>/gu, ' '); }
function decode(value) { return value.replaceAll('&quot;', '"').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&').replaceAll('&#8211;', '-').replaceAll('&#8212;', '-'); }
