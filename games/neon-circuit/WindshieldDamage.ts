export type ImpactSide = -1 | 0 | 1;
export interface FractureCluster { x:number; y:number; seed:number; side:-1|1; strength:number }
/** Reproducible variations per impact, bounded history, and no frame-based randomness. */
export class WindshieldDamage {
  readonly clusters:FractureCluster[]=[];
  revision=0;
  private health=100;
  private pending=0;
  private seed:number;
  constructor(seed=0xface731){this.seed=seed>>>0;}
  private random():number{this.seed=(Math.imul(this.seed,1664525)+1013904223)>>>0;return this.seed/0x100000000;}
  update(health:number,side:ImpactSide):void {
    health=Math.max(0,Math.min(100,health));
    if(health>this.health){this.clusters.length=0;this.pending=0;this.revision++;}
    const loss=this.health-health;this.health=health;
    if(loss<=0)return;
    this.pending+=loss;
    if(this.pending<2 && this.clusters.length>0)return;
    const amount=this.pending;this.pending=0;
    const target=side || (this.random()<.5?-1:1);
    // Keep impact centres on the hit half and away from the middle of the road view.
    const x=target<0?.05+this.random()*.18:.77+this.random()*.18;
    this.clusters.push({x,y:.17+this.random()*.64,seed:Math.floor(this.random()*0xffffffff),side:target,
      strength:Math.min(1,.22+amount/35)});
    if(this.clusters.length>10)this.clusters.shift();
    this.revision++;
  }
  get snapshot(){return {revision:this.revision,health:this.health,clusters:this.clusters.map(c=>({...c}))};}
}
