import { boardLength } from './topology';
import { DIGITS, neighbors, units, type Puzzle } from './rules';
import { littleKillerPath, domainSumPossible } from './little-killer';
import { lessonText } from './hint-explanation';
import type { Language } from './i18n';
const bit=(d:number)=>1<<(d-1);
const values=(mask:number)=>DIGITS.filter(d=>mask&bit(d));
export interface Reduction { cell:number; digits:number[]; }
export interface AdvancedDeduction {
  technique:'little-killer-sum'|'nonconsecutive-support'|'xv-support'|'consecutive-support'|'hidden-subset'|'quad'|'xy-wing'|'xyz-wing';
  evidence:number[]; region:number[]; digits:number[]; eliminations:Reduction[];
  /** null means an absent marker, which is also a constraint. */
  target?:number|null;
  pairs?:[number,number][];
  domains?:number[][];
}
function combinations<T>(items:T[],size:number):T[][] {
  if(size===0)return [[]];
  return items.flatMap((item,i)=>combinations(items.slice(i+1),size-1).map(rest=>[item,...rest]));
}
/** Arc support and small human patterns only. Never use the stored solution,
 * guesses, uniqueness assumptions, or mandatory digits in shortened units. */
export function advancedDeduction(p:Puzzle,board:number[],masks:number[],groups:number[][]):AdvancedDeduction|null {
  const domain=(i:number)=>board[i]?[board[i]!]:values(masks[i]!);
  const remove=(cells:number[],digits:number[])=>cells.filter(i=>!board[i]&&!p.blocked[i]).map(cell=>({cell,digits:digits.filter(d=>masks[cell]!&bit(d))})).filter(e=>e.digits.length);
  if(p.options.littleKiller)for(const clue of p.littleKillers??[]) {
    const region=littleKillerPath(clue),domains=region.map(i=>board[i]?bit(board[i]!):masks[i]!);
    if(!domainSumPossible(domains,clue.sum))continue;
    const eliminations=region.flatMap((cell,n)=>board[cell]?[]:[{cell,digits:values(domains[n]!).filter(d=>!domainSumPossible(domains.map((mask,k)=>k===n?bit(d):mask),clue.sum))}]).filter(e=>e.digits.length);
    if(eliminations.length)return {technique:'little-killer-sum',evidence:region,region,digits:[],target:clue.sum,domains:domains.map(values),eliminations};
  }
  // Include absent X/V and white-dot markers, since these variants mark ALL
  // matching adjacent pairs. Do not build edges through missing cells.
  for(const kind of ['xv','consecutive','nonConsecutive'] as const)if(p.options[kind])for(let a=0;a<81;a++)if(!p.blocked[a])for(const b of neighbors(a).filter(b=>b>a&&!p.blocked[b])){
    const av=domain(a),bv=domain(b);if(!av.length||!bv.length)continue;
    const xv=kind==='xv',target=xv?(p.xvClues??[]).find(c=>c.cells.includes(a)&&c.cells.includes(b))?.sum??null:kind==='consecutive'&&p.dots.some(pair=>pair.includes(a)&&pair.includes(b))?1:null;
    const pairs:[number,number][]=[];
    for(const x of av)for(const y of bv)if(x!==y&&(xv?(target!==null?x+y===target:x+y!==5&&x+y!==10):(Math.abs(x-y)===1)===(target===1)))pairs.push([x,y]);
    if(!pairs.length)continue;
    const eliminations=[...remove([a],av.filter(d=>!pairs.some(pair=>pair[0]===d))),...remove([b],bv.filter(d=>!pairs.some(pair=>pair[1]===d)))];
    if(eliminations.length)return {technique:xv?'xv-support':kind==='nonConsecutive'?'nonconsecutive-support':'consecutive-support',evidence:[a,b],region:[a,b],digits:[],target,pairs,eliminations};
  }
  for(const region of groups){
    const cells=region.filter(i=>!board[i]&&values(masks[i]!).length>=2&&values(masks[i]!).length<=4);
    for(const chosen of combinations(cells,4)){
      const digits=values(chosen.reduce((m,i)=>m|masks[i]!,0));if(digits.length!==4)continue;
      const eliminations=remove(region.filter(i=>!chosen.includes(i)),digits);
      if(eliminations.length)return {technique:'quad',evidence:chosen,region,digits,eliminations};
    }
  }
  for(const region of units(p).filter(u=>u.length===9))for(const size of [2,3]){
    const digits=DIGITS.filter(d=>!region.some(i=>board[i]===d)&&region.filter(i=>!board[i]&&(masks[i]!&bit(d))).length>=2);
    for(const chosen of combinations(digits,size)){
      const cells=region.filter(i=>!board[i]&&chosen.some(d=>masks[i]!&bit(d)));if(cells.length!==size)continue;
      const eliminations=remove(cells,DIGITS.filter(d=>!chosen.includes(d)));
      if(eliminations.length)return {technique:'hidden-subset',evidence:cells,region,digits:chosen,eliminations};
    }
  }
  const peers=Array.from({length:boardLength(p)},(_,i)=>new Set(groups.filter(g=>g.includes(i)).flat().filter(j=>i!==j)));
  const bivalue=Array.from({length:boardLength(p)},(_,i)=>i).filter(i=>!board[i]&&!p.blocked[i]&&values(masks[i]!).length===2);
  for(let pivot=0;pivot<boardLength(p);pivot++){
    if(board[pivot]||p.blocked[pivot])continue;
    const pv=values(masks[pivot]!);if(pv.length!==2&&pv.length!==3)continue;
    const wings=bivalue.filter(i=>peers[pivot]!.has(i));
    for(const [a,b] of combinations(wings,2)){
      const am=masks[a!]!,bm=masks[b!]!,common=am&bm,zs=values(common);if(zs.length!==1)continue;
      const z=zs[0]!,x=values(am&~common)[0]!,y=values(bm&~common)[0]!;
      if(x===y)continue;
      const xy=pv.length===2;
      if(masks[pivot]!==((bit(x)|bit(y))|(xy?0:bit(z))))continue;
      const targets=Array.from(peers[a!]!).filter(i=>i!==pivot&&i!==a&&i!==b&&peers[b!]!.has(i)&&(!xy?peers[pivot]!.has(i):true));
      const eliminations=remove(targets,[z]);
      if(eliminations.length)return {technique:xy?'xy-wing':'xyz-wing',evidence:[pivot,a!,b!],region:[pivot,a!,b!],digits:[x,y,z],eliminations};
    }
  }
  return null;
}
export function advancedText(d:AdvancedDeduction,language:Language,width=9):{title:string;reason:string;inspection:number[]} {
  const name=(i:number)=>`R${Math.floor(i/width)+1}C${i%width+1}`;
  const say=(zh:string,en:string,ja:string)=>lessonText(language,zh,en,ja),cells=d.evidence.map(name).join(', '),digits=d.digits.join(', ');
  if(d.technique==='little-killer-sum') {
    const entries=d.region.map((i,n)=>`${name(i)}: {${d.domains![n]!.join(', ')}}`).join('; ');
    const reasons=d.eliminations.flatMap(e=>e.digits.map(digit=>{
      const rest=d.domains!.filter((_,n)=>d.region[n]!==e.cell),left=d.target!-digit,min=rest.reduce((s,ds)=>s+Math.min(...ds),0),max=rest.reduce((s,ds)=>s+Math.max(...ds),0);
      const range=left<min||left>max;
      return say(`若 ${name(e.cell)}=${digit}，其他格须合计 ${d.target}−${digit}=${left}。${range?`但其总和只能在 ${min}～${max} 之间`:'但其现有候选没有任何组合能达到这个和'}，所以划去 ${digit}。`,`If ${name(e.cell)}=${digit}, other cells must total ${d.target}−${digit}=${left}. ${range?`Their sum is between ${min} and ${max}`:'No combination of their candidates reaches that sum'}, so remove ${digit}.`,`${name(e.cell)}=${digit} なら残りの合計は ${d.target}−${digit}=${left}。${range?`合計の範囲は ${min}～${max}`:'現在の候補でその合計は作れません'}。よって ${digit} を除外します。`);
    })).join('\n');
    return {title:say('小杀手斜线求和','Little killer sum','リトルキラーの合計'),inspection:d.region,reason:say(`箭头经过 ${d.region.map(name).join(' → ')}，目标总和为 ${d.target}。\n各格数字或候选：${entries}。\n${reasons}\n斜线本身不要求数字互异。`,`The arrow crosses ${d.region.map(name).join(' → ')} with total ${d.target}.\nValues or candidates: ${entries}.\n${reasons}\nThe diagonal does not require distinct digits.`,`矢印の経路 ${d.region.map(name).join(' → ')} の合計は ${d.target}。\n数字または候補：${entries}。\n${reasons}\n斜線自体に重複禁止の制限はありません。`)};
  }
  if(d.technique==='xv-support'||d.technique==='consecutive-support'||d.technique==='nonconsecutive-support'){
    const [a,b]=d.evidence.map(name),xv=d.technique==='xv-support';
    const constraint=d.technique==='nonconsecutive-support'?say('上下左右相邻，不连续规则禁止两数相差 1','are orthogonal neighbors: the non-consecutive rule forbids a difference of 1','上下左右に隣接し、非連続ルールで差を 1 にできません'):xv?(d.target===null?say('没有 X/V 标记，因此两数之和不能是 5 或 10','has no X/V marker, so the sum cannot be 5 or 10','X/V 印がないので、和は 5 と 10 にできません'):say(`有 ${d.target===5?'V':'X'} 标记，两数之和必须是 ${d.target}`,`has a ${d.target===5?'V':'X'} marker, so the sum must be ${d.target}`,`${d.target===5?'V':'X'} 印があるので、和は ${d.target} です`)):(d.target===null?say('没有白点，两数之差不能是 1','has no white dot, so the difference cannot be 1','白丸がないので差は 1 にできません'):say('有白点，两数之差必须是 1','has a white dot, so the difference must be 1','白丸があるので差は 1 です'));
    const pairs=d.pairs!.map(([x,y])=>`(${x}, ${y})`).join(', ');
    return {title:d.technique==='nonconsecutive-support'?say('不连续候选配对','Non-consecutive candidate support','非連続の候補ペア'):xv?say('XV 候选配对','XV candidate support','XV 候補の組合せ'):say('相邻连续候选配对','Consecutive candidate support','連続数の候補ペア'),inspection:d.evidence,reason:say(`${a} 与 ${b} ${constraint}，而且相邻两格不能相同。\n按 (${a}, ${b}) 顺序，当前所有可行配对：${pairs}。\n一个候选必须能在另一格找到至少一个符合规则的搭档；不出现在任何配对中的候选就可以排除。`,`${a} / ${b} ${constraint}. Adjacent cells must also differ.\nAll supported pairs in (${a}, ${b}) order: ${pairs}.\nEvery candidate needs a compatible partner in the other cell. Remove candidates appearing in none of these pairs.`,`${a} と ${b}：${constraint}。隣接マスは同じ数字にもできません。\n(${a}, ${b}) の順で、成立する組合せは ${pairs} です。\n相手のマスに対応する候補が一つもない数字は除外できます。`)};
  }
  if(d.technique==='quad')return {title:say('显性四数组','Naked quad','ネイキッドクアッド'),inspection:d.evidence,reason:say(`${cells} 这 4 格不能重复，全部候选合起来恰好只有 ${digits} 这 4 个数字。这 4 个数必被这些格子占用，所以它们共同的不能重复数字的区域里，其他格子不能再填这些数字。`,`${cells} are four all-different cells with only four combined candidates: ${digits}. They must use all four, excluding those digits from the other cells of their shared all-different region.`,`${cells} の 4 マスは重複できず、候補は全部で ${digits} の 4 個だけです。これらを使い切るため、同じ重複禁止領域の他のマスから除外します。`)};
  if(d.technique==='hidden-subset')return {title:say(d.digits.length===2?'隐性数对':'隐性三数组',d.digits.length===2?'Hidden pair':'Hidden triple',d.digits.length===2?'隠れペア':'隠れトリプル'),inspection:d.region,reason:say(`这个完整的九格区域必须包含 ${digits}，而这些数字都只能放在 ${cells} 这 ${d.evidence.length} 格。格数与数字数相同，因此这几格不能再填其他候选。缺门的八格区域不能使用这个“必须包含”的依据。`,`This full nine-cell region must contain ${digits}, whose only possible places are ${cells}. The numbers occupy all ${d.evidence.length} cells, so other candidates in those cells can be removed. This reasoning is not used in shortened missing-cell regions.`,`この完全な 9 マスの領域には ${digits} が必要で、入る場所は ${cells} の ${d.evidence.length} マスだけです。これらのマスの他の候補を除外できます。欠けた領域にはこの推論を使いません。`)};
  const [pivot,a,b]=d.evidence.map(name),[x,y,z]=d.digits,xyz=d.technique==='xyz-wing';
  return {title:xyz?'XYZ-Wing':'XY-Wing',inspection:d.evidence,reason:say(`${pivot} 是支点，${a}、${b} 分别与支点处于同一个不能重复的区域。\n① 若 ${pivot}=${x}，则 ${a} 不能是 ${x}，只能是 ${z}。\n② 若 ${pivot}=${y}，则 ${b} 不能是 ${y}，只能是 ${z}。${xyz?`\n③ 若 ${pivot}=${z}，支点本身就是 ${z}。`:''}\n所以${xyz?'这三格':'两个翼格'}至少有一格是 ${z}。同时能看到${xyz?'这三格':'两个翼格'}的格子就不能填 ${z}。“看到”指处于同一个不能重复数字的区域。`,`${pivot} is the pivot; ${a} and ${b} each share an all-different region with it.\n1. If ${pivot}=${x}, then ${a} must be ${z}.\n2. If ${pivot}=${y}, then ${b} must be ${z}.${xyz?`\n3. If ${pivot}=${z}, the pivot itself is ${z}.`:''}\nAt least one of ${xyz?'these three cells':'the two wings'} must be ${z}. A cell sharing an all-different region with each of them cannot contain ${z}.`,`${pivot} が軸で、${a} と ${b} はそれぞれ軸と重複禁止領域を共有します。\n① ${pivot}=${x} なら ${a}=${z}。\n② ${pivot}=${y} なら ${b}=${z}。${xyz?`\n③ ${pivot}=${z} なら軸自身が ${z}。`:''}\n${xyz?'この 3 マス':'両翼'}の少なくとも一つは ${z} です。それぞれと重複禁止領域を共有するマスから ${z} を除外できます。`)};
}
