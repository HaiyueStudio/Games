/** Four disjoint nine-cell houses, related by a quarter turn about the centre.
 * Select geometry before solving, so all later clues respect these houses. */
const seeds = [
  [10,11,12,19,20,21,28,29,30], // Offset 3×3 windows (Hyper Sudoku).
  [5,6,12,13,14,15,22,23,32],   // Irregular nine-cell shape, matching the reference.
];
export const rotateCell = (i:number):number => i%9*9+8-Math.floor(i/9);
export function symmetricRegions(random:()=>number):number[][] {
  const seed=seeds[Math.floor(random()*seeds.length)]!,mirror=random()<.5;
  let region=seed.map(i=>mirror?Math.floor(i/9)*9+8-i%9:i);
  return Array.from({length:4},()=>{const result=region.slice().sort((a,b)=>a-b);region=region.map(rotateCell);return result;})
    .sort((a,b)=>a[0]!-b[0]!);
}
function adjacent(i:number):number[]{return [i%9?i-1:-1,i%9<8?i+1:-1,i-9,i+9].filter(j=>j>=0&&j<81);}
export function connectedRegion(cells:readonly number[]):boolean {
  if(!cells.length)return false;const seen=new Set([cells[0]!]);
  for(const i of seen)for(const j of adjacent(i))if(cells.includes(j))seen.add(j);
  return seen.size===cells.length;
}
export function validExtraRegions(value:unknown,blocked:readonly boolean[]):value is number[][] {
  if(!Array.isArray(value)||value.length>9)return false;
  const occupied=new Set<number>();
  for(const cells of value){
    if(!Array.isArray(cells)||cells.length!==9||new Set(cells).size!==9||!cells.every(i=>Number.isInteger(i)&&i>=0&&i<81&&!blocked[i]&&!occupied.has(i))||!connectedRegion(cells))return false;
    // A normal row/column/box adds no information and should not be shaded.
    if([ (i:number)=>Math.floor(i/9), (i:number)=>i%9, (i:number)=>Math.floor(i/27)*3+Math.floor(i%9/3) ].some(group=>new Set(cells.map(group)).size===1))return false;
    cells.forEach(i=>occupied.add(i));
  }
  return true;
}
export function regionIndex(regions:readonly number[][]|undefined,cells:readonly number[]):number {
  return regions?.findIndex(region=>region.length===cells.length&&region.every(i=>cells.includes(i)))??-1;
}
export function regionLetter(index:number):string {return String.fromCharCode(65+index);}

/** Non-consecutive grids can make a fixed four-house template overconstrained.
 * Grow a compact region and its half-turn partner from a valid solution instead.
 * Both halves are rainbow at every step; no puzzle clue is removed here. */
export function regionsForSolution(solution:readonly number[],random:()=>number,budget=16000):number[][]|null {
  const order=Array.from({length:36},(_,i)=>i);
  for(let n=order.length-1;n>0;n--){const j=Math.floor(random()*(n+1));[order[n],order[j]]=[order[j]!,order[n]!];}
  const rank=new Map(order.map((i,n)=>[i,n])),seen=new Set<string>();let visits=0;
  function grow(cells:number[],used:number,mirrored:number):number[]|null {
    if(++visits>budget)return null;
    const key=cells.slice().sort((a,b)=>a-b).join(',');if(seen.has(key))return null;seen.add(key);
    if(cells.length===9)return validExtraRegions([cells,cells.map(i=>80-i)],Array(81).fill(false))?cells:null;
    const candidates=[...new Set(cells.flatMap(adjacent))].filter(i=>i<36&&!cells.includes(i)&&!(used&(1<<solution[i]!))&&!(mirrored&(1<<solution[80-i]!)));
    candidates.sort((a,b)=>rank.get(a)!-rank.get(b)!);
    for(const i of candidates){const next=[...cells,i],cols=next.map(j=>j%9);if(Math.max(...cols)-Math.min(...cols)>3)continue;
      const result=grow(next,used|(1<<solution[i]!),mirrored|(1<<solution[80-i]!));if(result)return result;if(visits>budget)return null;
    }
    return null;
  }
  for(const i of order){const region=grow([i],1<<solution[i]!,1<<solution[80-i]!);if(region)return [region.slice().sort((a,b)=>a-b),region.map(j=>80-j).sort((a,b)=>a-b)];if(visits>budget)break;}
  return null;
}
