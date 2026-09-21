import { boardLength } from './topology';
import { DIGITS, neighbors, units, type Puzzle } from './rules';
import { lessonText, type HintStep } from './hint-explanation';
import type { Language } from './i18n';
const bit=(d:number)=>1<<(d-1),values=(mask:number)=>DIGITS.filter(d=>mask&bit(d));
export interface Literal {cell:number;digit:number;yes:boolean;}
export interface ChainLink {
  from:Literal;to:Literal;reason:'cell'|'peer'|'bivalue'|'unit'|'pair';region:number[];
  pair?:{a:number;digit:number;b:number;other:number;only:boolean;kind:'xv'|'consecutive'|'nonConsecutive';target:number|null};
}
export interface ChainDeduction {technique:'chain';evidence:number[];region:number[];digits:number[];eliminations:{cell:number;digits:number[]}[];chain:ChainLink[];}
const literal=(cell:number,digit:number,yes:boolean):Literal=>({cell,digit,yes});
const id=(l:Literal)=>(l.cell*9+l.digit-1)*2+Number(l.yes);
/** Bounded implication graph, not a branching Sudoku solver. Each edge has an
 * explicit local justification; a path from a candidate ON to itself OFF is
 * a proof by contradiction. Short units produce weak links only. */
export function findInferenceChain(p:Puzzle,board:number[],masks:number[],groups:number[][]):ChainDeduction|null {
  const graph=Array.from({length:boardLength(p)*18},()=>new Map<number,ChainLink>()),cells=Array.from({length:boardLength(p)},(_,i)=>i).filter(i=>!board[i]&&!p.blocked[i]),domains=masks.map(values);
  const add=(from:Literal,to:Literal,reason:ChainLink['reason'],region:number[],pair?:ChainLink['pair'])=>{if(!graph[id(from)]!.has(id(to)))graph[id(from)]!.set(id(to),{from,to,reason,region,...pair?{pair}:{}});};
  for(const i of cells)for(const a of domains[i]!)for(const b of domains[i]!)if(a!==b){
    add(literal(i,a,true),literal(i,b,false),'cell',[i]);
    if(domains[i]!.length===2)add(literal(i,a,false),literal(i,b,true),'bivalue',[i]);
  }
  for(const region of groups)for(const d of DIGITS){
    const possible=region.filter(i=>!board[i]&&(masks[i]!&bit(d)));
    for(const a of possible)for(const b of possible)if(a!==b)add(literal(a,d,true),literal(b,d,false),'peer',region);
  }
  for(const region of units(p).filter(u=>u.length===9))for(const d of DIGITS){
    if(region.some(i=>board[i]===d))continue;
    const possible=region.filter(i=>!board[i]&&(masks[i]!&bit(d)));
    if(possible.length===2)for(const a of possible){const b=possible.find(i=>i!==a)!;add(literal(a,d,false),literal(b,d,true),'unit',region);}
  }
  for(const kind of ['xv','consecutive','nonConsecutive'] as const)if(p.options[kind])for(const a of cells)for(const b of neighbors(a).filter(j=>!board[j]&&!p.blocked[j])){
    const xv=kind==='xv',target=xv?(p.xvClues??[]).find(c=>c.cells.includes(a)&&c.cells.includes(b))?.sum??null:kind==='consecutive'&&p.dots.some(pair=>pair.includes(a)&&pair.includes(b))?1:null;
    for(const digit of domains[a]!){
      const compatible=domains[b]!.filter(other=>other!==digit&&(xv?(target!==null?digit+other===target:digit+other!==5&&digit+other!==10):(Math.abs(digit-other)===1)===(target===1)));
      for(const other of domains[b]!)if(!compatible.includes(other))add(literal(a,digit,true),literal(b,other,false),'pair',[a,b],{a,digit,b,other,only:false,kind,target});
      if(compatible.length===1){const other=compatible[0]!,pair={a,digit,b,other,only:true,kind,target} as const;add(literal(a,digit,true),literal(b,other,true),'pair',[a,b],pair);add(literal(b,other,false),literal(a,digit,false),'pair',[a,b],pair);}
    }
  }
  let best:ChainLink[]|null=null,visitedEdges=0;
  const limit=12;
  outer:for(const cell of cells)for(const digit of domains[cell]!){
    const start=id(literal(cell,digit,true)),goal=start-1,queue=[start],prev=new Int16Array(boardLength(p)*18).fill(-1),depth=new Uint8Array(boardLength(p)*18);prev[start]=start;
    for(let at=0;at<queue.length;at++){
      const from=queue[at]!;if(depth[from]!>=(best?.length??limit))continue;
      for(const [to] of graph[from]!){
        if(++visitedEdges>1500000)break outer;
        if(prev[to]!==-1)continue;prev[to]=from;depth[to]=depth[from]!+1;
        if(to===goal){const chain:ChainLink[]=[];for(let n=goal;n!==start;n=prev[n]!)chain.push(graph[prev[n]!]!.get(n)!);chain.reverse();if(!best||chain.length<best.length)best=chain;break;}
        queue.push(to);
      }
      if(prev[goal]!==-1)break;
    }
  }
  if(!best)return null;
  const first=best[0]!.from,evidence=[...new Set(best.flatMap(link=>[link.from.cell,link.to.cell]))];
  return {technique:'chain',evidence,region:evidence,digits:[first.digit],eliminations:[{cell:first.cell,digits:[first.digit]}],chain:best};
}
export function chainSteps(d:ChainDeduction,masks:number[],language:Language,width=9):HintStep[]{
  const name=(i:number)=>`R${Math.floor(i/width)+1}C${i%width+1}`,fact=(l:Literal)=>`${name(l.cell)} ${l.yes?'=':'≠'} ${l.digit}`;
  const say=(zh:string,en:string,ja:string)=>lessonText(language,zh,en,ja),start=d.chain[0]!.from;
  const base={candidateCell:start.cell,candidates:values(masks[start.cell]!),eliminations:[] as {cell:number;digits:number[]}[]};
  const steps:HintStep[]=[{...base,kind:'unit',title:say('候选推理链：检验假设','Inference chain: test a premise','推論チェーン：仮定を検証'),text:say(`先假设 ${fact(start)}，只在讲解中检验，不把它填进盘面。接下来每一步都由已有候选和明确规则推出；如果最后推出 ${name(start.cell)} ≠ ${start.digit}，假设自相矛盾，就能排除这个候选。`,`Suppose ${fact(start)} for this explanation only; do not fill it in. Follow justified implications. If they imply ${name(start.cell)} ≠ ${start.digit}, the premise contradicts itself and the candidate is eliminated.`,`解説内だけで ${fact(start)} と仮定します。盤面には入力しません。候補とルールから順に導き、最後に ${name(start.cell)} ≠ ${start.digit} となれば矛盾するので、この候補を除外できます。`),cells:[start.cell],evidence:[]}];
  for(const link of d.chain){
    let why='';const {from,to}=link;
    if(link.reason==='cell')why=say('一个格子只能填一个数字。','A cell contains only one digit.','一つのマスには一つの数字だけが入ります。');
    if(link.reason==='peer')why=say('这两格属于高亮的同一个不能重复数字的区域。','These cells share the highlighted all-different region.','この 2 マスは強調された同じ重複禁止領域にあります。');
    if(link.reason==='bivalue')why=say(`${name(from.cell)} 只有候选 ${values(masks[from.cell]!).join('、')}，排除其中一个后，只能是另一个。`,`${name(from.cell)} has only ${values(masks[from.cell]!).join(', ')}; excluding one forces the other.`,`${name(from.cell)} の候補は ${values(masks[from.cell]!).join('・')} だけで、一つを除外するともう一つに決まります。`);
    if(link.reason==='unit')why=say(`高亮的完整九格区域必须包含 ${from.digit}，当前只有 ${name(from.cell)} 和 ${name(to.cell)} 两个位置。一个不能填，就只能放在另一个。`,`The highlighted full nine-cell region must contain ${from.digit}, with only ${name(from.cell)} and ${name(to.cell)} available. Excluding one forces the other.`,`強調された完全な 9 マス領域には ${from.digit} が必要で、位置は ${name(from.cell)} と ${name(to.cell)} だけです。一方が不可能なら他方に決まります。`);
    if(link.pair){const p=link.pair,rule=p.kind==='nonConsecutive'?say('不连续规则：上下左右相邻格不能相差 1','non-consecutive: orthogonal neighbors cannot differ by 1','非連続：上下左右の隣接マスの差は 1 以外'):p.kind==='xv'?(p.target===null?say('无 X/V 标记，和不能为 5 或 10','no X/V marker: sum cannot be 5 or 10','X/V 印なし：和は 5・10 以外'):say(`XV 和为 ${p.target}`,`XV sum ${p.target}`,`XV の和 ${p.target}`)):(p.target===null?say('无白点，差不能为 1','no dot: difference cannot be 1','白丸なし：差は 1 以外'):say('白点要求差为 1','white dot: difference is 1','白丸：差は 1'));
      why=p.only?say(`${rule}。若 ${name(p.a)}=${p.digit}，另一格的候选 ${values(masks[p.b]!).join('、')} 中，只有 ${p.other} 能配对。${!from.yes?'反过来，若这个搭档被排除，原候选也不能成立。':''}`,`${rule}. If ${name(p.a)}=${p.digit}, only ${p.other} among ${name(p.b)} candidates ${values(masks[p.b]!).join(', ')} can pair with it.${!from.yes?' Therefore excluding that partner also excludes the original candidate.':''}`,`${rule}。${name(p.a)}=${p.digit} なら、${name(p.b)} の候補 ${values(masks[p.b]!).join('・')} で対応するのは ${p.other} だけです。${!from.yes?'相手を除外すると元の候補も除外されます。':''}`):say(`${rule}。${name(p.a)}=${p.digit} 和 ${name(p.b)}=${p.other} 不符合这条规则，不能同时成立。`,`${rule}. ${name(p.a)}=${p.digit} and ${name(p.b)}=${p.other} violate it and cannot both hold.`,`${rule}。${name(p.a)}=${p.digit} と ${name(p.b)}=${p.other} は同時には成立しません。`);
    }
    steps.push({...base,kind:'unit',title:say('沿假设继续推导','Follow the implication','仮定から推論を続ける'),text:say(`仍在上述假设下：${fact(from)}。\n${why}\n因此 ${fact(to)}。`,`Under the premise: ${fact(from)}.\n${why}\nTherefore ${fact(to)}.`,`仮定の下で ${fact(from)}。\n${why}\nしたがって ${fact(to)}。`),cells:[to.cell],evidence:link.region});
  }
  steps.push({...base,kind:'unit',title:say('发现矛盾','Contradiction','矛盾'),text:say(`最初假设 ${fact(start)}，现在却推出 ${name(start.cell)} ≠ ${start.digit}。这两个结论不可能同时成立，因此撤销假设，排除候选 ${start.digit}。`,`The premise ${fact(start)} implies ${name(start.cell)} ≠ ${start.digit}. Both cannot hold. Reject the premise and eliminate ${start.digit}.`,`最初の仮定 ${fact(start)} から ${name(start.cell)} ≠ ${start.digit} が導かれました。矛盾するので仮定を棄却し、${start.digit} を除外します。`),cells:[start.cell],evidence:d.evidence});
  return steps;
}
