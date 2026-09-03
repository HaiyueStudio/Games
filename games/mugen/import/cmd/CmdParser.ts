import { failMugen, mugenDiagnostic } from '../diagnostics';
import type { MugenAssignmentToken, MugenTextDocument, MugenTextSection } from '../text/MugenTextParser';
import { asciiCaseFold, unquoteMugenValue } from '../vfs/path';
import type { MugenCommandButton, MugenCommandDefinition, MugenCommandDirection, MugenCommandProgram, MugenCommandStep, MugenCommandToken } from './types';

const DEFAULT_COMMAND_TIME = 15;
const DEFAULT_BUFFER_TIME = 1;

export function parseMugenCommandDocument(document: MugenTextDocument): MugenCommandProgram {
  let defaultTime = DEFAULT_COMMAND_TIME;
  let defaultBufferTime = DEFAULT_BUFFER_TIME;
  const remap = new Map<MugenCommandButton, MugenCommandButton>();
  for (const button of BUTTONS) remap.set(button, button);

  for (const section of document.sections) {
    if (section.foldedName === 'defaults') {
      for (const assignment of sectionAssignments(document, section)) {
        if (assignment.foldedKey === 'command.time') defaultTime = boundedInteger(assignment, 1, 60, document, 'command.time');
        else if (assignment.foldedKey === 'command.buffer.time') defaultBufferTime = boundedInteger(assignment, 1, 30, document, 'command.buffer.time');
        else failAssignment(document, assignment, `Unsupported MUGEN [Defaults] key: ${assignment.key}.`);
      }
    } else if (section.foldedName === 'remap') {
      for (const assignment of sectionAssignments(document, section)) {
        const from = normalizeButton(assignment.key);
        const raw = asciiCaseFold(unquoteMugenValue(assignment.value).trim());
        if (from === null || (raw !== '' && normalizeButton(raw) === null)) failAssignment(document, assignment, `Invalid MUGEN button remap: ${assignment.key} = ${assignment.value}.`);
        if (from !== null && raw !== from && !(from === 'start' && raw === 's')) failUnsupported(document, assignment, 'Non-identity MUGEN button remapping is outside the G08-B input profile.');
      }
    }
  }

  const commands: MugenCommandDefinition[] = [];
  for (const section of document.sections) {
    if (section.foldedName !== 'command') continue;
    const assignments = sectionAssignments(document, section);
    const byKey = uniqueAssignments(document, assignments, new Set(['name', 'command', 'time', 'buffer.time']));
    const nameToken = required(byKey, 'name', document, section);
    const commandToken = required(byKey, 'command', document, section);
    const name = unquoteMugenValue(nameToken.value).trim();
    if (name.length < 1 || name.length > 128) failAssignment(document, nameToken, 'MUGEN command name must contain 1 to 128 characters.');
    const time = byKey.get('time') === undefined ? defaultTime : boundedInteger(byKey.get('time')!, 0, 60, document, 'time');
    const steps = parseCommandSequence(document, commandToken, remap);
    const isHoldOnly = steps.length === 1 && steps[0]!.tokens.every(token => token.mode === 'hold');
    const bufferTime = isHoldOnly ? 1 : byKey.get('buffer.time') === undefined ? defaultBufferTime : boundedInteger(byKey.get('buffer.time')!, 1, 30, document, 'buffer.time');
    commands.push(Object.freeze({ name, foldedName: asciiCaseFold(name), steps, time, bufferTime, sourcePath: document.canonicalPath, sourceLine: section.header.span.line }));
  }
  if (commands.length === 0) failSection(document, undefined, 'MUGEN CMD has no [Command] sections.');
  if (commands.length > 1_024) failSection(document, undefined, 'MUGEN CMD exceeds the G08-B command budget of 1024.');
  return Object.freeze({ schemaVersion: 1, revision: 'm08-g08b-command-v1', commands: Object.freeze(commands) });
}

function parseCommandSequence(document: MugenTextDocument, assignment: MugenAssignmentToken, remap: ReadonlyMap<MugenCommandButton, MugenCommandButton>): readonly MugenCommandStep[] {
  const rawSteps = assignment.value.split(',').map(value => value.trim());
  if (rawSteps.some(value => value === '') || rawSteps.length > 32) failAssignment(document, assignment, 'MUGEN command sequence is empty or exceeds 32 steps.');
  return Object.freeze(rawSteps.map(rawStep => {
    const rawTokens = rawStep.split('+').map(value => value.trim());
    if (rawTokens.some(value => value === '') || rawTokens.length > 6) failAssignment(document, assignment, 'MUGEN simultaneous command step is invalid.');
    const tokens = rawTokens.map(rawToken => parseCommandToken(document, assignment, rawToken, remap));
    if (new Set(tokens.map(token => `${token.targetType}:${token.target}`)).size !== tokens.length) failAssignment(document, assignment, 'MUGEN command step repeats an input token.');
    return Object.freeze({ tokens: Object.freeze(tokens) });
  }));
}

function parseCommandToken(document: MugenTextDocument, assignment: MugenAssignmentToken, rawToken: string, remap: ReadonlyMap<MugenCommandButton, MugenCommandButton>): MugenCommandToken {
  let source = rawToken;
  let hold = false; let release = false; let fourWay = false; let noOtherInput = false; let chargeTicks = 0;
  let consumed = true;
  while (consumed && source !== '') {
    consumed = false;
    if (source.startsWith('/')) { if (hold) failAssignment(document, assignment, `Duplicate / modifier in command token ${rawToken}.`); hold = true; source = source.slice(1); consumed = true; }
    else if (source.startsWith('>')) { if (noOtherInput) failAssignment(document, assignment, `Duplicate > modifier in command token ${rawToken}.`); noOtherInput = true; source = source.slice(1); consumed = true; }
    else if (source.startsWith('$')) { if (fourWay) failAssignment(document, assignment, `Duplicate $ modifier in command token ${rawToken}.`); fourWay = true; source = source.slice(1); consumed = true; }
    else if (source.startsWith('~')) {
      if (release) failAssignment(document, assignment, `Duplicate ~ modifier in command token ${rawToken}.`);
      release = true; source = source.slice(1); const match = /^\d+/u.exec(source); if (match) { chargeTicks = Number(match[0]); source = source.slice(match[0].length); }
      consumed = true;
    }
  }
  if (hold && release) failAssignment(document, assignment, `MUGEN command token cannot combine / and ~: ${rawToken}.`);
  if (chargeTicks > 600) failAssignment(document, assignment, `MUGEN command charge exceeds 600 ticks: ${rawToken}.`);
  const direction = normalizeDirection(source);
  const button = normalizeButton(source);
  if (direction === null && button === null) failAssignment(document, assignment, `Unknown MUGEN command token: ${rawToken}.`);
  if (fourWay && direction === null) failAssignment(document, assignment, `$ is only valid on direction tokens: ${rawToken}.`);
  if (chargeTicks > 0 && !release) failAssignment(document, assignment, `Charge ticks require a release token: ${rawToken}.`);
  return Object.freeze({
    target: direction ?? remap.get(button!)!,
    targetType: direction === null ? 'button' : 'direction',
    mode: release ? 'release' : hold ? 'hold' : 'press',
    fourWay,
    noOtherInput,
    chargeTicks,
  });
}

function sectionAssignments(document: MugenTextDocument, section: MugenTextSection): readonly MugenAssignmentToken[] {
  return document.tokens.slice(section.tokenStart + 1, section.tokenEnd).filter((token): token is MugenAssignmentToken => token.kind === 'assignment');
}

function uniqueAssignments(document: MugenTextDocument, assignments: readonly MugenAssignmentToken[], allowed: ReadonlySet<string>): Map<string, MugenAssignmentToken> {
  const result = new Map<string, MugenAssignmentToken>();
  for (const assignment of assignments) {
    if (!allowed.has(assignment.foldedKey)) failAssignment(document, assignment, `Unsupported MUGEN [Command] key: ${assignment.key}.`);
    if (result.has(assignment.foldedKey)) failAssignment(document, assignment, `Duplicate MUGEN [Command] key: ${assignment.key}.`);
    result.set(assignment.foldedKey, assignment);
  }
  return result;
}

function required(values: ReadonlyMap<string, MugenAssignmentToken>, key: string, document: MugenTextDocument, section: MugenTextSection): MugenAssignmentToken {
  const value = values.get(key);
  if (!value) failSection(document, section, `MUGEN [Command] is missing ${key}.`);
  return value;
}

function boundedInteger(assignment: MugenAssignmentToken, minimum: number, maximum: number, document: MugenTextDocument, label: string): number {
  const value = Number(assignment.value);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) failAssignment(document, assignment, `MUGEN ${label} must be an integer from ${minimum} to ${maximum}.`);
  return value;
}

function normalizeDirection(value: string): MugenCommandDirection | null {
  const normalized = LEGACY_DIRECTION_ALIASES.get(value) ?? value;
  return DIRECTIONS.has(normalized) ? normalized as MugenCommandDirection : null;
}
function normalizeButton(value: string): MugenCommandButton | null { const normalized = asciiCaseFold(value) === 's' ? 'start' : asciiCaseFold(value); return BUTTON_SET.has(normalized) ? normalized as MugenCommandButton : null; }
function failAssignment(document: MugenTextDocument, assignment: MugenAssignmentToken, message: string): never { failMugen(mugenDiagnostic('E_MUGEN_CMD_SYNTAX', 'cmd', 'error', 'release-resource', message, { canonicalPath: document.canonicalPath, sourceSha256: document.sourceSha256, byteOffset: assignment.valueSpan.startByte, line: assignment.valueSpan.line, column: assignment.valueSpan.column, key: assignment.key })); }
function failUnsupported(document: MugenTextDocument, assignment: MugenAssignmentToken, message: string): never { failMugen(mugenDiagnostic('E_MUGEN_UNSUPPORTED_FEATURE', 'classification', 'error', 'release-resource', message, { canonicalPath: document.canonicalPath, sourceSha256: document.sourceSha256, byteOffset: assignment.valueSpan.startByte, line: assignment.valueSpan.line, column: assignment.valueSpan.column, key: assignment.key })); }
function failSection(document: MugenTextDocument, section: MugenTextSection | undefined, message: string): never { failMugen(mugenDiagnostic('E_MUGEN_CMD_SYNTAX', 'cmd', 'error', 'release-resource', message, { canonicalPath: document.canonicalPath, sourceSha256: document.sourceSha256, ...(section === undefined ? {} : { byteOffset: section.header.span.startByte, line: section.header.span.line, column: section.header.span.column, section: section.name }) })); }

const DIRECTIONS = new Set<string>(['B', 'DB', 'D', 'DF', 'F', 'UF', 'U', 'UB']);
const LEGACY_DIRECTION_ALIASES = new Map<string, MugenCommandDirection>([['BD', 'DB'], ['FD', 'DF'], ['FU', 'UF'], ['BU', 'UB']]);
const BUTTONS: readonly MugenCommandButton[] = Object.freeze(['a', 'b', 'c', 'x', 'y', 'z', 'start']);
const BUTTON_SET = new Set<string>(BUTTONS);
