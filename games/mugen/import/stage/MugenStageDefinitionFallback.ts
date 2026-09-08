import type { MugenVfsInput } from '../vfs/MugenVfs';

const UTF8 = new TextEncoder();
const AUDIO_EXTENSIONS = new Set(['.ogg', '.mp3', '.wav', '.mid', '.midi']);

export interface MugenPreparedStageSourceSet {
  readonly inputs: readonly MugenVfsInput[];
  readonly entryDefs: readonly string[];
  readonly generatedEntryDefs: readonly string[];
}

/** Adds deterministic, explicitly marked Stage DEF files for SFF assets not claimed by an authored stage. */
export function prepareMugenStageSourceSet(inputs: readonly MugenVfsInput[]): MugenPreparedStageSourceSet {
  const authored = discoverMugenStageDefCandidates(inputs);
  const paths = new Set(inputs.map(input => normalizedPath(input.path).toLowerCase()));
  const authoredPaths = new Set(authored.map(path => path.toLowerCase()));
  const claimedSffNames = new Set<string>();
  for (const input of inputs) {
    const path = normalizedPath(input.path);
    if (!authoredPaths.has(path.toLowerCase())) continue;
    claimedSffNames.add(`${basenameOf(path).slice(0, -4).toLowerCase()}.sff`);
    for (const reference of spriteReferences(input)) claimedSffNames.add(basenameOf(reference).toLowerCase());
  }
  const sffPaths = inputs.map(input => normalizedPath(input.path))
    .filter(path => path.toLowerCase().endsWith('.sff') && !claimedSffNames.has(basenameOf(path).toLowerCase()))
    .sort(pathOrder);
  const generatedInputs: MugenVfsInput[] = [];
  const generatedEntryDefs: string[] = [];
  for (const [index, sffPath] of sffPaths.entries()) {
    const directory = directoryOf(sffPath); const stem = basenameOf(sffPath).slice(0, -4);
    let entryDef = `${directory}${stem}.haiyue-generated.def`;
    if (paths.has(entryDef.toLowerCase())) entryDef = `${directory}haiyue-generated-stage-${index + 1}.def`;
    const music = inputs.map(input => normalizedPath(input.path))
      .filter(path => directoryOf(path).toLowerCase() === directory.toLowerCase() && AUDIO_EXTENSIONS.has(extensionOf(path)))
      .sort(pathOrder)[0] ?? null;
    generatedInputs.push(Object.freeze({ path: entryDef, bytes: UTF8.encode(generatedDefinition(stem, basenameOf(sffPath), music === null ? null : basenameOf(music))) }));
    generatedEntryDefs.push(entryDef);
  }
  return Object.freeze({
    inputs: Object.freeze([...inputs, ...generatedInputs]),
    entryDefs: Object.freeze([...authored, ...generatedEntryDefs].sort(pathOrder)),
    generatedEntryDefs: Object.freeze(generatedEntryDefs),
  });
}

export function discoverMugenStageDefCandidates(inputs: readonly MugenVfsInput[]): readonly string[] {
  const candidates = inputs.flatMap(input => {
    const path = normalizedPath(input.path);
    if (!path.toLowerCase().endsWith('.def')) return [];
    const bytes = input.bytes instanceof Uint8Array ? input.bytes : new Uint8Array(input.bytes);
    const preview = asciiPreview(bytes);
    return /^\s*\[\s*bgdef\s*\]/imu.test(preview) && /^\s*spr\s*=/imu.test(preview) ? [path] : [];
  });
  return Object.freeze(candidates.sort(pathOrder));
}

function generatedDefinition(name: string, sff: string, music: string | null): string {
  return [
    '[Info]',
    `name = ${name}`,
    'author = Haiyue inferred fallback',
    'haiyue.generated = 1',
    '',
    '[BGDef]',
    `spr = ${sff}`,
    'debugbg = 0',
    ...(music === null ? [] : ['', '[Music]', `bgmusic = ${music}`, 'bgvolume = 255']),
    '',
  ].join('\r\n');
}

function spriteReferences(input: MugenVfsInput): readonly string[] {
  const bytes = input.bytes instanceof Uint8Array ? input.bytes : new Uint8Array(input.bytes);
  return Object.freeze([...asciiPreview(bytes).matchAll(/^\s*spr\s*=\s*([^;\r\n]+)/gimu)]
    .map(match => unquote(match[1]!.trim()).replaceAll('\\', '/'))
    .filter(value => value.toLowerCase().endsWith('.sff')));
}

function asciiPreview(bytes: Uint8Array): string {
  let preview = '';
  for (let index = 0; index < Math.min(bytes.length, 256 * 1024); index += 1) preview += bytes[index]! < 0x80 ? String.fromCharCode(bytes[index]!) : ' ';
  return preview;
}

function unquote(value: string): string {
  return value.length >= 2 && (value[0] === '"' && value.at(-1) === '"' || value[0] === "'" && value.at(-1) === "'") ? value.slice(1, -1).trim() : value;
}

function normalizedPath(value: string): string { return value.replaceAll('\\', '/'); }
function directoryOf(value: string): string { const index = value.lastIndexOf('/'); return index < 0 ? '' : value.slice(0, index + 1); }
function basenameOf(value: string): string { return value.slice(value.lastIndexOf('/') + 1); }
function extensionOf(value: string): string { const name = basenameOf(value); const index = name.lastIndexOf('.'); return index < 0 ? '' : name.slice(index).toLowerCase(); }
function pathOrder(left: string, right: string): number { return left.localeCompare(right, 'en', { sensitivity: 'base' }); }
