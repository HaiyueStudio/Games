export type MugenTriggerImplementation = 'native' | 'strict-import-failure';

export interface MugenTriggerLedgerEntry {
  readonly name: string;
  readonly implementation: MugenTriggerImplementation;
  readonly owner: string;
}

/**
 * Generated from the frozen MUGEN 1.1b1 trigger census. Keep the catalog names
 * in official-document order so the milestone artifact remains reviewable.
 */
export const MUGEN_TRIGGER_LEDGER = Object.freeze([
  ...native(['Alive', 'Anim', 'AnimElem', 'AnimElemTime', 'AnimTime'], 'g02-trigger-redirection-order'),
  ...native(['CanRecover'], 'g04-combat-hit-throw-custom-state'),
  ...native(['Command', 'Ctrl', 'Facing', 'FVar'], 'g02-trigger-redirection-order'),
  ...native(['GetHitVar'], 'g04-combat-hit-throw-custom-state'),
  ...native(['HitCount'], 'g02-trigger-redirection-order'),
  ...native(['HitDefAttr', 'HitFall', 'HitOver'], 'g04-combat-hit-throw-custom-state'),
  ...native(['HitPauseTime', 'HitShakeOver', 'HitVel', 'InGuardDist', 'Life', 'LifeMax', 'MoveContact', 'MoveGuarded', 'MoveHit'], 'g02-trigger-redirection-order'),
  ...native(['MoveReversed'], 'g04-combat-hit-throw-custom-state'),
  ...native(['MoveType'], 'g02-trigger-redirection-order'),
  ...native(['NumTarget', 'P2BodyDist'], 'g04-combat-hit-throw-custom-state'),
  ...native(['P2Dist', 'Pos', 'Power', 'PowerMax'], 'g02-trigger-redirection-order'),
  ...native(['PrevStateNo'], 'g04-combat-hit-throw-custom-state'),
  ...native(['Random', 'RoundNo', 'RoundState', 'StateNo', 'StateType', 'Time'], 'g02-trigger-redirection-order'),
  ...native(['UniqHitCount'], 'g04-combat-hit-throw-custom-state'),
  ...native(['Var', 'Vel'], 'g02-trigger-redirection-order'),
  ...native(['ID', 'IsHelper', 'NumExplod', 'NumHelper', 'NumProj', 'NumProjID', 'ParentDist', 'PlayerIDExist', 'ProjCancelTime', 'ProjContact', 'ProjContactTime', 'ProjGuarded', 'ProjGuardedTime', 'ProjHit', 'ProjHitTime', 'RootDist', 'ScreenPos', 'SelfAnimExist'], 'g05-helper-projectile-explod-target'),
  ...native(['P2Life', 'P2MoveType', 'P2StateNo', 'P2StateType', 'Win'], 'g08-character-parity-acceptance'),
  ...native(['PalNo'], 'g07c-character-native-script-common-state'),
  ...native(['AnimElemNo', 'AnimExist', 'TimeMod'], 'g08-character-parity-acceptance'),
  ...native(['Abs', 'Acos', 'Asin', 'Atan', 'Ceil', 'Cond', 'Cos', 'E', 'Exp', 'Floor', 'IfElse', 'Ln', 'Log', 'Pi', 'Sin', 'Tan'], 'g01-expression-compiler-vm'),
  ...native(['AILevel'], 'g07-command-common-state-ai-closure'),
  ...native(['AuthorName', 'BackEdgeBodyDist', 'BackEdgeDist', 'FrontEdgeBodyDist', 'FrontEdgeDist', 'GameTime', 'MatchOver', 'Name', 'NumEnemy', 'P2Name', 'P4Name', 'RoundsExisted', 'SysVar', 'TeamMode', 'TeamSide'], 'g07b-petra-trigger-expression-closure'),
  ...native(['CameraPos', 'Const', 'Const240p', 'Const480p', 'Const720p'], 'g07c-character-native-script-common-state'),
  ...native(['BackEdge', 'BottomEdge', 'CameraZoom', 'DrawGame', 'FrontEdge', 'GameHeight', 'GameWidth', 'IsHomeTeam', 'LeftEdge', 'Lose', 'MatchNo', 'NumPartner', 'P1Name', 'P3Name', 'RightEdge', 'ScreenHeight', 'ScreenWidth', 'StageVar', 'SysFVar', 'TicksPerSecond', 'TopEdge'], 'g08-character-parity-acceptance'),
] satisfies readonly MugenTriggerLedgerEntry[]);

export const MUGEN_TRIGGER_DISPATCH = Object.freeze([
  dispatch('AILevel', 'reference', ['ailevel']),
  dispatch('CanRecover', 'reference', ['canrecover']), dispatch('HitFall', 'reference', ['hitfall']), dispatch('HitOver', 'reference', ['hitover']), dispatch('UniqHitCount', 'reference', ['uniqhitcount']),
  dispatch('Alive', 'reference', ['alive']), dispatch('Anim', 'reference', ['anim']), dispatch('AnimElem', 'call', ['animelem']), dispatch('AnimElemTime', 'call', ['animelemtime']), dispatch('AnimTime', 'reference', ['animtime']), dispatch('Command', 'call', ['command']), dispatch('Ctrl', 'reference', ['ctrl']), dispatch('Facing', 'reference', ['facing']), dispatch('FVar', 'call', ['fvar']), dispatch('HitCount', 'reference', ['hitcount']), dispatch('HitPauseTime', 'reference', ['hitpausetime']), dispatch('HitShakeOver', 'reference', ['hitshakeover']), dispatch('HitVel', 'reference', ['hitvel.x', 'hitvel.y']), dispatch('InGuardDist', 'reference', ['inguarddist']), dispatch('Life', 'reference', ['life']), dispatch('LifeMax', 'reference', ['lifemax']), dispatch('MoveContact', 'reference', ['movecontact']), dispatch('MoveGuarded', 'reference', ['moveguarded']), dispatch('MoveHit', 'reference', ['movehit']), dispatch('MoveReversed', 'reference', ['movereversed']), dispatch('MoveType', 'reference', ['movetype']), dispatch('P2BodyDist', 'reference', ['p2bodydist.x', 'p2bodydist.y']), dispatch('P2Dist', 'reference', ['p2dist.x', 'p2dist.y']), dispatch('Pos', 'reference', ['pos.x', 'pos.y']), dispatch('Power', 'reference', ['power']), dispatch('PowerMax', 'reference', ['powermax']), dispatch('PrevStateNo', 'reference', ['prevstateno']), dispatch('Random', 'reference', ['random']), dispatch('RoundNo', 'reference', ['roundno']), dispatch('RoundState', 'reference', ['roundstate']), dispatch('StateNo', 'reference', ['stateno']), dispatch('StateType', 'reference', ['statetype']), dispatch('Time', 'reference', ['time', 'statetime']), dispatch('Var', 'call', ['var']), dispatch('Vel', 'reference', ['vel.x', 'vel.y']),
  dispatch('Abs', 'call', ['abs']), dispatch('Acos', 'call', ['acos']), dispatch('Asin', 'call', ['asin']), dispatch('Atan', 'call', ['atan']), dispatch('Ceil', 'call', ['ceil']), dispatch('Cond', 'call', ['cond']), dispatch('Cos', 'call', ['cos']), dispatch('E', 'reference', ['e']), dispatch('Exp', 'call', ['exp']), dispatch('Floor', 'call', ['floor']), dispatch('IfElse', 'call', ['ifelse']), dispatch('Ln', 'call', ['ln']), dispatch('Log', 'call', ['log']), dispatch('Pi', 'reference', ['pi']), dispatch('Sin', 'call', ['sin']), dispatch('Tan', 'call', ['tan']),
  dispatch('GetHitVar', 'call', ['gethitvar']), dispatch('HitDefAttr', 'call', ['hitdefattr']), dispatch('NumTarget', 'call', ['numtarget']),
  dispatch('ID', 'reference', ['id']), dispatch('IsHelper', 'both', ['ishelper']), dispatch('NumProj', 'reference', ['numproj']), dispatch('ParentDist', 'reference', ['parentdist.x', 'parentdist.y']), dispatch('RootDist', 'reference', ['rootdist.x', 'rootdist.y']),
  dispatch('ScreenPos', 'reference', ['screenpos.x', 'screenpos.y']),
  dispatch('NumExplod', 'call', ['numexplod']), dispatch('NumHelper', 'call', ['numhelper']), dispatch('NumProjID', 'call', ['numprojid']), dispatch('PlayerIDExist', 'call', ['playeridexist']),
  dispatch('ProjContact', 'call', ['projcontact']), dispatch('ProjGuarded', 'call', ['projguarded']), dispatch('ProjHit', 'call', ['projhit']), dispatch('ProjCancelTime', 'call', ['projcanceltime']), dispatch('ProjContactTime', 'call', ['projcontacttime']), dispatch('ProjGuardedTime', 'call', ['projguardedtime']), dispatch('ProjHitTime', 'call', ['projhittime']), dispatch('SelfAnimExist', 'call', ['selfanimexist']),
  dispatch('P2MoveType', 'reference', ['p2movetype']), dispatch('P2StateNo', 'reference', ['p2stateno']), dispatch('P2StateType', 'reference', ['p2statetype']), dispatch('Win', 'reference', ['win', 'winko', 'wintime', 'winperfect']),
  dispatch('P2Life', 'reference', ['p2life']), dispatch('AnimElemNo', 'call', ['animelemno']), dispatch('AnimExist', 'call', ['animexist']), dispatch('TimeMod', 'call', ['timemod']),
  dispatch('AuthorName', 'reference', ['authorname']), dispatch('BackEdgeBodyDist', 'reference', ['backedgebodydist']), dispatch('BackEdgeDist', 'reference', ['backedgedist']), dispatch('FrontEdgeBodyDist', 'reference', ['frontedgebodydist']), dispatch('FrontEdgeDist', 'reference', ['frontedgedist']), dispatch('GameTime', 'reference', ['gametime']), dispatch('MatchOver', 'reference', ['matchover']), dispatch('Name', 'reference', ['name']), dispatch('NumEnemy', 'reference', ['numenemy']), dispatch('P2Name', 'reference', ['p2name']), dispatch('P4Name', 'reference', ['p4name']), dispatch('RoundsExisted', 'reference', ['roundsexisted']), dispatch('SysVar', 'call', ['sysvar']), dispatch('TeamMode', 'reference', ['teammode']), dispatch('TeamSide', 'reference', ['teamside']),
  dispatch('CameraPos', 'reference', ['camerapos.x', 'camerapos.y']), dispatch('Const', 'call', ['const']), dispatch('Const240p', 'call', ['const240p']), dispatch('Const480p', 'call', ['const480p']), dispatch('Const720p', 'call', ['const720p']),
  dispatch('PalNo', 'reference', ['palno']),
  dispatch('BackEdge', 'reference', ['backedge']), dispatch('BottomEdge', 'reference', ['bottomedge']), dispatch('CameraZoom', 'reference', ['camerazoom']), dispatch('DrawGame', 'reference', ['drawgame']), dispatch('FrontEdge', 'reference', ['frontedge']), dispatch('GameHeight', 'reference', ['gameheight']), dispatch('GameWidth', 'reference', ['gamewidth']), dispatch('IsHomeTeam', 'reference', ['ishometeam']), dispatch('LeftEdge', 'reference', ['leftedge']), dispatch('Lose', 'reference', ['lose', 'loseko', 'losetime']), dispatch('MatchNo', 'reference', ['matchno']), dispatch('NumPartner', 'reference', ['numpartner']), dispatch('P1Name', 'reference', ['p1name']), dispatch('P3Name', 'reference', ['p3name']), dispatch('RightEdge', 'reference', ['rightedge']), dispatch('ScreenHeight', 'reference', ['screenheight']), dispatch('ScreenWidth', 'reference', ['screenwidth']), dispatch('StageVar', 'call', ['stagevar']), dispatch('SysFVar', 'call', ['sysfvar']), dispatch('TicksPerSecond', 'reference', ['tickspersecond']), dispatch('TopEdge', 'reference', ['topedge']),
]);

export const MUGEN_NATIVE_TRIGGER_REFERENCES: readonly string[] = Object.freeze(MUGEN_TRIGGER_DISPATCH.filter(entry => entry.syntax === 'reference' || entry.syntax === 'both').flatMap(entry => entry.tokens));
export const MUGEN_NATIVE_TRIGGER_CALLS: readonly string[] = Object.freeze(MUGEN_TRIGGER_DISPATCH.filter(entry => entry.syntax === 'call' || entry.syntax === 'both').flatMap(entry => entry.tokens));
export const MUGEN_STRICT_IMPORT_FAILURE_TRIGGERS: readonly string[] = Object.freeze(MUGEN_TRIGGER_LEDGER.filter(entry => entry.implementation === 'strict-import-failure').map(entry => entry.name));

const STRICT_FAILURE_PATTERNS = MUGEN_STRICT_IMPORT_FAILURE_TRIGGERS.map(name => Object.freeze({ name, pattern: new RegExp(`\\b${name}\\b`, 'iu') }));

export function findStrictImportFailureTrigger(source: string): string | null {
  let outsideStrings = ''; let quoted = false;
  for (let index = 0; index < source.length; index += 1) { const character = source[index]!; if (character === '"' && source[index - 1] !== '\\') quoted = !quoted; outsideStrings += quoted ? ' ' : character; }
  for (const entry of STRICT_FAILURE_PATTERNS) if (entry.pattern.test(outsideStrings)) return entry.name;
  return null;
}

function native(names: readonly string[], owner: string): readonly MugenTriggerLedgerEntry[] { return names.map(name => Object.freeze({ name, implementation: 'native' as const, owner })); }
function dispatch(name: string, syntax: 'reference' | 'call' | 'both', tokens: readonly string[]) { return Object.freeze({ name, syntax, tokens: Object.freeze(tokens) }); }
