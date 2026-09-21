import { boardWidth, cellName } from './topology';
import { regionIndex, regionLetter } from './extra-regions';
import { littleKillerPath, domainSumPossible } from './little-killer';
import type { Puzzle } from './rules';
interface HintRules { candidates: typeof import('./rules').candidates; units: typeof import('./rules').units; ledAllows: typeof import('./rules').ledAllows; exclusionCells: typeof import('./rules').exclusionCells; exclusionDigits: typeof import('./rules').exclusionDigits; neighbors: typeof import('./rules').neighbors; }
import { t, ruleCopy, type Language } from './i18n';
export interface HintStep {
  kind: 'candidates' | 'unit' | 'eliminate' | 'conclusion';
  title: string; text: string; cells: number[]; evidence: number[];
  eliminations: { cell: number; digits: number[] }[];
  candidateCell?: number;
  /** Verified domains at this proof step, including previously recorded deductions. */
  candidateMasks?: number[];
  candidates: number[];
}
export function lessonText(language: Language, zh: string, en: string, ja: string): string { return language === 'zh' ? zh : language === 'ja' ? ja : en; }
function basicPuzzle(p: Puzzle): Puzzle { return { ...p, options: {difficulty:p.options.difficulty,staircase:!!p.options.staircase,led:false,diagonal:false,missing:!!p.options.missing,killer:false,renban:false,consecutive:false}, cages:[], lines:[], dots:[] }; }
function unitName(p: Puzzle, unit: number[], language: Language, api: HintRules): string {
  const index=api.units(p).findIndex(u=>u.length===unit.length && u.every((v,i)=>v===unit[i]));
  const extra=p.options.extraRegion?regionIndex(p.extraRegions,unit):-1;
  if(extra>=0)return t(language,'extraRegionName',{name:regionLetter(extra)});
  if(p.options.antiKing&&unit.length===2)return lessonText(language,'无缘规则的斜角相邻两格','the two diagonal neighbors under the anti-king rule','アンチキングで斜め隣の 2 マス');
  if(index>=0&&index<boardWidth(p)*3) { const n=Math.floor(index/3)+1, kind=index%3;return lessonText(language,`第 ${n} ${['行','列','宫'][kind]}`,`${['row','column','box'][kind]} ${n}`,`${n} ${['行目','列目','番ブロック'][kind]}`); }
  return lessonText(language,index<29&&p.options.diagonal?'这条对角线':'这条斜线', 'this diagonal', 'この対角線');
}
interface Reason { id: string; text: string; evidence: number[]; }
/** A reason is accepted only when the corresponding public candidate predicate
 * rejects the digit. No answer, branching solver or hypothetical filled grid. */
function rejection(p: Puzzle, board: number[], i: number, d: number, language: Language, api: HintRules): Reason {
  const name=(i:number)=>cellName(p,i);
  const {units,candidates,ledAllows,exclusionCells,exclusionDigits,neighbors}=api;
  const say=(zh:string,en:string,ja:string)=>lessonText(language,zh,en,ja);
  const orderedUnits=units(p).map((u,n)=>({u,n})).sort((a,b)=>Number(b.n<boardWidth(p)*3&&b.n%3===2)-Number(a.n<boardWidth(p)*3&&a.n%3===2));
  for(const {u} of orderedUnits) if(u.includes(i)) {
    const peer=u.find(j=>j!==i&&board[j]===d);
    if(peer!==undefined) return {id:`peer:${peer}:${unitName(p,u,language,api)}`,evidence:[peer],text:say(`${unitName(p,u,language,api)}内，${name(peer)} 已经是 ${d}，这个区域不能再填相同数字。`,`${name(peer)} is already ${d} in ${unitName(p,u,language,api)}. This region cannot repeat it.`,`${unitName(p,u,language,api)} の ${name(peer)} は ${d} です。この領域では重複できません。`)};
  }
  if(p.options.nonConsecutive)for(const j of neighbors(i))if(!p.blocked[j]&&board[j]&&Math.abs(board[j]!-d)===1)return {id:`nonConsecutive:${j}`,evidence:[i,j],text:say(`${name(j)} 已填 ${board[j]}，与 ${name(i)} 上下或左右相邻。不连续规则禁止相差 1，所以 ${name(i)} 不能填 ${d}。`,`${name(j)} contains ${board[j]} and is orthogonally adjacent to ${name(i)}. The non-consecutive rule forbids a difference of 1, excluding ${d}.`,`${name(j)} は ${board[j]} で、${name(i)} の上下左右に隣接します。非連続ルールでは差が 1 にできないため、${d} を除外します。`)};
  if(p.options.inequality) for(const [a,b] of p.inequalities??[]) {
    if(i===a&&d>=(board[b]||9)||i===b&&d<=(board[a]||1)) {
      const other=i===a?b:a, bound=board[other]||(i===a?9:1), sign=i===a?'<':'>';
      const boundText=board[other]?`${name(other)} = ${bound}`:say(`空格 ${name(other)} ${i===a?'最大是 9':'最小是 1'}`,`${name(other)} is ${i===a?'at most 9':'at least 1'}`,`${name(other)} は${i===a?'最大 9':'最小 1'}`);
      return {id:`inequality:${a}:${b}`,evidence:[a,b],text:say(`${name(a)} < ${name(b)}，${boundText}。所以 ${name(i)} 必须 ${sign} ${bound}，不可能是 ${d}。`,`${name(a)} < ${name(b)} and ${boundText}. Thus ${name(i)} must be ${sign} ${bound}, ruling out ${d}.`,`${name(a)} < ${name(b)}、${boundText}。${name(i)} は ${sign} ${bound} なので ${d} は入りません。`)};
    }
  }
  if(p.options.led!==false&&!ledAllows(p.lights[i]!,d)) return {id:`led:${i}`,evidence:[i],text:say(`数字 ${d} 缺少 ${name(i)} 已亮起的灯段，因此不能匹配。暗灯段不用于排除。`,`Digit ${d} lacks a lit segment at ${name(i)}. Dark segments impose no restriction.`,`${d} は ${name(i)} の点灯部分を含まないため除外します。暗い部分は不明です。`)};
  if(p.options.parity&&p.parity?.[i]&&(d%2?1:2)!==p.parity[i]) return {id:`parity:${i}`,evidence:[i],text:say(`${name(i)} 的底色要求${p.parity[i]===1?'奇':'偶'}数，${d} 不符合。`,`${name(i)} requires an ${p.parity[i]===1?'odd':'even'} digit; ${d} has the wrong parity.`,`${name(i)} は${p.parity[i]===1?'奇':'偶'}数のマスなので ${d} は入りません。`)};
  if(p.options.exclusion) for(const e of p.exclusions??[]) if(exclusionCells(e.at).includes(i)&&exclusionDigits(e).includes(d)) return {id:`exclusion:${e.at}`,evidence:exclusionCells(e.at),text:say(`高亮交点排除 ${exclusionDigits(e).join('、')}，周围四格都不能填 ${d}。`,`The highlighted circle excludes ${exclusionDigits(e).join(', ')} from its four cells, including ${d}.`,`丸の表示により周囲 4 マスから ${exclusionDigits(e).join('・')} を除外するため、${d} は入りません。`)};
  // Isolate each remaining rule family to name the actual rejecting constraint,
  // instead of attaching every enabled rule to every explanation.
  if(p.options.littleKiller)for(const clue of p.littleKillers??[]) {
    const path=littleKillerPath(clue);if(!path.includes(i))continue;
    const other=path.filter(j=>j!==i),masks=other.map(j=>{if(board[j])return 1<<(board[j]!-1);let mask=511;for(const peer of new Set(units(p).filter(u=>u.includes(j)).flat()))if(peer!==j){const digit=peer===i?d:board[peer];if(digit)mask&=~(1<<(digit-1));}return mask;});
    if(domainSumPossible(masks,clue.sum-d))continue;
    const fixed=other.reduce((sum,j)=>sum+board[j]!,0),rest=clue.sum-fixed-d;
    const domains=other.map((j,n)=>`${name(j)}={${Array.from({length:9},(_,k)=>k+1).filter(k=>masks[n]!&1<<(k-1)).join(',')}}`).join('; ');
    return {id:`littleKiller:${clue.side}:${clue.index}:${d}`,evidence:path,text:say(`小杀手箭头经过 ${path.map(name).join(' → ')}，总和为 ${clue.sum}。其他已填数字之和为 ${fixed}。若 ${name(i)}=${d}，剩余空格必须合计 ${clue.sum}−${fixed}−${d}=${rest}。按行、列、宫等互异规则，其他格允许 ${domains}；这些候选没有任何组合能凑出所需总和，所以排除 ${d}。`,`The little killer arrow follows ${path.map(name).join(' → ')} and totals ${clue.sum}. Other filled digits sum to ${fixed}. If ${name(i)}=${d}, remaining blanks must sum to ${clue.sum}−${fixed}−${d}=${rest}. Other cells allow ${domains} under the all-different rules; no combination reaches the required total, ruling out ${d}.`,`矢印の経路は ${path.map(name).join(' → ')}、合計は ${clue.sum}。他の入力済み数字の和は ${fixed}。${name(i)}=${d} なら残りは ${clue.sum}−${fixed}−${d}=${rest} が必要です。他のマスは ${domains} ですが、必要な合計を作れないため ${d} を除外します。`)};
  }
  const kinds=['killer','renban','consecutive','thermometer','skyscraper','xv','quadruple'] as const;
  for(const key of kinds) if(p.options[key]) {
    const isolated=basicPuzzle(p);isolated.options[key]=true;isolated.options.diagonal=p.options.diagonal;isolated.options.multiDiagonal=!!p.options.multiDiagonal;isolated.options.extraRegion=!!p.options.extraRegion;
    if(key==='killer') isolated.cages=p.cages;
    if(key==='renban') isolated.lines=p.lines;
    if(key==='consecutive') isolated.dots=p.dots;
    const values=candidates(isolated,board,i);
    if(values.includes(d))continue;
    const groups=key==='killer'?p.cages.filter(c=>c.cells.includes(i)).map(c=>c.cells):key==='renban'?p.lines.filter(l=>l.includes(i)):key==='thermometer'?(p.thermometers??[]).filter(l=>l.includes(i)):key==='quadruple'?(p.fourSums??[]).filter(s=>exclusionCells(s.at).includes(i)).map(s=>exclusionCells(s.at)):key==='skyscraper'?units(p).filter((u,n)=>n<27&&n%3!==2&&u.includes(i)):[[i,...neighbors(i).filter(j=>!p.blocked[j])]];
    const evidence=[...new Set(groups.flat())], rule=ruleCopy(language,key);
    const given=evidence.filter(j=>board[j]).map(j=>`${name(j)}=${board[j]}`).join(', ');
    const extra=key==='killer'?p.cages.filter(c=>c.cells.includes(i)).map(c=>`Σ ${c.sum}`).join(', '):key==='quadruple'?(p.fourSums??[]).filter(s=>exclusionCells(s.at).includes(i)).map(s=>`Σ ${s.sum}`).join(', '):'';
    return {id:`${key}:${i}`,evidence,text:say(`${rule[0]}：${rule[1]} ${extra}${given?` 已知 ${given}。`:''} 按这条规则，${name(i)} 当前允许 ${values.join('、')||'无'}，因此排除 ${d}。`,`${rule[0]}: ${rule[1]} ${extra}${given?` Known: ${given}.`:''} This rule allows ${values.join(', ')||'no digits'} at ${name(i)}, excluding ${d}.`,`${rule[0]}：${rule[1]} ${extra}${given?` 既知：${given}。`:''} このルールで ${name(i)} に入るのは ${values.join('・')||'なし'} なので、${d} を除外します。`)};
  }
  throw new Error(`Missing hint justification: ${name(i)} != ${d}`);
}
export function buildHintSteps(p: Puzzle, board: number[], cell: number, value: number, unit: number[] | undefined, language: Language, api: HintRules): HintStep[] {
  const name=(i:number)=>cellName(p,i);
  const {candidates,units}=api;
  const say=(zh:string,en:string,ja:string)=>lessonText(language,zh,en,ja), basic=basicPuzzle(p);
  const base=candidates(basic,board,cell), peers=units(basic).filter(u=>u.includes(cell)).flat();
  const filled=[...new Set(peers)].filter(i=>board[i]);
  const seen=[...new Set(filled.map(i=>board[i]!))].sort();
  const steps:HintStep[]=[{kind:'candidates',title:say('先找基础候选','Start with basic candidates','基本候補を確認'),text:say(`先看 ${name(cell)}。同行、同列、同宫已有 ${seen.join('、')||'无数字'}，排除后候选是 ${base.join('、')}。${base.length===1?'仅靠基础规则就已确定这个数字。':'这里只用了基础规则，还不能直接确定答案。'}`,`Look at ${name(cell)}. Its row, column and box contain ${seen.join(', ')||'no digits'}, leaving ${base.join(', ')}. These are basic candidates before extra rules.`,`${name(cell)} の行・列・ブロックには ${seen.join('・')||'数字なし'} があり、基本候補は ${base.join('・')} です。追加ルールはまだ考慮していません。`),cells:[cell],evidence:filled,eliminations:[],candidates:base}];
  let remaining=base.slice();
  const addEliminations=(entries:{cell:number;digit:number}[])=>{
    const groups=new Map<string,{reason:Reason;entries:typeof entries}>();
    for(const entry of entries){const reason=rejection(p,board,entry.cell,entry.digit,language,api);const group=groups.get(reason.id)??{reason,entries:[]};group.entries.push(entry);groups.set(reason.id,group);}
    for(const {reason,entries:es} of groups.values()){
      const cells=[...new Set(es.map(e=>e.cell))], digits=[...new Set(es.map(e=>e.digit))];
      remaining=remaining.filter(d=>!es.some(e=>e.cell===cell&&e.digit===d));
      steps.push({kind:'eliminate',title:say(`排除 ${digits.join('、')}`,`Eliminate ${digits.join(', ')}`,`${digits.join('・')} を除外`),text:`${reason.text}\n${say(`${cells.map(name).join('、')} 不能填 ${digits.join('、')}。`,`${cells.map(name).join(', ')} cannot contain ${digits.join(', ')}.`,`${cells.map(name).join('・')} に ${digits.join('・')} は入りません。`)}`,cells,evidence:reason.evidence,eliminations:cells.map(i=>({cell:i,digits:es.filter(e=>e.cell===i).map(e=>e.digit)})),candidates:remaining.slice()});
    }
  };
  const actual=candidates(p,board,cell);addEliminations(base.filter(d=>!actual.includes(d)).map(d=>({cell,digit:d})));
  if(unit){
    const region=unitName(p,unit,language,api),empty=unit.filter(i=>!board[i]);
    steps.push({kind:'unit',title:say(`在${region}找 ${value}`,`Place ${value} in ${region}`,`${region} の ${value} を探す`),text:say(`${region}有完整的 9 个格子，必须恰好包含一个 ${value}。已填的格子不动，接下来检查空格 ${empty.map(name).join('、')}。`,`${region} has nine playable cells and must contain ${value} exactly once. Keep filled cells unchanged; inspect ${empty.map(name).join(', ')}.`,`${region} は 9 マスなので ${value} が一つ必要です。入力済みのマスは変えず、${empty.map(name).join('・')} を調べます。`),cells:unit.slice(),evidence:unit.filter(i=>board[i]),eliminations:[],candidates:remaining.slice()});
    addEliminations(empty.filter(i=>i!==cell).map(i=>({cell:i,digit:value})));
  }
  steps.push({kind:'conclusion',title:say('得到结论','Conclusion','結論'),text:unit?say(`其他空格都已排除 ${value}，${unitName(p,unit,language,api)}中只剩 ${name(cell)} 可以放 ${value}。所以它的候选 ${base.join('、')} 中只能选 ${value}。`,`${value} is excluded from every other empty cell in ${unitName(p,unit,language,api)}, so ${name(cell)} must be ${value}, even though its basic candidates were ${base.join(', ')}.`,`${unitName(p,unit,language,api)} の他の空きマスから ${value} が除外され、${name(cell)} だけが残ります。基本候補 ${base.join('・')} のうち ${value} に決まります。`):say(`其他候选均有明确的排除依据，${name(cell)} 只剩 ${value}。`,`${name(cell)} has only ${value} left after the justified eliminations.`,`根拠に従って他の候補を除外すると ${name(cell)} は ${value} だけです。`),cells:[cell],evidence:[],eliminations:[],candidates:[value]});
  return steps;
}
