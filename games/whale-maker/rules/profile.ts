import type { Level, Tile } from './model';

export interface RuleOptions { revision:1; rewards:'score'|'legacy-coins'; freezing:'timed'|'permanent';pipes?:'legacy'|'reference' }
export const REFERENCE_RULES:Readonly<RuleOptions>=Object.freeze({revision:1,rewards:'score',freezing:'timed',pipes:'reference'});
export const LEGACY_RULES:Readonly<RuleOptions>=Object.freeze({revision:1,rewards:'legacy-coins',freezing:'permanent'});
export const rulesFor=(level:Pick<Level,'rules'>):Readonly<RuleOptions>=>level.rules??LEGACY_RULES;
export const modernLevel=(level:Level):Level=>({...structuredClone(level),rules:{...REFERENCE_RULES}});
export function validRules(value:unknown):value is RuleOptions {
    if(!value||typeof value!=='object'||Array.isArray(value))return false;
    const p=value as RuleOptions;
    return Object.keys(p).every(k=>['revision','rewards','freezing','pipes'].includes(k))&&(p.pipes===undefined||p.pipes==='legacy'||p.pipes==='reference')&&p.revision===1&&['score','legacy-coins'].includes(p.rewards)&&['timed','permanent'].includes(p.freezing);
}
const extensions=new Set<string>(['^','spike-all','basin','firebar','vine','iron-turtle','giant-pearl','bridge','bridge-bell','turtle-boss','ice-flower','ice','quicksand','moving-platform','speed-belt','cannon-basic']);
export const elementOrigin=(tile:Tile):'3D基础'|'保留扩展'|'编辑工具'=>tile==='.'?'编辑工具':extensions.has(tile)?'保留扩展':'3D基础';

