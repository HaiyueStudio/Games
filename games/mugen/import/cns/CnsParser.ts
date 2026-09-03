import { failMugen, mugenDiagnostic } from '../diagnostics';
import type { MugenAssignmentToken, MugenTextDocument, MugenTextSection } from '../text/MugenTextParser';
import { asciiCaseFold } from '../vfs/path';
import { parseMugenExpression } from './ExpressionParser';
import { compileMugenExpression } from '../expression/MugenExpressionCompiler';
import { mugenFloat, mugenInt } from '../expression/types';
import type { MugenControllerType, MugenExpression, MugenHitAttributeFilterTemplate, MugenHitDefTemplate, MugenHitOverrideTemplate, MugenReversalDefTemplate, MugenStateController, MugenStateDefinition, MugenStateProgram } from './types';

export interface MugenControllerParameterCensusEntry {
  readonly sourceName: string;
  readonly type: MugenControllerType;
  readonly sourceParameters: readonly string[];
  readonly requiredCompiledParameters: readonly string[];
  readonly compatibilityIgnoredParameters: readonly string[];
}

/** Machine-readable view of the exact strict parser surface used by G08 acceptance. */
export function getMugenControllerParameterCensus(): readonly MugenControllerParameterCensusEntry[] {
  return Object.freeze([...CONTROLLER_TYPES.entries()].map(([sourceName, type]) => Object.freeze({
    sourceName,
    type,
    sourceParameters: Object.freeze([...CONTROLLER_PARAMETERS[type], 'ignorehitpause', 'persistent'].sort()),
    requiredCompiledParameters: Object.freeze([...REQUIRED_PARAMETERS[type]].sort()),
    compatibilityIgnoredParameters: Object.freeze([...(KNOWN_IGNORED_CONTROLLER_PARAMETERS[type] ?? []), ...(type === 'helper' ? ['pausermovetime'] : [])].sort()),
  })).sort((left, right) => left.sourceName.localeCompare(right.sourceName, 'en')));
}
import type { MugenMoveType, MugenPhysicsType, MugenStateType } from '../../runtime/match/MugenMatchState';

export interface ParseMugenStateDocumentsOptions { readonly commonStatePaths?: ReadonlySet<string> }

export function parseMugenStateDocuments(documents: readonly MugenTextDocument[], options: ParseMugenStateDocumentsOptions = {}): MugenStateProgram {
  const definitions = new Map<number, Omit<MugenStateDefinition, 'controllers'>>();
  const controllers: Array<Readonly<{ controller: MugenStateController; common: boolean }>> = [];
  const commonPaths = new Set([...(options.commonStatePaths ?? [])].map(asciiCaseFold));
  const characterAttributes = parseCharacterAttributes(documents);
  const characterPhysics = parseCharacterPhysics(documents);
  const characterConstants = parseCharacterConstants(documents);
  for (const document of documents) {
    const commonDocument = commonPaths.has(asciiCaseFold(document.canonicalPath));
    let currentStateNumber: number | null = null;
    for (const section of document.sections) {
      const stateDefMatch = /^statedef\s+(-?\d+)$/iu.exec(section.name.trim());
      if (stateDefMatch) {
        const number = stateNumber(stateDefMatch[1]!, document, section);
        currentStateNumber = number;
        if (number < -3) failUnsupportedSection(document, section, `StateDef ${number} is outside the official MUGEN special-state range.`);
        const existing = definitions.get(number);
        if (existing !== undefined) {
          const existingCommon = commonPaths.has(asciiCaseFold(existing.sourcePath));
          if (existingCommon && !commonDocument) definitions.set(number, parseStateDef(document, section, number));
          else if (!existingCommon && commonDocument) continue;
          else failSection(document, section, `Duplicate MUGEN StateDef ${number}.`);
        } else definitions.set(number, parseStateDef(document, section, number));
        continue;
      }
      const controllerMatch = /^state\s+([^,]+?)(?:\s*,\s*(.*))?$/iu.exec(section.name.trim());
      if (controllerMatch) {
        // The first field in a [State label, name] header is descriptive only.
        // MUGEN binds the controller to the nearest preceding StateDef in the
        // same document; legacy characters frequently use a stale number or a
        // non-numeric shorthand such as [State a].
        if (currentStateNumber === null) failSection(document, section, 'MUGEN state controller must follow a StateDef in the same document.');
        const label = controllerMatch[1]!.trim(); const name = controllerMatch[2]?.trim() || label;
        controllers.push(Object.freeze({ controller: parseController(document, section, currentStateNumber, name), common: commonDocument }));
      }
    }
  }
  if (!definitions.has(-1)) definitions.set(-1, emptyStateDefinition(-1, '<generated>', 0));
  const activeControllers = controllers.flatMap(entry => {
    const definition = definitions.get(entry.controller.stateNumber);
    if (definition === undefined) failMugen(mugenDiagnostic('E_MUGEN_CNS_SYNTAX', 'cns', 'error', 'release-resource', `MUGEN controller references missing StateDef ${entry.controller.stateNumber}.`, { canonicalPath: entry.controller.sourcePath, line: entry.controller.sourceLine, section: `State ${entry.controller.stateNumber}` }));
    return entry.common && asciiCaseFold(definition.sourcePath) !== asciiCaseFold(entry.controller.sourcePath) ? [] : [entry.controller];
  });
  const states = [...definitions.values()].sort((left, right) => left.number - right.number).map(definition => Object.freeze({ ...definition, controllers: Object.freeze(activeControllers.filter(controller => controller.stateNumber === definition.number)) }));
  if (!definitions.has(0)) failMugen(mugenDiagnostic('E_MUGEN_CNS_SYNTAX', 'cns', 'error', 'release-resource', 'MUGEN state program requires StateDef 0.'));
  if (activeControllers.length > 8_192) failMugen(mugenDiagnostic('E_MUGEN_LIMIT_EXCEEDED', 'budget', 'fatal', 'release-resource', 'MUGEN state program exceeds the G08-C controller budget.', {}, { budget: 'g08cControllers', observed: activeControllers.length, limit: 8_192 }));
  return Object.freeze({ schemaVersion: 1, revision: 'm09-g03-core-state-v1', attributes: characterAttributes, physics: characterPhysics, constants: characterConstants, states: Object.freeze(states) });
}

function parseCharacterConstants(documents: readonly MugenTextDocument[]): MugenStateProgram['constants'] {
  const result: Record<string, number> = {};
  for (const document of documents) for (const section of document.sections) {
    const namespace = asciiCaseFold(section.name.trim());
    if (!CHARACTER_CONSTANT_SECTIONS.has(namespace)) continue;
    for (const assignment of sectionAssignments(document, section)) {
      const fields = splitTopLevel(assignment.value);
      if (fields.length < 1 || fields.length > 2) continue;
      const values = fields.map(field => Number(field));
      if (values.some(value => !Number.isFinite(value))) continue;
      const key = `${namespace}.${assignment.foldedKey}`;
      if (result[key] !== undefined) failAssignment(document, assignment, `Duplicate MUGEN character constant: ${key}.`);
      result[key] = Math.fround(values[0]!);
      result[`${key}.x`] = Math.fround(values[0]!);
      if (values[1] !== undefined) {
        result[`${key}.y`] = Math.fround(values[1]);
        // MUGEN exposes the neutral jump vector's second component through
        // Const(velocity.jump.y) / Const(velocity.airjump.y), even though the
        // CNS declaration is named jump.neu / airjump.neu.
        if (namespace === 'velocity' && (assignment.foldedKey === 'jump.neu' || assignment.foldedKey === 'airjump.neu')) result[`velocity.${assignment.foldedKey.slice(0, -4)}.y`] = Math.fround(values[1]);
      }
    }
  }
  return Object.freeze(Object.fromEntries(Object.entries(result).sort(([left], [right]) => left.localeCompare(right))));
}

function parseCharacterAttributes(documents: readonly MugenTextDocument[]): MugenStateProgram['attributes'] {
  const values = new Map<string, Readonly<{ assignment: MugenAssignmentToken; document: MugenTextDocument }>>();
  for (const document of documents) for (const section of document.sections) if (asciiCaseFold(section.name.trim()) === 'data') for (const assignment of sectionAssignments(document, section)) if (CHARACTER_ATTRIBUTE_KEYS.has(assignment.foldedKey)) {
    if (values.has(assignment.foldedKey)) failAssignment(document, assignment, `Duplicate MUGEN Data ${assignment.key} constant.`);
    values.set(assignment.foldedKey, { assignment, document });
  }
  const integer = (key: string, fallback: number, minimum: number, maximum: number): number => { const source = values.get(key); return source === undefined ? fallback : boundedInteger(source.assignment, minimum, maximum, source.document, `Data ${key}`); };
  return Object.freeze({ defense: integer('defence', 100, 1, 1_000_000), airJuggle: integer('airjuggle', 15, 0, 1_000_000) });
}

function parseCharacterPhysics(documents: readonly MugenTextDocument[]): MugenStateProgram['physics'] {
  const values = new Map<string, Readonly<{ assignment: MugenAssignmentToken; document: MugenTextDocument }>>();
  for (const document of documents) for (const section of document.sections) if (asciiCaseFold(section.name.trim()) === 'movement') for (const assignment of sectionAssignments(document, section)) if (PHYSICS_CONSTANT_KEYS.has(assignment.foldedKey)) { if (values.has(assignment.foldedKey)) failAssignment(document, assignment, `Duplicate MUGEN Movement constant: ${assignment.key}.`); values.set(assignment.foldedKey, { assignment, document }); }
  const value = (key: string, fallback: number): number => { const entry = values.get(key); if (!entry) return Math.fround(fallback); const parsed = Number(entry.assignment.value); if (!Number.isFinite(parsed)) failAssignment(entry.document, entry.assignment, `MUGEN Movement ${entry.assignment.key} must be finite.`); return Math.fround(parsed); };
  const gravity = value('yaccel', 0.5); const standFriction = value('stand.friction', 0.85); const crouchFriction = value('crouch.friction', 0.82);
  const invalid = (key: string, message: string): never => { const entry = values.get(key); if (!entry) throw new TypeError(message); failAssignment(entry.document, entry.assignment, message); };
  if (Math.abs(gravity) > 100) invalid('yaccel', 'MUGEN Movement yaccel exceeds the supported range.');
  if (standFriction < 0 || standFriction > 1) invalid('stand.friction', 'MUGEN Movement stand.friction must be from 0 to 1.');
  if (crouchFriction < 0 || crouchFriction > 1) invalid('crouch.friction', 'MUGEN Movement crouch.friction must be from 0 to 1.');
  return Object.freeze({ gravity, standFriction, crouchFriction });
}

function parseStateDef(document: MugenTextDocument, section: MugenTextSection, number: number): Omit<MugenStateDefinition, 'controllers'> {
  const values = unique(document, sectionAssignments(document, section), STATE_DEF_KEYS, 'StateDef');
  if (number < 0 && values.size === 0) return emptyStateDefinition(number, document.canonicalPath, section.header.span.line);
  const stateType = optionalEnumAssignment(values.get('type'), STATE_TYPES, 'S', document, 'type') as MugenStateType | 'U';
  const moveType = optionalEnumAssignment(values.get('movetype'), MOVE_TYPES, 'I', document, 'movetype') as MugenMoveType | 'U';
  const physics = optionalEnumAssignment(values.get('physics'), PHYSICS_TYPES, 'N', document, 'physics') as MugenPhysicsType | 'U';
  return Object.freeze({
    number, stateType, moveType, physics,
    animation: parsedExpression(values.get('anim'), document),
    velocity: values.get('velset') === undefined ? null : expressionTuple(values.get('velset')!, document, 'velset'),
    control: parsedExpression(values.get('ctrl'), document), powerAdd: parsedExpression(values.get('poweradd'), document),
    juggle: parsedExpression(values.get('juggle'), document), faceOpponent: parsedExpression(values.get('facep2'), document),
    hitDefPersist: parsedExpression(values.get('hitdefpersist'), document), moveHitPersist: parsedExpression(values.get('movehitpersist'), document),
    hitCountPersist: parsedExpression(values.get('hitcountpersist'), document), spritePriority: parsedExpression(values.get('sprpriority'), document),
    sourcePath: document.canonicalPath, sourceLine: section.header.span.line,
  });
}

function emptyStateDefinition(number: number, sourcePath: string, sourceLine: number): Omit<MugenStateDefinition, 'controllers'> { return Object.freeze({ number, stateType: 'S', moveType: 'I', physics: 'N', animation: null, velocity: null, control: null, powerAdd: null, juggle: null, faceOpponent: null, hitDefPersist: null, moveHitPersist: null, hitCountPersist: null, spritePriority: null, sourcePath, sourceLine }); }

function parseController(document: MugenTextDocument, section: MugenTextSection, state: number, name: string): MugenStateController {
  const assignments = sectionAssignments(document, section);
  const typeAssignment = assignments.find(value => value.foldedKey === 'type');
  if (!typeAssignment) failSection(document, section, 'MUGEN state controller is missing type.');
  const typeName = asciiCaseFold(typeAssignment.value.replace(/\s+/gu, ''));
  const type = CONTROLLER_TYPES.get(typeName);
  if (!type) failUnsupported(document, typeAssignment, `Unsupported MUGEN state controller: ${typeAssignment.value}.`);
  const allowedParameters = CONTROLLER_PARAMETERS[type];
  const triggerAll: MugenExpression[] = [];
  const groups = new Map<number, MugenExpression[]>();
  const parameters: Record<string, MugenExpression> = {};
  const literalParameters: Record<string, string> = {};
  const parameterSources = new Map<string, string>();
  const hitDefAssignments = new Map<string, MugenAssignmentToken>();
  const hitFilterAssignments = new Map<string, MugenAssignmentToken>();
  let hitOverrideAttribute: MugenAssignmentToken | null = null;
  const reversalAssignments = new Map<string, MugenAssignmentToken>();
  let persistent = 1; let ignoreHitPause = false;
  for (const assignment of assignments) {
    if (assignment === typeAssignment) continue;
    if (assignment.foldedKey === 'triggerall') { triggerAll.push(parseMugenExpression(assignment.value, document, assignment)); continue; }
    const trigger = /^trigger(\d+)$/u.exec(assignment.foldedKey);
    if (trigger) { const group = Number(trigger[1]); if (!Number.isSafeInteger(group) || group < 1 || group > 64) failAssignment(document, assignment, 'MUGEN trigger group must be from 1 to 64.'); const values = groups.get(group) ?? []; values.push(parseMugenExpression(assignment.value, document, assignment)); groups.set(group, values); continue; }
    if (assignment.foldedKey === 'persistent') { persistent = boundedInteger(assignment, 0, 65_535, document, 'persistent'); continue; }
    if (assignment.foldedKey === 'ignorehitpause' || assignment.foldedKey === 'ignorehitpose') { ignoreHitPause = booleanAssignment(assignment, document); continue; }
    if (type === 'helper' && assignment.foldedKey === 'pausermovetime') { if (parameters.pausemovetime !== undefined) failAssignment(document, assignment, 'Duplicate MUGEN Helper pausemovetime parameter.'); parameters.pausemovetime = parseMugenExpression(assignment.value, document, assignment); continue; }
    if (KNOWN_IGNORED_PARAMETER_TYPOS.has(assignment.foldedKey)) { literalParameters[`compat.ignored.${assignment.foldedKey}`] = assignment.value.trim(); continue; }
    if (KNOWN_IGNORED_CONTROLLER_PARAMETERS[type]?.has(assignment.foldedKey)) { literalParameters[`compat.ignored.${assignment.foldedKey}`] = assignment.value.trim(); continue; }
    const systemVariable = /^(?:sysvar)\(\s*([0-4])\s*\)$/u.exec(assignment.foldedKey);
    if ((type === 'var-set' || type === 'var-add') && systemVariable !== null) { if (parameters.sv !== undefined || parameters.value !== undefined) failAssignment(document, assignment, `Duplicate MUGEN system variable assignment: ${assignment.key}.`); parameters.sv = numberExpression(Number(systemVariable[1])); parameters.value = parseMugenExpression(assignment.value, document, assignment); continue; }
    const standardVariable = /^(f?var)\(\s*(\d+)\s*\)$/u.exec(assignment.foldedKey);
    if ((type === 'var-set' || type === 'var-add' || type === 'parent-var-set' || type === 'parent-var-add') && standardVariable !== null) {
      const floatVariable = standardVariable[1] === 'fvar';
      const index = Number(standardVariable[2]);
      const maximum = floatVariable ? 39 : 59;
      if (!Number.isSafeInteger(index) || index < 0 || index > maximum) failAssignment(document, assignment, `MUGEN ${standardVariable[1]} index must be from 0 to ${maximum}.`);
      if (parameters.v !== undefined || parameters.fv !== undefined || parameters.sv !== undefined || parameters.value !== undefined) failAssignment(document, assignment, `Duplicate MUGEN variable assignment: ${assignment.key}.`);
      parameters[floatVariable ? 'fv' : 'v'] = numberExpression(index);
      parameters.value = parseMugenExpression(assignment.value, document, assignment);
      continue;
    }
    if (!allowedParameters.has(assignment.foldedKey)) { if (type === 'null') continue; failAssignment(document, assignment, `Unsupported parameter ${assignment.key} for ${typeAssignment.value}.`); }
    if ((type === 'explod' || type === 'modify-explod') && assignment.foldedKey === 'supermove') { literalParameters['compat.deprecated.supermove'] = assignment.value.trim(); parameters.supermove = parseMugenExpression(assignment.value, document, assignment); continue; }
    const normalizedParameterSource = assignment.value.replace(/\s+/gu, '').toLowerCase(); const previousParameterSource = parameterSources.get(assignment.foldedKey);
    if (previousParameterSource !== undefined) literalParameters[`compat.duplicate.${assignment.foldedKey}`] = assignment.value.trim();
    parameterSources.set(assignment.foldedKey, normalizedParameterSource);
    if (type === 'hit-def' || type === 'projectile' && HITDEF_PARAMETERS.has(assignment.foldedKey)) { hitDefAssignments.set(assignment.foldedKey, assignment); continue; }
    if ((type === 'hit-by' || type === 'not-hit-by') && (assignment.foldedKey === 'value' || assignment.foldedKey === 'value2')) { hitFilterAssignments.set(assignment.foldedKey, assignment); continue; }
    if (type === 'hit-override' && assignment.foldedKey === 'attr') { hitOverrideAttribute = assignment; continue; }
    if (type === 'reversal-def') { reversalAssignments.set(assignment.foldedKey, assignment); continue; }
    if (type === 'play-snd' && assignment.foldedKey === 'value') { const values = splitTopLevel(assignment.value); if (values.length !== 2) failAssignment(document, assignment, 'MUGEN PlaySnd value must contain group,item.'); const group = values[0]!.trim(); const owner = /^([sf])\s*(.*)$/iu.exec(group); if (owner) literalParameters['value.owner'] = asciiCaseFold(owner[1]!) === 'f' ? 'fight' : 'self'; parameters.group = parseMugenExpression(owner?.[2] ?? group, document, assignment); parameters.item = parseMugenExpression(values[1]!, document, assignment); continue; }
    if (type === 'assert-special' && ASSERT_SPECIAL_PARAMETERS.has(assignment.foldedKey)) {
      const flag = asciiCaseFold(assignment.value.trim().replace(/^['"]|['"]$/gu, '')).replace(/[\s_-]+/gu, '');
      if (!ASSERT_SPECIAL_FLAGS.has(flag)) failAssignment(document, assignment, `Unsupported MUGEN AssertSpecial flag: ${assignment.value}.`);
      literalParameters[assignment.foldedKey] = flag;
      continue;
    }
    if ((type === 'display-to-clipboard' || type === 'append-to-clipboard' || type === 'null') && assignment.foldedKey === 'params') { literalParameters.params = assignment.value.trim(); continue; }
    if ((type === 'display-to-clipboard' || type === 'append-to-clipboard') && assignment.foldedKey === 'text' && !/^"(?:[^"\\]|\\.)*"$/u.test(assignment.value.trim())) failAssignment(document, assignment, `MUGEN ${typeAssignment.value} text must be a double-quoted format string.`);
    if (type === 'force-feedback' && assignment.foldedKey !== 'waveform') {
      const constants = splitTopLevel(assignment.value); const integerConstant = /^[+-]?\d+$/u; const numericConstant = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/u;
      if (constants.length === 0 || constants.some(value => !(assignment.foldedKey === 'time' || assignment.foldedKey === 'self' ? integerConstant : numericConstant).test(value.trim()))) failAssignment(document, assignment, `MUGEN ForceFeedback ${assignment.key} requires numeric constants.`);
    }
    if (LITERAL_PARAMETERS.has(assignment.foldedKey) || type === 'projectile' && assignment.foldedKey === 'afterimage.trans') { literalParameters[assignment.foldedKey] = assignment.value.trim().replace(/^['"]|['"]$/gu, ''); continue; }
    const tupleArity = tupleParameterArity(type, assignment.foldedKey);
    if (tupleArity !== null) { const values = splitTopLevel(assignment.value); if (values.length < tupleArity[0] || values.length > tupleArity[1] || values.some(value => value === '')) failAssignment(document, assignment, `MUGEN ${assignment.key} must contain ${tupleArity[0] === tupleArity[1] ? tupleArity[0] : `${tupleArity[0]} to ${tupleArity[1]}`} expressions.`); for (let index = 0; index < tupleArity[1]; index += 1) delete parameters[`${assignment.foldedKey}.${index}`]; for (let index = 0; index < values.length; index += 1) parameters[`${assignment.foldedKey}.${index}`] = parseMugenExpression(values[index]!, document, assignment); continue; }
    if (PREFIXED_RESOURCE_PARAMETERS.has(assignment.foldedKey) && /^f\s*(?:-?\d|\()/iu.test(assignment.value.trim())) { const source = assignment.value.trim(); literalParameters[`${assignment.foldedKey}.owner`] = 'fight'; parameters[assignment.foldedKey] = parseMugenExpression(source.slice(1).trim(), document, assignment); continue; }
    parameters[assignment.foldedKey] = parseMugenExpression(assignment.value, document, assignment);
  }
  if (type === 'pos-add' && parameters.value !== undefined) { if (parameters.x !== undefined || parameters.y !== undefined) failSection(document, section, 'MUGEN PosAdd legacy value cannot be combined with x or y.'); parameters.x = parameters.value; delete parameters.value; }
  if (groups.size === 0) failSection(document, section, 'MUGEN state controller requires at least one triggerN expression.');
  for (const key of REQUIRED_PARAMETERS[type]) if (parameters[key] === undefined) failSection(document, section, `MUGEN ${typeAssignment.value} controller requires ${key}.`);
  if ((type === 'var-set' || type === 'var-add') && Number(parameters.v !== undefined) + Number(parameters.fv !== undefined) + Number(parameters.sv !== undefined) !== 1) failSection(document, section, `MUGEN ${typeAssignment.value} requires exactly one of v, fv or sysvar(index).`);
  if ((type === 'parent-var-set' || type === 'parent-var-add') && Number(parameters.v !== undefined) + Number(parameters.fv !== undefined) !== 1) failSection(document, section, `MUGEN ${typeAssignment.value} requires exactly one of v or fv.`);
  if (type === 'var-random' && parameters.v === undefined) failSection(document, section, 'MUGEN VarRandom requires v.');
  if (type === 'var-range-set' && Number(parameters.value !== undefined) + Number(parameters.fvalue !== undefined) !== 1) failSection(document, section, 'MUGEN VarRangeSet requires exactly one of value or fvalue.');
  if (type === 'assert-special' && Object.keys(literalParameters).length === 0) failSection(document, section, 'MUGEN AssertSpecial requires at least one flag.');
  if (type === 'after-image-time' && parameters.time === undefined && parameters.value === undefined) failSection(document, section, 'MUGEN AfterImageTime requires time or value.');
  if (type === 'snd-pan' && Number(parameters.pan !== undefined) + Number(parameters.abspan !== undefined) !== 1) failSection(document, section, 'MUGEN SndPan requires exactly one of pan or abspan.');
  if (type === 'play-snd' && parameters.pan !== undefined && parameters.abspan !== undefined) failSection(document, section, 'MUGEN PlaySnd accepts only one of pan or abspan.');
  if ((type === 'display-to-clipboard' || type === 'append-to-clipboard') && literalParameters.text === undefined) failSection(document, section, `MUGEN ${typeAssignment.value} requires text.`);
  if (type === 'trans' && literalParameters.trans === undefined) failSection(document, section, 'MUGEN Trans requires trans.');
  if (type === 'force-feedback') {
    const waveform = literalParameters.waveform;
    if (waveform !== undefined && !FORCE_FEEDBACK_WAVEFORMS.has(asciiCaseFold(waveform))) failSection(document, section, `Unsupported MUGEN ForceFeedback waveform: ${waveform}.`);
  }
  if ((type === 'trans' || type === 'explod' || type === 'modify-explod') && literalParameters.trans !== undefined && !TRANSPARENCY_MODES.has(asciiCaseFold(literalParameters.trans))) failSection(document, section, `Unsupported MUGEN transparency mode: ${literalParameters.trans}.`);
  if ((type === 'explod' || type === 'modify-explod') && literalParameters.space !== undefined && !new Set(['screen', 'stage']).has(asciiCaseFold(literalParameters.space))) failSection(document, section, `Unsupported MUGEN Explod space: ${literalParameters.space}.`);
  if ((type === 'explod' || type === 'modify-explod' || type === 'helper' || type === 'projectile') && literalParameters.postype !== undefined && !new Set(['p1', 'p2', 'front', 'back', 'left', 'right', 'none']).has(asciiCaseFold(literalParameters.postype))) failSection(document, section, `Unsupported MUGEN ${typeAssignment.value} postype: ${literalParameters.postype}.`);
  if (type === 'helper' && literalParameters.helpertype !== undefined && !new Set(['normal', 'player']).has(asciiCaseFold(literalParameters.helpertype))) failSection(document, section, `Unsupported MUGEN Helper helpertype: ${literalParameters.helpertype}.`);
  if (type === 'after-image' && literalParameters.trans !== undefined && !AFTER_IMAGE_TRANSPARENCY_MODES.has(asciiCaseFold(literalParameters.trans))) failSection(document, section, `Unsupported MUGEN AfterImage transparency mode: ${literalParameters.trans}.`);
  if (type === 'projectile' && literalParameters['afterimage.trans'] !== undefined && !AFTER_IMAGE_TRANSPARENCY_MODES.has(asciiCaseFold(literalParameters['afterimage.trans']))) failSection(document, section, `Unsupported MUGEN Projectile afterimage.trans mode: ${literalParameters['afterimage.trans']}.`);
  if (type === 'state-type-set' && parameters.statetype === undefined && parameters.movetype === undefined && parameters.physics === undefined) failSection(document, section, 'MUGEN StateTypeSet requires statetype, movetype or physics.');
  if ((type === 'vel-set' || type === 'vel-add' || type === 'vel-mul' || type === 'pos-set' || type === 'pos-add') && parameters.x === undefined && parameters.y === undefined) failSection(document, section, `MUGEN ${typeAssignment.value} requires x or y.`);
  if ((type === 'target-vel-set' || type === 'target-vel-add') && parameters.x === undefined && parameters.y === undefined) failSection(document, section, `MUGEN ${typeAssignment.value} requires x or y.`);
  if (type === 'width' && parameters['value.0'] !== undefined && (parameters['edge.0'] !== undefined || parameters['player.0'] !== undefined)) failSection(document, section, 'MUGEN Width value cannot be combined with edge or player.');
  const hitDefinition = type === 'hit-def' || type === 'projectile' ? parseHitDef(document, section, hitDefAssignments, type === 'hit-def') : null;
  const hitAttributeFilter = type === 'hit-by' || type === 'not-hit-by' ? parseHitAttributeFilter(document, section, type, hitFilterAssignments, parameters.time) : null;
  const hitOverride = type === 'hit-override' ? parseHitOverride(document, section, hitOverrideAttribute, parameters) : null;
  const reversalDefinition = type === 'reversal-def' ? parseReversalDef(document, section, reversalAssignments) : null;
  return Object.freeze({ stateNumber: state, name, type, triggerAll: Object.freeze(triggerAll), triggerGroups: Object.freeze([...groups.entries()].sort((a, b) => a[0] - b[0]).map(([group, expressions]) => Object.freeze({ group, expressions: Object.freeze(expressions) }))), persistent, ignoreHitPause, parameters: Object.freeze(parameters), ...(Object.keys(literalParameters).length === 0 ? {} : { literalParameters: Object.freeze(literalParameters) }), hitDefinition, hitAttributeFilter, hitOverride, reversalDefinition, sourcePath: document.canonicalPath, sourceLine: section.header.span.line });
}

function parseHitOverride(document: MugenTextDocument, section: MugenTextSection, attr: MugenAssignmentToken | null, parameters: Readonly<Record<string, MugenExpression>>): MugenHitOverrideTemplate { if (attr === null) failSection(document, section, 'MUGEN HitOverride requires attr.'); const attributes = attr.value.trim() === '' ? Object.freeze([]) : parseHitAttributeSet(document, attr); return Object.freeze({ attributes, stateNumber: parameters.stateno ?? numberExpression(-1), slot: parameters.slot ?? numberExpression(0), time: parameters.time ?? numberExpression(1), forceAir: parameters.forceair ?? numberExpression(0) }); }

function parseReversalDef(document: MugenTextDocument, section: MugenTextSection, values: ReadonlyMap<string, MugenAssignmentToken>): MugenReversalDefTemplate { const attr = values.get('reversal.attr'); if (!attr) failSection(document, section, 'MUGEN ReversalDef requires reversal.attr.'); return Object.freeze({ attributes: attr.value.trim() === '' ? Object.freeze([]) : parseHitAttributeSet(document, attr), hitPause: optionalExpressionPair(values.get('pausetime'), document, [0, 0]), attackerStateNumber: optionalExpression(values.get('p1stateno'), document, -1), defenderStateNumber: optionalExpression(values.get('p2stateno'), document, -1), attackerSpritePriority: optionalExpression(values.get('p1sprpriority'), document, 1), defenderSpritePriority: optionalExpression(values.get('p2sprpriority'), document, 0), sparkNumber: prefixedExpression(values.get('sparkno'), document).expression, hitSound: prefixedExpressionPair(values.get('hitsound'), document).expressions }); }

function parseHitAttributeFilter(document: MugenTextDocument, section: MugenTextSection, type: 'hit-by' | 'not-hit-by', values: ReadonlyMap<string, MugenAssignmentToken>, time: MugenExpression | undefined): MugenHitAttributeFilterTemplate {
  const value = values.get('value'); const value2 = values.get('value2');
  if (Number(value !== undefined) + Number(value2 !== undefined) !== 1) failSection(document, section, `MUGEN ${type === 'hit-by' ? 'HitBy' : 'NotHitBy'} requires exactly one of value or value2.`);
  const assignment = value ?? value2!;
  return Object.freeze({ slot: value2 === undefined ? 0 : 1, allow: type === 'hit-by', attributes: parseHitAttributeSet(document, assignment), time: time ?? numberExpression(1) });
}

function parseHitAttributeSet(document: MugenTextDocument, assignment: MugenAssignmentToken): readonly string[] {
  const fields = splitTopLevel(assignment.value); if (fields.length < 1) failAssignment(document, assignment, `MUGEN ${assignment.key} must be a standard hit attribute string.`);
  const states = fields[0]!.trim().toUpperCase();
  if ([...states].some(value => !HITDEF_STATES.has(value))) failAssignment(document, assignment, `MUGEN ${assignment.key} contains an invalid hit state attribute.`);
  const attackTokens = fields.slice(1).map(value => value.replace(/\s+/gu, '').toUpperCase()).filter(Boolean);
  if (attackTokens.some(value => !/^[NSHA][APT]$/u.test(value))) failAssignment(document, assignment, `MUGEN ${assignment.key} contains an invalid attack attribute.`);
  const stateValues = states === '' ? [...HITDEF_STATES] : [...new Set(states)];
  const attackValues = attackTokens.length === 0 ? [...ATTACK_ATTRIBUTES] : [...ATTACK_ATTRIBUTES].filter(value => attackTokens.some(pattern => (pattern[0] === 'A' || pattern[0] === value[0]) && (pattern[1] === value[1])));
  return Object.freeze(stateValues.flatMap(state => attackValues.map(attack => `${state}:${attack}`)).sort());
}

function parseHitDef(document: MugenTextDocument, section: MugenTextSection, values: ReadonlyMap<string, MugenAssignmentToken>, requireAttribute = true): MugenHitDefTemplate {
  const attr = values.get('attr'); const damage = values.get('damage');
  if (!attr && requireAttribute) failSection(document, section, 'MUGEN HitDef requires attr.');
  const attrParts = attr === undefined ? ['S', 'NA'] : splitTopLevel(attr.value); if (attrParts.length !== 2) failAssignment(document, attr!, 'MUGEN HitDef attr must contain state and attack attributes.');
  const attributeState = attrParts[0]!.trim().toUpperCase(); const attackAttribute = attrParts[1]!.trim().toUpperCase();
  if (!HITDEF_STATES.has(attributeState) || !ATTACK_ATTRIBUTES.has(attackAttribute)) { if (attr) failAssignment(document, attr, `Unsupported MUGEN HitDef attr: ${attr.value}.`); throw new TypeError('Invalid internal Projectile attribute fallback.'); }
  const damagePair = optionalExpressionPair(damage, document, [0, 0]);
  const hitPause = optionalExpressionPair(values.get('pausetime'), document, [0, 0]);
  const guardPause = optionalExpressionPair(values.get('guard.pausetime'), document, hitPause);
  const groundHitTime = optionalExpression(values.get('ground.hittime'), document, 0);
  const groundSlideTime = optionalExpression(values.get('ground.slidetime'), document, 0);
  const guardHitTime = optionalExpression(values.get('guard.hittime'), document, groundHitTime);
  const guardSlideTime = optionalExpression(values.get('guard.slidetime'), document, guardHitTime);
  const airHitTime = optionalExpression(values.get('air.hittime'), document, 20);
  const groundVelocity = optionalExpressionPair(values.get('ground.velocity'), document, [0, 0]);
  const airVelocity = optionalExpressionPair(values.get('air.velocity'), document, [0, 0]);
  const guardVelocity = optionalExpressionPair(values.get('guard.velocity'), document, [groundVelocity[0], numberExpression(0)]);
  const priority = hitPriority(values.get('priority'), document);
  const animationType = hitAnimationType(values.get('animtype'), 'light', document);
  const airAnimationType = hitAnimationType(values.get('air.animtype'), animationType, document);
  const fallAnimationType = hitAnimationType(values.get('fall.animtype'), airAnimationType === 'up' ? 'up' : 'back', document);
  const envShake = Object.freeze([optionalExpression(values.get('envshake.time'), document, 0), optionalExpression(values.get('envshake.freq'), document, 60), optionalExpression(values.get('envshake.ampl'), document, -4), optionalExpression(values.get('envshake.phase'), document, 0)]) as MugenHitDefTemplate['output']['envShake']; const fallEnvShake = Object.freeze([optionalExpression(values.get('fall.envshake.time'), document, 0), optionalExpression(values.get('fall.envshake.freq'), document, 60), optionalExpression(values.get('fall.envshake.ampl'), document, -4), optionalExpression(values.get('fall.envshake.phase'), document, 0)]) as MugenHitDefTemplate['output']['fallEnvShake'];
  const defenderPalette = Object.freeze({ time: optionalExpression(values.get('palfx.time'), document, 0), multiply: optionalExpressionTriple(values.get('palfx.mul'), document, [256, 256, 256]), add: optionalExpressionTriple(values.get('palfx.add'), document, [0, 0, 0]) });
  const output = Object.freeze({ sparkNumber: prefixedExpression(values.get('sparkno'), document).expression, sparkFromPlayer: prefixedExpression(values.get('sparkno'), document).prefixed, guardSparkNumber: prefixedExpression(values.get('guard.sparkno'), document).expression, guardSparkFromPlayer: prefixedExpression(values.get('guard.sparkno'), document).prefixed, sparkPosition: optionalExpressionPair(values.get('sparkxy'), document, [0, 0]), hitSound: prefixedExpressionPair(values.get('hitsound'), document).expressions, hitSoundFromPlayer: prefixedExpressionPair(values.get('hitsound'), document).prefixed, guardSound: prefixedExpressionPair(values.get('guardsound'), document).expressions, guardSoundFromPlayer: prefixedExpressionPair(values.get('guardsound'), document).prefixed, envShake, fallEnvShake, defenderPalette });
  return Object.freeze({
    attributeState: attributeState as MugenHitDefTemplate['attributeState'], attackAttribute: attackAttribute as MugenHitDefTemplate['attackAttribute'], affectTeam: hitAffectTeam(values.get('affectteam'), document), damage: damagePair,
    hitFlags: flags(values.get('hitflag'), 'MAF', HIT_FLAGS, document, 'hitflag'), guardFlags: flags(values.get('guardflag'), '', GUARD_FLAGS, document, 'guardflag'), priority,
    groundHitType: groundHitType(values.get('ground.type'), document), airHitType: groundHitType(values.get('air.type'), document, groundHitType(values.get('ground.type'), document)), animationType, airAnimationType, fallAnimationType, hitPause, guardPause, groundHitTime, groundSlideTime, guardSlideTime, guardHitTime, airHitTime,
    guardControlTime: optionalExpression(values.get('guard.ctrltime'), document, guardSlideTime), airGuardControlTime: optionalExpression(values.get('airguard.ctrltime'), document, optionalExpression(values.get('guard.ctrltime'), document, guardSlideTime)), yAcceleration: optionalExpression(values.get('yaccel'), document, .35), groundVelocity, airVelocity, guardVelocity, airGuardVelocity: values.get('airguard.velocity') === undefined ? null : expressionPair(values.get('airguard.velocity')!, document, 0), downVelocity: optionalExpressionPair(values.get('down.velocity'), document, airVelocity), downHitTime: optionalExpression(values.get('down.hittime'), document, 0), groundCornerPush: parsedExpression(values.get('ground.cornerpush.veloff'), document), airCornerPush: parsedExpression(values.get('air.cornerpush.veloff'), document), downCornerPush: parsedExpression(values.get('down.cornerpush.veloff'), document), guardCornerPush: parsedExpression(values.get('guard.cornerpush.veloff'), document), airGuardCornerPush: parsedExpression(values.get('airguard.cornerpush.veloff'), document),
    attackerPower: optionalExpressionPair(values.get('getpower'), document, [0, 0]), defenderPower: optionalExpressionPair(values.get('givepower'), document, [0, 0]),
    guardDistance: optionalExpression(values.get('guard.dist'), document, -1), attackerSpritePriority: optionalExpression(values.get('p1sprpriority'), document, 1), defenderSpritePriority: optionalExpression(values.get('p2sprpriority'), document, 0),
    attackerFacing: optionalExpression(values.get('p1facing'), document, 0), attackerGetDefenderFacing: optionalExpression(values.get('p1getp2facing'), document, 0), defenderFacing: optionalExpression(values.get('p2facing'), document, 0),
    attackerStateNumber: optionalExpression(values.get('p1stateno'), document, -1), defenderStateNumber: optionalExpression(values.get('p2stateno'), document, -1), defenderGetsAttackerState: optionalExpression(values.get('p2getp1state'), document, 1),
    forceStand: optionalExpression(values.get('forcestand'), document, 0), fall: optionalExpression(values.get('fall'), document, 0), airFall: optionalExpression(values.get('air.fall'), document, optionalExpression(values.get('fall'), document, 0)), forceNoFall: optionalExpression(values.get('forcenofall'), document, 0), airJuggle: optionalExpression(values.get('air.juggle'), document, 0), snap: values.get('snap') === undefined ? null : expressionPair(values.get('snap')!, document, 0), downBounce: optionalExpression(values.get('down.bounce'), document, 0), fallVelocity: Object.freeze([parsedExpression(values.get('fall.xvelocity'), document), optionalExpression(values.get('fall.yvelocity'), document, -4.5)]) as readonly [MugenExpression | null, MugenExpression], fallRecover: optionalExpression(values.get('fall.recover'), document, 1), fallRecoverTime: optionalExpression(values.get('fall.recovertime'), document, 4), fallDamage: optionalExpression(values.get('fall.damage'), document, 0), fallKill: optionalExpression(values.get('fall.kill'), document, 1), minimumDistance: values.get('mindist') === undefined ? null : expressionPair(values.get('mindist')!, document, 0), maximumDistance: values.get('maxdist') === undefined ? null : expressionPair(values.get('maxdist')!, document, 0), targetId: optionalExpression(values.get('id'), document, 0), chainId: optionalExpression(values.get('chainid'), document, -1), noChainIds: optionalExpressionPair(values.get('nochainid'), document, [-1, -1]), hitOnce: optionalExpression(values.get('hitonce'), document, attackAttribute.endsWith('T') ? 1 : 0), hitCount: optionalExpression(values.get('numhits'), document, 1),
    kill: optionalExpression(values.get('kill'), document, 1), guardKill: optionalExpression(values.get('guard.kill'), document, 1), output,
  });
}

function hitPriority(assignment: MugenAssignmentToken | undefined, document: MugenTextDocument): MugenHitDefTemplate['priority'] { if (assignment === undefined) return Object.freeze([numberExpression(4), 'hit']); const fields = splitTopLevel(assignment.value); if (fields.length < 1 || fields.length > 2 || fields[0] === '') failAssignment(document, assignment, 'MUGEN HitDef priority must contain priority and optional class.'); const className = asciiCaseFold(fields[1]?.trim() ?? 'hit'); if (className !== 'hit' && className !== 'miss' && className !== 'dodge') failAssignment(document, assignment, `Unsupported MUGEN HitDef priority class: ${fields[1]}.`); return Object.freeze([parseMugenExpression(fields[0]!, document, assignment), className]); }
function hitAffectTeam(assignment: MugenAssignmentToken | undefined, document: MugenTextDocument): MugenHitDefTemplate['affectTeam'] { const value = (assignment?.value ?? 'E').trim().toUpperCase(); if (value !== 'B' && value !== 'E' && value !== 'F') { if (assignment) failAssignment(document, assignment, `Unsupported MUGEN HitDef affectteam: ${assignment.value}.`); throw new TypeError('Invalid internal HitDef affectteam fallback.'); } return value; }

function optionalExpression(assignment: MugenAssignmentToken | undefined, document: MugenTextDocument, fallback: number | MugenExpression): MugenExpression { return assignment === undefined ? (typeof fallback === 'number' ? numberExpression(fallback) : fallback) : parseMugenExpression(assignment.value, document, assignment); }
function expressionPair(assignment: MugenAssignmentToken, document: MugenTextDocument, secondDefault: number): readonly [MugenExpression, MugenExpression] { const fields = splitTopLevel(assignment.value); if (fields.length < 1 || fields.length > 2 || fields.some(field => field.trim() === '')) failAssignment(document, assignment, `MUGEN ${assignment.key} must contain one or two expressions.`); return Object.freeze([parseMugenExpression(fields[0]!, document, assignment), fields[1] === undefined ? numberExpression(secondDefault) : parseMugenExpression(fields[1], document, assignment)]); }
function optionalExpressionPair(assignment: MugenAssignmentToken | undefined, document: MugenTextDocument, fallback: readonly [number, number] | readonly [MugenExpression, MugenExpression]): readonly [MugenExpression, MugenExpression] { if (assignment !== undefined) return expressionPair(assignment, document, 0); return Object.freeze([typeof fallback[0] === 'number' ? numberExpression(fallback[0]) : fallback[0], typeof fallback[1] === 'number' ? numberExpression(fallback[1]) : fallback[1]]); }
function optionalExpressionTriple(assignment: MugenAssignmentToken | undefined, document: MugenTextDocument, fallback: readonly [number, number, number]): readonly [MugenExpression, MugenExpression, MugenExpression] { if (assignment === undefined) return Object.freeze(fallback.map(numberExpression)) as readonly [MugenExpression, MugenExpression, MugenExpression]; const fields = splitTopLevel(assignment.value); if (fields.length !== 3 || fields.some(field => field.trim() === '')) failAssignment(document, assignment, `MUGEN ${assignment.key} must contain three expressions.`); return Object.freeze(fields.map(field => parseMugenExpression(field, document, assignment))) as readonly [MugenExpression, MugenExpression, MugenExpression]; }
function numberExpression(value: number): MugenExpression { const literal = Number.isInteger(value) ? mugenInt(value) : mugenFloat(value); if (literal.kind === 'bottom') throw new TypeError('Invalid internal expression fallback.'); return compileMugenExpression(Object.freeze({ kind: 'literal', value: literal })); }
function splitTopLevel(value: string): readonly string[] { const result: string[] = []; let depth = 0; let quote = ''; let start = 0; for (let index = 0; index < value.length; index += 1) { const character = value[index]!; if (quote !== '') { if (character === quote && value[index - 1] !== '\\') quote = ''; continue; } if (character === '"' || character === "'") quote = character; else if (character === '(') depth += 1; else if (character === ')') depth -= 1; else if (character === ',' && depth === 0) { result.push(value.slice(start, index).trim()); start = index + 1; } if (depth < 0) return Object.freeze([]); } if (depth !== 0 || quote !== '') return Object.freeze([]); result.push(value.slice(start).trim()); return Object.freeze(result); }

function tupleParameterArity(type: MugenControllerType, key: string): readonly [minimum: number, maximum: number] | null {
  if (type === 'remap-pal' && (key === 'source' || key === 'dest')) return [2, 2];
  if (type === 'super-pause' && key === 'sound') return [2, 2];
  if (type === 'env-color' && key === 'value') return [3, 3];
  if (PAIR_PARAMETERS.has(key) || type === 'width' && (key === 'value' || key === 'edge' || key === 'player') || type === 'var-random' && key === 'range') return [1, 2];
  if (key === 'alpha' || key === 'movecamera' || key === 'pos2') return [2, 2];
  if (key === 'add' || key === 'mul' || key === 'palfx.add' || key === 'palfx.mul' || key === 'palbright' || key === 'palcontrast' || key === 'palpostbright' || key === 'paladd' || key === 'palmul' || /^afterimage\.(?:palbright|palcontrast|palpostbright|paladd|palmul)$/u.test(key)) return [3, 3];
  // A number of WinMUGEN-era characters omit the period. MUGEN treats the
  // missing fourth field as the controller default rather than rejecting the
  // remaining PalFX fields.
  if (key === 'sinadd') return [3, 4];
  if (type === 'force-feedback' && (key === 'freq' || key === 'ampl')) return [1, 4];
  return null;
}

function flags(assignment: MugenAssignmentToken | undefined, fallback: string, allowed: ReadonlySet<string>, document: MugenTextDocument, label: string): string { const value = (assignment?.value ?? fallback).trim().toUpperCase(); if ([...value].some(flag => !allowed.has(flag))) { if (assignment) failAssignment(document, assignment, `Unsupported MUGEN HitDef ${label}: ${assignment.value}.`); throw new TypeError(`Invalid internal HitDef ${label} fallback.`); } return [...new Set(value)].sort().join(''); }
function groundHitType(assignment: MugenAssignmentToken | undefined, document: MugenTextDocument, fallback: MugenHitDefTemplate['groundHitType'] = 'high'): MugenHitDefTemplate['groundHitType'] { const value = asciiCaseFold(assignment?.value.trim() ?? fallback); if (value === 'high' || value === 'low' || value === 'trip' || value === 'none') return value; if (assignment) failAssignment(document, assignment, `Unsupported MUGEN hit type: ${assignment.value}.`); throw new TypeError('Invalid internal hit type fallback.'); }
function hitAnimationType(assignment: MugenAssignmentToken | undefined, fallback: MugenHitDefTemplate['animationType'], document: MugenTextDocument): MugenHitDefTemplate['animationType'] { const value = asciiCaseFold(assignment?.value.trim() ?? fallback); const normalized = value === 'med' ? 'medium' : value === 'diag-up' ? 'diagup' : value; if (normalized === 'light' || normalized === 'medium' || normalized === 'hard' || normalized === 'back' || normalized === 'up' || normalized === 'diagup') return normalized; if (assignment) failAssignment(document, assignment, `Unsupported MUGEN animation type: ${assignment.value}.`); throw new TypeError('Invalid internal animation type fallback.'); }
function prefixedExpression(assignment: MugenAssignmentToken | undefined, document: MugenTextDocument): Readonly<{ expression: MugenExpression | null; prefixed: boolean }> { if (assignment === undefined) return Object.freeze({ expression: null, prefixed: false }); const source = assignment.value.trim(); const prefixed = /^s/iu.test(source); return Object.freeze({ expression: parseMugenExpression(prefixed ? source.slice(1).trim() : source, document, assignment), prefixed }); }
function prefixedExpressionPair(assignment: MugenAssignmentToken | undefined, document: MugenTextDocument): Readonly<{ expressions: readonly [MugenExpression, MugenExpression] | null; prefixed: boolean }> { if (assignment === undefined) return Object.freeze({ expressions: null, prefixed: false }); const fields = splitTopLevel(assignment.value); if (fields.length !== 2) failAssignment(document, assignment, `MUGEN ${assignment.key} must contain group,item.`); const first = fields[0]!.trim(); const prefixed = /^s/iu.test(first); const expressions = Object.freeze([parseMugenExpression(prefixed ? first.slice(1).trim() : first, document, assignment), parseMugenExpression(fields[1]!, document, assignment)]) as readonly [MugenExpression, MugenExpression]; return Object.freeze({ expressions, prefixed }); }

function sectionAssignments(document: MugenTextDocument, section: MugenTextSection): readonly MugenAssignmentToken[] { return document.tokens.slice(section.tokenStart + 1, section.tokenEnd).filter((token): token is MugenAssignmentToken => token.kind === 'assignment'); }
function unique(document: MugenTextDocument, assignments: readonly MugenAssignmentToken[], allowed: ReadonlySet<string>, label: string): Map<string, MugenAssignmentToken> { const result = new Map<string, MugenAssignmentToken>(); for (const assignment of assignments) { if (!allowed.has(assignment.foldedKey)) failAssignment(document, assignment, `Unsupported MUGEN ${label} key: ${assignment.key}.`); if (result.has(assignment.foldedKey)) failAssignment(document, assignment, `Duplicate MUGEN ${label} key: ${assignment.key}.`); result.set(assignment.foldedKey, assignment); } return result; }
function parsedExpression(assignment: MugenAssignmentToken | undefined, document: MugenTextDocument): MugenExpression | null { return assignment === undefined ? null : parseMugenExpression(assignment.value, document, assignment); }
function expressionTuple(assignment: MugenAssignmentToken, document: MugenTextDocument, label: string): readonly [MugenExpression, MugenExpression] { const values = splitTopLevel(assignment.value); if (values.length < 1 || values.length > 2 || values.some(value => value === '')) failAssignment(document, assignment, `MUGEN ${label} must contain one or two expressions.`); return Object.freeze([parseMugenExpression(values[0]!, document, assignment), values[1] === undefined ? numberExpression(0) : parseMugenExpression(values[1], document, assignment)]); }
function optionalEnumAssignment(assignment: MugenAssignmentToken | undefined, allowed: ReadonlySet<string>, fallback: string, document: MugenTextDocument, key: string): string { if (!assignment) return fallback; const value = assignment.value.trim().toUpperCase(); if (!allowed.has(value)) failAssignment(document, assignment, `Invalid MUGEN StateDef ${key}: ${assignment.value}.`); return value; }
function booleanAssignment(assignment: MugenAssignmentToken, document: MugenTextDocument): boolean { const value = asciiCaseFold(assignment.value.trim()); if (value === '1' || value === 'true') return true; if (value === '0' || value === 'false') return false; failAssignment(document, assignment, `MUGEN boolean must be 0 or 1: ${assignment.value}.`); }
function boundedInteger(assignment: MugenAssignmentToken, minimum: number, maximum: number, document: MugenTextDocument, label: string): number { const value = Number(assignment.value); if (!Number.isSafeInteger(value) || value < minimum || value > maximum) failAssignment(document, assignment, `MUGEN ${label} must be an integer from ${minimum} to ${maximum}.`); return value; }
function stateNumber(value: string, document: MugenTextDocument, section: MugenTextSection): number { const number = Number(value); if (!Number.isSafeInteger(number) || number < -2_147_483_648 || number > 2_147_483_647) failSection(document, section, `Invalid MUGEN state number: ${value}.`); return number; }

const KNOWN_IGNORED_PARAMETER_TYPOS = new Set(['scadle', 'triggeeall', 'troggerall', 'trrigge5']);
const KNOWN_IGNORED_CONTROLLER_PARAMETERS: Partial<Readonly<Record<MugenControllerType, ReadonlySet<string>>>> = Object.freeze({
  'assert-special': new Set(['pausemovetime', 'supermovetime']),
  helper: new Set(['bindtime', 'removetime']),
  'remove-explod': new Set(['pausemovetime', 'supermovetime']),
});
function failAssignment(document: MugenTextDocument, assignment: MugenAssignmentToken, message: string): never { failMugen(mugenDiagnostic('E_MUGEN_CNS_SYNTAX', 'cns', 'error', 'release-resource', message, { canonicalPath: document.canonicalPath, sourceSha256: document.sourceSha256, byteOffset: assignment.valueSpan.startByte, line: assignment.valueSpan.line, column: assignment.valueSpan.column, key: assignment.key })); }
function failUnsupported(document: MugenTextDocument, assignment: MugenAssignmentToken, message: string): never { failMugen(mugenDiagnostic('E_MUGEN_UNSUPPORTED_FEATURE', 'classification', 'error', 'release-resource', message, { canonicalPath: document.canonicalPath, sourceSha256: document.sourceSha256, byteOffset: assignment.valueSpan.startByte, line: assignment.valueSpan.line, column: assignment.valueSpan.column, key: assignment.key })); }
function failUnsupportedSection(document: MugenTextDocument, section: MugenTextSection, message: string): never { failMugen(mugenDiagnostic('E_MUGEN_UNSUPPORTED_FEATURE', 'classification', 'error', 'release-resource', message, { canonicalPath: document.canonicalPath, sourceSha256: document.sourceSha256, byteOffset: section.header.span.startByte, line: section.header.span.line, column: section.header.span.column, section: section.name })); }
function failSection(document: MugenTextDocument, section: MugenTextSection, message: string): never { failMugen(mugenDiagnostic('E_MUGEN_CNS_SYNTAX', 'cns', 'error', 'release-resource', message, { canonicalPath: document.canonicalPath, sourceSha256: document.sourceSha256, byteOffset: section.header.span.startByte, line: section.header.span.line, column: section.header.span.column, section: section.name })); }

const STATE_DEF_KEYS = new Set(['type', 'movetype', 'physics', 'anim', 'velset', 'ctrl', 'poweradd', 'juggle', 'facep2', 'hitdefpersist', 'movehitpersist', 'hitcountpersist', 'sprpriority']);
const PHYSICS_CONSTANT_KEYS = new Set(['yaccel', 'stand.friction', 'crouch.friction']);
const STATE_TYPES = new Set(['S', 'C', 'A', 'L', 'U']); const MOVE_TYPES = new Set(['I', 'A', 'H', 'U']); const PHYSICS_TYPES = new Set(['N', 'S', 'C', 'A', 'U']);
const CONTROLLER_TYPES = new Map<string, MugenControllerType>([
  ['changestate', 'change-state'], ['selfstate', 'self-state'], ['changeanim', 'change-anim'], ['changeanim2', 'change-anim2'],
  ['velset', 'vel-set'], ['veladd', 'vel-add'], ['velmul', 'vel-mul'], ['posset', 'pos-set'], ['posadd', 'pos-add'], ['posfreeze', 'pos-freeze'],
  ['ctrlset', 'ctrl-set'], ['statetypeset', 'state-type-set'], ['turn', 'turn'], ['width', 'width'], ['sprpriority', 'spr-priority'],
  ['varset', 'var-set'], ['varadd', 'var-add'], ['varrandom', 'var-random'], ['varrangeset', 'var-range-set'],
  ['assertspecial', 'assert-special'],
  ['afterimage', 'after-image'], ['afterimagetime', 'after-image-time'], ['allpalfx', 'all-pal-fx'], ['angleadd', 'angle-add'], ['angledraw', 'angle-draw'], ['anglemul', 'angle-mul'], ['angleset', 'angle-set'], ['appendtoclipboard', 'append-to-clipboard'], ['bgpalfx', 'bg-pal-fx'], ['clearclipboard', 'clear-clipboard'], ['displaytoclipboard', 'display-to-clipboard'],
  ['envcolor', 'env-color'], ['envshake', 'env-shake'], ['fallenvshake', 'fall-env-shake'], ['forcefeedback', 'force-feedback'], ['gamemakeanim', 'game-make-anim'], ['makedust', 'make-dust'], ['offset', 'offset'], ['palfx', 'pal-fx'], ['pause', 'pause'], ['remappal', 'remap-pal'], ['screenbound', 'screen-bound'], ['sndpan', 'snd-pan'], ['superpause', 'super-pause'], ['trans', 'trans'], ['victoryquote', 'victory-quote'],
  ['attackdist', 'attack-dist'], ['attackmulset', 'attack-mul-set'], ['defencemulset', 'defence-mul-set'], ['hitadd', 'hit-add'], ['hitby', 'hit-by'], ['nothitby', 'not-hit-by'], ['hitdef', 'hit-def'], ['hitfalldamage', 'hit-fall-damage'], ['hitfallset', 'hit-fall-set'], ['hitfallvel', 'hit-fall-vel'], ['hitoverride', 'hit-override'], ['hitvelset', 'hit-vel-set'], ['reversaldef', 'reversal-def'], ['playerpush', 'player-push'], ['lifeadd', 'life-add'], ['lifeset', 'life-set'], ['poweradd', 'power-add'], ['powerset', 'power-set'],
  ['targetbind', 'target-bind'], ['targetdrop', 'target-drop'], ['targetfacing', 'target-facing'], ['targetlifeadd', 'target-life-add'], ['targetpoweradd', 'target-power-add'], ['targetstate', 'target-state'], ['targetveladd', 'target-vel-add'], ['targetvelset', 'target-vel-set'],
  ['bindtoparent', 'bind-to-parent'], ['bindtoroot', 'bind-to-root'], ['bindtotarget', 'bind-to-target'], ['destroyself', 'destroy-self'],
  ['explod', 'explod'], ['explodbindtime', 'explod-bind-time'], ['helper', 'helper'], ['modifyexplod', 'modify-explod'],
  ['parentvaradd', 'parent-var-add'], ['parentvarset', 'parent-var-set'], ['projectile', 'projectile'], ['removeexplod', 'remove-explod'],
  ['movehitreset', 'move-hit-reset'], ['gravity', 'gravity'], ['playsnd', 'play-snd'], ['stopsnd', 'stop-snd'], ['null', 'null'],
]);
const HITDEF_PARAMETERS = new Set<string>(['attr', 'affectteam', 'damage', 'hitflag', 'guardflag', 'priority', 'animtype', 'air.animtype', 'fall.animtype', 'ground.type', 'air.type', 'pausetime', 'guard.pausetime', 'ground.slidetime', 'guard.slidetime', 'ground.hittime', 'guard.hittime', 'air.hittime', 'airguard.hittime', 'guard.ctrltime', 'airguard.ctrltime', 'guard.dist', 'yaccel', 'ground.velocity', 'air.velocity', 'guard.velocity', 'airguard.velocity', 'down.velocity', 'down.hittime', 'down.bounce', 'ground.cornerpush.veloff', 'air.cornerpush.veloff', 'down.cornerpush.veloff', 'guard.cornerpush.veloff', 'airguard.cornerpush.veloff', 'air.juggle', 'mindist', 'maxdist', 'snap', 'p1sprpriority', 'p2sprpriority', 'p1facing', 'p1getp2facing', 'p2facing', 'p1stateno', 'p2stateno', 'p2getp1state', 'forcestand', 'fall', 'air.fall', 'forcenofall', 'fall.xvelocity', 'fall.yvelocity', 'fall.recover', 'fall.recovertime', 'fall.damage', 'fall.kill', 'id', 'chainid', 'nochainid', 'hitonce', 'numhits', 'getpower', 'givepower', 'kill', 'guard.kill', 'sparkno', 'guard.sparkno', 'sparkxy', 'hitsound', 'guardsound', 'envshake.time', 'envshake.freq', 'envshake.ampl', 'envshake.phase', 'fall.envshake.time', 'fall.envshake.freq', 'fall.envshake.ampl', 'fall.envshake.phase', 'palfx.time', 'palfx.mul', 'palfx.add']);
const EXPLOD_PARAMETERS = new Set<string>(['anim', 'id', 'space', 'pos', 'facing', 'vfacing', 'bindid', 'bindtime', 'vel', 'velocity', 'accel', 'removetime', 'supermove', 'supermovetime', 'pausemovetime', 'scale', 'angle', 'yangle', 'xangle', 'sprpriority', 'ontop', 'shadow', 'ownpal', 'remappal', 'removeongethit', 'trans', 'alpha', 'postype', 'random']);
const HELPER_PARAMETERS = new Set<string>(['helpertype', 'name', 'id', 'pos', 'postype', 'facing', 'stateno', 'keyctrl', 'ownpal', 'remappal', 'supermovetime', 'pausemovetime', 'scale', 'sprpriority', 'size.xscale', 'size.yscale', 'size.ground.back', 'size.ground.front', 'size.air.back', 'size.air.front', 'size.height', 'size.proj.doscale', 'size.head.pos', 'size.mid.pos', 'size.shadowoffset']);
const PROJECTILE_PARAMETERS = new Set<string>([...HITDEF_PARAMETERS, 'projid', 'projanim', 'projhitanim', 'projremanim', 'projcancelanim', 'projscale', 'projremove', 'projremovetime', 'velocity', 'remvelocity', 'accel', 'velmul', 'projhits', 'projmisstime', 'projpriority', 'projsprpriority', 'projedgebound', 'projstagebound', 'projheightbound', 'offset', 'postype', 'projshadow', 'supermovetime', 'pausemovetime', 'ownpal', 'remappal', 'afterimage.time', 'afterimage.length', 'afterimage.palcolor', 'afterimage.palinvertall', 'afterimage.palbright', 'afterimage.palcontrast', 'afterimage.palpostbright', 'afterimage.paladd', 'afterimage.palmul', 'afterimage.timegap', 'afterimage.framegap', 'afterimage.trans']);
const PAIR_PARAMETERS = new Set<string>(['pos', 'vel', 'accel', 'scale', 'remappal', 'random', 'size.head.pos', 'size.mid.pos', 'velocity', 'remvelocity', 'velmul', 'projscale', 'projheightbound', 'offset']);
const LITERAL_PARAMETERS = new Set<string>(['space', 'postype', 'helpertype', 'name', 'trans', 'text', 'waveform']);
const PREFIXED_RESOURCE_PARAMETERS = new Set<string>(['anim', 'projanim', 'projhitanim', 'projremanim', 'projcancelanim']);
const ASSERT_SPECIAL_PARAMETERS = new Set<string>(['flag', 'flag2', 'flag3']);
const ASSERT_SPECIAL_FLAGS = new Set<string>(['intro', 'invisible', 'roundnotover', 'nobardisplay', 'nobg', 'nofg', 'nostandguard', 'nocrouchguard', 'noairguard', 'noautoturn', 'nojugglecheck', 'nokosnd', 'nokoslow', 'noshadow', 'globalnoshadow', 'nomusic', 'nowalk', 'timerfreeze', 'unguardable']);
const FORCE_FEEDBACK_WAVEFORMS = new Set<string>(['sine', 'square', 'sinesquare', 'off']);
const TRANSPARENCY_MODES = new Set<string>(['default', 'none', 'add', 'addalpha', 'add1', 'sub']);
const AFTER_IMAGE_TRANSPARENCY_MODES = new Set<string>(['none', 'add', 'add1', 'sub']);
const PALETTE_EFFECT_PARAMETERS = new Set<string>(['time', 'add', 'mul', 'sinadd', 'invertall', 'color']);
const AFTER_IMAGE_PARAMETERS = new Set<string>(['time', 'length', 'palcolor', 'palinvertall', 'palbright', 'palcontrast', 'palpostbright', 'paladd', 'palmul', 'timegap', 'framegap', 'trans']);
const CHARACTER_ATTRIBUTE_KEYS = new Set(['defence', 'airjuggle']);
const CHARACTER_CONSTANT_SECTIONS = new Set(['data', 'size', 'velocity', 'movement']);
const CONTROLLER_PARAMETERS: Readonly<Record<MugenControllerType, ReadonlySet<string>>> = Object.freeze({
  'change-state': new Set(['value', 'ctrl', 'anim']), 'self-state': new Set(['value', 'ctrl', 'anim']),
  'change-anim': new Set(['value', 'elem', 'ctrl']), 'change-anim2': new Set(['value', 'elem', 'ctrl']),
  'vel-set': new Set(['x', 'y']), 'vel-add': new Set(['x', 'y']), 'vel-mul': new Set(['x', 'y']),
  'pos-set': new Set(['x', 'y']), 'pos-add': new Set(['x', 'y', 'value']), 'pos-freeze': new Set(['value', 'x', 'y']),
  'ctrl-set': new Set(['value']), 'state-type-set': new Set(['statetype', 'movetype', 'physics']), turn: new Set<string>(), width: new Set(['value', 'edge', 'player']), 'spr-priority': new Set(['value']),
  'var-set': new Set(['v', 'fv', 'value']), 'var-add': new Set(['v', 'fv', 'value']), 'var-random': new Set(['v', 'range']), 'var-range-set': new Set(['first', 'last', 'value', 'fvalue']),
  'assert-special': ASSERT_SPECIAL_PARAMETERS,
  'after-image': AFTER_IMAGE_PARAMETERS, 'after-image-time': new Set(['time', 'value']),
  'append-to-clipboard': new Set(['text', 'params']), 'display-to-clipboard': new Set(['text', 'params']),
  'all-pal-fx': PALETTE_EFFECT_PARAMETERS, 'angle-add': new Set(['value']), 'angle-draw': new Set(['value', 'scale']), 'angle-mul': new Set(['value']), 'angle-set': new Set(['value']),
  'bg-pal-fx': PALETTE_EFFECT_PARAMETERS, 'clear-clipboard': new Set<string>(), 'env-color': new Set(['value', 'time', 'under']), offset: new Set(['x', 'y']), 'pal-fx': PALETTE_EFFECT_PARAMETERS, pause: new Set(['time', 'movetime', 'endcmdbuftime', 'pausebg']), 'remap-pal': new Set(['source', 'dest']), 'snd-pan': new Set(['channel', 'pan', 'abspan']), 'super-pause': new Set(['time', 'movetime', 'anim', 'sound', 'pos', 'darken', 'p2defmul', 'poweradd', 'unhittable']), 'victory-quote': new Set(['value']),
  'env-shake': new Set(['time', 'freq', 'ampl', 'phase']), 'fall-env-shake': new Set<string>(),
  'force-feedback': new Set(['waveform', 'time', 'freq', 'ampl', 'self']),
  'game-make-anim': new Set(['value', 'under', 'pos', 'random']), 'make-dust': new Set(['pos', 'pos2', 'spacing']),
  'screen-bound': new Set(['value', 'movecamera']), trans: new Set(['trans', 'alpha']),
  'attack-dist': new Set(['value']), 'attack-mul-set': new Set(['value']), 'defence-mul-set': new Set(['value']), 'hit-add': new Set(['value']),
  'hit-by': new Set(['value', 'value2', 'time']), 'not-hit-by': new Set(['value', 'value2', 'time']), 'hit-def': HITDEF_PARAMETERS, 'hit-override': new Set(['attr', 'stateno', 'slot', 'time', 'forceair']), 'life-add': new Set(['value', 'kill', 'absolute']), 'life-set': new Set(['value']), 'power-add': new Set(['value']), 'power-set': new Set(['value']),
  'hit-fall-damage': new Set<string>(), 'hit-fall-set': new Set(['value', 'xvel', 'yvel']), 'hit-fall-vel': new Set<string>(), 'hit-vel-set': new Set(['x', 'y']), 'player-push': new Set(['value']),
  'reversal-def': new Set(['reversal.attr', 'pausetime', 'sparkno', 'sparkxy', 'hitsound', 'p1stateno', 'p2stateno', 'p1sprpriority', 'p2sprpriority', 'numhits']),
  'target-bind': new Set(['time', 'id', 'pos']), 'target-drop': new Set(['excludeid', 'keepone']), 'target-facing': new Set(['value', 'id']), 'target-life-add': new Set(['value', 'id', 'kill', 'absolute']), 'target-power-add': new Set(['value', 'id']), 'target-state': new Set(['value', 'id', 'ctrl']), 'target-vel-add': new Set(['x', 'y', 'id']), 'target-vel-set': new Set(['x', 'y', 'id']),
  'bind-to-parent': new Set(['time', 'facing', 'pos']), 'bind-to-root': new Set(['time', 'facing', 'pos']), 'bind-to-target': new Set(['time', 'id', 'pos', 'postype']), 'destroy-self': new Set(['recursive', 'removeexplods']),
  explod: EXPLOD_PARAMETERS, 'explod-bind-time': new Set(['id', 'time']), helper: HELPER_PARAMETERS, 'modify-explod': EXPLOD_PARAMETERS, 'parent-var-add': new Set(['v', 'fv', 'value']), 'parent-var-set': new Set(['v', 'fv', 'value']), projectile: PROJECTILE_PARAMETERS, 'remove-explod': new Set(['id']),
  'move-hit-reset': new Set<string>(), gravity: new Set<string>(), 'play-snd': new Set(['value', 'channel', 'volume', 'volumescale', 'lowpriority', 'pan', 'abspan', 'freqmul', 'loop']), 'stop-snd': new Set(['channel']), null: new Set(['text', 'params', 'supermovetime', 'pausemovetime']),
});
const REQUIRED_PARAMETERS: Readonly<Record<MugenControllerType, readonly string[]>> = Object.freeze({
  'change-state': ['value'], 'self-state': ['value'], 'change-anim': ['value'], 'change-anim2': ['value'],
  'vel-set': [], 'vel-add': [], 'vel-mul': [], 'pos-set': [], 'pos-add': [], 'pos-freeze': [], 'ctrl-set': ['value'], 'state-type-set': [], turn: [], width: [], 'spr-priority': ['value'],
  'var-set': ['value'], 'var-add': ['value'], 'var-random': ['v'], 'var-range-set': [], 'hit-by': [], 'not-hit-by': [], 'hit-def': [], 'hit-override': [], 'life-add': ['value'], 'life-set': ['value'], 'power-add': ['value'], 'power-set': ['value'],
  'assert-special': [],
  'after-image': [], 'after-image-time': [], 'all-pal-fx': [], 'angle-add': ['value'], 'angle-draw': [], 'angle-mul': ['value'], 'angle-set': ['value'], 'append-to-clipboard': [], 'bg-pal-fx': [], 'clear-clipboard': [], 'display-to-clipboard': [], 'env-color': [], offset: [], pause: [], 'remap-pal': ['source.0', 'source.1', 'dest.0', 'dest.1'], 'snd-pan': ['channel'], 'super-pause': [], 'victory-quote': [],
  'env-shake': ['time'], 'fall-env-shake': [], 'force-feedback': [], 'game-make-anim': [], 'make-dust': [], 'pal-fx': [], 'screen-bound': [], trans: [],
  'attack-dist': ['value'], 'attack-mul-set': ['value'], 'defence-mul-set': ['value'], 'hit-add': ['value'], 'hit-fall-damage': [], 'hit-fall-set': [], 'hit-fall-vel': [], 'hit-vel-set': [], 'player-push': ['value'],
  'reversal-def': [],
  'target-bind': [], 'target-drop': [], 'target-facing': ['value'], 'target-life-add': ['value'], 'target-power-add': ['value'], 'target-state': ['value'], 'target-vel-add': [], 'target-vel-set': [],
  'bind-to-parent': [], 'bind-to-root': [], 'bind-to-target': [], 'destroy-self': [], explod: ['anim'], 'explod-bind-time': [], helper: [], 'modify-explod': [], 'parent-var-add': ['value'], 'parent-var-set': ['value'], projectile: [], 'remove-explod': [],
  'move-hit-reset': [], gravity: [], 'play-snd': ['group', 'item'], 'stop-snd': ['channel'], null: [],
});
const HITDEF_STATES = new Set<string>(['S', 'C', 'A']); const ATTACK_ATTRIBUTES = new Set<string>(['NA', 'SA', 'HA', 'NP', 'SP', 'HP', 'NT', 'ST', 'HT']); const HIT_FLAGS = new Set<string>(['H', 'L', 'M', 'A', 'F', 'D', '+', '-']); const GUARD_FLAGS = new Set<string>(['M', 'H', 'L', 'A']);
