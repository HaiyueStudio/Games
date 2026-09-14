import { uploadNeonCanvas, type NeonRaster } from './NeonRaster';
import type { WindshieldDamage } from './WindshieldDamage';
/** One persistent GPU layer, redrawn only when a damage cluster changes. */
export class WindshieldGlass {
  readonly texture:GPUTexture;
  private revision=-1;
  constructor(private readonly device:GPUDevice,private readonly raster:NeonRaster){
    this.texture=device.createTexture({label:'Windshield.directionalFractures',size:[1280,720],format:'rgba8unorm',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST});
  }
  update(damage:WindshieldDamage):void {
    if(damage.revision===this.revision)return;this.revision=damage.revision;
    const canvas=this.raster.canvas(1280,720),ctx=canvas.getContext('2d') as CanvasRenderingContext2D;
    const severity=(100-damage.snapshot.health)/100;
    for(const cluster of damage.clusters){
      let seed=cluster.seed;
      const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/0x100000000;};
      const cx=cluster.x*1280,cy=cluster.y*720;
      const rays:{x:number;y:number}[][]=[];
      const rayCount=7+Math.floor(cluster.strength*5);
      for(let r=0;r<rayCount;r++){
        const angle=r/rayCount*Math.PI*2+random()*.48;
        const length=(65+random()*135)*(.7+cluster.strength*.35+severity*.4),points=[{x:cx,y:cy}];
        for(let s=1;s<=5;s++){
          const a=angle+(random()-.5)*.3;
          const x=cx+Math.cos(a)*length*s/5;
          points.push({x:cluster.side<0?Math.min(590,x):Math.max(690,x),y:cy+Math.sin(a)*length*s/5});
        }
        rays.push(points);
      }
      const stroke=(points:{x:number;y:number}[],width:number)=>{
        ctx.lineWidth=width;ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.stroke();
      };
      ctx.lineJoin='round';
      for(const ray of rays){
        ctx.strokeStyle='#09161d8c';stroke(ray,3.2);
        ctx.strokeStyle='#e1f6ffb8';stroke(ray,1.05);
        const p=ray[2]!,q=ray[3]!;const x=q.x+(random()-.5)*40;
        stroke([p,{x:cluster.side<0?Math.min(590,x):Math.max(690,x),y:q.y+(random()-.5)*40}],.7);
      }
      for(let r=0;r<rays.length;r++)for(let ring=1;ring<=2+Math.floor(severity*2);ring++){
        if(random()<.4)continue;
        ctx.strokeStyle='#c6dfeb70';stroke([rays[r]![ring]!,rays[(r+1)%rays.length]![ring]!],.65);
      }
    }
    uploadNeonCanvas(this.device,this.raster,canvas,this.texture);
  }
  destroy():void{this.texture.destroy();}
}
