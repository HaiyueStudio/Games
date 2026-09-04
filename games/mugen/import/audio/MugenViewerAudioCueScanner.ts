import type { MugenImportGraph } from '../text/DependencyGraph';
import type { MugenAssignmentToken, MugenTextDocument, MugenTextSection } from '../text/MugenTextParser';
import { asciiCaseFold, compareMugenStrings } from '../vfs/path';

export type MugenViewerAudioCueTiming = Readonly<
  | { kind: 'tick'; value: number }
  | { kind: 'element'; value: number }
>;

export interface MugenScannedViewerAudioCue {
  readonly actionNumber: number;
  readonly group: number;
  readonly item: number;
  readonly timing: MugenViewerAudioCueTiming;
  readonly channel: number;
  readonly volume: number;
  readonly pan: number;
  readonly frequency: number;
  readonly loop: boolean;
  readonly sourcePath: string;
  readonly sourceLine: number;
}

const MAX_SCANNED_CUES = 16_384;

interface ViewerStateBlock {
  readonly stateNumber: number | null;
  readonly actionNumbers: readonly number[];
  readonly immediateTargets: readonly number[];
  readonly controllers: readonly MugenTextSection[];
}

/**
 * Viewer-only, loss-tolerant audio association pass. It intentionally understands
 * only StateDef anim, PlaySnd, HitDef hitsound and static trigger timing, and
 * never compiles the surrounding executable controller program.
 */
export function scanMugenViewerAudioCues(graph: MugenImportGraph): readonly MugenScannedViewerAudioCue[] {
  const cues: MugenScannedViewerAudioCue[] = [];
  const availableActionNumbers = airActionNumbers(graph);
  const claimedGlobalChannels = new Set<string>();
  const referencedStateScripts = stateScriptPaths(graph);
  for (const resource of graph.resources) {
    const document = resource.document;
    if (document === undefined || (resource.kind !== 'cns' && resource.kind !== 'cmd'
      && !referencedStateScripts.has(resource.foldedPath))) continue;
    for (const block of viewerStateBlocks(document)) for (const controller of block.controllers) {
      const assignments = sectionAssignments(document, controller);
      const type = assignments.find(value => value.foldedKey === 'type');
      const normalizedType = type === undefined ? '' : asciiCaseFold(type.value).replace(/[\s_-]+/gu, '');
      if (normalizedType !== 'playsnd' && normalizedType !== 'hitdef') continue;
      const actionNumbers = block.actionNumbers.length === 0 ? inferredActionNumbers(assignments, availableActionNumbers) : block.actionNumbers;
      if (actionNumbers.length === 0) continue;
      const values = new Map<string, MugenAssignmentToken>();
      for (const assignment of assignments) if (!values.has(assignment.foldedKey)) values.set(assignment.foldedKey, assignment);
      const sound = parseSoundKey(values.get(normalizedType === 'hitdef' ? 'hitsound' : 'value'), normalizedType === 'hitdef');
      if (sound === null || sound.owner === 'fight') continue;
      for (const actionNumber of actionNumbers) {
        if (!matchesGetHitAnimationType(assignments, actionNumber)) continue;
        const timing = scanTiming(assignments);
        const channel = staticInteger(values.get('channel')?.value) ?? -1;
        if (block.actionNumbers.length === 0 && channel >= 0) {
          // Mutually exclusive global hurt-voice controllers often target the
          // same channel. Once their static AnimType branch selects a cue, do
          // not make the preview play a later guard/random alternative too.
          const channelKey = `${actionNumber}:${timing.kind}:${timing.value}:${channel}`;
          if (claimedGlobalChannels.has(channelKey)) continue;
          claimedGlobalChannels.add(channelKey);
        }
        cues.push(Object.freeze({
          actionNumber,
          group: sound.group,
          item: sound.item,
          timing,
          channel,
          volume: clamp(staticNumber(values.get('volume')?.value) ?? 255, 0, 255) / 255,
          pan: clamp(staticNumber(values.get('pan')?.value) ?? 0, -127, 127) / 127,
          frequency: clamp(staticNumber(values.get('freqmul')?.value) ?? 1, 0.01, 16),
          loop: (staticNumber(values.get('loop')?.value) ?? 0) !== 0,
          sourcePath: document.canonicalPath,
          sourceLine: controller.header.span.line,
        }));
        if (cues.length >= MAX_SCANNED_CUES) return sortedCues(cues);
      }
    }
  }
  return sortedCues(cues);
}

/**
 * Some legacy characters deliberately disguise CMD/CNS state files behind
 * custom extensions such as .mai, .teo or .ini. The dependency graph has
 * already classified those files by their [Files] role and decoded them as
 * text, so use that authoritative relationship instead of the filename.
 */
function stateScriptPaths(graph: MugenImportGraph): ReadonlySet<string> {
  const paths = new Set<string>();
  for (const edge of graph.edges) {
    if (asciiCaseFold(edge.section) !== 'files') continue;
    const key = asciiCaseFold(edge.key);
    if (key !== 'cmd' && key !== 'cns' && key !== 'st' && key !== 'stcommon' && !/^st\d+$/u.test(key)) continue;
    paths.add(asciiCaseFold(edge.to));
  }
  return paths;
}

function viewerStateBlocks(document: MugenTextDocument): readonly ViewerStateBlock[] {
  const result: ViewerStateBlock[] = [];
  for (let index = 0; index < document.sections.length; index += 1) {
    const definition = document.sections[index]!;
    const stateMatch = /^statedef\s+(-?\d+)$/iu.exec(definition.name.trim());
    if (!stateMatch) continue;
    const stateNumber = staticInteger(stateMatch[1]);
    const controllers: MugenTextSection[] = [];
    let end = index + 1;
    while (end < document.sections.length && !/^statedef\s+-?\d+$/iu.test(document.sections[end]!.name.trim())) {
      if (/^state\s+-?\d+(?:\s*,|$)/iu.test(document.sections[end]!.name.trim())) controllers.push(document.sections[end]!);
      end += 1;
    }
    const stateDefAnimation = sectionAssignments(document, definition).find(value => value.foldedKey === 'anim');
    let actionNumbers = staticIntegerAlternatives(stateDefAnimation?.value);
    if (actionNumbers.length === 0 && stateNumber !== null && stateNumber >= 0) {
      for (const controller of controllers) {
        const assignments = sectionAssignments(document, controller);
        const type = assignments.find(value => value.foldedKey === 'type');
        const normalizedType = type === undefined ? '' : asciiCaseFold(type.value).replace(/[\s_-]+/gu, '');
        if (normalizedType !== 'changeanim' && normalizedType !== 'changeanim2') continue;
        actionNumbers = staticIntegerAlternatives(assignments.find(value => value.foldedKey === 'value')?.value);
        if (actionNumbers.length > 0) break;
      }
    }
    const immediateTargets = new Set<number>();
    for (const controller of controllers) {
      const assignments = sectionAssignments(document, controller);
      const type = assignments.find(value => value.foldedKey === 'type');
      const normalizedType = type === undefined ? '' : asciiCaseFold(type.value).replace(/[\s_-]+/gu, '');
      if (normalizedType !== 'changestate' || !canRunAtStateEntry(assignments)) continue;
      for (const target of staticIntegerAlternatives(assignments.find(value => value.foldedKey === 'value')?.value)) immediateTargets.add(target);
    }
    result.push(Object.freeze({ stateNumber, actionNumbers, immediateTargets: Object.freeze([...immediateTargets].sort((left, right) => left - right)), controllers: Object.freeze(controllers) }));
    index = end - 1;
  }
  const byState = new Map(result.flatMap(block => block.stateNumber === null ? [] : [[block.stateNumber, block] as const]));
  return Object.freeze(result.map(block => {
    if (block.actionNumbers.length > 0 || block.stateNumber === null || block.stateNumber < 0) return block;
    const inherited = new Set<number>();
    for (const target of block.immediateTargets) for (const actionNumber of byState.get(target)?.actionNumbers ?? []) inherited.add(actionNumber);
    return inherited.size === 0 ? block : Object.freeze({ ...block, actionNumbers: Object.freeze([...inherited].sort((left, right) => left - right)) });
  }));
}

function canRunAtStateEntry(assignments: readonly MugenAssignmentToken[]): boolean {
  const triggers = assignments.filter(value => value.foldedKey === 'triggerall' || /^trigger\d+$/u.test(value.foldedKey));
  return triggers.every(trigger => !/\b(?:animtime|animelem|animelemtime)\b/iu.test(trigger.value)
    && !/\btime\b/iu.test(trigger.value.replace(/\btime\s*=\s*0\b/giu, '')));
}

/**
 * Accept a literal animation number or the literal result branches of a MUGEN
 * IfElse expression. The condition is deliberately ignored so comparison
 * constants such as `var(59) = 2` cannot leak into the action catalog.
 */
function staticIntegerAlternatives(value: string | undefined, depth = 0): readonly number[] {
  if (value === undefined || depth > 16) return Object.freeze([]);
  const exact = staticInteger(value);
  if (exact !== null && exact >= 0) return Object.freeze([exact]);
  const ifElse = /^\s*ifelse\s*\(/iu.exec(value);
  if (!ifElse) return Object.freeze([]);
  const opening = ifElse[0].length - 1;
  const closing = matchingClosingParenthesis(value, opening);
  if (closing >= value.length || value.slice(closing + 1).trim() !== '') return Object.freeze([]);
  const fields = splitTopLevel(value.slice(opening + 1, closing));
  if (fields.length !== 3) return Object.freeze([]);
  const result = new Set([...staticIntegerAlternatives(fields[1], depth + 1), ...staticIntegerAlternatives(fields[2], depth + 1)]);
  return Object.freeze([...result].sort((left, right) => left - right));
}

/**
 * StateDef -2/-3 controllers are global. Characters commonly put voices there
 * and select the current action with `Anim = ...` (hurt voices in particular).
 * Prefer explicit animation checks; StateNo is a useful fallback for the common
 * one-state/one-action authoring style used by attack voices.
 */
function inferredActionNumbers(assignments: readonly MugenAssignmentToken[], availableActionNumbers: ReadonlySet<number>): readonly number[] {
  const triggers = assignments.filter(value => value.foldedKey === 'triggerall' || /^trigger\d+$/u.test(value.foldedKey));
  const animations = equalityIntegers(triggers, 'anim');
  if (animations.length > 0) return animations;
  const states = equalityIntegers(triggers, 'stateno');
  if (availableActionNumbers.size === 0) return states;
  const expanded = new Set<number>();
  for (const state of states) {
    const family = standardGetHitActionFamily(state);
    if (family === null) {
      if (availableActionNumbers.has(state)) expanded.add(state);
      continue;
    }
    for (const action of availableActionNumbers) if (action >= family[0] && action <= family[1]) expanded.add(action);
  }
  return Object.freeze([...expanded].sort((left, right) => left - right));
}

function airActionNumbers(graph: MugenImportGraph): ReadonlySet<number> {
  const result = new Set<number>();
  for (const resource of graph.resources) {
    if (resource.kind !== 'air' || resource.document === undefined) continue;
    for (const section of resource.document.sections) {
      const match = /^begin\s+action\s+([+-]?\d+)$/iu.exec(section.name.trim());
      const value = staticInteger(match?.[1]);
      if (value !== null && value >= 0) result.add(value);
    }
  }
  return result;
}

function standardGetHitActionFamily(state: number): readonly [number, number] | null {
  if (state === 5000 || state === 5010 || state === 5020 || state === 5030 || state === 5035 || state === 5040 || state === 5050) return Object.freeze([5000, 5069]);
  if (state === 5070 || state === 5071 || state === 5080 || state === 5081) return Object.freeze([5070, 5099]);
  if (state === 5100 || state === 5101 || state === 5110 || state === 5120 || state === 5150) return Object.freeze([5100, 5199]);
  return null;
}

function matchesGetHitAnimationType(assignments: readonly MugenAssignmentToken[], actionNumber: number): boolean {
  const animationType = getHitAnimationType(actionNumber);
  if (animationType === null) return true;
  for (const assignment of assignments) {
    if (assignment.foldedKey !== 'triggerall') continue;
    const pattern = /gethitvar\s*\(\s*animtype\s*\)\s*(!=|=)\s*(\[\s*-?\d+\s*,\s*-?\d+\s*\]|-?\d+)/giu;
    for (const match of assignment.value.matchAll(pattern)) {
      const expected = integerOrIntervalContains(match[2]!, animationType);
      if (expected === null) continue;
      if ((match[1] === '=' && !expected) || (match[1] === '!=' && expected)) return false;
    }
  }
  return true;
}

function getHitAnimationType(actionNumber: number): number | null {
  if (actionNumber < 5000 || actionNumber > 5069) return null;
  const ones = actionNumber % 10;
  if (actionNumber < 5030 && ones <= 2) return ones;
  if (actionNumber < 5030 && ones >= 5 && ones <= 7) return ones - 5;
  if ((actionNumber >= 5051 && actionNumber <= 5059) || (actionNumber >= 5061 && actionNumber <= 5069)) return ones + 3;
  return 2;
}

function integerOrIntervalContains(source: string, value: number): boolean | null {
  const interval = /^\[\s*(-?\d+)\s*,\s*(-?\d+)\s*\]$/u.exec(source);
  if (interval) {
    const minimum = staticInteger(interval[1]); const maximum = staticInteger(interval[2]);
    return minimum === null || maximum === null ? null : value >= minimum && value <= maximum;
  }
  const integer = staticInteger(source);
  return integer === null ? null : value === integer;
}

function equalityIntegers(assignments: readonly MugenAssignmentToken[], name: 'anim' | 'stateno'): readonly number[] {
  const values = new Set<number>();
  const pattern = new RegExp(`(?:^|[^a-z0-9_.!<>])${name}\\s*=\\s*(-?\\d+)(?=\\D|$)`, 'giu');
  for (const assignment of assignments) for (const match of assignment.value.matchAll(pattern)) {
    const value = staticInteger(match[1]);
    if (value !== null && value >= 0) values.add(value);
  }
  return Object.freeze([...values].sort((left, right) => left - right));
}

function scanTiming(assignments: readonly MugenAssignmentToken[]): MugenViewerAudioCueTiming {
  const triggers = assignments.filter(value => value.foldedKey === 'triggerall' || /^trigger\d+$/u.test(value.foldedKey));
  for (const trigger of triggers) {
    const match = /(?:^|[^a-z0-9_.])time\s*=\s*(-?\d+)(?:\D|$)/iu.exec(trigger.value);
    const tick = staticInteger(match?.[1]);
    if (tick !== null) return Object.freeze({ kind: 'tick', value: Math.max(0, tick) });
  }
  for (const trigger of triggers) {
    const elementTime = /animelemtime\s*\(\s*(\d+)\s*\)\s*=\s*0(?:\D|$)/iu.exec(trigger.value);
    const element = staticInteger(elementTime?.[1]);
    if (element !== null && element > 0) return Object.freeze({ kind: 'element', value: element });
    const animationElement = /(?:^|[^a-z0-9_.])animelem\s*=\s*(\d+)(?:\D|$)/iu.exec(trigger.value);
    const directElement = staticInteger(animationElement?.[1]);
    if (directElement !== null && directElement > 0) return Object.freeze({ kind: 'element', value: directElement });
  }
  return Object.freeze({ kind: 'tick', value: 0 });
}

function parseSoundKey(assignment: MugenAssignmentToken | undefined, unprefixedIsFight = false): Readonly<{ owner: 'self' | 'fight'; group: number; item: number }> | null {
  if (assignment === undefined) return null;
  const fields = splitTopLevel(assignment.value);
  if (fields.length !== 2) return null;
  const ownerMatch = /^([sf])?\s*(-?\d+)$/iu.exec(fields[0]!.trim());
  const item = tolerantSoundItem(fields[1]!);
  if (!ownerMatch || item === null) return null;
  const group = staticInteger(ownerMatch[2]);
  if (group === null) return null;
  const prefix = asciiCaseFold(ownerMatch[1] ?? '');
  const owner = prefix === 'f' || (prefix === '' && unprefixedIsFight) ? 'fight' : 'self';
  return Object.freeze({ owner, group, item });
}

/**
 * HitDef sound numbers are commonly randomized with a static ifelse tree, for
 * example `S5, ifelse(Random < 333, 0, ifelse(Random < 666, 1, 2))`.
 * The preview is deterministic, so use the first static branch. A leading
 * integer also covers the widespread `2 + (Random % 2)` form without trying to
 * evaluate arbitrary battle expressions.
 */
function tolerantSoundItem(value: string): number | null {
  const exact = staticInteger(value);
  if (exact !== null) return exact;
  const ifElse = /^\s*ifelse\s*\(/iu.exec(value);
  if (ifElse) {
    const call = value.slice(ifElse[0].length, matchingClosingParenthesis(value, ifElse[0].length - 1));
    const fields = splitTopLevel(call);
    if (fields.length === 3) return tolerantSoundItem(fields[1]!) ?? tolerantSoundItem(fields[2]!);
  }
  const leading = /^\s*([+-]?\d+)\s*(?:[+\-*/%]|$)/u.exec(value);
  return staticInteger(leading?.[1]);
}

function matchingClosingParenthesis(source: string, opening: number): number {
  let depth = 0;
  for (let index = opening; index < source.length; index += 1) {
    if (source[index] === '(') depth += 1;
    else if (source[index] === ')' && --depth === 0) return index;
  }
  return source.length;
}

function sectionAssignments(document: MugenTextDocument, section: MugenTextSection): readonly MugenAssignmentToken[] {
  return document.tokens.slice(section.tokenStart + 1, section.tokenEnd).filter((token): token is MugenAssignmentToken => token.kind === 'assignment');
}

function splitTopLevel(source: string): readonly string[] {
  const fields: string[] = [];
  let start = 0; let depth = 0; let quote = '';
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]!;
    if (quote !== '') { if (character === quote) quote = ''; continue; }
    if (character === '"' || character === "'") { quote = character; continue; }
    if (character === '(' || character === '[' || character === '{') depth += 1;
    else if (character === ')' || character === ']' || character === '}') depth = Math.max(0, depth - 1);
    else if (character === ',' && depth === 0) { fields.push(source.slice(start, index).trim()); start = index + 1; }
  }
  fields.push(source.slice(start).trim());
  return Object.freeze(fields);
}

function staticInteger(value: string | undefined): number | null {
  if (value === undefined || !/^[+-]?\d+$/u.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function staticNumber(value: string | undefined): number | null {
  if (value === undefined || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/u.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value: number, minimum: number, maximum: number): number { return Math.max(minimum, Math.min(maximum, value)); }

function sortedCues(values: readonly MugenScannedViewerAudioCue[]): readonly MugenScannedViewerAudioCue[] {
  return Object.freeze([...values].sort((left, right) => left.actionNumber - right.actionNumber
    || timingOrder(left.timing) - timingOrder(right.timing)
    || left.group - right.group || left.item - right.item
    || compareMugenStrings(left.sourcePath, right.sourcePath) || left.sourceLine - right.sourceLine));
}

function timingOrder(value: MugenViewerAudioCueTiming): number { return value.kind === 'tick' ? value.value : 1_000_000 + value.value; }
