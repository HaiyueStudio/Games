import type { MugenPackageContributions } from '../../package/builder';
import type { MugenCanonicalValue } from '../../package/types';
import { MUGEN_LIMITS } from '../contract';
import { failMugen, mugenDiagnostic, throwIfAborted } from '../diagnostics';
import { spriteId } from '../sff/MugenSpritePackage';
import type { MugenSffBank } from '../sff/types';
import type { MugenImportGraph, MugenImportResource } from '../text/DependencyGraph';
import { compareMugenStrings } from '../vfs/path';
import { parseMugenAirResource } from './AirParser';
import type { MugenAirAction, MugenAirBank, MugenAirCollisionBox, MugenAirElement, MugenAirSpriteReference, MugenAirSpriteResolver } from './types';

export interface ImportMugenActionOptions {
  readonly spriteBanks?: readonly MugenSffBank[];
  readonly signal?: AbortSignal;
}

export interface MugenActionImportResult {
  readonly banks: readonly MugenAirBank[];
  readonly contributions: MugenPackageContributions;
  readonly actionCount: number;
  readonly elementCount: number;
  readonly collisionBoxCount: number;
}

export function importMugenActionContributions(graph: MugenImportGraph, options: ImportMugenActionOptions = {}): MugenActionImportResult {
  const resolver = options.spriteBanks === undefined ? undefined : createSpriteResolver(options.spriteBanks);
  const banks: MugenAirBank[] = [];
  let actionCount = 0;
  let elementCount = 0;
  let collisionBoxCount = 0;
  for (const resource of graph.resources.filter(value => value.kind === 'air').sort(resourceOrder)) {
    throwIfAborted(options.signal);
    const parseOptions = {
      ...(resolver === undefined ? {} : { spriteResolver: resolver }),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    };
    const bank = parseMugenAirResource(resource, parseOptions);
    actionCount = addBudget(actionCount, bank.actions.length, MUGEN_LIMITS.air.maxActions, 'maxActions', resource);
    elementCount = addBudget(elementCount, bank.elementCount, MUGEN_LIMITS.air.maxElementsPerPackage, 'maxElementsPerPackage', resource);
    collisionBoxCount = addBudget(collisionBoxCount, bank.collisionBoxCount, MUGEN_LIMITS.air.maxCollisionBoxesPerPackage, 'maxCollisionBoxesPerPackage', resource);
    banks.push(bank);
  }
  const features = new Set<string>(actionCount === 0 ? [] : ['g04.air.action']);
  for (const bank of banks) for (const action of bank.actions) for (const element of action.elements) {
    if (element.clsn1.length > 0) features.add('g04.air.clsn1');
    if (element.clsn2.length > 0) features.add('g04.air.clsn2');
    if (element.flipX || element.flipY) features.add('g04.air.flip');
    if (element.blend.mode !== 'opaque') features.add(`g04.air.blend.${element.blend.mode}`);
    if (element.scaleX !== 1 || element.scaleY !== 1) features.add('g04.air.scale');
    if (element.angleDegrees !== 0) features.add('g04.air.angle');
    for (const interpolation of element.interpolateToThis) features.add(`g04.air.interpolate.${interpolation}`);
  }
  const actions = banks.flatMap(bank => bank.actions.map(action => actionValue(bank, action))).sort(canonicalOrder);
  const diagnostics = banks.flatMap(bank => bank.diagnostics);
  return Object.freeze({
    banks: Object.freeze(banks),
    contributions: Object.freeze({
      actions: Object.freeze(actions),
      featureUsage: Object.freeze([...features].sort(compareMugenStrings)),
      diagnostics: Object.freeze(diagnostics),
    }),
    actionCount,
    elementCount,
    collisionBoxCount,
  });
}

export function actionId(path: string, actionNumber: number): string { return `${path}#action:${actionNumber}`; }

function actionValue(bank: MugenAirBank, action: MugenAirAction): MugenCanonicalValue {
  return Object.freeze({
    id: actionId(bank.canonicalPath, action.number),
    kind: 'air-action-v1',
    sourcePath: bank.canonicalPath,
    sourceSha256: bank.sourceSha256,
    byteOffset: action.byteOffset,
    line: action.line,
    number: action.number,
    loopStart: action.loopStart,
    totalTicks: action.totalTicks,
    preLoopTicks: action.preLoopTicks,
    loopTicks: action.loopTicks,
    elements: Object.freeze(action.elements.map(elementValue)),
  });
}

function elementValue(element: MugenAirElement): MugenCanonicalValue {
  return Object.freeze({
    index: element.index,
    spriteGroup: element.spriteGroup,
    spriteItem: element.spriteItem,
    spriteId: element.spriteId,
    offsetX: element.offsetX,
    offsetY: element.offsetY,
    durationTicks: element.durationTicks,
    flipX: element.flipX,
    flipY: element.flipY,
    blend: Object.freeze({ mode: element.blend.mode, sourceAlpha: element.blend.sourceAlpha, destinationAlpha: element.blend.destinationAlpha }),
    scaleX: element.scaleX,
    scaleY: element.scaleY,
    angleDegrees: element.angleDegrees,
    interpolateToThis: element.interpolateToThis,
    clsn1: Object.freeze(element.clsn1.map(boxValue)),
    clsn2: Object.freeze(element.clsn2.map(boxValue)),
    byteOffset: element.byteOffset,
    line: element.line,
    column: element.column,
  });
}

function boxValue(box: MugenAirCollisionBox): MugenCanonicalValue {
  return Object.freeze({ index: box.index, left: box.left, top: box.top, right: box.right, bottom: box.bottom, byteOffset: box.byteOffset, line: box.line, column: box.column });
}

function createSpriteResolver(banks: readonly MugenSffBank[]): MugenAirSpriteResolver {
  const references = new Map<string, MugenAirSpriteReference>();
  for (const bank of [...banks].sort((left, right) => compareMugenStrings(left.canonicalPath, right.canonicalPath))) {
    for (const sprite of bank.sprites) {
      const key = `${sprite.group},${sprite.item}`;
      const reference = Object.freeze({ id: spriteId(bank.canonicalPath, sprite.sourceIndex), axisX: sprite.axisX, axisY: sprite.axisY });
      references.set(key, reference);
    }
  }
  return (group, item) => references.get(`${group},${item}`) ?? null;
}

function resourceOrder(left: MugenImportResource, right: MugenImportResource): number { return compareMugenStrings(left.canonicalPath, right.canonicalPath); }
function canonicalOrder(left: MugenCanonicalValue, right: MugenCanonicalValue): number { return compareMugenStrings(String((left as Record<string, MugenCanonicalValue>).id), String((right as Record<string, MugenCanonicalValue>).id)); }
function addBudget(current: number, added: number, limit: number, budget: string, resource: MugenImportResource): number {
  const total = current + added;
  if (!Number.isSafeInteger(total) || total > limit) failMugen(mugenDiagnostic('E_MUGEN_LIMIT_EXCEEDED', 'budget', 'fatal', 'release-resource', `MUGEN AIR import exceeds ${budget}.`, { canonicalPath: resource.canonicalPath, sourceSha256: resource.sha256 }, { budget, observed: total, limit }));
  return total;
}
