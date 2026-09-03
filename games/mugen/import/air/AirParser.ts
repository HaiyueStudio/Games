import { MUGEN_LIMITS } from '../contract';
import { failMugen, mugenDiagnostic, throwIfAborted, type MugenImportDiagnostic } from '../diagnostics';
import type { MugenImportResource } from '../text/DependencyGraph';
import type { MugenAssignmentToken, MugenDirectiveToken, MugenTextDocument, MugenTextSpan } from '../text/MugenTextParser';
import type {
  MugenAirAction,
  MugenAirBank,
  MugenAirBlend,
  MugenAirCollisionBox,
  MugenAirElement,
  MugenAirInterpolation,
  MugenAirSpriteResolver,
} from './types';

type SemanticToken = MugenAssignmentToken | MugenDirectiveToken;
type CollisionKind = 'clsn1' | 'clsn2';

interface PendingCollision {
  readonly kind: CollisionKind;
  readonly isDefault: boolean;
  readonly expected: number;
  readonly declaration: MugenDirectiveToken;
  readonly boxes: Map<number, MugenAirCollisionBox>;
}

export interface ParseMugenAirOptions {
  readonly spriteResolver?: MugenAirSpriteResolver;
  readonly signal?: AbortSignal;
}

export function parseMugenAirResource(resource: MugenImportResource, options: ParseMugenAirOptions = {}): MugenAirBank {
  if (resource.kind !== 'air' || resource.document === undefined) {
    failMugen(mugenDiagnostic('E_MUGEN_AIR_ELEMENT_INVALID', 'air', 'error', 'release-resource', `Resource is not a decoded AIR document: ${resource.canonicalPath}.`, { canonicalPath: resource.canonicalPath, sourceSha256: resource.sha256 }));
  }
  return parseMugenAir(resource.document, options);
}

export function parseMugenAir(document: MugenTextDocument, options: ParseMugenAirOptions = {}): MugenAirBank {
  const actions: MugenAirAction[] = [];
  const diagnostics: MugenImportDiagnostic[] = [];
  const actionLines = new Map<number, number>();
  let elementCount = 0;
  let collisionBoxCount = 0;
  for (let sectionIndex = 0; sectionIndex < document.sections.length; sectionIndex++) {
    throwIfAborted(options.signal);
    const section = document.sections[sectionIndex]!;
    const match = /^begin\s+action\s+([+-]?\d+)$/i.exec(section.name.trim());
    if (!match) failAir(document, section.header.span, 'E_MUGEN_AIR_ELEMENT_INVALID', `Unsupported AIR section [${section.name}].`);
    const actionNumber = parseInt32(match[1]!, document, section.header.span, 'action number');
    const firstLine = actionLines.get(actionNumber);
    if (firstLine !== undefined) {
      diagnostics.push(mugenDiagnostic(
        'E_MUGEN_AIR_ACTION_DUPLICATE',
        'air',
        'warning',
        'ignore',
        `Duplicate AIR action ${actionNumber} is ignored; MUGEN 1.1 keeps the first definition.`,
        { ...location(document, section.header.span), section: `Begin Action ${actionNumber}`, group: actionNumber },
        { firstLine, duplicateLine: section.header.span.line },
      ));
      continue;
    }
    actionLines.set(actionNumber, section.header.span.line);
    if (actions.length >= MUGEN_LIMITS.air.maxActions) failBudget(document, section.header.span, 'maxActions', actions.length + 1, MUGEN_LIMITS.air.maxActions);
    const tokens = document.tokens.filter((token): token is SemanticToken =>
      (token.kind === 'assignment' || token.kind === 'directive') && token.sectionIndex === sectionIndex);
    const parsed = parseAction(document, actionNumber, section.header.span, tokens, options.spriteResolver, diagnostics, options.signal);
    elementCount = checkedAggregate(document, section.header.span, 'maxElementsPerPackage', elementCount, parsed.elements.length, MUGEN_LIMITS.air.maxElementsPerPackage);
    const actionBoxes = parsed.elements.reduce((total, element) => total + element.clsn1.length + element.clsn2.length, 0);
    collisionBoxCount = checkedAggregate(document, section.header.span, 'maxCollisionBoxesPerPackage', collisionBoxCount, actionBoxes, MUGEN_LIMITS.air.maxCollisionBoxesPerPackage);
    actions.push(parsed);
  }
  actions.sort((left, right) => left.number - right.number);
  return Object.freeze({
    canonicalPath: document.canonicalPath,
    sourceSha256: document.sourceSha256,
    actions: Object.freeze(actions),
    diagnostics: Object.freeze(diagnostics),
    elementCount,
    collisionBoxCount,
  });
}

function parseAction(
  document: MugenTextDocument,
  actionNumber: number,
  actionSpan: MugenTextSpan,
  tokens: readonly SemanticToken[],
  spriteResolver: MugenAirSpriteResolver | undefined,
  diagnostics: MugenImportDiagnostic[],
  signal?: AbortSignal,
): MugenAirAction {
  const elements: MugenAirElement[] = [];
  let defaultClsn1: readonly MugenAirCollisionBox[] = Object.freeze([]);
  let defaultClsn2: readonly MugenAirCollisionBox[] = Object.freeze([]);
  let currentClsn1 = defaultClsn1;
  let currentClsn2 = defaultClsn2;
  let pendingCollision: PendingCollision | null = null;
  const pendingInterpolation: MugenAirInterpolation[] = [];
  let loopStart = 0;
  let pendingLoopStart = false;

  const commitCollision = (pending: PendingCollision): void => {
    const ordered: MugenAirCollisionBox[] = [];
    for (let index = 0; index < pending.expected; index++) {
      const box = pending.boxes.get(index);
      if (!box) failAir(document, pending.declaration.span, 'E_MUGEN_AIR_CLSN_COUNT', `${pending.kind} declares ${pending.expected} boxes but index ${index} is missing.`, { group: actionNumber });
      ordered.push(box);
    }
    const boxes = Object.freeze(ordered);
    if (pending.kind === 'clsn1') {
      currentClsn1 = boxes;
      if (pending.isDefault) defaultClsn1 = boxes;
    } else {
      currentClsn2 = boxes;
      if (pending.isDefault) defaultClsn2 = boxes;
    }
    pendingCollision = null;
  };

  for (const token of tokens) {
    throwIfAborted(signal);
    if (pendingCollision !== null) {
      if (token.kind !== 'assignment') failAir(document, token.span, 'E_MUGEN_AIR_CLSN_COUNT', `${pendingCollision.kind} expects ${pendingCollision.expected} indexed boxes before another AIR directive.`, { group: actionNumber });
      const box = parseCollisionAssignment(document, token, pendingCollision, actionNumber);
      if (pendingCollision.boxes.has(box.index)) failAir(document, token.keySpan, 'E_MUGEN_AIR_CLSN_COUNT', `Duplicate ${pendingCollision.kind} box index ${box.index}.`, { group: actionNumber });
      pendingCollision.boxes.set(box.index, box);
      if (pendingCollision.boxes.size === pendingCollision.expected) commitCollision(pendingCollision);
      continue;
    }
    if (token.kind === 'assignment') {
      failAir(document, token.keySpan, 'E_MUGEN_AIR_CLSN_COUNT', `AIR collision assignment ${token.key} has no matching count declaration.`, { group: actionNumber });
    }
    const directive = token.value.trim();
    const count = /^clsn([12])(default)?\s*:\s*([+-]?\d+)$/i.exec(directive);
    if (count) {
      const expected = parseNonNegativeInt(count[3]!, document, token.span, 'collision count');
      if (expected > MUGEN_LIMITS.air.maxCollisionBoxesPerElement) failBudget(document, token.span, 'maxCollisionBoxesPerElement', expected, MUGEN_LIMITS.air.maxCollisionBoxesPerElement);
      pendingCollision = { kind: count[1] === '1' ? 'clsn1' : 'clsn2', isDefault: count[2] !== undefined, expected, declaration: token, boxes: new Map() };
      if (expected === 0) commitCollision(pendingCollision);
      continue;
    }
    if (/^loopstart$/i.test(directive)) {
      pendingLoopStart = true;
      continue;
    }
    const interpolation = /^interpolate\s+(offset|blend|scale|angle)$/i.exec(directive);
    if (interpolation) {
      const kind = interpolation[1]!.toLowerCase() as MugenAirInterpolation;
      if (pendingInterpolation.includes(kind)) failAir(document, token.span, 'E_MUGEN_AIR_ELEMENT_INVALID', `Duplicate Interpolate ${kind} directive for one AIR transition.`, { group: actionNumber });
      if (pendingInterpolation.length >= MUGEN_LIMITS.air.maxInterpolationDirectivesPerElement) failBudget(document, token.span, 'maxInterpolationDirectivesPerElement', pendingInterpolation.length + 1, MUGEN_LIMITS.air.maxInterpolationDirectivesPerElement);
      pendingInterpolation.push(kind);
      continue;
    }
    if (/^copy\s+action\b/i.test(directive)) failAir(document, token.span, 'E_MUGEN_OUT_OF_PROFILE', 'Copy Action is outside the MUGEN 1.1b1 strict AIR subset.', { group: actionNumber });
    if (!/^[+-]?\d/.test(directive)) failAir(document, token.span, 'E_MUGEN_AIR_ELEMENT_INVALID', `Unknown AIR directive: ${directive}.`, { group: actionNumber });
    if (elements.length >= MUGEN_LIMITS.air.maxElementsPerAction) failBudget(document, token.span, 'maxElementsPerAction', elements.length + 1, MUGEN_LIMITS.air.maxElementsPerAction);
    if (pendingLoopStart) { loopStart = elements.length; pendingLoopStart = false; }
    const element = parseElement(document, token, elements.length, currentClsn1, currentClsn2, pendingInterpolation, spriteResolver, diagnostics, actionNumber);
    elements.push(element);
    pendingInterpolation.length = 0;
    currentClsn1 = defaultClsn1;
    currentClsn2 = defaultClsn2;
  }
  if (pendingCollision !== null) failAir(document, pendingCollision.declaration.span, 'E_MUGEN_AIR_CLSN_COUNT', `${pendingCollision.kind} declares ${pendingCollision.expected} boxes but only ${pendingCollision.boxes.size} were provided.`, { group: actionNumber });
  if (pendingInterpolation.length > 0) failAir(document, actionSpan, 'E_MUGEN_AIR_ELEMENT_INVALID', 'AIR interpolation directive has no following element.', { group: actionNumber });
  if (pendingLoopStart) failAir(document, actionSpan, 'E_MUGEN_AIR_ELEMENT_INVALID', 'LoopStart has no following element.', { group: actionNumber });
  if (elements.length === 0) failAir(document, actionSpan, 'E_MUGEN_AIR_ELEMENT_INVALID', `AIR action ${actionNumber} has no elements.`, { group: actionNumber });

  const firstInfinite = elements.findIndex(element => element.durationTicks === -1);
  if (firstInfinite >= 0 && firstInfinite < elements.length - 1) {
    // Frames after the first infinite frame are unreachable in MUGEN. Legacy
    // AIR generators may leave either duplicate holds or an abandoned finite
    // tail after it, so retain the first hold and discard the unreachable tail.
    elements.splice(firstInfinite + 1);
    loopStart = Math.min(loopStart, firstInfinite);
  }

  if (elements.every(element => element.durationTicks === 0)) {
    // Legacy MUGEN characters and authoring tools use an all-zero action as an
    // instantaneous placeholder, sometimes with a visible sprite. Give its
    // first element one tick so preview playback has a defined frame/loop.
    elements[0] = Object.freeze({ ...elements[0]!, durationTicks: 1 });
    loopStart = 0;
  }

  for (let target = 0; target < elements.length; target++) {
    if (!elements[target]!.interpolateToThis.includes('blend')) continue;
    const previous = elements[(target - 1 + elements.length) % elements.length]!;
    if (previous.blend.mode !== elements[target]!.blend.mode || previous.blend.mode === 'opaque') {
      failAir(document, spanOf(elements[target]!), 'E_MUGEN_AIR_ELEMENT_INVALID', 'Interpolate Blend requires matching non-opaque transparency functions; use AS256D0 for an opaque endpoint.', { group: actionNumber, item: target });
    }
  }
  for (let index = 0; index < elements.length - 1; index++) if (elements[index]!.durationTicks === -1) failAir(document, spanOf(elements[index]!), 'E_MUGEN_AIR_DURATION_INVALID', 'Only the final AIR element may have duration -1.', { group: actionNumber, item: index });
  const infinite = elements[elements.length - 1]!.durationTicks === -1;
  const positiveTicks = (from: number, to: number): number => elements.slice(from, to).reduce((total, element) => checkedTickSum(document, spanOf(element), total, Math.max(0, element.durationTicks)), 0);
  const preLoopTicks = positiveTicks(0, loopStart);
  const loopTicks = infinite ? null : positiveTicks(loopStart, elements.length);
  const totalTicks = infinite ? null : checkedTickSum(document, actionSpan, preLoopTicks, loopTicks!);
  if (!infinite && totalTicks === 0) failAir(document, actionSpan, 'E_MUGEN_AIR_DURATION_INVALID', `AIR action ${actionNumber} has no observable element duration.`, { group: actionNumber });
  if (!infinite && loopTicks === 0) failAir(document, actionSpan, 'E_MUGEN_AIR_DURATION_INVALID', `AIR action ${actionNumber} has a zero-duration loop segment.`, { group: actionNumber });
  return Object.freeze({
    number: actionNumber,
    loopStart,
    elements: Object.freeze(elements),
    totalTicks,
    preLoopTicks,
    loopTicks,
    ...sourceSpan(actionSpan),
  });
}

function parseElement(
  document: MugenTextDocument,
  token: MugenDirectiveToken,
  index: number,
  clsn1: readonly MugenAirCollisionBox[],
  clsn2: readonly MugenAirCollisionBox[],
  interpolation: readonly MugenAirInterpolation[],
  spriteResolver: MugenAirSpriteResolver | undefined,
  diagnostics: MugenImportDiagnostic[],
  actionNumber: number,
): MugenAirElement {
  const fields = token.value.split(',').map(value => value.trim().replace(/\u00ff+$/u, '').trim());
  if (fields.length < 5 || fields.length > 10) failAir(document, token.span, 'E_MUGEN_AIR_ELEMENT_INVALID', `AIR element must have 5 to 10 comma-separated fields, got ${fields.length}.`, { group: actionNumber, item: index });
  const parsedSpriteGroup = parseLegacySpriteInt32(fields[0]!, document, token.span, 'sprite group');
  const parsedSpriteItem = parseLegacySpriteInt32(fields[1]!, document, token.span, 'sprite item');
  // Official AIR uses -1 as the blank sentinel, while older authoring tools
  // and hand-authored characters sometimes emit other negative identifiers.
  // MUGEN renders those as an empty element, so canonicalize them to -1.
  const spriteGroup = parsedSpriteGroup < 0 ? -1 : parsedSpriteGroup;
  const spriteItem = parsedSpriteItem < 0 ? -1 : parsedSpriteItem;
  const offsetX = parseBoundedInt(fields[2]!, document, token.span, 'x offset', MUGEN_LIMITS.air.maxAbsoluteOffset);
  const offsetY = parseBoundedInt(fields[3]!, document, token.span, 'y offset', MUGEN_LIMITS.air.maxAbsoluteOffset);
  const durationTicks = parseInt32(fields[4]!, document, token.span, 'duration');
  if (durationTicks < -1 || durationTicks > MUGEN_LIMITS.air.maxFiniteElementTicks) failAir(document, token.span, 'E_MUGEN_AIR_DURATION_INVALID', `AIR duration ${durationTicks} is outside -1..${MUGEN_LIMITS.air.maxFiniteElementTicks}.`, { group: actionNumber, item: index });
  const flip = (fields[5] ?? '').toLowerCase();
  if (!/^(?:|h|v|hv|vh)$/.test(flip)) failAir(document, token.span, 'E_MUGEN_AIR_ELEMENT_INVALID', `Invalid AIR flip flags: ${fields[5]}.`, { group: actionNumber, item: index });
  const blend = parseBlend(fields[6] ?? '', document, token.span, actionNumber, index);
  const scaleX = parseScale(fields, 7, document, token.span, actionNumber, index);
  const scaleY = parseScale(fields, 8, document, token.span, actionNumber, index);
  const angleDegrees = fields.length <= 9 || fields[9] === '' ? 0 : parseBoundedFloat(fields[9]!, document, token.span, 'angle', MUGEN_LIMITS.air.maxAbsoluteAngleDegrees, actionNumber, index);
  const blank = spriteGroup === -1 || spriteItem === -1;
  const sprite = blank ? null : spriteResolver?.(spriteGroup, spriteItem) ?? null;
  if (!blank && spriteResolver !== undefined && sprite === null) diagnostics.push(mugenDiagnostic(
    'E_MUGEN_AIR_SPRITE_MISSING', 'air', 'warning', 'ignore',
    `AIR action ${actionNumber} element ${index} references missing sprite ${spriteGroup},${spriteItem}.`,
    { canonicalPath: document.canonicalPath, sourceSha256: document.sourceSha256, byteOffset: token.span.startByte, line: token.span.line, column: token.span.column, section: `Begin Action ${actionNumber}`, group: spriteGroup, item: spriteItem },
  ));
  return Object.freeze({
    index,
    spriteGroup,
    spriteItem,
    spriteId: sprite?.id ?? null,
    offsetX,
    offsetY,
    durationTicks,
    flipX: flip.includes('h'),
    flipY: flip.includes('v'),
    blend,
    scaleX,
    scaleY,
    angleDegrees,
    interpolateToThis: Object.freeze([...interpolation]),
    clsn1,
    clsn2,
    ...sourceSpan(token.span),
  });
}

function parseCollisionAssignment(document: MugenTextDocument, token: MugenAssignmentToken, pending: PendingCollision, actionNumber: number): MugenAirCollisionBox {
  const match = /^clsn([12])\s*\[\s*(\d+)\s*\]$/i.exec(token.key);
  // Elecbyte's bundled KFM contains a `Clsn1: 1` block whose sole assignment is
  // misspelled `Clsn2[0]`. MUGEN consumes assignments positionally after the
  // count declaration, so the declaration remains authoritative here too.
  if (!match) failAir(document, token.keySpan, 'E_MUGEN_AIR_CLSN_COUNT', `${pending.kind} declaration was followed by incompatible box ${token.key}.`, { group: actionNumber });
  const index = parseNonNegativeInt(match[2]!, document, token.keySpan, 'collision index');
  if (index >= pending.expected) failAir(document, token.keySpan, 'E_MUGEN_AIR_CLSN_COUNT', `${pending.kind} box index ${index} exceeds declared count ${pending.expected}.`, { group: actionNumber });
  const fields = token.value.split(',').map(value => value.trim());
  if (fields.length !== 4) failAir(document, token.valueSpan, 'E_MUGEN_AIR_ELEMENT_INVALID', `${pending.kind}[${index}] must contain four coordinates.`, { group: actionNumber });
  const values = fields.map((value, field) => parseBoundedInt(value, document, token.valueSpan, `collision coordinate ${field}`, MUGEN_LIMITS.air.maxAbsoluteCollisionCoordinate));
  return Object.freeze({ index, left: Math.min(values[0]!, values[2]!), top: Math.min(values[1]!, values[3]!), right: Math.max(values[0]!, values[2]!), bottom: Math.max(values[1]!, values[3]!), ...sourceSpan(token.span) });
}

function parseBlend(value: string, document: MugenTextDocument, span: MugenTextSpan, action: number, element: number): MugenAirBlend {
  const normalized = value.replace(/\s/g, '').toLowerCase();
  if (normalized === '') return OPAQUE_BLEND;
  if (normalized === 'a') return Object.freeze({ mode: 'add', sourceAlpha: 256, destinationAlpha: 256 });
  if (normalized === 'a1') return Object.freeze({ mode: 'add', sourceAlpha: 256, destinationAlpha: 128 });
  // A2..A9 are non-standard WinMUGEN-era spellings found in characters authored
  // with older community tools. Those runtimes treat them as ordinary additive
  // blending rather than rejecting the entire animation bank.
  if (/^a[2-9]$/u.test(normalized)) return Object.freeze({ mode: 'add', sourceAlpha: 256, destinationAlpha: 256 });
  if (normalized === 's') return Object.freeze({ mode: 'subtract', sourceAlpha: 256, destinationAlpha: 256 });
  const alpha = /^as(\d{1,3})d(\d{1,3})$/.exec(normalized);
  if (alpha) {
    const sourceAlpha = Number(alpha[1]);
    const destinationAlpha = Number(alpha[2]);
    if (sourceAlpha <= 256 && destinationAlpha <= 256) return Object.freeze({ mode: 'add', sourceAlpha, destinationAlpha });
  }
  failAir(document, span, 'E_MUGEN_AIR_ELEMENT_INVALID', `Invalid AIR blend parameter: ${value}.`, { group: action, item: element });
}

function parseScale(fields: readonly string[], index: number, document: MugenTextDocument, span: MugenTextSpan, action: number, element: number): number {
  if (fields.length <= index) return 1;
  if (fields[index] === '') return 0;
  return parseBoundedFloat(fields[index]!, document, span, index === 7 ? 'x scale' : 'y scale', MUGEN_LIMITS.air.maxAbsoluteScale, action, element);
}

function parseBoundedFloat(value: string, document: MugenTextDocument, span: MugenTextSpan, label: string, maximum: number, action: number, element: number): number {
  if (!DECIMAL.test(value)) failAir(document, span, 'E_MUGEN_AIR_ELEMENT_INVALID', `AIR ${label} is not a finite decimal: ${value}.`, { group: action, item: element });
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || Math.abs(parsed) > maximum) failAir(document, span, 'E_MUGEN_AIR_ELEMENT_INVALID', `AIR ${label} exceeds ±${maximum}: ${value}.`, { group: action, item: element });
  const rounded = Math.fround(parsed);
  return Object.is(rounded, -0) ? 0 : rounded;
}

function parseBoundedInt(value: string, document: MugenTextDocument, span: MugenTextSpan, label: string, maximum: number): number {
  const parsed = parseInt32(value, document, span, label);
  if (Math.abs(parsed) > maximum) failAir(document, span, 'E_MUGEN_AIR_ELEMENT_INVALID', `AIR ${label} exceeds ±${maximum}: ${value}.`);
  return parsed;
}

function parseInt32(value: string, document: MugenTextDocument, span: MugenTextSpan, label: string): number {
  if (!/^[+-]?\d+$/.test(value)) failAir(document, span, 'E_MUGEN_AIR_ELEMENT_INVALID', `AIR ${label} is not an integer: ${value}.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < -2_147_483_648 || parsed > 2_147_483_647) failAir(document, span, 'E_MUGEN_AIR_ELEMENT_INVALID', `AIR ${label} is outside int32: ${value}.`);
  return parsed;
}

/**
 * A small number of WinMUGEN-era AIR files contain constant arithmetic in a
 * sprite identifier (for example Fiona's `504-5`). It is not part of the AIR
 * standard, but evaluating a single literal addition/subtraction is safe and
 * lets the existing missing-sprite recovery preserve the rest of the action.
 */
function parseLegacySpriteInt32(value: string, document: MugenTextDocument, span: MugenTextSpan, label: string): number {
  if (/^[+-]?\d+$/u.test(value)) return parseInt32(value, document, span, label);
  const expression = /^([+-]?\d+)\s*([+-])\s*(\d+)$/u.exec(value);
  if (!expression) failAir(document, span, 'E_MUGEN_AIR_ELEMENT_INVALID', `AIR ${label} is not an integer: ${value}.`);
  const left = Number(expression[1]);
  const right = Number(expression[3]);
  const parsed = expression[2] === '+' ? left + right : left - right;
  if (!Number.isSafeInteger(parsed) || parsed < -2_147_483_648 || parsed > 2_147_483_647) failAir(document, span, 'E_MUGEN_AIR_ELEMENT_INVALID', `AIR ${label} expression is outside int32: ${value}.`);
  return parsed;
}

function parseNonNegativeInt(value: string, document: MugenTextDocument, span: MugenTextSpan, label: string): number {
  const parsed = parseInt32(value, document, span, label);
  if (parsed < 0) failAir(document, span, 'E_MUGEN_AIR_CLSN_COUNT', `AIR ${label} cannot be negative: ${value}.`);
  return parsed;
}

function checkedAggregate(document: MugenTextDocument, span: MugenTextSpan, budget: string, current: number, added: number, limit: number): number {
  const total = current + added;
  if (!Number.isSafeInteger(total) || total > limit) failBudget(document, span, budget, total, limit);
  return total;
}

function checkedTickSum(document: MugenTextDocument, span: MugenTextSpan, current: number, added: number): number {
  const total = current + added;
  if (!Number.isSafeInteger(total)) failAir(document, span, 'E_MUGEN_AIR_DURATION_INVALID', 'AIR action tick sum exceeds the safe integer range.');
  return total;
}

function failBudget(document: MugenTextDocument, span: MugenTextSpan, budget: string, observed: number, limit: number): never {
  failMugen(mugenDiagnostic('E_MUGEN_LIMIT_EXCEEDED', 'budget', 'fatal', 'release-resource', `AIR exceeds ${budget}.`, location(document, span), { budget, observed, limit }));
}

function failAir(document: MugenTextDocument, span: MugenTextSpan, code: 'E_MUGEN_AIR_ELEMENT_INVALID' | 'E_MUGEN_AIR_DURATION_INVALID' | 'E_MUGEN_AIR_CLSN_COUNT' | 'E_MUGEN_OUT_OF_PROFILE', message: string, extra: { readonly group?: number; readonly item?: number } = {}): never {
  const contract = code === 'E_MUGEN_OUT_OF_PROFILE'
    ? ['classification', 'error', 'release-resource'] as const
    : ['air', 'error', 'release-resource'] as const;
  failMugen(mugenDiagnostic(code, contract[0], contract[1], contract[2], message, { ...location(document, span), ...extra }));
}

function location(document: MugenTextDocument, span: MugenTextSpan) {
  return { canonicalPath: document.canonicalPath, sourceSha256: document.sourceSha256, byteOffset: span.startByte, line: span.line, column: span.column } as const;
}
function sourceSpan(span: MugenTextSpan) { return { byteOffset: span.startByte, line: span.line, column: span.column } as const; }
function spanOf(value: { readonly byteOffset: number; readonly line: number; readonly column: number }): MugenTextSpan { return { canonicalPath: '', startByte: value.byteOffset, endByte: value.byteOffset, line: value.line, column: value.column }; }

const OPAQUE_BLEND: MugenAirBlend = Object.freeze({ mode: 'opaque', sourceAlpha: 256, destinationAlpha: 0 });
const DECIMAL = /^[+-]?(?:(?:\d+(?:\.\d*)?)|(?:\.\d+))(?:e[+-]?\d+)?$/i;
