import { MUGEN_LIMITS } from '../contract';
import { failMugen, mugenDiagnostic, throwIfAborted } from '../diagnostics';
import type { MugenDependencyEdge, MugenImportGraph, MugenImportResource } from '../text/DependencyGraph';
import { compareMugenStrings } from '../vfs/path';
import type { MugenPackageContributions } from '../../package/builder';
import type { MugenCanonicalValue } from '../../package/types';
import { parseMugenAct } from './ActParser';
import { parseMugenSff } from './SffParser';
import type { MugenDecodedPalette, MugenDecodedSprite, MugenSffBank } from './types';

export interface MugenSpriteImportResult {
  readonly banks: readonly MugenSffBank[];
  readonly contributions: MugenPackageContributions;
  readonly decodedSpriteBytes: number;
  readonly decodedPaletteBytes: number;
}

export async function importMugenSpriteContributions(graph: MugenImportGraph, signal?: AbortSignal): Promise<MugenSpriteImportResult> {
  const spriteResources = graph.resources.filter(resource => resource.kind === 'sprite').sort(resourceOrder);
  if (spriteResources.length > MUGEN_LIMITS.sff.maxSffFilesPerPackage) {
    failMugen(mugenDiagnostic('E_MUGEN_LIMIT_EXCEEDED', 'budget', 'fatal', 'release-resource', 'MUGEN package contains too many SFF files.', {}, { budget: 'maxSffFilesPerPackage', observed: spriteResources.length, limit: MUGEN_LIMITS.sff.maxSffFilesPerPackage }));
  }
  const banks: MugenSffBank[] = [];
  let decodedSpriteBytes = 0;
  let decodedPaletteBytes = 0;
  for (const resource of spriteResources) {
    throwIfAborted(signal);
    const bank = await parseMugenSff(resource, signal === undefined ? {} : { signal });
    decodedSpriteBytes = addBudget(decodedSpriteBytes, bank.decodedSpriteBytes, MUGEN_LIMITS.sff.maxDecodedSpriteBytesPerPackage, 'maxDecodedSpriteBytesPerPackage');
    decodedPaletteBytes = addBudget(decodedPaletteBytes, bank.decodedPaletteBytes, MUGEN_LIMITS.sff.maxDecodedPaletteBytesPerPackage, 'maxDecodedPaletteBytesPerPackage');
    banks.push(bank);
  }
  const palettes: MugenCanonicalValue[] = [];
  const sprites: MugenCanonicalValue[] = [];
  const features = new Set<string>();
  for (const bank of banks) {
    features.add(`g03.sff.${bank.version}`);
    for (const palette of bank.palettes) palettes.push(paletteValue(bank.canonicalPath, palette));
  }
  const externalPalettes: Array<{ readonly selection: number; readonly value: MugenCanonicalValue }> = [];
  for (const resource of graph.resources.filter(value => value.kind === 'palette').sort(resourceOrder)) {
    throwIfAborted(signal);
    const selection = selectionFromDependency(graph.edges, resource);
    const palette = parseMugenAct(asVfsFile(resource), 1, selection);
    decodedPaletteBytes = addBudget(decodedPaletteBytes, palette.rgba.byteLength, MUGEN_LIMITS.sff.maxDecodedPaletteBytesPerPackage, 'maxDecodedPaletteBytesPerPackage');
    const value = paletteValue(resource.canonicalPath, palette);
    palettes.push(value);
    externalPalettes.push({ selection, value });
    features.add('g03.palette.act');
  }
  externalPalettes.sort((left, right) => left.selection - right.selection || canonicalTableOrder(left.value, right.value));
  const externalPaletteId = externalPalettes.length === 0 ? null : String((externalPalettes[0]!.value as Record<string, MugenCanonicalValue>).id);
  for (const bank of banks) {
    for (const sprite of bank.sprites) {
      features.add(`g03.sff.${sprite.compression}`);
      features.add(`g03.sprite.${sprite.pixelFormat}`);
      sprites.push(spriteValue(bank.canonicalPath, sprite, externalPaletteId));
    }
  }
  palettes.sort(canonicalTableOrder);
  sprites.sort(canonicalTableOrder);
  const contributions: MugenPackageContributions = Object.freeze({
    palettes: Object.freeze(palettes),
    sprites: Object.freeze(sprites),
    featureUsage: Object.freeze([...features].sort(compareMugenStrings)),
    diagnostics: Object.freeze(banks.flatMap(bank => bank.diagnostics)),
  });
  return Object.freeze({ banks: Object.freeze(banks), contributions, decodedSpriteBytes, decodedPaletteBytes });
}

function paletteValue(path: string, palette: MugenDecodedPalette): MugenCanonicalValue {
  return Object.freeze({
    id: paletteId(path, palette.sourceIndex),
    kind: 'palette-rgba8',
    sourcePath: path,
    sourceIndex: palette.sourceIndex,
    group: palette.group,
    item: palette.item,
    colorCount: palette.colorCount,
    linkedPaletteId: palette.linkedToSourceIndex === null ? null : paletteId(path, palette.linkedToSourceIndex),
    rgbaBase64: palette.linkedToSourceIndex === null ? encodeBase64(palette.rgba) : null,
    source: palette.source,
  });
}

function spriteValue(path: string, sprite: MugenDecodedSprite, externalPaletteId: string | null): MugenCanonicalValue {
  return Object.freeze({
    id: spriteId(path, sprite.sourceIndex),
    kind: 'sprite-plane',
    sourcePath: path,
    sourceIndex: sprite.sourceIndex,
    group: sprite.group,
    item: sprite.item,
    width: sprite.width,
    height: sprite.height,
    axisX: sprite.axisX,
    axisY: sprite.axisY,
    colorDepth: sprite.colorDepth,
    pixelFormat: sprite.pixelFormat,
    compression: sprite.compression,
    dataSpriteId: sprite.linkedToSourceIndex === null ? null : spriteId(path, sprite.linkedToSourceIndex),
    paletteId: sprite.pixelFormat !== 'indexed8'
      ? null
      : sprite.paletteSourceIndex === null ? externalPaletteId : paletteId(path, sprite.paletteSourceIndex),
    pixelsBase64: sprite.pixels === null ? null : encodeBase64(sprite.pixels),
  });
}

function selectionFromDependency(edges: readonly MugenDependencyEdge[], resource: MugenImportResource): number {
  const candidates = edges.filter(edge => edge.to === resource.canonicalPath && /^pal\d+$/i.test(edge.key))
    .map(edge => Number.parseInt(edge.key.slice(3), 10)).filter(value => Number.isInteger(value) && value >= 1 && value <= 12);
  return candidates.length === 0 ? 1 : Math.min(...candidates);
}

function asVfsFile(resource: MugenImportResource) {
  return { canonicalPath: resource.canonicalPath, foldedPath: resource.foldedPath, byteLength: resource.byteLength, sha256: resource.sha256, read: resource.read };
}

function resourceOrder(left: MugenImportResource, right: MugenImportResource): number { return compareMugenStrings(left.canonicalPath, right.canonicalPath); }
function canonicalTableOrder(left: MugenCanonicalValue, right: MugenCanonicalValue): number { return compareMugenStrings(String((left as Record<string, MugenCanonicalValue>).id), String((right as Record<string, MugenCanonicalValue>).id)); }
export function paletteId(path: string, sourceIndex: number): string { return `${path}#palette:${sourceIndex}`; }
export function spriteId(path: string, sourceIndex: number): string { return `${path}#sprite:${sourceIndex}`; }

function addBudget(current: number, added: number, maximum: number, budget: string): number {
  const total = current + added;
  if (!Number.isSafeInteger(total) || total > maximum) failMugen(mugenDiagnostic('E_MUGEN_LIMIT_EXCEEDED', 'budget', 'fatal', 'release-resource', `MUGEN sprite import exceeds ${budget}.`, {}, { budget, observed: total, limit: maximum }));
  return total;
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export function encodeBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  const chunkCharacters: string[] = [];
  for (let offset = 0; offset < bytes.byteLength; offset += 3) {
    const first = bytes[offset]!;
    const second = offset + 1 < bytes.byteLength ? bytes[offset + 1]! : 0;
    const third = offset + 2 < bytes.byteLength ? bytes[offset + 2]! : 0;
    const value = (first << 16) | (second << 8) | third;
    chunkCharacters.push(BASE64[(value >>> 18) & 63]!, BASE64[(value >>> 12) & 63]!, offset + 1 < bytes.byteLength ? BASE64[(value >>> 6) & 63]! : '=', offset + 2 < bytes.byteLength ? BASE64[value & 63]! : '=');
    if (chunkCharacters.length >= 16_384) { parts.push(chunkCharacters.join('')); chunkCharacters.length = 0; }
  }
  if (chunkCharacters.length > 0) parts.push(chunkCharacters.join(''));
  return parts.join('');
}
