import { boardWidth, boardLength, cellName } from './topology';
import { sumCombinationDeduction, sumCombinationSteps, type SumDeduction } from './sum-combinations';
import { regionIndex, regionLetter } from './extra-regions';
import { findInferenceChain, chainSteps, type ChainDeduction } from './inference-chains';
import { advancedDeduction, advancedText, type AdvancedDeduction } from './advanced-hints';
import { boardCandidateMasks, candidates, DIGITS, findHint, units, validBoard, type Hint, type Puzzle, type SaveData } from './rules';
import { lessonText, type HintStep } from './hint-explanation';
import { t, type Language } from './i18n';

const bit = (d: number) => 1 << (d - 1);
const values = (mask: number) => DIGITS.filter(d => mask & bit(d));
interface Reduction { cell: number; digits: number[]; }
interface Deduction {
  technique: 'locked' | 'subset' | 'xwing' | 'inequality' | 'thermometer' | 'ordered';
  evidence: number[]; region: number[]; otherRegion?: number[]; digits: number[]; eliminations: Reduction[];
}
export interface LogicalHint extends Hint {
  kind: 'placement' | 'elimination';
  eliminations: Reduction[];
  /** Used only to reject stale apply actions, never as a logical premise. */
  position: string;
  deductionSteps: number;
}
function position(state: Pick<SaveData, 'puzzle' | 'board'>): string { return JSON.stringify([state.puzzle, state.board]); }
function allDifferent(p: Puzzle): number[][] {
  return [...units(p), ...(p.options.killer ? p.cages.map(c => c.cells) : []), ...(p.options.renban ? p.lines : []), ...(p.options.thermometer ? p.thermometers ?? [] : [])];
}
/** Each deduction removes at least one currently present bit. No manual notes,
 * saved answer, trial placements, or branching solver are used as premises. */
function nextDeduction(p: Puzzle, board: number[], masks: number[]): Deduction | AdvancedDeduction | ChainDeduction | SumDeduction | null {
  const us = units(p), groups = allDifferent(p);
  const remove = (cells: number[], digits: number[]): Reduction[] => cells.filter(i => !board[i]).map(cell => ({cell, digits: digits.filter(d => masks[cell]! & bit(d))})).filter(e => e.digits.length > 0);
  // A complete source unit must contain the digit. The receiving unit only
  // needs all-different; shortened missing-cell/slant units are NOT sources.
  for (const source of us.filter(u => u.length === 9)) for (const d of DIGITS) {
    if (source.some(i => board[i] === d)) continue;
    const places = source.filter(i => !board[i] && (masks[i]! & bit(d)));
    if (places.length < 2) continue;
    for (const target of groups) if (places.every(i => target.includes(i))) {
      const eliminations = remove(target.filter(i => !source.includes(i)), [d]);
      if (eliminations.length) return {technique:'locked', evidence:places, region:source, otherRegion:target, digits:[d], eliminations};
    }
  }
  for (const group of groups) for (const size of [2, 3]) {
    const cells = group.filter(i => !board[i] && values(masks[i]!).length >= 2 && values(masks[i]!).length <= size);
    for (let a = 0; a < cells.length; a++) for (let b = a + 1; b < cells.length; b++) {
      for (let c = size === 2 ? cells.length : b + 1; c <= cells.length; c++) {
        if (size === 3 && c === cells.length) break;
        const chosen = size === 2 ? [cells[a]!, cells[b]!] : [cells[a]!, cells[b]!, cells[c]!];
        const digits = values(chosen.reduce((m, i) => m | masks[i]!, 0));
        if (digits.length !== size) continue;
        const eliminations = remove(group.filter(i => !chosen.includes(i)), digits);
        if (eliminations.length) return {technique:'subset', evidence:chosen, region:group, digits, eliminations};
      }
    }
  }
  // X-Wing requires full rows/columns: missing-cell units need not contain d.
  for (const orientation of [0, 1]) for (const d of DIGITS) for (let a = 0; a < boardWidth(p); a++) {
    const source = us[a * 3 + orientation]!;
    if (source.length !== 9 || source.some(i => board[i] === d)) continue;
    const places = source.filter(i => !board[i] && (masks[i]! & bit(d)));
    if (places.length !== 2) continue;
    const cross = (i: number) => orientation === 0 ? i % boardWidth(p) : Math.floor(i / boardWidth(p));
    for (let b = a + 1; b < boardWidth(p); b++) {
      const second = us[b * 3 + orientation]!;
      if (second.length !== 9 || second.some(i => board[i] === d)) continue;
      const other = second.filter(i => !board[i] && (masks[i]! & bit(d)));
      if (other.length !== 2 || !other.every(i => places.some(j => cross(i) === cross(j)))) continue;
      const evidence = [...places, ...other];
      const targets = Array.from({length:boardLength(p)}, (_, i) => i).filter(i => !p.blocked[i] && !evidence.includes(i) && places.some(j => cross(i) === cross(j)));
      const eliminations = remove(targets, [d]);
      if (eliminations.length) return {technique:'xwing', evidence, region:[...source, ...second], digits:[d], eliminations};
    }
  }
  const domain = (i: number) => board[i] ? [board[i]!] : values(masks[i]!);
  const relations: {a:number; b:number; technique:'inequality'|'thermometer'}[] = [];
  if (p.options.inequality) for (const [a,b] of p.inequalities ?? []) relations.push({a,b,technique:'inequality'});
  if (p.options.thermometer) for (const line of p.thermometers ?? []) for (let j=1;j<line.length;j++) relations.push({a:line[j-1]!,b:line[j]!,technique:'thermometer'});
  for (const {a,b,technique} of relations) {
    const av=domain(a), bv=domain(b);
    const eliminations=[...remove([a], av.filter(d=>!bv.some(e=>d<e))), ...remove([b], bv.filter(d=>!av.some(e=>e<d)))];
    if (eliminations.length && av.length && bv.length) return {technique,evidence:[a,b],region:[a,b],digits:[],eliminations};
  }
  if (p.options.renban && p.lineRule === 'ordered') for (const line of p.lines) {
    const sequences: number[][]=[];
    for (const start of domain(line[0]!)) for (const direction of [-1,1]) {
      const seq=line.map((_,n)=>start+n*direction);
      if(seq.every((d,n)=>d>=1&&d<=9&&domain(line[n]!).includes(d))) sequences.push(seq);
    }
    if (!sequences.length) continue;
    const eliminations=line.flatMap((i,n)=>remove([i], domain(i).filter(d=>!sequences.some(seq=>seq[n]===d))));
    if(eliminations.length)return {technique:'ordered',evidence:line,region:line,digits:[],eliminations};
  }
  return advancedDeduction(p,board,masks,groups) ?? findInferenceChain(p,board,masks,groups) ?? sumCombinationDeduction(p,board,masks,groups);
}
function apply(masks: number[], deduction: Deduction | AdvancedDeduction | ChainDeduction | SumDeduction): number[] {
  const result=masks.slice(); for(const e of deduction.eliminations)for(const d of e.digits)result[e.cell]! &= ~bit(d); return result;
}
interface Replay { masks:number[]; proofs:{deduction:Deduction | AdvancedDeduction | ChainDeduction | SumDeduction;before:number[];after:number[]}[]; }
// Cache only one position per puzzle, keyed by content (including editable rule
// arrays). Saved count replays bounded, verifiable deductions after app upgrades.
const cache=new WeakMap<Puzzle,{key:string;result:Replay}>();
function replay(state: Pick<SaveData,'puzzle'|'board'|'deductionSteps'>): Replay {
  const count=Number.isInteger(state.deductionSteps)?Math.max(0,Math.min(state.board.length*9,state.deductionSteps!)):0;
  const key=`${position(state)}:${count}`, old=cache.get(state.puzzle);if(old?.key===key)return old.result;
  let masks=boardCandidateMasks(state.puzzle,state.board);const proofs:Replay['proofs']=[];
  if(count && validBoard(state.puzzle,state.board))for(let n=0;n<count;n++){
    const deduction=nextDeduction(state.puzzle,state.board,masks);if(!deduction)break;
    const after=apply(masks,deduction);if(after.some((m,i)=>!m&&!state.board[i]&&!state.puzzle.blocked[i]))break;
    proofs.push({deduction,before:masks,after});masks=after;
  }
  const result={masks,proofs};cache.set(state.puzzle,{key,result});return result;
}
export function logicalCandidateMasks(state: Pick<SaveData,'puzzle'|'board'|'deductionSteps'>): number[] { return replay(state).masks.slice(); }
function describe(p: Puzzle, cells: number[], lang: Language): string {
  const name=(i:number)=>cellName(p,i);
  const index=units(p).findIndex(u=>u.length===cells.length&&u.every((i,n)=>i===cells[n]));
  const extra=p.options.extraRegion?regionIndex(p.extraRegions,cells):-1;
  if(extra>=0)return t(lang,'extraRegionName',{name:regionLetter(extra)});
  if(index>=0&&index<boardWidth(p)*3){const n=Math.floor(index/3)+1,k=index%3;return lessonText(lang,`第 ${n} ${['行','列','宫'][k]}`,`${['row','column','box'][k]} ${n}`,`${n} ${['行目','列目','番ブロック'][k]}`);}
  return cells.map(name).join(', ');
}
function proofSteps(p:Puzzle,board:number[],proof:Replay['proofs'][number],language:Language):HintStep[]{
  const name=(i:number)=>cellName(p,i);
  const {deduction:d,before,after}=proof,cell=d.eliminations[0]!.cell;
  const say=(zh:string,en:string,ja:string)=>lessonText(language,zh,en,ja);
  const advanced=['little-killer-sum','nonconsecutive-support','xv-support','consecutive-support','hidden-subset','quad','xy-wing','xyz-wing'].includes(d.technique)?advancedText(d as AdvancedDeduction,language,boardWidth(p)):null;
  const title=d.technique==='chain'?say('候选推理链','Inference chain','推論チェーン'):advanced?.title??{locked:say('区块排除','Locked candidates','候補のロック'),subset:say(d.digits.length===2?'显性数对':'显性三数组',d.digits.length===2?'Naked pair':'Naked triple',d.digits.length===2?'ネイキッドペア':'ネイキッドトリプル'),xwing:'X-Wing',inequality:say('不等号候选约束','Inequality candidates','不等号の候補制約'),thermometer:say('温度计递增约束','Thermometer order','温度計の順序'),ordered:say('连续升降序约束','Consecutive sequence','連続する昇順・降順')}[d.technique as Deduction['technique']];
  const inspection=advanced?.inspection??(d.technique==='locked'||d.technique==='xwing'?d.region:d.evidence);
  const listing=inspection.map(i=>`${name(i)}: ${board[i]||values(before[i]!).join(', ')}`).join('\n');
  const region=describe(p,d.region,language),otherRegion=describe(p,('otherRegion' in d?d.otherRegion:undefined)??[],language),cells=d.evidence.map(name).join(', '),digits=d.digits.join(', ');
  let reason=advanced?.reason??'';
  if(d.technique==='locked')reason=say(`${region}必须包含 ${digits}，而它只能出现在 ${cells}。这些格子都在${otherRegion}，所以${otherRegion}的其他格子不能再填 ${digits}。`,`${region} must contain ${digits}, and only ${cells} can hold it. These cells are all in ${otherRegion}, so the other cells of ${otherRegion} cannot contain ${digits}.`,`${region} に ${digits} が必要で、入る場所は ${cells} だけです。これらは ${otherRegion} にあるので、${otherRegion} の他のマスから ${digits} を除外します。`);
  if(d.technique==='subset')reason=say(`${cells} 这 ${d.evidence.length} 格不能重复，它们所有候选合起来只有 ${digits} 这 ${d.digits.length} 个数。这些数必然被这几格占用，所以 ${region} 中其他格子不能再填这些数。`,`${cells} are ${d.evidence.length} all-different cells whose combined candidates are only ${digits}. They must use all these digits, excluding them from the other cells of ${region}.`,`${cells} は重複できない ${d.evidence.length} マスで、候補の合計は ${digits} だけです。これらの数字を使い切るため、${region} の他のマスから除外できます。`);
  if(d.technique==='xwing')reason=say(`两条完整的平行行/列中，${digits} 都只可能在高亮的两个交叉位置。两个 ${digits} 必须分占两条交叉列/行，所以交叉列/行的其他格子不能再填 ${digits}。`,`In two full parallel rows/columns, ${digits} can occur only at the highlighted intersections. The two occurrences must occupy different crossing columns/rows, excluding ${digits} from their other cells.`,`二つの完全な行・列で ${digits} は強調された交点だけに入ります。同じ数字は別々の交差する列・行に入るため、その列・行の他のマスから除外できます。`);
  if(d.technique==='inequality'||d.technique==='thermometer')reason=say(`${name(d.evidence[0]!)} < ${name(d.evidence[1]!)}。逐个检查两格的候选：左侧数字必须能在右侧找到比它大的候选，右侧也必须能在左侧找到比它小的候选。找不到配对的候选可以排除。`,`${name(d.evidence[0]!)} < ${name(d.evidence[1]!)}. Each candidate on the smaller side needs a larger candidate on the other side, and vice versa. Candidates with no supporting partner can be removed.`,`${name(d.evidence[0]!)} < ${name(d.evidence[1]!)}。小さい側の候補には大きい相手、大きい側には小さい相手が必要です。相手がない候補を除外します。`);
  if(d.technique==='ordered')reason=say('整条紫线每步只能加 1，或每步都减 1。按上面的候选逐一列出可行起点和方向，任何完整序列中都没有出现的候选可以排除。','The entire purple line must increase by 1 at every step or decrease by 1 at every step. Check each candidate start in both directions; remove candidates occurring in no complete supported sequence.','紫線全体は一歩ごとに 1 増えるか、全体で 1 減ります。候補の始点と両方向を調べ、成立する数列に一度も現れない候補を除外します。');
  const changes=d.eliminations.map(e=>`${name(e.cell)}: ${values(before[e.cell]!).join(', ')} → ${values(after[e.cell]!).join(', ')} (${say('排除','remove','除外')} ${e.digits.join(', ')})`).join('\n');
  const common={candidateMasks:before,candidateCell:cell,cells:[cell],evidence:d.evidence,eliminations:[] as Reduction[],candidates:values(before[cell]!)};
  return [
    {...common,kind:'candidates',title:say('观察当前候选','Inspect current candidates','現在の候補を確認'),text:say('按行列宫、已开启的附加规则和前面已确认的推理，观察以下格子的候选（已填格显示其数字）：','Using rows, columns, boxes, enabled rules and previously confirmed deductions, inspect these candidates (filled cells show their value):','行・列・ブロック、追加ルール、確認済みの推論から、候補を確認します（入力済みのマスは数字を表示）：')+'\n'+listing},
    ...(d.technique==='sum-combination'?sumCombinationSteps(d,board,before,allDifferent(p),language):d.technique==='chain'?chainSteps(d,before,language,boardWidth(p)).map(step=>({...step,candidateMasks:before})):[{...common,kind:'unit' as const,title,text:reason,cells:d.evidence,evidence:[...d.region,...('otherRegion' in d?d.otherRegion:undefined)??[]]}]),
    {...common,candidateMasks:after,kind:'eliminate',title:say('逐项减少候选','Remove the candidates','候補を除外'),text:changes,cells:d.eliminations.map(e=>e.cell),eliminations:d.eliminations,candidates:values(after[cell]!)}
  ];
}
export function findLogicalHint(state:Pick<SaveData,'puzzle'|'board'|'deductionSteps'|'crossed'>,language:Language='zh'):LogicalHint|null {
  const {puzzle:p,board}=state;const name=(i:number)=>cellName(p,i);if(!validBoard(p,board))return null;
  const direct=findHint(p,board,language),stamp=position(state);
  if(direct)return {...direct,kind:'placement',eliminations:[],position:stamp,deductionSteps:state.deductionSteps??0};
  const replayed=replay(state),proofs=replayed.proofs.slice(),say=(zh:string,en:string,ja:string)=>lessonText(language,zh,en,ja);
  let masks=replayed.masks;
  // Crosses only tell us which verified results the player already recorded.
  // Re-prove each deduction from rule domains before using it in later steps.
  for (;;) {
    if(masks.some((m,i)=>!m&&!board[i]&&!p.blocked[i]))return null;
    let cell=masks.findIndex((m,i)=>!board[i]&&!p.blocked[i]&&values(m).length===1),value=cell>=0?values(masks[cell]!)[0]!:0,unit:number[]|undefined;
    if(cell<0)for(const u of units(p).filter(u=>u.length===9))for(const d of DIGITS){
      if(u.some(i=>board[i]===d))continue;
      const places=u.filter(i=>!board[i]&&(masks[i]!&bit(d)));
      if(places.length===1&&cell<0){cell=places[0]!;value=d;unit=u;}
    }
    if(cell>=0){
      const explanation=unit?say(`${describe(p,unit,language)} 中只有 ${name(cell)} 仍能填 ${value}。`,`${name(cell)} is the only remaining place for ${value} in ${describe(p,unit,language)}.`,`${describe(p,unit,language)} で ${value} が入るのは ${name(cell)} だけです。`):say(`${name(cell)} 经候选排除后只剩 ${value}。`,`${name(cell)} has only ${value} left after eliminations.`,`候補を除外すると ${name(cell)} は ${value} だけです。`);
      const steps=proofs.flatMap(proof=>proofSteps(p,board,proof,language));
      steps.push({kind:'conclusion',title:say('现在可以填数','A digit can now be placed','数字が確定'),text:explanation+(unit?'\n'+unit.filter(i=>!board[i]).map(i=>`${name(i)}: ${values(masks[i]!).join(', ')}`).join('\n'):''),candidateMasks:masks,candidateCell:cell,cells:[cell],evidence:unit??[],eliminations:[],candidates:[value]});
      return {kind:'placement',cell,value,explanation,steps,eliminations:[],position:stamp,deductionSteps:proofs.length};
    }
    const deduction=nextDeduction(p,board,masks);if(!deduction)return null;
    const after=apply(masks,deduction);if(after.some((m,i)=>!m&&!board[i]&&!p.blocked[i]))return null;
    const pending=deduction.eliminations.map(e=>({cell:e.cell,digits:e.digits.filter(d=>!((state.crossed?.[e.cell]??0)&bit(d)))})).filter(e=>e.digits.length);
    if(!pending.length){
      proofs.push({deduction,before:masks,after});masks=after;continue;
    }
    const visibleDeduction={...deduction,eliminations:pending};
    cell=pending[0]!.cell;
    const explanation=say(`${name(cell)} ${state.crossed?.[cell]?'可以进一步排除候选':'可以排除候选'} ${pending[0]!.digits.join('、')}。点击解释查看步骤。`,`${name(cell)} can ${state.crossed?.[cell]?'further exclude':'exclude'} ${pending[0]!.digits.join(', ')}. Open the explanation for the steps.`,`${name(cell)} から${state.crossed?.[cell]?'さらに':''} ${pending[0]!.digits.join('・')} を除外できます。解説で手順を確認できます。`);
    const steps=proofSteps(p,board,{deduction:visibleDeduction,before:masks,after},language);
    steps.push({kind:'conclusion',title:say('将结果记入笔记','Record the result','結果をメモに反映'),text:say('这一步只减少候选，不自动填数。点击“应用到笔记”会划去高亮格中已排除的候选；没有笔记的格子会展示其余候选。其他笔记保留。之后可以继续提示，也可以撤销。','This step only removes candidates; it does not fill a digit. “Apply to notes” crosses out excluded candidates and shows the other candidates in cells without notes. Other notes are preserved. Continue with another hint, or undo.','この手順では候補だけを減らし、数字は入力しません。「メモに反映」で強調マスの除外候補に取消線を付け、メモがないマスは残りの候補を表示します。他のメモは保持します。次のヒントに進むか、元に戻せます。'),candidateMasks:after,candidateCell:cell,cells:pending.map(e=>e.cell),evidence:[],eliminations:pending,candidates:values(after[cell]!)});
    return {kind:'elimination',cell,value:0,explanation,steps,eliminations:pending,position:stamp,deductionSteps:proofs.length};
  }
}
/** Recheck against current rules/board. Partial handwritten notes never prove a
 * deduction; existing notes only shrink; blank notes receive verified remaining domains. */
export function applyHintToNotes(state:SaveData,hint:LogicalHint):SaveData|null {
  if(hint.kind!=='elimination'||hint.position!==position(state))return null;
  const current=findLogicalHint(state);if(!current||current.kind!=='elimination'||current.deductionSteps!==hint.deductionSteps||JSON.stringify(current.eliminations)!==JSON.stringify(hint.eliminations))return null;
  const next={...state,deductionSteps:hint.deductionSteps+1},masks=logicalCandidateMasks(next),notes=state.notes.slice(),crossed=state.crossed?.slice()??Array(state.board.length).fill(0);
  for(const e of current.eliminations){for(const d of e.digits)crossed[e.cell]! |= bit(d);notes[e.cell]=(notes[e.cell] ? notes[e.cell]! & masks[e.cell]! : masks[e.cell]!) & ~crossed[e.cell]!;}
  return {...next,notes,crossed};
}
