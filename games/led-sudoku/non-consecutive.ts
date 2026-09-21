/** Construct a full non-consecutive solution with domain propagation. Used only
 * before clue removal; the normal bounded solver still proves uniqueness. */
const ALL=511;
const bits=Array.from({length:512},(_,mask)=>Array.from({length:9},(_,d)=>1<<d).filter(bit=>mask&bit));
const support=bits.map(values=>values.reduce((mask,bit)=>mask|(ALL&~(bit|(bit<<1)|(bit>>>1))),0));
const adjacent=Array.from({length:81},(_,i)=>[i%9?i-1:-1,i%9<8?i+1:-1,i-9,i+9].filter(j=>j>=0&&j<81));
export function nonConsecutiveSolution(groups:number[][],random:()=>number,budget=60000, antiKing=false):{solution:number[]|null;nodes:number;exhausted:boolean} {
  const peers=Array.from({length:81},(_,i)=>[...new Set(groups.filter(g=>g.includes(i)).flat())].filter(j=>j!==i));
  // Anti-king + non-consecutive has a constructive Latin-grid family. Try its
  // symmetries before domain search; every enabled all-different group is checked.
  if(antiKing&&budget>0){
    const shuffle=(a:number[])=>{for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j]!,a[i]!];}return a;};
    const order=()=>shuffle([0,1,2]).flatMap(b=>shuffle([0,1,2]).map(r=>b*3+r));
    const offset=Math.floor(random()*9),reverse=random()<.5,transpose=random()<.5;
    for(let attempt=0;attempt<256;attempt++){
      const rows=attempt?order():[0,1,2,3,4,5,6,7,8],cols=attempt?order():[0,1,2,3,4,5,6,7,8];
      const solution=Array.from({length:81},(_,i)=>{const r=rows[transpose?i%9:Math.floor(i/9)]!,c=cols[transpose?Math.floor(i/9):i%9]!;const value=((r*3+Math.floor(r/3)+c+offset)%9*5)%9+1;return reverse?10-value:value;});
      if(groups.every(g=>new Set(g.map(i=>solution[i])).size===g.length)&&adjacent.every((js,i)=>js.every(j=>Math.abs(solution[i]!-solution[j]!)!==1)))return {solution,nodes:0,exhausted:false};
    }
  }
  let nodes=0,exhausted=false;
  function propagate(domains:Uint16Array):boolean {
    const queue=Array.from({length:81},(_,i)=>i),queued=Array<boolean>(81).fill(true);
    const restrict=(i:number,mask:number):boolean=>{if(!mask)return false;if(mask!==domains[i]){domains[i]=mask;if(!queued[i]){queue.push(i);queued[i]=true;}}return true;};
    let at=0;
    while(true){
      while(at<queue.length){const i=queue[at++]!,mask=domains[i]!;queued[i]=false;
        if(!mask)return false;
        if((mask&(mask-1))===0)for(const j of peers[i]!)if(!restrict(j,domains[j]!&~mask))return false;
        for(const j of adjacent[i]!)if(!restrict(j,domains[j]!&support[mask]!))return false;
      }
      for(const group of groups)if(group.length===9)for(let bit=1;bit<=256;bit<<=1){
        let only=-1;for(const i of group)if(domains[i]!&bit){if(only>=0){only=-2;break;}only=i;}
        if(only===-1)return false;if(only>=0&&!restrict(only,bit))return false;
      }
      if(at===queue.length)return true;
    }
  }
  function visit(domains:Uint16Array):number[]|null {
    if(++nodes>budget){exhausted=true;return null;}if(!propagate(domains))return null;
    let best=-1,count=10;
    for(let i=0;i<81;i++){const n=bits[domains[i]!]!.length;if(n>1&&(n<count||n===count&&peers[i]!.length>peers[best]!.length)){best=i;count=n;}}
    if(best<0)return Array.from(domains,mask=>Math.log2(mask)+1);
    const values=bits[domains[best]!]!.slice();for(let i=values.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[values[i],values[j]]=[values[j]!,values[i]!];}
    const cost=(bit:number)=>peers[best]!.reduce((n,j)=>n+Number(!!(domains[j]!&bit)),0)+adjacent[best]!.reduce((n,j)=>n+bits[domains[j]!&~support[bit]!]!.length,0);
    values.sort((a,b)=>cost(a)-cost(b));
    for(const bit of values){const next=domains.slice();next[best]=bit;const result=visit(next);if(result)return result;if(exhausted)return null;}
    return null;
  }
  const solution=visit(new Uint16Array(81).fill(ALL));return {solution,nodes,exhausted};
}
