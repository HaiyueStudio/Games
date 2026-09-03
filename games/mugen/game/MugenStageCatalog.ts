import { importMugenStage, type MugenStageModel } from '../import/stage/MugenStageParser';
import { assignmentsInSection, parseMugenTextFile } from '../import/text/MugenTextParser';
import { createMugenVfs } from '../import/vfs/MugenVfs';
import { canonicalizeMugenPath, resolveMugenReference, unquoteMugenValue } from '../import/vfs/path';

export interface MugenStageCatalogEntry { readonly id: string; readonly displayName: string; readonly def: string }

export async function loadMugenStageCatalog(signal?: AbortSignal): Promise<readonly MugenStageCatalogEntry[]> {
  const response = await fetch(new URL('../stages/catalog.json', import.meta.url), signal === undefined ? {} : { signal });
  if (!response.ok) throw new Error(`无法载入舞台目录（HTTP ${response.status}）。`);
  return validateMugenStageCatalog(await response.json());
}

export async function loadMugenBuiltInStage(entry: MugenStageCatalogEntry, signal?: AbortSignal): Promise<MugenStageModel> {
  const defPath = canonicalizeMugenPath(entry.def); const defBytes = await fetchBytes(defPath, signal);
  const defOnly = await createMugenVfs([{ path: defPath, bytes: defBytes }], signal); const document = parseMugenTextFile(defOnly.require(defPath));
  const spriteAssignment = assignmentsInSection(document, 'BGdef').filter(value => value.foldedKey === 'spr').at(-1);
  if (spriteAssignment === undefined) throw new TypeError(`MUGEN stage ${defPath} has no [BGdef] spr declaration.`);
  const spritePath = resolveMugenReference(defPath, unquoteMugenValue(spriteAssignment.value)); const spriteBytes = await fetchBytes(spritePath, signal);
  const vfs = await createMugenVfs([{ path: defPath, bytes: defBytes }, { path: spritePath, bytes: spriteBytes }], signal);
  return importMugenStage(vfs, entry.id, defPath, signal);
}

export function validateMugenStageCatalog(value: unknown): readonly MugenStageCatalogEntry[] {
  if (!record(value) || value.schemaVersion !== 1 || !Array.isArray(value.entries) || value.entries.length < 1 || value.entries.length > 128) throw new TypeError('MUGEN 舞台目录格式无效。');
  const ids = new Set<string>(); const paths = new Set<string>();
  const entries = value.entries.map((raw, index) => {
    if (!record(raw) || typeof raw.id !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,63}$/u.test(raw.id) || typeof raw.displayName !== 'string' || raw.displayName.trim().length < 1 || raw.displayName.length > 128 || typeof raw.def !== 'string') throw new TypeError(`MUGEN 舞台目录第 ${index + 1} 项无效。`);
    const path = canonicalizeMugenPath(raw.def); if (!path.toLowerCase().endsWith('.def')) throw new TypeError(`MUGEN 舞台入口必须是 DEF：${path}`);
    if (ids.has(raw.id) || paths.has(path.toLowerCase())) throw new TypeError(`MUGEN 舞台目录存在重复项：${raw.id}`);
    ids.add(raw.id); paths.add(path.toLowerCase()); return Object.freeze({ id: raw.id, displayName: raw.displayName.trim(), def: path });
  });
  return Object.freeze(entries);
}

async function fetchBytes(path: string, signal?: AbortSignal): Promise<Uint8Array> {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/'); const response = await fetch(new URL(`../stages/${encodedPath}`, import.meta.url), signal === undefined ? {} : { signal });
  if (!response.ok) throw new Error(`无法载入舞台资源 ${path}（HTTP ${response.status}）。`);
  return new Uint8Array(await response.arrayBuffer());
}
function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
