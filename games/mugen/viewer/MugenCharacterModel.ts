import type { MugenAirAction, MugenAirBlend, MugenAirCollisionBox, MugenAirElement, MugenAirSpriteReference } from '../import/air/types';
import type { MugenCharacterMetadata } from '../import/worker/MugenCharacterImport';
import type { MugenScannedViewerAudioCue } from '../import/audio/MugenViewerAudioCueScanner';
import type { MugenImportDiagnostic } from '../import/diagnostics';
import type { MugenVfsInput } from '../import/vfs/MugenVfs';
import { asciiCaseFold, compareMugenStrings } from '../import/vfs/path';
import type { HaiyueMugenPackage, MugenCanonicalValue } from '../package/types';

export interface MugenViewerSprite {
  readonly id: string;
  readonly renderSpriteId: string;
  readonly sourcePath: string;
  readonly group: number;
  readonly item: number;
  readonly width: number;
  readonly height: number;
  readonly axisX: number;
  readonly axisY: number;
  readonly format: 'indexed8' | 'rgb8' | 'rgba8';
  readonly pixels: Uint8Array;
  readonly defaultPaletteId: string | null;
}

export interface MugenViewerPalette {
  readonly id: string;
  readonly renderPaletteId: string;
  readonly sourcePath: string;
  readonly group: number;
  readonly item: number;
  readonly colorCount: number;
  readonly rgba: Uint8Array;
  readonly source: string;
}

export interface MugenViewerAction {
  readonly id: string;
  readonly sourcePath: string;
  readonly label: string | null;
  readonly action: MugenAirAction;
  readonly elementCount: number;
  readonly referencedSpriteIds: readonly string[];
  readonly clsn1Count: number;
  readonly clsn2Count: number;
  readonly warningCount: number;
  readonly errorCount: number;
  readonly audioCues: readonly MugenViewerAudioCue[];
}

export interface MugenViewerSound {
  readonly id: string;
  readonly group: number;
  readonly item: number;
  readonly encodedSha256: string;
  readonly encodedBase64: string;
}

export interface MugenViewerAudioCue {
  readonly sound: MugenViewerSound;
  readonly tick: number;
  readonly channel: number;
  readonly volume: number;
  readonly pan: number;
  readonly frequency: number;
  readonly loop: boolean;
  readonly repeatOnLoop: boolean;
}

export interface MugenRendererSpriteAsset {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly format: 'indexed8' | 'rgb8' | 'rgba8';
  readonly pixels: Uint8Array;
}

export interface MugenRendererPaletteAsset {
  readonly id: string;
  readonly colorCount: number;
  readonly rgba: Uint8Array;
}

export interface MugenRenderAssetModel {
  readonly sprites: readonly MugenViewerSprite[];
  readonly palettes: readonly MugenViewerPalette[];
  readonly rendererSprites: readonly MugenRendererSpriteAsset[];
  readonly rendererPalettes: readonly MugenRendererPaletteAsset[];
  readonly spriteById: ReadonlyMap<string, MugenViewerSprite>;
  readonly paletteById: ReadonlyMap<string, MugenViewerPalette>;
}

export interface MugenCharacterModel extends MugenRenderAssetModel {
  readonly metadata: MugenCharacterMetadata;
  readonly package: HaiyueMugenPackage;
  readonly actions: readonly MugenViewerAction[];
  readonly sounds: readonly MugenViewerSound[];
  readonly referencedSpriteCount: number;
  readonly missingSpriteReferenceCount: number;
  readonly diagnostics: readonly MugenImportDiagnostic[];
}

export interface MugenCharacterModelOptions {
  readonly viewerAudioCues?: readonly MugenScannedViewerAudioCue[];
}

export function discoverMugenCharacterDefCandidates(inputs: readonly MugenVfsInput[]): readonly string[] {
  const candidates = inputs
    .map(input => ({ input, path: input.path.replaceAll('\\', '/') }))
    .filter(candidate => asciiCaseFold(candidate.path).endsWith('.def'));
  const roots = candidates.filter(candidate => !candidate.path.includes('/'));
  const scoped = roots.length > 0 ? roots : candidates;
  const characterDefs = scoped.filter(candidate => looksLikeCharacterDef(candidate.input.bytes));
  const selected = characterDefs.length > 0 ? characterDefs : scoped;
  return Object.freeze(selected
    .map(candidate => candidate.path)
    .sort((left, right) => compareMugenStrings(asciiCaseFold(left), asciiCaseFold(right)) || compareMugenStrings(left, right)));
}

function looksLikeCharacterDef(source: Uint8Array | ArrayBuffer): boolean {
  // DEF grammar tokens are ASCII even when display metadata uses a legacy code page.
  // Limit the preview so a malformed or mislabeled file cannot cause excessive work.
  const bytes = source instanceof Uint8Array ? source : new Uint8Array(source);
  const length = Math.min(bytes.byteLength, 256 * 1024);
  let preview = '';
  for (let index = 0; index < length; index += 1) {
    const value = bytes[index]!;
    preview += value < 0x80 ? String.fromCharCode(value) : ' ';
  }
  return /^\s*\[\s*files\s*\]/imu.test(preview)
    && /^\s*(?:sprite|anim|cmd|cns)\s*=/imu.test(preview);
}

export function createMugenCharacterModel(packageValue: HaiyueMugenPackage, metadata: MugenCharacterMetadata, options: MugenCharacterModelOptions = {}): MugenCharacterModel {
  const rawPalettes = packageValue.tables.palettes.map(value => paletteRecord(value));
  const paletteRecords = new Map(rawPalettes.map(value => [value.id, value]));
  const paletteById = new Map<string, MugenViewerPalette>();
  const resolvePalette = (id: string, ancestors = new Set<string>()): MugenViewerPalette => {
    const existing = paletteById.get(id);
    if (existing) return existing;
    if (ancestors.has(id)) throw new TypeError(`MUGEN viewer palette link cycle at ${id}.`);
    const raw = paletteRecords.get(id);
    if (!raw) throw new TypeError(`MUGEN viewer palette link target is missing: ${id}.`);
    ancestors.add(id);
    const root = raw.linkedPaletteId === null ? null : resolvePalette(raw.linkedPaletteId, ancestors);
    ancestors.delete(id);
    const rgba = root?.rgba ?? decodeBase64(requireString(raw.rgbaBase64, `${id}.rgbaBase64`));
    const palette = Object.freeze({
      id,
      renderPaletteId: root?.renderPaletteId ?? id,
      sourcePath: raw.sourcePath,
      group: raw.group,
      item: raw.item,
      colorCount: raw.colorCount,
      rgba,
      source: raw.source,
    });
    paletteById.set(id, palette);
    return palette;
  };
  const palettes = Object.freeze(rawPalettes.map(value => resolvePalette(value.id)));

  const rawSprites = packageValue.tables.sprites.map(value => spriteRecord(value));
  const spriteRecords = new Map(rawSprites.map(value => [value.id, value]));
  const spriteById = new Map<string, MugenViewerSprite>();
  const resolveSprite = (id: string, ancestors = new Set<string>()): MugenViewerSprite => {
    const existing = spriteById.get(id);
    if (existing) return existing;
    if (ancestors.has(id)) throw new TypeError(`MUGEN viewer sprite link cycle at ${id}.`);
    const raw = spriteRecords.get(id);
    if (!raw) throw new TypeError(`MUGEN viewer sprite link target is missing: ${id}.`);
    ancestors.add(id);
    const root = raw.dataSpriteId === null ? null : resolveSprite(raw.dataSpriteId, ancestors);
    ancestors.delete(id);
    const pixels = root?.pixels ?? decodeBase64(requireString(raw.pixelsBase64, `${id}.pixelsBase64`));
    const sprite = Object.freeze({
      id,
      renderSpriteId: root?.renderSpriteId ?? id,
      sourcePath: raw.sourcePath,
      group: raw.group,
      item: raw.item,
      width: root?.width ?? raw.width,
      height: root?.height ?? raw.height,
      axisX: raw.axisX,
      axisY: raw.axisY,
      format: root?.format ?? raw.format,
      pixels,
      defaultPaletteId: raw.paletteId,
    });
    spriteById.set(id, sprite);
    return sprite;
  };
  const sprites = Object.freeze(rawSprites.map(value => resolveSprite(value.id)));

  const sounds = Object.freeze(packageValue.tables.sounds.map(soundRecord).filter(value => value.selectedByKey));
  const soundByKey = new Map(sounds.map(sound => [`${sound.group},${sound.item}`, sound]));
  const baseActions = packageValue.tables.actions.map(value => actionRecord(value, spriteById));
  const baseActionByNumber = new Map(baseActions.map(value => [value.action.number, value]));
  const audioCues = mergeAudioCues(
    audioCuesByAction(packageValue.tables.states, soundByKey, baseActionByNumber),
    scannedAudioCuesByAction(options.viewerAudioCues ?? [], soundByKey, baseActionByNumber),
  );
  const actions = Object.freeze(baseActions.map(action => {
    return Object.freeze({ ...action, audioCues: audioCues.get(action.action.number) ?? Object.freeze([]) });
  }).sort((left, right) => left.action.number - right.action.number || compareMugenStrings(left.id, right.id)));
  const referenced = new Set(actions.flatMap(action => action.referencedSpriteIds));
  const missingSpriteReferenceCount = actions.reduce((total, action) => total + action.warningCount, 0);
  const rendererSprites = Object.freeze([...new Map(sprites.map(sprite => [sprite.renderSpriteId, Object.freeze({
    id: sprite.renderSpriteId,
    width: sprite.width,
    height: sprite.height,
    format: sprite.format,
    pixels: sprite.pixels,
  })])).values()].sort((left, right) => compareMugenStrings(left.id, right.id)));
  const rendererPalettes = Object.freeze([...new Map(palettes.map(palette => [palette.renderPaletteId, Object.freeze({
    id: palette.renderPaletteId,
    colorCount: palette.colorCount,
    rgba: palette.rgba,
  })])).values()].sort((left, right) => compareMugenStrings(left.id, right.id)));
  return Object.freeze({
    metadata,
    package: packageValue,
    sprites,
    palettes,
    actions,
    sounds,
    rendererSprites,
    rendererPalettes,
    spriteById,
    paletteById,
    referencedSpriteCount: referenced.size,
    missingSpriteReferenceCount,
    diagnostics: packageValue.diagnostics,
  });
}

export function spriteReferenceResolver(model: MugenCharacterModel): (id: string) => MugenAirSpriteReference | null {
  return id => {
    const sprite = model.spriteById.get(id);
    return sprite === undefined ? null : Object.freeze({ id, axisX: sprite.axisX, axisY: sprite.axisY });
  };
}

function actionRecord(value: MugenCanonicalValue, sprites: ReadonlyMap<string, MugenViewerSprite>): Omit<MugenViewerAction, 'audioCues'> {
  const record = requireRecord(value, 'action');
  const id = fieldString(record, 'id');
  const number = fieldInteger(record, 'number');
  const elements = Object.freeze(fieldArray(record, 'elements').map((element, index) => elementRecord(element, index)));
  const action: MugenAirAction = Object.freeze({
    number,
    loopStart: fieldInteger(record, 'loopStart'),
    elements,
    totalTicks: nullableInteger(record.totalTicks, `${id}.totalTicks`),
    preLoopTicks: fieldInteger(record, 'preLoopTicks'),
    loopTicks: nullableInteger(record.loopTicks, `${id}.loopTicks`),
    byteOffset: fieldInteger(record, 'byteOffset'),
    line: fieldInteger(record, 'line'),
    column: 1,
  });
  const referencedSpriteIds = Object.freeze([...new Set(elements.flatMap(element => element.spriteId === null ? [] : [element.spriteId]))].sort(compareMugenStrings));
  const missing = elements.filter(element => element.spriteGroup !== -1 && element.spriteItem !== -1 && (element.spriteId === null || !sprites.has(element.spriteId))).length;
  return Object.freeze({
    id,
    sourcePath: fieldString(record, 'sourcePath'),
    label: STANDARD_ACTION_LABELS.get(number) ?? null,
    action,
    elementCount: elements.length,
    referencedSpriteIds,
    clsn1Count: elements.reduce((sum, element) => sum + element.clsn1.length, 0),
    clsn2Count: elements.reduce((sum, element) => sum + element.clsn2.length, 0),
    warningCount: missing,
    errorCount: 0,
  });
}

function soundRecord(value: MugenCanonicalValue): MugenViewerSound & { readonly selectedByKey: boolean } {
  const record = requireRecord(value, 'sound');
  if (fieldString(record, 'kind') !== 'snd-wav-v1') throw new TypeError('Unsupported MUGEN viewer sound kind.');
  return Object.freeze({
    id: fieldString(record, 'id'),
    group: fieldInteger(record, 'group'),
    item: fieldInteger(record, 'item'),
    selectedByKey: fieldBoolean(record, 'selectedByKey'),
    encodedSha256: fieldString(record, 'encodedSha256'),
    encodedBase64: fieldString(record, 'encodedBase64'),
  });
}

function audioCuesByAction(values: readonly MugenCanonicalValue[], sounds: ReadonlyMap<string, MugenViewerSound>, actions: ReadonlyMap<number, Omit<MugenViewerAction, 'audioCues'>>): ReadonlyMap<number, readonly MugenViewerAudioCue[]> {
  const mutable = new Map<number, MugenViewerAudioCue[]>();
  const seen = new Set<string>();
  for (const value of values) {
    if (!record(value)) continue;
    const program = value as Record<string, unknown>;
    if (program.revision !== 'm09-g03-core-state-v1' || !Array.isArray(program.states)) continue;
    for (const stateValue of program.states) {
      if (!record(stateValue) || !Array.isArray(stateValue.controllers)) continue;
      const actionNumber = constantInteger(stateValue.animation);
      if (actionNumber === null) continue;
      const action = actions.get(actionNumber); if (!action) continue;
      for (const controllerValue of stateValue.controllers) {
        if (!record(controllerValue) || controllerValue.type !== 'play-snd' || !record(controllerValue.parameters)) continue;
        const group = constantInteger(controllerValue.parameters.group);
        const item = constantInteger(controllerValue.parameters.item);
        if (group === null || item === null) continue;
        const sound = sounds.get(`${group},${item}`);
        if (!sound) continue;
        const timing = controllerTiming(controllerValue, action);
        const channel = constantInteger(controllerValue.parameters.channel) ?? -1;
        const volume = constantNumber(controllerValue.parameters.volume) ?? 255;
        const pan = constantNumber(controllerValue.parameters.pan) ?? 0;
        const frequency = constantNumber(controllerValue.parameters.freqmul) ?? 1;
        const loop = (constantNumber(controllerValue.parameters.loop) ?? 0) !== 0;
        const key = `${actionNumber}:${group},${item}:${timing.tick}:${channel}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const cue = Object.freeze({
          sound,
          tick: timing.tick,
          channel,
          volume: Math.max(0, Math.min(1, volume / 255)),
          pan: Math.max(-1, Math.min(1, pan / 127)),
          frequency: Math.max(0.01, Math.min(16, frequency)),
          loop,
          repeatOnLoop: timing.repeatOnLoop,
        });
        const cues = mutable.get(actionNumber) ?? [];
        cues.push(cue); mutable.set(actionNumber, cues);
      }
    }
  }
  return new Map([...mutable].map(([action, cues]) => [action, Object.freeze(cues.sort((left, right) => left.tick - right.tick || compareMugenStrings(left.sound.id, right.sound.id)))]));
}

function scannedAudioCuesByAction(values: readonly MugenScannedViewerAudioCue[], sounds: ReadonlyMap<string, MugenViewerSound>, actions: ReadonlyMap<number, Omit<MugenViewerAction, 'audioCues'>>): ReadonlyMap<number, readonly MugenViewerAudioCue[]> {
  const mutable = new Map<number, MugenViewerAudioCue[]>();
  const seen = new Set<string>();
  for (const value of values) {
    const sound = sounds.get(`${value.group},${value.item}`);
    const action = actions.get(value.actionNumber);
    if (sound === undefined || action === undefined) continue;
    const tick = value.timing.kind === 'tick' ? Math.max(0, value.timing.value) : animationElementStart(action, value.timing.value);
    const key = `${value.actionNumber}:${value.group},${value.item}:${tick}:${value.channel}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const cues = mutable.get(value.actionNumber) ?? [];
    cues.push(Object.freeze({
      sound,
      tick,
      channel: value.channel,
      volume: Math.max(0, Math.min(1, value.volume)),
      pan: Math.max(-1, Math.min(1, value.pan)),
      frequency: Math.max(0.01, Math.min(16, value.frequency)),
      loop: value.loop,
      repeatOnLoop: value.timing.kind === 'element',
    }));
    mutable.set(value.actionNumber, cues);
  }
  return freezeAudioCueMap(mutable);
}

function mergeAudioCues(...maps: readonly ReadonlyMap<number, readonly MugenViewerAudioCue[]>[]): ReadonlyMap<number, readonly MugenViewerAudioCue[]> {
  const mutable = new Map<number, MugenViewerAudioCue[]>();
  const seen = new Set<string>();
  for (const map of maps) for (const [actionNumber, cues] of map) for (const cue of cues) {
    const key = `${actionNumber}:${cue.sound.group},${cue.sound.item}:${cue.tick}:${cue.channel}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const values = mutable.get(actionNumber) ?? [];
    values.push(cue);
    mutable.set(actionNumber, values);
  }
  return freezeAudioCueMap(mutable);
}

function freezeAudioCueMap(values: ReadonlyMap<number, MugenViewerAudioCue[]>): ReadonlyMap<number, readonly MugenViewerAudioCue[]> {
  return new Map([...values].map(([action, cues]) => [action, Object.freeze(cues.sort((left, right) => left.tick - right.tick || compareMugenStrings(left.sound.id, right.sound.id)))]));
}

function controllerTiming(controller: Record<string, unknown>, action: Omit<MugenViewerAction, 'audioCues'>): Readonly<{ tick: number; repeatOnLoop: boolean }> {
  const expressions: unknown[] = [];
  if (Array.isArray(controller.triggerAll)) expressions.push(...controller.triggerAll);
  if (Array.isArray(controller.triggerGroups)) for (const group of controller.triggerGroups) if (record(group) && Array.isArray(group.expressions)) expressions.push(...group.expressions);
  for (const expression of expressions) { const tick = timeEquality(expression); if (tick !== null) return Object.freeze({ tick: Math.max(0, tick), repeatOnLoop: false }); }
  for (const expression of expressions) { const element = animationElement(expression); if (element !== null) return Object.freeze({ tick: animationElementStart(action, element), repeatOnLoop: true }); }
  return Object.freeze({ tick: 0, repeatOnLoop: false });
}

function animationElementStart(action: Omit<MugenViewerAction, 'audioCues'>, oneBasedElement: number): number {
  const target = Math.max(1, oneBasedElement) - 1;
  let tick = 0;
  for (let index = 0; index < Math.min(target, action.action.elements.length); index += 1) tick += Math.max(0, action.action.elements[index]!.durationTicks);
  return tick;
}

function timeEquality(value: unknown): number | null {
  const instructions = expressionInstructions(value);
  if (instructions?.length !== 4 || !record(instructions[2]) || instructions[2].op !== 'binary' || instructions[2].operator !== '=') return null;
  const left = instructions[0]; const right = instructions[1];
  if (isReference(left, 'time')) return pushedInteger(right);
  if (isReference(right, 'time')) return pushedInteger(left);
  return null;
}

function animationElement(value: unknown): number | null {
  const instructions = expressionInstructions(value);
  if (instructions?.length !== 3 || !record(instructions[1]) || instructions[1].op !== 'call' || instructions[1].name !== 'animelem' || instructions[1].argumentCount !== 1) return null;
  return pushedInteger(instructions[0]);
}

function constantInteger(value: unknown): number | null {
  const number = constantNumber(value);
  return number !== null && Number.isSafeInteger(number) ? number : null;
}

function constantNumber(value: unknown): number | null {
  const instructions = expressionInstructions(value);
  if (!instructions) return null;
  const stack: number[] = [];
  for (const instruction of instructions) {
    if (!record(instruction) || typeof instruction.op !== 'string') return null;
    if (instruction.op === 'push-int' || instruction.op === 'push-float') { if (typeof instruction.value !== 'number' || !Number.isFinite(instruction.value)) return null; stack.push(instruction.value); continue; }
    if (instruction.op === 'unary') {
      const operand = stack.pop(); if (operand === undefined) return null;
      if (instruction.operator === '+') stack.push(operand); else if (instruction.operator === '-') stack.push(-operand); else if (instruction.operator === '!') stack.push(operand === 0 ? 1 : 0); else if (instruction.operator === '~') stack.push(~operand); else return null;
      continue;
    }
    if (instruction.op === 'binary') {
      const right = stack.pop(); const left = stack.pop(); if (left === undefined || right === undefined) return null;
      const result = constantBinary(left, right, instruction.operator); if (result === null || !Number.isFinite(result)) return null; stack.push(result); continue;
    }
    if (instruction.op === 'return') return stack.length === 1 ? stack[0]! : null;
    return null;
  }
  return null;
}

function constantBinary(left: number, right: number, operator: unknown): number | null {
  switch (operator) {
    case '+': return left + right; case '-': return left - right; case '*': return left * right; case '/': return right === 0 ? null : left / right;
    case '%': return right === 0 ? null : left % right; case '**': return left ** right; case '&': return (left | 0) & (right | 0); case '^': return (left | 0) ^ (right | 0); case '|': return (left | 0) | (right | 0);
    case '=': return left === right ? 1 : 0; case '!=': return left !== right ? 1 : 0; case '>': return left > right ? 1 : 0; case '>=': return left >= right ? 1 : 0; case '<': return left < right ? 1 : 0; case '<=': return left <= right ? 1 : 0;
    default: return null;
  }
}

function expressionInstructions(value: unknown): readonly unknown[] | null {
  if (!record(value)) return null;
  const expression = value.revision === 'm09-g02-runtime-expression-v1' ? value.expression : value;
  return record(expression) && expression.revision === 'm09-g01-expression-bytecode-v1' && Array.isArray(expression.instructions) ? expression.instructions : null;
}
function isReference(value: unknown, name: string): boolean { return record(value) && value.op === 'load-reference' && value.name === name; }
function pushedInteger(value: unknown): number | null { return record(value) && value.op === 'push-int' && Number.isSafeInteger(value.value) ? value.value as number : null; }
function record(value: unknown): value is Record<string, any> { return value !== null && typeof value === 'object' && !Array.isArray(value); }

function elementRecord(value: MugenCanonicalValue, expectedIndex: number): MugenAirElement {
  const record = requireRecord(value, `element ${expectedIndex}`);
  const blendRecord = requireRecord(record.blend, `element ${expectedIndex}.blend`);
  const blend: MugenAirBlend = Object.freeze({ mode: blendMode(blendRecord.mode), sourceAlpha: finiteNumber(blendRecord.sourceAlpha, 'sourceAlpha'), destinationAlpha: finiteNumber(blendRecord.destinationAlpha, 'destinationAlpha') });
  const spriteId = nullableString(record.spriteId, `element ${expectedIndex}.spriteId`);
  return Object.freeze({
    index: fieldInteger(record, 'index'),
    spriteGroup: fieldInteger(record, 'spriteGroup'),
    spriteItem: fieldInteger(record, 'spriteItem'),
    spriteId,
    offsetX: fieldInteger(record, 'offsetX'),
    offsetY: fieldInteger(record, 'offsetY'),
    durationTicks: fieldInteger(record, 'durationTicks'),
    flipX: fieldBoolean(record, 'flipX'),
    flipY: fieldBoolean(record, 'flipY'),
    blend,
    scaleX: finiteNumber(record.scaleX, 'scaleX'),
    scaleY: finiteNumber(record.scaleY, 'scaleY'),
    angleDegrees: finiteNumber(record.angleDegrees, 'angleDegrees'),
    interpolateToThis: Object.freeze(fieldArray(record, 'interpolateToThis').map(interpolation)),
    clsn1: Object.freeze(fieldArray(record, 'clsn1').map(collisionRecord)),
    clsn2: Object.freeze(fieldArray(record, 'clsn2').map(collisionRecord)),
    byteOffset: fieldInteger(record, 'byteOffset'),
    line: fieldInteger(record, 'line'),
    column: fieldInteger(record, 'column'),
  });
}

function collisionRecord(value: MugenCanonicalValue): MugenAirCollisionBox {
  const record = requireRecord(value, 'collision');
  return Object.freeze({ index: fieldInteger(record, 'index'), left: fieldInteger(record, 'left'), top: fieldInteger(record, 'top'), right: fieldInteger(record, 'right'), bottom: fieldInteger(record, 'bottom'), byteOffset: fieldInteger(record, 'byteOffset'), line: fieldInteger(record, 'line'), column: fieldInteger(record, 'column') });
}

function paletteRecord(value: MugenCanonicalValue) {
  const record = requireRecord(value, 'palette');
  return Object.freeze({ id: fieldString(record, 'id'), sourcePath: fieldString(record, 'sourcePath'), group: fieldInteger(record, 'group'), item: fieldInteger(record, 'item'), colorCount: fieldInteger(record, 'colorCount'), linkedPaletteId: nullableString(record.linkedPaletteId, 'linkedPaletteId'), rgbaBase64: nullableString(record.rgbaBase64, 'rgbaBase64'), source: fieldString(record, 'source') });
}

function spriteRecord(value: MugenCanonicalValue) {
  const record = requireRecord(value, 'sprite');
  const pixelFormat = fieldString(record, 'pixelFormat');
  if (pixelFormat !== 'indexed8' && pixelFormat !== 'rgb8' && pixelFormat !== 'rgba8') throw new TypeError(`Unsupported viewer sprite format ${pixelFormat}.`);
  return Object.freeze({ id: fieldString(record, 'id'), sourcePath: fieldString(record, 'sourcePath'), group: fieldInteger(record, 'group'), item: fieldInteger(record, 'item'), width: fieldInteger(record, 'width'), height: fieldInteger(record, 'height'), axisX: fieldInteger(record, 'axisX'), axisY: fieldInteger(record, 'axisY'), format: pixelFormat, dataSpriteId: nullableString(record.dataSpriteId, 'dataSpriteId'), paletteId: nullableString(record.paletteId, 'paletteId'), pixelsBase64: nullableString(record.pixelsBase64, 'pixelsBase64') });
}

function decodeBase64(value: string): Uint8Array {
  if (value.length % 4 !== 0) throw new TypeError('MUGEN viewer base64 length is invalid.');
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  const output = new Uint8Array(value.length / 4 * 3 - padding);
  let write = 0;
  for (let index = 0; index < value.length; index += 4) {
    const a = base64Digit(value[index]!); const b = base64Digit(value[index + 1]!);
    const c = value[index + 2] === '=' ? 0 : base64Digit(value[index + 2]!);
    const d = value[index + 3] === '=' ? 0 : base64Digit(value[index + 3]!);
    const bits = (a << 18) | (b << 12) | (c << 6) | d;
    if (write < output.length) output[write++] = bits >>> 16;
    if (write < output.length) output[write++] = bits >>> 8;
    if (write < output.length) output[write++] = bits;
  }
  return output;
}

function base64Digit(value: string): number {
  const index = BASE64.indexOf(value);
  if (index < 0) throw new TypeError(`Invalid MUGEN viewer base64 character ${value}.`);
  return index;
}

function requireRecord(value: unknown, label: string): Record<string, MugenCanonicalValue> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`MUGEN viewer ${label} must be a record.`);
  return value as Record<string, MugenCanonicalValue>;
}
function fieldString(record: Record<string, MugenCanonicalValue>, key: string): string { return requireString(record[key], key); }
function requireString(value: unknown, label: string): string { if (typeof value !== 'string') throw new TypeError(`MUGEN viewer ${label} must be a string.`); return value; }
function nullableString(value: unknown, label: string): string | null { if (value === null) return null; return requireString(value, label); }
function fieldInteger(record: Record<string, MugenCanonicalValue>, key: string): number { const value = record[key]; if (!Number.isSafeInteger(value)) throw new TypeError(`MUGEN viewer ${key} must be an integer.`); return value as number; }
function nullableInteger(value: unknown, label: string): number | null { if (value === null) return null; if (!Number.isSafeInteger(value)) throw new TypeError(`MUGEN viewer ${label} must be an integer or null.`); return value as number; }
function finiteNumber(value: unknown, label: string): number { if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`MUGEN viewer ${label} must be finite.`); return value; }
function fieldBoolean(record: Record<string, MugenCanonicalValue>, key: string): boolean { const value = record[key]; if (typeof value !== 'boolean') throw new TypeError(`MUGEN viewer ${key} must be boolean.`); return value; }
function fieldArray(record: Record<string, MugenCanonicalValue>, key: string): readonly MugenCanonicalValue[] { const value = record[key]; if (!Array.isArray(value)) throw new TypeError(`MUGEN viewer ${key} must be an array.`); return value; }
function blendMode(value: unknown): MugenAirBlend['mode'] { if (value !== 'opaque' && value !== 'add' && value !== 'subtract') throw new TypeError('MUGEN viewer blend mode is invalid.'); return value; }
function interpolation(value: MugenCanonicalValue): MugenAirElement['interpolateToThis'][number] { if (value !== 'offset' && value !== 'blend' && value !== 'scale' && value !== 'angle') throw new TypeError('MUGEN viewer interpolation is invalid.'); return value; }

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const STANDARD_ACTION_LABELS = new Map<number, string>([
  [0, '站立'], [5, '站立转身'], [10, '下蹲开始'], [11, '下蹲'], [12, '起身'], [20, '向前行走'], [21, '向后行走'],
  [40, '起跳'], [41, '垂直跳跃'], [42, '前跳'], [43, '后跳'], [44, '落地'], [100, '奔跑'], [105, '后撤'],
  [120, '防御开始'], [130, '站立防御'], [140, '下蹲防御'], [150, '空中防御'], [170, '失败'], [175, '平局'],
  [180, '胜利'], [190, '登场'], [195, '挑衅'], [5000, '站立受击'], [5010, '下蹲受击'], [5020, '空中受击'],
]);
