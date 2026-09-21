/** Exterior diagonal sums. Repetition is allowed unless an existing all-different
 * house forbids it; these paths must never be added as Sudoku houses/cages. */
export interface LittleKillerClue { side:'top'|'right'|'bottom'|'left'; index:number; sum:number; }
export function littleKillerPath(clue:Pick<LittleKillerClue,'side'|'index'>):number[] {
  const {side,index}=clue;
  let r=side==='top'?0:side==='bottom'?8:index,c=side==='left'?0:side==='right'?8:index;
  const dr=side==='top'||side==='left'?1:-1,dc=side==='left'||side==='bottom'?1:-1,result:number[]=[];
  while(r>=0&&r<9&&c>=0&&c<9){result.push(r*9+c);r+=dr;c+=dc;}
  return result;
}
export function littleKillerLocations():LittleKillerClue[] {
  const result:LittleKillerClue[]=[],seen=new Set<string>();
  for(const side of ['top','left','bottom','right'] as const)for(let index=0;index<9;index++){
    const clue={side,index,sum:0},cells=littleKillerPath(clue),key=cells.slice().sort((a,b)=>a-b).join(',');
    if(cells.length<2||seen.has(key))continue;
    seen.add(key);result.push(clue);
  }
  return result;
}
const values=Array.from({length:512},(_,m)=>Array.from({length:9},(_,d)=>d+1).filter(d=>m&1<<(d-1)));
/** Exact attainable sums of independent domains, with a cheap interval fast path.
 * Ignoring interactions between unfilled cells is conservative, never a proof of
 * uniqueness. The ordinary solver still enforces every row/column/box. */
export function domainSumPossible(masks:readonly number[],target:number):boolean {
  if(!Number.isInteger(target)||target<0)return false;
  let min=0,max=0,interval=true;
  for(const mask of masks){const ds=values[mask]!;if(!ds?.length)return false;min+=ds[0]!;max+=ds[ds.length-1]!;interval&&=ds.length===ds[ds.length-1]!-ds[0]!+1;}
  if(target<min||target>max)return false;
  if(interval)return true;
  let sums=1n;const cap=(1n<<BigInt(target+1))-1n;
  for(const mask of masks){let next=0n;for(const d of values[mask]!)next|=sums<<BigInt(d);sums=next&cap;}
  return !!(sums&(1n<<BigInt(target)));
}
export function validLittleKillers(value:unknown,blocked:readonly boolean[]):value is LittleKillerClue[] {
  if(!Array.isArray(value)||value.length>32)return false;
  const seen=new Set<string>();
  return value.every(clue=>{
    if(!clue||!['top','right','bottom','left'].includes(clue.side)||!Number.isInteger(clue.index)||clue.index<0||clue.index>8)return false;
    const cells=littleKillerPath(clue),key=cells.slice().sort((a,b)=>a-b).join(',');
    if(cells.length<2||cells.some(i=>blocked[i])||seen.has(key)||!Number.isInteger(clue.sum)||clue.sum<cells.length||clue.sum>cells.length*9)return false;
    seen.add(key);return true;
  });
}
