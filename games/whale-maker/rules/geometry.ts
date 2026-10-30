/** Shared geometric predicates. Touch tolerances belong to the contact policy. */
export interface Bounds {x:number;y:number;w:number;h:number}
export const overlaps=<A extends Bounds,B extends Bounds>(a:A,b:B):boolean=>
    a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
