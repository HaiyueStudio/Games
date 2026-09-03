import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { deflateRawSync } from 'node:zlib';

registerHooks({
  resolve(specifier, context, nextResolve) {
    const relativeWithoutExtension = /^\.{1,2}\//.test(specifier) && !/\.[a-z0-9]+$/i.test(specifier);
    return nextResolve(relativeWithoutExtension ? `${specifier}.ts` : specifier, context);
  },
});

const [
  { MUGEN_DIAGNOSTIC_CATALOG, MugenImportFailure, mugenDiagnostic },
  { MUGEN_LIMITS },
  { buildMugenImportGraph },
  { assignmentsInSection, parseMugenTextFile },
  { createMugenVfs },
  { createMugenVfsFromDirectoryHandle, createMugenVfsFromFileList },
  { canonicalizeMugenPath },
  { createMugenVfsFromZip },
  { MugenImportWorkerClient },
  { MUGEN_WORKER_PROTOCOL, MUGEN_WORKER_PROTOCOL_VERSION },
  { canonicalJson, decodeMugenPackage, encodeMugenPackage },
  { importMugenPackage },
] = await Promise.all([
  import('../mugen/import/diagnostics.ts'),
  import('../mugen/import/contract.ts'),
  import('../mugen/import/text/DependencyGraph.ts'),
  import('../mugen/import/text/MugenTextParser.ts'),
  import('../mugen/import/vfs/MugenVfs.ts'),
  import('../mugen/import/vfs/browserDirectory.ts'),
  import('../mugen/import/vfs/path.ts'),
  import('../mugen/import/vfs/zip.ts'),
  import('../mugen/import/worker/MugenImportWorkerClient.ts'),
  import('../mugen/import/worker/protocol.ts'),
  import('../mugen/package/codec.ts'),
  import('../mugen/package/importer.ts'),
]);

const UTF8 = new TextEncoder();
const FIXTURE_DIRECTORY = new URL('../mugen/fixtures/g02-text-paths-v1/', import.meta.url);
const FIXTURE_MANIFEST = JSON.parse(readFileSync(new URL('../mugen/fixtures/g02-text-paths-v1.fixture.json', import.meta.url), 'utf8'));
const WIRE_CONTRACT = JSON.parse(readFileSync(new URL('../mugen/package/hymugen-v1.contract.json', import.meta.url), 'utf8'));

test('restricted VFS canonicalizes separators, hashes deterministically, and rejects unsafe or ambiguous paths', async () => {
  const left = await createMugenVfs([
    input('Sub\\B.cmd', 'b'),
    input('a.def', 'a'),
  ]);
  const right = await createMugenVfs([
    input('a.def', 'a'),
    input('Sub/B.cmd', 'b'),
  ]);
  assert.deepEqual(left.files.map(file => file.canonicalPath), ['a.def', 'Sub/B.cmd']);
  assert.equal(left.sourceSetSha256, right.sourceSetSha256);
  assert.equal(left.get('SUB/b.CMD')?.canonicalPath, 'Sub/B.cmd');
  assert.equal(canonicalizeMugenPath('./sub//file.def'), 'sub/file.def');

  await assertDiagnostic(() => createMugenVfs([input('../escape.def', 'x')]), 'E_MUGEN_PATH_TRAVERSAL');
  await assertDiagnostic(() => createMugenVfs([input('C:\\escape.def', 'x')]), 'E_MUGEN_PATH_UNC_OR_DRIVE');
  await assertDiagnostic(() => createMugenVfs([input('https://example.test/a.def', 'x')]), 'E_MUGEN_PATH_REMOTE_REFERENCE');
  await assertDiagnostic(() => createMugenVfs([input('Foo.def', 'a'), input('foo.DEF', 'b')]), 'E_MUGEN_PATH_CASE_COLLISION');
  await assertDiagnostic(() => createMugenVfs([{ ...input('link.def', 'x'), symlink: true }]), 'E_MUGEN_PATH_SYMLINK');
  await assertDiagnostic(
    () => createMugenVfs(Array.from({ length: MUGEN_LIMITS.directoryAndArchive.maxFiles + 1 }, (_, index) => input(`f${index}.def`, ''))),
    'E_MUGEN_LIMIT_EXCEEDED',
  );
});

test('browser directory adapters strip only the selected root and produce the same VFS from FileList or directory handles', async () => {
  const def = browserFile('hero.def', '[Files]\ncmd=hero.cmd\nsprite=hero.sff\nanim=hero.air\n', 'picked/hero.def');
  const cmd = browserFile('hero.cmd', '[Command]\nname=x\n', 'picked/hero.cmd');
  const fromFiles = await createMugenVfsFromFileList([cmd, def]);
  assert.deepEqual(fromFiles.files.map(file => file.canonicalPath), ['hero.cmd', 'hero.def']);

  const directory = directoryHandle('picked', [fileHandle(cmd), fileHandle(def)]);
  const fromHandle = await createMugenVfsFromDirectoryHandle(directory);
  assert.equal(fromHandle.sourceSetSha256, fromFiles.sourceSetSha256);
  assert.deepEqual(fromHandle.files.map(file => file.canonicalPath), ['hero.cmd', 'hero.def']);
});

test('loss-aware text parser preserves duplicate order, comments, header semicolons, BOM and source byte offsets', async () => {
  const source = '\ufeff[Info]\r\nname = "Euro €; Hero" ; visible comment\r\n[State -2,Null; VelSet] ; header comment\r\nvalue = 1\r\n[Files]\r\ncmd = hero.cmd\r\nCMD=alt.cmd\r\n';
  const vfs = await createMugenVfs([input('hero.def', source)]);
  const document = parseMugenTextFile(vfs.require('hero.def'), 'utf-8');
  assert.equal(document.hadUtf8Bom, true);
  assert.equal(document.normalizedText.includes('\r'), false);
  assert.deepEqual(document.sections.map(section => section.name), ['Info', 'State -2,Null; VelSet', 'Files']);
  assert.equal(document.sections[1].header.span.line, 3);
  const files = assignmentsInSection(document, 'files');
  assert.deepEqual(files.map(item => [item.key, item.value]), [['cmd', 'hero.cmd'], ['CMD', 'alt.cmd']]);
  assert.equal(files[0].valueSpan.startByte, Buffer.from(source).indexOf('hero.cmd'));
  const name = assignmentsInSection(document, 'Info')[0];
  assert.equal(name.value, '"Euro €; Hero"');
  assert.equal(name.trailingComment?.value.trim(), 'visible comment');

  const cp1252 = await createMugenVfs([{ path: 'legacy.def', bytes: Uint8Array.from([...UTF8.encode('[Info]\nname = "'), 0x80, ...UTF8.encode('"\n')]) }]);
  assert.equal(assignmentsInSection(parseMugenTextFile(cp1252.require('legacy.def')), 'Info')[0].value, '"€"');
  const invalidUtf8 = await createMugenVfs([{ path: 'bad.def', bytes: Uint8Array.of(0xc3, 0x28) }]);
  await assertDiagnostic(async () => parseMugenTextFile(invalidUtf8.require('bad.def'), 'utf-8'), 'E_MUGEN_ENCODING_INVALID_SEQUENCE');
  const mixedBomComment = await createMugenVfs([{ path: 'mixed.air', bytes: concatenate([
    Uint8Array.of(0xef, 0xbb, 0xbf),
    UTF8.encode('; '),
    Uint8Array.of(0xd5, 0xbe, 0xc1, 0xa2),
    UTF8.encode('\n[Begin Action 0]\n0,0,0,0,1\n'),
  ]) }]);
  assert.equal(parseMugenTextFile(mixedBomComment.require('mixed.air')).sections[0].name, 'Begin Action 0');
  const mixedBomTrailingComment = await createMugenVfs([{ path: 'mixed.air', bytes: concatenate([
    Uint8Array.of(0xef, 0xbb, 0xbf),
    UTF8.encode('[Begin Action 15150];'),
    Uint8Array.of(0x90, 0x47, 0x8e, 0xe8),
    UTF8.encode('\n0,0,0,0,1\n'),
  ]) }]);
  assert.equal(parseMugenTextFile(mixedBomTrailingComment.require('mixed.air')).sections[0].name, 'Begin Action 15150');
  const mixedBomQuotedValue = await createMugenVfs([{ path: 'mixed.cns', bytes: concatenate([
    Uint8Array.of(0xef, 0xbb, 0xbf),
    UTF8.encode('[State 0]\ntext="legacy '),
    Uint8Array.of(0x81),
    UTF8.encode(' value"\ntype=Null\n'),
  ]) }]);
  assert.equal(assignmentsInSection(parseMugenTextFile(mixedBomQuotedValue.require('mixed.cns')), 'State 0')[0].key, 'text');
  const legacyCommentNul = await createMugenVfs([{ path: 'nul.air', bytes: concatenate([
    UTF8.encode(';'), Uint8Array.of(0), UTF8.encode('annotation\n[Begin Action 0]\n0,0,0,0,1\n'),
  ]) }]);
  assert.equal(parseMugenTextFile(legacyCommentNul.require('nul.air')).sections[0].name, 'Begin Action 0');
  const invalidDirectiveNul = await createMugenVfs([{ path: 'bad-nul.air', bytes: concatenate([
    UTF8.encode('[Begin Action 0]\n'), Uint8Array.of(0), UTF8.encode('\n'),
  ]) }]);
  await assertDiagnostic(async () => parseMugenTextFile(invalidDirectiveNul.require('bad-nul.air')), 'E_MUGEN_TEXT_SYNTAX');
  const invalidBomDirective = await createMugenVfs([{ path: 'bad.air', bytes: concatenate([
    Uint8Array.of(0xef, 0xbb, 0xbf),
    UTF8.encode('[Begin Action 0]\n'),
    Uint8Array.of(0xc1, 0xa2),
    UTF8.encode('\n'),
  ]) }]);
  await assertDiagnostic(async () => parseMugenTextFile(invalidBomDirective.require('bad.air')), 'E_MUGEN_ENCODING_INVALID_SEQUENCE');
  const utf16 = await createMugenVfs([{ path: 'utf16.def', bytes: Uint8Array.of(0xff, 0xfe, 0x41, 0x00) }]);
  await assertDiagnostic(async () => parseMugenTextFile(utf16.require('utf16.def')), 'E_MUGEN_ENCODING_UNSUPPORTED');

  const shiftJisBytes = concatenate([
    UTF8.encode('[Info]\nname = "'),
    Uint8Array.of(0x83, 0x65, 0x83, 0x58, 0x83, 0x67),
    UTF8.encode('"\n'),
  ]);
  const shiftJis = await createMugenVfs([{ path: 'jp.def', bytes: shiftJisBytes }]);
  assert.equal(assignmentsInSection(parseMugenTextFile(shiftJis.require('jp.def'), 'shift_jis'), 'Info')[0].value, '"テスト"');
});

test('loss-aware text parser preserves legacy apostrophe-prefixed directive lines', async () => {
  const vfs = await createMugenVfs([input('legacy.cns', "[State -2]\n'juggle adjustment\ntype = Null\n")]);
  const document = parseMugenTextFile(vfs.require('legacy.cns'), 'utf-8');

  assert.equal(document.tokens.find(token => token.kind === 'directive')?.value, "'juggle adjustment");
  assert.equal(assignmentsInSection(document, 'State -2')[0]?.value, 'Null');
});

test('loss-aware text parser accepts a legacy State header with a damaged trailing label only', async () => {
  const vfs = await createMugenVfs([input('hero.cns', '[State 1897, helper]damaged label]\ntype=Helper\n[State -3,S_HS]damaged label\ntype=ChangeState\n[State 3236, Push\ntype=PlayerPush\n[State 1200, helper]]\ntype=Helper\n[State a]damaged label\ntype=Null\n')]);
  const document = parseMugenTextFile(vfs.require('hero.cns'), 'utf-8');
  assert.equal(document.sections[0].name, 'State 1897, helper');
  assert.equal(document.sections[1].name, 'State -3,S_HS');
  assert.equal(document.sections[2].name, 'State 3236, Push');
  assert.equal(document.sections[3].name, 'State 1200, helper');
  assert.equal(document.sections[4].name, 'State a');
  const malformed = await createMugenVfs([input('bad.cns', '[Info]damaged label]\nname=Bad\n')]);
  await assertDiagnostic(async () => parseMugenTextFile(malformed.require('bad.cns'), 'utf-8'), 'E_MUGEN_TEXT_SYNTAX');
  const malformedWithoutClosingSuffix = await createMugenVfs([input('bad.cns', '[Info]damaged label\nname=Bad\n')]);
  await assertDiagnostic(async () => parseMugenTextFile(malformedWithoutClosingSuffix.require('bad.cns'), 'utf-8'), 'E_MUGEN_TEXT_SYNTAX');
});

test('loss-aware text parser preserves legacy separators, bracketed headings and malformed unused string values as directives or assignments', async () => {
  const vfs = await createMugenVfs([input('legacy.cns', '[Statedef 0]\n====================\n[heading]----------\n[;comment without closing bracket\ntext="Value1 is %f",Value2 is %d"\n')]);
  const document = parseMugenTextFile(vfs.require('legacy.cns'), 'utf-8');
  assert.equal(document.sections.length, 1);
  assert.equal(document.tokens.filter(token => token.kind === 'directive').length, 2);
  assert.equal(document.tokens.find(token => token.kind === 'assignment')?.key, 'text');
  assert(document.tokens.some(token => token.kind === 'comment' && token.value === 'comment without closing bracket'));
});

test('dependency graph selects a character DEF, resolves case-insensitively, records exact edges and rejects missing/cyclic/traversing references', async () => {
  const vfs = await createMugenVfs(characterInputs());
  const graph = await buildMugenImportGraph(vfs, { entryKind: 'character', encoding: 'utf-8' });
  assert.equal(graph.entryDef, 'hero.def');
  assert.equal(graph.entryKind, 'character');
  assert.equal(graph.resources.length, 7);
  assert.equal(graph.edges.length, 6);
  assert.ok(graph.edges.every(edge => edge.section === 'Files' && edge.byteOffset >= 0 && edge.line > 0));
  assert.equal(graph.resources.find(resource => resource.canonicalPath === 'Hero.CMD')?.document?.encoding, 'utf-8');
  assert.match(graph.dependencyGraphSha256, /^[0-9a-f]{64}$/);

  const missing = characterInputs().filter(file => file.path !== 'hero.sff');
  await assertDiagnostic(async () => buildMugenImportGraph(await createMugenVfs(missing), { encoding: 'utf-8' }), 'E_MUGEN_DEPENDENCY_MISSING');

  const traversal = characterInputs().map(file => file.path === 'hero.def'
    ? input('hero.def', text(file).replace('Hero.CMD', '../Hero.CMD'))
    : file);
  const traversalError = await captureDiagnostic(async () => buildMugenImportGraph(await createMugenVfs(traversal), { encoding: 'utf-8' }), 'E_MUGEN_PATH_TRAVERSAL');
  assert.equal(traversalError.canonicalPath, 'hero.def');
  assert.equal(traversalError.section, 'Files');
  assert.equal(traversalError.key, 'cmd');
  assert.ok(traversalError.byteOffset > 0 && traversalError.line > 0 && traversalError.column > 0);

  const cycle = await createMugenVfs([
    input('a.def', '[Files]\ncmd=a.cmd\nsprite=a.sff\nanim=a.air\ncommon=b.def\n'),
    input('b.def', '[Files]\ncommon=a.def\n'),
    input('a.cmd', '[Command]\nname=x\n'),
    input('a.sff', ''),
    input('a.air', '[Begin Action 0]\n0,0,0,0,1\n'),
  ]);
  await assertDiagnostic(() => buildMugenImportGraph(cycle, { entryDef: 'a.def', encoding: 'utf-8' }), 'E_MUGEN_DEPENDENCY_CYCLE');

  const deepInputs = [];
  const depthLimit = MUGEN_LIMITS.directoryAndArchive.maxDependencyDepth;
  for (let index = 0; index <= depthLimit + 1; index++) {
    deepInputs.push(input(`d${index}.def`, `[Files]\ncommon=d${index + 1}.def\n${index === 0 ? 'cmd=a.cmd\nsprite=a.sff\nanim=a.air\n' : ''}`));
  }
  deepInputs.push(input(`d${depthLimit + 2}.def`, '[Info]\nname=end\n'), input('a.cmd', ''), input('a.sff', ''), input('a.air', ''));
  await assertDiagnostic(async () => buildMugenImportGraph(await createMugenVfs(deepInputs), { entryDef: 'd0.def', encoding: 'utf-8' }), 'E_MUGEN_LIMIT_EXCEEDED');

  const unknown = await createMugenVfs([
    input('unknown.def', '[Files]\ncmd=a.cmd\nsprite=a.sff\nanim=a.air\nplugin=arbitrary.dll\n'),
    input('a.cmd', '[Command]\nname=x\n'), input('a.sff', ''), input('a.air', '[Begin Action 0]\n0,0,0,0,1\n'),
  ]);
  await assertDiagnostic(() => buildMugenImportGraph(unknown, { encoding: 'utf-8' }), 'E_MUGEN_UNSUPPORTED_FEATURE');

  const withBinaryFontInputs = characterInputs().map(file => file.path === 'hero.def'
    ? input('hero.def', `${text(file)}font1=font.fnt\n`)
    : file);
  withBinaryFontInputs.push({ path: 'font.fnt', bytes: concatenate([UTF8.encode('ElecbyteFnt'), new Uint8Array(16)]) });
  const withBinaryFont = await buildMugenImportGraph(await createMugenVfs(withBinaryFontInputs), { encoding: 'utf-8' });
  assert.equal(withBinaryFont.resources.find(resource => resource.canonicalPath === 'font.fnt')?.document, undefined);

  const officialStyle = await createMugenVfs([
    input('kfm.def', '[Info]\nname=KFM\n[Files]\ncmd=kfm.cmd\ncns=kfm.cns\nstcommon=common1.cns\nsprite=kfm.sff\nanim=kfm.air\nai=kfm.ai\n'),
    { path: 'kfm.cmd', bytes: concatenate([Uint8Array.of(0xef, 0xbb, 0xbf), UTF8.encode('[Command]\nname=x\ncommand=x\n')]) },
    input('kfm.cns', '[Data]\nlife=1000\n'), input('kfm.sff', ''), input('kfm.air', '[Begin Action 0]\n0,0,0,0,1\n'),
    input('kfm.ai', 'AI hints are opaque to the G05 viewer.\n'),
  ]);
  const officialStyleGraph = await buildMugenImportGraph(officialStyle, { entryKind: 'character' });
  assert.equal(officialStyleGraph.selectedEncoding, 'windows-1252');
  assert.equal(officialStyleGraph.resources.find(resource => resource.canonicalPath === 'kfm.cmd')?.document?.encoding, 'utf-8');
  assert.equal(officialStyleGraph.resources.find(resource => resource.canonicalPath === 'kfm.ai')?.kind, 'other');
  assert.equal(officialStyleGraph.edges.some(edge => edge.to === 'common1.cns'), false, 'missing engine-provided stcommon stays outside the character VFS');
});

test('HYMUGEN v1 is byte-exact, round-trips canonically, excludes raw source bytes, and rejects tampering or unknown fields', async () => {
  const fixtureInputs = formalFixtureInputs();
  const first = await importMugenPackage(await createMugenVfs(fixtureInputs), { contentRole: 'formal-fixture', encoding: 'utf-8' });
  const second = await importMugenPackage(await createMugenVfs([...fixtureInputs].reverse()), { contentRole: 'formal-fixture', encoding: 'utf-8' });
  assert.equal(first.encoded.packageSha256, second.encoded.packageSha256);
  assert.equal(first.package.sourceSetSha256, FIXTURE_MANIFEST.expected.sourceSetSha256);
  assert.equal(first.package.dependencyGraphSha256, FIXTURE_MANIFEST.expected.dependencyGraphSha256);
  assert.equal(first.encoded.packageSha256, FIXTURE_MANIFEST.expected.packageSha256);
  assert.equal(first.package.tables.resources.length, FIXTURE_MANIFEST.expected.resourceCount);
  assert.deepEqual(first.report.budgetUsage, FIXTURE_MANIFEST.expected.budgetUsage);
  assert.deepEqual(first.encoded.bytes, second.encoded.bytes);
  assert.equal(Buffer.from(first.encoded.bytes.subarray(0, 8)).toString('hex'), WIRE_CONTRACT.magicHex);
  const headerView = new DataView(first.encoded.bytes.buffer, first.encoded.bytes.byteOffset, first.encoded.bytes.byteLength);
  assert.equal(headerView.getUint16(8, true), WIRE_CONTRACT.wireVersion);
  assert.equal(headerView.getUint16(10, true), 0);
  assert.equal(headerView.getUint32(12, true), first.encoded.bytes.byteLength - WIRE_CONTRACT.headerBytes);
  assert.equal(WIRE_CONTRACT.maxPackageBytes, MUGEN_LIMITS.worker.maxMessageBytes);
  assert.equal(Object.keys(MUGEN_DIAGNOSTIC_CATALOG).length, 55);
  assert.equal(canonicalJson(first.report), canonicalJson(second.report));
  assert.match(first.encoded.packageSha256, /^[0-9a-f]{64}$/);
  assert.equal(new TextDecoder().decode(first.encoded.bytes).includes('G02 Fighter'), false);
  assert.ok(first.package.tables.resources.every(resource => !Object.hasOwn(resource, 'bytes')));
  const fixtureVfs = await createMugenVfs(fixtureInputs);
  for (const expectedFile of FIXTURE_MANIFEST.files) {
    const actual = fixtureVfs.require(expectedFile.path);
    assert.equal(actual.byteLength, expectedFile.bytes);
    assert.equal(actual.sha256, expectedFile.sha256);
  }
  assert.equal(FIXTURE_MANIFEST.license.spdx, 'MIT');

  const decoded = await decodeMugenPackage(first.encoded.bytes);
  assert.deepEqual(decoded.package, first.package);
  assert.equal(decoded.packageSha256, first.encoded.packageSha256);
  assert.ok(Object.isFrozen(decoded.package.tables));
  assert.ok(Object.isFrozen(decoded.package.tables.resources));

  const numeric = await importMugenPackage(await createMugenVfs(fixtureInputs), {
    contentRole: 'formal-fixture',
    encoding: 'utf-8',
    contributions: { sprites: [{ fraction: Math.fround(1.5), negative: -7 }] },
  });
  const numericDecoded = await decodeMugenPackage(numeric.encoded.bytes);
  assert.deepEqual(numericDecoded.package.tables.sprites, [{ fraction: 1.5, negative: -7 }]);
  assert.ok(findBytes(numeric.encoded.bytes, Uint8Array.of(WIRE_CONTRACT.valueTags.finiteExactFloat32LittleEndian, 0, 0, 0xc0, 0x3f)) >= 0, 'float32 tag and little-endian 1.5 must be present');
  assert.ok(findBytes(numeric.encoded.bytes, Uint8Array.of(WIRE_CONTRACT.valueTags.signedSafeInteger64LittleEndian, 0xf9, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff)) >= 0, 'int64 tag and little-endian -7 must be present');
  const futureGoalDiagnostic = mugenDiagnostic(
    'E_MUGEN_AIR_SPRITE_MISSING',
    'air',
    'warning',
    'ignore',
    'Future G04 source location fixture.',
    { canonicalPath: 'hero.air', group: 0, item: 0 },
  );
  const withFutureDiagnostic = await importMugenPackage(await createMugenVfs(fixtureInputs), {
    contentRole: 'formal-fixture',
    encoding: 'utf-8',
    contributions: { diagnostics: [futureGoalDiagnostic] },
  });
  assert.deepEqual((await decodeMugenPackage(withFutureDiagnostic.encoded.bytes)).package.diagnostics, [futureGoalDiagnostic]);
  await assertDiagnostic(
    async () => importMugenPackage(await createMugenVfs(fixtureInputs), {
      contentRole: 'formal-fixture',
      encoding: 'utf-8',
      contributions: { sprites: [{ nonCanonicalFloat: 0.1 }] },
    }),
    'E_MUGEN_PACKAGE_VERSION',
  );
  const cyclicContribution = {};
  cyclicContribution.self = cyclicContribution;
  await assertDiagnostic(
    async () => importMugenPackage(await createMugenVfs(fixtureInputs), {
      contentRole: 'formal-fixture',
      encoding: 'utf-8',
      contributions: { sprites: [cyclicContribution] },
    }),
    'E_MUGEN_PACKAGE_VERSION',
  );

  const invalidDependency = {
    ...first.package,
    tables: {
      ...first.package.tables,
      strings: [...first.package.tables.strings, 'unused-string'].sort(),
      resources: first.package.tables.resources.map((resource, index) => index === 0
        ? { ...resource, dependencies: [first.package.tables.strings.length] }
        : resource),
    },
  };
  await assertDiagnostic(() => encodeMugenPackage(invalidDependency), 'E_MUGEN_PACKAGE_VERSION');
  const entryResourceIndex = first.package.tables.resources.findIndex(resource => first.package.tables.strings[resource.path] === first.package.entryDef);
  const invalidEntryKind = {
    ...first.package,
    tables: {
      ...first.package.tables,
      resources: first.package.tables.resources.map((resource, index) => index === entryResourceIndex ? { ...resource, kind: 'other' } : resource),
    },
  };
  await assertDiagnostic(() => encodeMugenPackage(invalidEntryKind), 'E_MUGEN_PACKAGE_VERSION');
  const invalidDiagnostic = {
    ...first.package,
    diagnostics: [{
      code: 'E_MUGEN_PACKAGE_VERSION',
      severity: 'error',
      profile: first.package.profile,
      phase: 'package',
      message: 'invalid diagnostic fixture',
      recovery: 'release-resource',
      hostPath: 'C:\\must-not-leak',
    }],
  };
  await assertDiagnostic(() => encodeMugenPackage(invalidDiagnostic), 'E_MUGEN_PACKAGE_VERSION');
  await assertDiagnostic(() => decodeMugenPackage(first.encoded.bytes.subarray(0, 20)), 'E_MUGEN_TRUNCATED');

  const tampered = first.encoded.bytes.slice();
  tampered[tampered.length - 1] ^= 1;
  await assertDiagnostic(() => decodeMugenPackage(tampered), 'E_MUGEN_PACKAGE_HASH');
  await assertDiagnostic(
    () => encodeMugenPackage({ ...first.package, unknownField: true }),
    'E_MUGEN_PACKAGE_VERSION',
  );
});

test('ZIP adapter accepts stored and deflated files, strips one common root, and fails closed on truncation or ratio bombs', async () => {
  const zip = makeZip([
    { path: 'hero/hero.def', bytes: UTF8.encode('[Files]\ncmd=hero.cmd\nsprite=hero.sff\nanim=hero.air\n'), compression: 0 },
    { path: 'hero/hero.cmd', bytes: UTF8.encode('[Command]\nname=x\n'), compression: 8 },
    { path: 'hero/hero.sff', bytes: new Uint8Array(0), compression: 0 },
    { path: 'hero/hero.air', bytes: UTF8.encode('[Begin Action 0]\n0,0,0,0,1\n'), compression: 8 },
  ]);
  const vfs = await createMugenVfsFromZip(zip);
  assert.deepEqual(vfs.files.map(file => file.canonicalPath), ['hero.air', 'hero.cmd', 'hero.def', 'hero.sff']);
  assert.equal((await buildMugenImportGraph(vfs, { encoding: 'utf-8' })).entryKind, 'character');

  await assertDiagnostic(() => createMugenVfsFromZip(zip.subarray(0, zip.byteLength - 8)), 'E_MUGEN_DECODE_INVALID');
  const bomb = makeZip([{ path: 'bomb.def', bytes: UTF8.encode('A'.repeat(50_000)), compression: 8 }]);
  await assertDiagnostic(() => createMugenVfsFromZip(bomb), 'E_MUGEN_COMPRESSION_RATIO');

  const formalInputs = formalFixtureInputs();
  const formalZip = makeZip(formalInputs.map((file, index) => ({ path: `selected/${file.path}`, bytes: file.bytes, compression: index % 2 === 0 ? 0 : 8 })));
  const directoryPackage = await importMugenPackage(await createMugenVfs(formalInputs), { contentRole: 'formal-fixture', encoding: 'utf-8' });
  const archivePackage = await importMugenPackage(await createMugenVfsFromZip(formalZip), { contentRole: 'formal-fixture', encoding: 'utf-8' });
  assert.equal(archivePackage.encoded.packageSha256, directoryPackage.encoded.packageSha256);
  assert.deepEqual(archivePackage.encoded.bytes, directoryPackage.encoded.bytes);
});

test('Worker client is latest-wins, ignores stale replies, transfers chunks, and disposes idempotently', async () => {
  const port = new FakeWorkerPort();
  const progress = [];
  const client = new MugenImportWorkerClient(port, { onProgress: item => progress.push(item), timeoutMilliseconds: 5_000 });
  const first = client.import([input('a.def', '[Files]\n')], { contentRole: 'formal-fixture', encoding: 'utf-8' });
  const second = client.import([input('b.def', '[Files]\n')], { contentRole: 'formal-fixture', encoding: 'utf-8' });
  await assert.rejects(first, error => error?.name === 'AbortError');
  const starts = port.messages.filter(message => message.kind === 'start');
  assert.equal(starts.length, 2);
  const [oldStart, currentStart] = starts;
  port.emit(resultReply(oldStart.requestId, oldStart.generation, 1));
  port.emit({ ...replyBase(currentStart.requestId, currentStart.generation), kind: 'progress', phase: 'parse', completed: 1, total: 1 });
  port.emit(resultReply(currentStart.requestId, currentStart.generation, 2));
  const result = await second;
  assert.deepEqual([...result.packageBytes], [2]);
  assert.equal(progress.length, 1);
  assert.ok(port.messages.some(message => message.kind === 'abort' && message.requestId === oldStart.requestId));
  assert.ok(port.transfers.some(list => list.length === 1));

  const zipImport = client.importZip(Uint8Array.of(1, 2, 3), { contentRole: 'local-content', encoding: 'utf-8' });
  const zipStart = port.messages.filter(message => message.kind === 'start').at(-1);
  assert.equal(zipStart.options.sourceKind, 'zip');
  port.emit(resultReply(zipStart.requestId, zipStart.generation, 3));
  assert.deepEqual([...(await zipImport).packageBytes], [3]);

  const abortController = new AbortController();
  const aborted = client.import([input('cancel.def', '[Files]\n')], { contentRole: 'local-content', encoding: 'utf-8' }, abortController.signal);
  const abortedStart = port.messages.filter(message => message.kind === 'start').at(-1);
  abortController.abort();
  await assert.rejects(aborted, error => error?.name === 'AbortError');
  port.emit(resultReply(abortedStart.requestId, abortedStart.generation, 4));
  assert.ok(port.messages.some(message => message.kind === 'abort' && message.requestId === abortedStart.requestId));
  client.dispose();
  client.dispose();
  assert.equal(port.listeners.size, 0);
});

function characterInputs() {
  return [
    input('hero.def', '[Info]\nname = "G02 Fighter"\n[Files]\ncmd = Hero.CMD\ncns=hero.cns\nsprite=hero.sff\nanim=hero.air\nsound=hero.snd\npal1=hero.act\n'),
    input('Hero.CMD', '[Command]\nname = "x"\ncommand = x\n'),
    input('hero.cns', '[Statedef 0]\ntype = S\n'),
    input('hero.sff', 'SFF fixture placeholder'),
    input('hero.air', '[Begin Action 0]\n0, 0, 0, 0, 1\n'),
    input('hero.snd', 'SND fixture placeholder'),
    input('hero.act', 'ACT fixture placeholder'),
  ];
}

function formalFixtureInputs() {
  return FIXTURE_MANIFEST.files.map(file => ({
    path: file.path,
    bytes: new Uint8Array(readFileSync(new URL(file.path, FIXTURE_DIRECTORY))),
  }));
}

function browserFile(name, contents, relativePath) {
  const file = new File([contents], name, { type: 'text/plain' });
  Object.defineProperty(file, 'webkitRelativePath', { value: relativePath });
  return file;
}

function fileHandle(file) {
  return { kind: 'file', name: file.name, async getFile() { return file; } };
}

function directoryHandle(name, entries) {
  return {
    kind: 'directory',
    name,
    async *values() { yield* entries; },
  };
}

function concatenate(values) {
  const result = new Uint8Array(values.reduce((sum, value) => sum + value.byteLength, 0));
  let offset = 0;
  for (const value of values) {
    result.set(value, offset);
    offset += value.byteLength;
  }
  return result;
}

function findBytes(haystack, needle) {
  outer: for (let offset = 0; offset <= haystack.byteLength - needle.byteLength; offset++) {
    for (let index = 0; index < needle.byteLength; index++) if (haystack[offset + index] !== needle[index]) continue outer;
    return offset;
  }
  return -1;
}

function input(path, value) {
  return { path, bytes: typeof value === 'string' ? UTF8.encode(value) : value };
}

function text(file) {
  return new TextDecoder().decode(file.bytes);
}

async function assertDiagnostic(action, code) {
  await captureDiagnostic(action, code);
}

async function captureDiagnostic(action, code) {
  let captured;
  await assert.rejects(action, error => {
    if (!(error instanceof MugenImportFailure)) return false;
    captured = error.diagnostics.find(item => item.code === code);
    return captured !== undefined;
  });
  return captured;
}

class FakeWorkerPort {
  messages = [];
  transfers = [];
  listeners = new Set();

  postMessage(message, transfer = []) {
    this.messages.push(message);
    this.transfers.push(transfer);
  }

  addEventListener(_type, listener) { this.listeners.add(listener); }
  removeEventListener(_type, listener) { this.listeners.delete(listener); }
  emit(data) { for (const listener of this.listeners) listener({ data }); }
}

function replyBase(requestId, generation) {
  return { protocol: MUGEN_WORKER_PROTOCOL, version: MUGEN_WORKER_PROTOCOL_VERSION, requestId, generation };
}

function resultReply(requestId, generation, byte) {
  return {
    ...replyBase(requestId, generation),
    kind: 'result',
    packageBytes: Uint8Array.of(byte).buffer,
    packageSha256: '0'.repeat(64),
    report: {},
    metadata: { name: null, displayName: null, author: null, mugenVersion: null, localCoord: null, entryDef: 'hero.def', dependencies: [] },
    viewerAudioCues: [],
  };
}

function makeZip(entries) {
  const localRecords = [];
  const centralRecords = [];
  let localOffset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.path, 'utf8');
    const source = Buffer.from(entry.bytes);
    const compressed = entry.compression === 8 ? deflateRawSync(source) : source;
    const crc = crc32(source);
    const local = Buffer.alloc(30 + name.length + compressed.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(entry.compression, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(source.length, 22);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);
    compressed.copy(local, 30 + name.length);
    localRecords.push(local);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(entry.compression, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(source.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(localOffset, 42);
    name.copy(central, 46);
    centralRecords.push(central);
    localOffset += local.length;
  }
  const centralOffset = localRecords.reduce((sum, item) => sum + item.length, 0);
  const centralSize = centralRecords.reduce((sum, item) => sum + item.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(centralOffset, 16);
  return new Uint8Array(Buffer.concat([...localRecords, ...centralRecords, eocd]));
}

function crc32(bytes) {
  let value = 0xffff_ffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit++) value = (value & 1) !== 0 ? 0xedb8_8320 ^ (value >>> 1) : value >>> 1;
  }
  return (value ^ 0xffff_ffff) >>> 0;
}
