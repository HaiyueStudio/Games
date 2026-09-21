/** Digits remain 1–9. Staircase geometry spans 12×12 with four absent boxes. */
type BoardShape = { options: { staircase?: boolean } };
export function boardWidth(p: BoardShape): number { return p.options.staircase ? 12 : 9; }
export function boardLength(p: BoardShape): number { return boardWidth(p) ** 2; }
export function staircaseGap(i: number): boolean {
  return Math.floor(i / 36) + Math.floor(i % 12 / 3) === 3;
}
export function cellName(p: BoardShape, i: number): string {
  const width=boardWidth(p);return `R${Math.floor(i/width)+1}C${i%width+1}`;
}
/** Keep row / column / box interleaved for both geometries. */
export function baseUnits(p: BoardShape): number[][] {
  const width=boardWidth(p), boxes:number[][]=[];
  for(let row=0;row<width;row+=3)for(let col=0;col<width;col+=3){
    if(p.options.staircase&&staircaseGap(row*width+col))continue;
    boxes.push(Array.from({length:9},(_,k)=>(row+Math.floor(k/3))*width+col+k%3));
  }
  return Array.from({length:width},(_,n)=>[
    Array.from({length:width},(_,k)=>n*width+k),
    Array.from({length:width},(_,k)=>k*width+n),boxes[n]!
  ]).flat().map(unit=>p.options.staircase?unit.filter(i=>!staircaseGap(i)):unit);
}
