import { DIGITS, exclusionCells, units, type Puzzle } from './rules';
import { littleKillerPath } from './little-killer';
import { lessonText, type HintStep } from './hint-explanation';
import type { Language } from './i18n';
const bit=(d:number)=>1<<(d-1),values=(mask:number)=>DIGITS.filter(d=>mask&bit(d));
const name=(i:number)=>`R${Math.floor(i/9)+1}C${i%9+1}`;
interface SumSource {kind:'unit'|'little'|'cage'|'four'|'xv';cells:number[];sum:number;unit?:number;}
interface Term {cell:number;sign:1|-1;}
interface Equation {sources:SumSource[];terms:Term[];total:number;}
export interface SumDeduction extends Equation {
  technique:'sum-combination';evidence:number[];region:number[];digits:number[];
  eliminations:{cell:number;digits:number[]}[];combinations:number[][];count:number;
}
interface Supports {masks:number[];combinations:number[][];count:number;nodes:number;exhausted:boolean;}
/** Enumerate a small local equation, not Sudoku completions. Repeated digits are
 * forbidden only for actual peers. An exhausted enumeration proves nothing. */
function supports(eq:Equation,masks:number[],peers:Set<number>[],budget:number):Supports {
  const ds=eq.terms.map(t=>values(masks[t.cell]!)),result:Supports={masks:ds.map(()=>0),combinations:[],count:0,nodes:0,exhausted:false};
  if(ds.some(d=>!d.length))return result;
  const order=eq.terms.map((_,i)=>i).sort((a,b)=>ds[a]!.length-ds[b]!.length||a-b),assigned=ds.map(()=>0);
  const low=order.map(n=>Math.min(...ds[n]!.map(d=>eq.terms[n]!.sign*d))),high=order.map(n=>Math.max(...ds[n]!.map(d=>eq.terms[n]!.sign*d)));
  const suffixLow=Array(order.length+1).fill(0),suffixHigh=suffixLow.slice();
  for(let n=order.length-1;n>=0;n--){suffixLow[n]=suffixLow[n+1]+low[n]!;suffixHigh[n]=suffixHigh[n+1]+high[n]!;}
  let allSupported=false;
  function visit(at:number,total:number):void {
    if(++result.nodes>budget){result.exhausted=true;return;}
    if(total+suffixLow[at]>eq.total||total+suffixHigh[at]<eq.total)return;
    if(at===order.length){
      if(total!==eq.total)return;
      result.count++;for(let n=0;n<assigned.length;n++)result.masks[n]!|=bit(assigned[n]!);
      if(result.combinations.length<12)result.combinations.push(assigned.slice());
      allSupported=eq.terms.every((t,n)=>result.masks[n]===masks[t.cell]);return;
    }
    const n=order[at]!,term=eq.terms[n]!;
    for(const d of ds[n]!) {
      if(eq.terms.some((t,k)=>assigned[k]===d&&peers[term.cell]!.has(t.cell)))continue;
      assigned[n]=d;visit(at+1,total+term.sign*d);assigned[n]=0;
      if(result.exhausted||allSupported)return;
    }
  }
  visit(0,0);return result;
}
/** 45-rule / innies-outies and overlap subtraction. Keep existing techniques
 * ahead of this bounded fallback, preserving previously recorded deductions. */
export function sumCombinationDeduction(p:Puzzle,board:number[],masks:number[],groups:number[][],budget=120000):SumDeduction|null {
  const clues:SumSource[]=[];
  if(p.options.littleKiller)for(const c of p.littleKillers??[])clues.push({kind:'little',cells:littleKillerPath(c),sum:c.sum});
  if(p.options.killer)for(const c of p.cages)clues.push({kind:'cage',cells:c.cells,sum:c.sum});
  if(p.options.quadruple)for(const c of p.fourSums??[])clues.push({kind:'four',cells:exclusionCells(c.at),sum:c.sum});
  if(p.options.xv)for(const c of p.xvClues??[])clues.push({kind:'xv',cells:c.cells,sum:c.sum});
  if(!clues.length||budget<=0)return null;
  const houses:SumSource[]=units(p).flatMap((cells,unit)=>cells.length===9?[{kind:'unit' as const,cells,sum:45,unit}]:[]);
  const sources=[...houses,...clues],equations:Equation[]=[];
  const remainder=(s:SumSource)=>s.sum-s.cells.reduce((v,i)=>v+board[i]!,0);
  for(const source of clues){const terms=source.cells.filter(i=>!board[i]).map(cell=>({cell,sign:1 as const}));if(terms.length&&terms.length<=7)equations.push({sources:[source],terms,total:remainder(source)});}
  for(let a=0;a<sources.length;a++)for(let b=Math.max(a+1,houses.length);b<sources.length;b++) {
    const first=sources[a]!,second=sources[b]!;
    if(!first.cells.some(i=>!board[i]&&second.cells.includes(i)))continue;
    const terms:Term[]=[...new Set([...first.cells,...second.cells])].filter(i=>!board[i]).flatMap(cell=>{
      const sign=Number(first.cells.includes(cell))-Number(second.cells.includes(cell));return sign?[{cell,sign:sign as 1|-1}]:[];
    });
    if(terms.length&&terms.length<=7)equations.push({sources:[first,second],terms,total:remainder(first)-remainder(second)});
  }
  equations.sort((a,b)=>a.terms.length-b.terms.length||a.sources.length-b.sources.length);
  const peers=Array.from({length:81},()=>new Set<number>());
  for(const group of groups)for(const i of group)for(const j of group)if(i!==j)peers[i]!.add(j);
  let left=budget;
  for(const eq of equations){
    const proof=supports(eq,masks,peers,Math.min(left,16000));left-=proof.nodes;
    if(!proof.exhausted&&proof.count){
      const eliminations=eq.terms.map((t,n)=>({cell:t.cell,digits:values(masks[t.cell]!&~proof.masks[n]!)})).filter(e=>e.digits.length);
      if(eliminations.length)return {...eq,technique:'sum-combination',evidence:[...new Set(eq.sources.flatMap(s=>s.cells))],region:eq.terms.map(t=>t.cell),digits:[],eliminations,combinations:proof.combinations,count:proof.count};
    }
    if(left<=0)break;
  }
  return null;
}
function sourceName(s:SumSource,language:Language):string {
  const say=(zh:string,en:string,ja:string)=>lessonText(language,zh,en,ja);
  if(s.kind==='unit'){const i=s.unit!;return i<27?say(`第 ${Math.floor(i/3)+1} ${['行','列','宫'][i%3]}`,`${['row','column','box'][i%3]} ${Math.floor(i/3)+1}`,`${Math.floor(i/3)+1} ${['行目','列目','番ブロック'][i%3]}`):say('这个完整的九格区域','this full nine-cell region','この完全な九マス領域');}
  return s.kind==='little'?say('小杀手斜线','little killer diagonal','リトルキラーの斜線'):s.kind==='cage'?say('杀手笼','killer cage','キラーケージ'):s.kind==='four'?say('四数和','four-cell sum','四マスの和'):say('XV 标记','XV marker','XV 印');
}
export function sumCombinationSteps(d:SumDeduction,board:number[],masks:number[],groups:number[][],language:Language):HintStep[] {
  const say=(zh:string,en:string,ja:string)=>lessonText(language,zh,en,ja),cell=d.eliminations[0]!.cell;
  const common={kind:'unit' as const,candidateMasks:masks,candidateCell:cell,candidates:values(masks[cell]!),eliminations:[],cells:d.region,evidence:d.evidence};
  const steps:HintStep[]=d.sources.map(source=>{
    const fixed=source.cells.filter(i=>board[i]),sum=fixed.reduce((v,i)=>v+board[i]!,0),empty=source.cells.filter(i=>!board[i]),equation=`${empty.map(name).join(' + ')} = ${source.sum} − ${sum} = ${source.sum-sum}`;
    return {...common,cells:source.cells,evidence:fixed,title:source.kind==='unit'?say('45 法则：九格总和','Rule of 45: a full house','45 の法則：九マスの合計'):say('写出线索总和','Write the clue sum','合計の条件を書く'),text:say(`${sourceName(source,language)}的总和为 ${source.sum}。${source.kind==='unit'?'因为完整九格包含 1–9，合计 45。':''}\n已填数字：${fixed.map(i=>`${name(i)}=${board[i]}`).join('，')||'无'}，合计 ${sum}。\n扣除已填数字后：\n${equation}`,`${sourceName(source,language)} totals ${source.sum}.${source.kind==='unit'?' A full house contains 1–9, summing to 45.':''}\nFilled cells: ${fixed.map(i=>`${name(i)}=${board[i]}`).join(', ')||'none'}, total ${sum}.\nSubtract them:\n${equation}`,`${sourceName(source,language)}の合計は ${source.sum}。${source.kind==='unit'?'完全な九マスは 1〜9 を含み、合計は 45 です。':''}\n入力済み：${fixed.map(i=>`${name(i)}=${board[i]}`).join('、')||'なし'}、合計 ${sum}。\nこれを引くと：\n${equation}`)};
  });
  if(d.sources.length===2){const commonCells=d.sources[0]!.cells.filter(i=>!board[i]&&d.sources[1]!.cells.includes(i));const positive=d.terms.filter(t=>t.sign===1).map(t=>name(t.cell)).join(' + ')||'0',negative=d.terms.filter(t=>t.sign===-1).map(t=>name(t.cell)).join(' + '),equation=`(${positive})${negative?` − (${negative})`:''} = ${d.total}`;
    steps.push({...common,title:say('相减，消去共有格','Subtract shared cells','共通マスを引いて消去'),text:say(`用第一个等式减去第二个等式，共有的 ${commonCells.map(name).join('、')} 正好抵消，得到：\n${equation}\n这把两个求和条件联系在一起。`,`Subtract the second equation from the first. Shared cells ${commonCells.map(name).join(', ')} cancel:\n${equation}\nThis connects both sum constraints.`,`最初の式から二番目の式を引き、共通の ${commonCells.map(name).join('、')} を消去します：\n${equation}\n二つの合計条件を結び付けます。`)});
  }
  const restrictions=[...new Set(groups.map(g=>d.region.filter(i=>g.includes(i))).filter(g=>g.length>=2).map(g=>g.map(name).join(', ')))];
  const combinations=d.combinations.map((tuple,n)=>`${n+1}. ${d.terms.map((t,k)=>`${name(t.cell)}=${tuple[k]}`).join(', ')}`).join('\n');
  steps.push({...common,title:say('总和与互异规则一起检查','Check sums and distinct digits together','合計と重複禁止を同時に確認'),text:say(`逐个检查这些格子的当前候选组合：既要满足上面的等式，还要让同一个行、列、宫或其他互异区域的数字不重复。以下每组格子不能重复：\n${restrictions.join('\n')||'这些格子之间没有额外的互异关系'}\n小杀手斜线本身不要求数字互异。\n共有 ${d.count} 种满足这些局部条件的组合${d.count>12?'，下面列出前 12 种':''}：\n${combinations}\n没有在任何可行组合中出现的候选可以划去。这一步只检查局部条件，没有使用答案。`,`Check current candidate combinations against the equation and the all-different regions. Each of these groups must contain distinct digits:\n${restrictions.join('\n')||'No all-different relationships among these cells'}\nA little killer diagonal itself does not require distinct digits.\n${d.count} combinations satisfy these local conditions${d.count>12?' (first 12 shown)':''}:\n${combinations}\nRemove candidates appearing in none of the combinations. This uses local constraints, not the saved answer.`,`現在の候補の組合せを、等式と重複禁止領域の両方で確認します。次の各組では同じ数字は使えません：\n${restrictions.join('\n')||'このマス間に重複禁止関係はありません'}\nリトルキラーの斜線自体は重複禁止ではありません。\n局所条件を満たす組合せは ${d.count} 通り${d.count>12?'（最初の 12 通りを表示）':''}：\n${combinations}\nどの組合せにも現れない候補を除外できます。保存された解答は使いません。`)});
  return steps;
}
