import { BasicMaterial, CartesianTransform3D, Entity, Mesh3D, createPlane3D, type World } from '@haiyue/engine';
import { createCylinder3D, createSphere3D } from '@haiyue/engine/geometry';
import { HullFireTexture } from './HullFireTexture';
import { uploadNeonCanvas, type NeonRaster } from './NeonRaster';
import { racePose, type RaceTrack } from './RaceRules';
import { MAX_FIREBALLS, type FallingFireball } from './VolcanicHazards';

/** Bounded scene objects: sky, crater eruptions, drifting ash and four reusable road hazards. */
export class VolcanoEnvironment {
  private readonly sky = new CartesianTransform3D();
  private readonly flame: HullFireTexture;
  private readonly eruptions: {transform:CartesianTransform3D;origin:readonly number[];index:number}[]=[];
  private readonly smoke: {transform:CartesianTransform3D;origin:readonly number[];index:number}[]=[];
  private readonly hazards: {rock:CartesianTransform3D;fire:CartesianTransform3D;warning:CartesianTransform3D;warningMaterial:BasicMaterial}[]=[];
  private constructor(world:World, device:GPUDevice, private readonly textures:GPUTexture[], private readonly track:RaceTrack, raster:NeonRaster) {
    const add=(name:string,geometry:ConstructorParameters<typeof Mesh3D>[0],material:BasicMaterial,transform=new CartesianTransform3D()):CartesianTransform3D=>{
      const entity=new Entity(name);entity.addComponent(transform);entity.addComponent(new Mesh3D(geometry,material));world.addEntity(entity);return transform;
    };
    add('Ashfall volcanic panorama',createSphere3D({radius:42000,widthSegments:64,heightSegments:32}),new BasicMaterial({texture:textures[0]!,cullMode:'none',sampler:{minFilter:'linear',magFilter:'linear',addressModeU:'repeat',addressModeV:'clamp-to-edge'}}),this.sky);
    this.flame=new HullFireTexture(device);
    const rock=createSphere3D({radius:1,widthSegments:12,heightSegments:8});
    const volcanicRock=new BasicMaterial({texture:textures[2]!,sampler:{minFilter:'linear',magFilter:'linear',addressModeU:'repeat',addressModeV:'repeat'}});
    const molten=new BasicMaterial({color:[1,.25,.015,1]});
    const fire=new BasicMaterial({texture:this.flame.texture,blending:'additive',depthWrite:false,cullMode:'none'});
    const ash=new BasicMaterial({texture:textures[1]!,color:[.18,.12,.11,.46],blending:'normal',depthWrite:false,cullMode:'none'});
    const plume=createPlane3D({width:1,height:1,normal:'z'});
    const origins=[[0,920,0],[-7400,1600,1700],[6800,1400,-3400]];
    for(const [i,origin] of origins.entries()) {
      const [x,y,z]=origin as [number,number,number];
      const mountain=createCylinder3D({radiusTop:140,radiusBottom:y*1.15,height:y,radialSegments:64,heightSegments:10});
      for(let v=0;v<mountain.positions.length;v+=3) {
        const angle=Math.atan2(mountain.positions[v+2]!,mountain.positions[v]!);
        const elevation=mountain.positions[v+1]!/y+.5;
        const ridge=1+Math.sin(elevation*Math.PI)*(.14*Math.sin(angle*7+i)+.08*Math.cos(angle*13-elevation*4));
        mountain.positions[v]!*=ridge;mountain.positions[v+2]!*=ridge;
      }
      const uv=mountain.textureCoordinates.get(0)!;
      for(let u=0;u<uv.length;u+=2){uv[u]!*=5;uv[u+1]!*=2;}
      add(`Basalt volcano ${i}`,mountain,volcanicRock).setPosition(x,y/2-50,z);
      add(`Molten crater ${i}`,createCylinder3D({radiusTop:138,radiusBottom:125,height:18,radialSegments:24}),molten).setPosition(x,y-45,z);
      for(let n=0;n<16;n++) this.eruptions.push({transform:add(`Eruption fragment ${i}-${n}`,rock,molten),origin,index:n});
      for(let n=0;n<10;n++) this.smoke.push({transform:add(`Volcanic ash ${i}-${n}`,plume,ash),origin,index:n});
    }
    const canvas=raster.canvas(256,256),ctx=canvas.getContext('2d') as CanvasRenderingContext2D;
    ctx.strokeStyle='#ff5c1c';ctx.lineWidth=9;ctx.beginPath();ctx.arc(128,128,111,0,Math.PI*2);ctx.stroke();
    ctx.strokeStyle='#ffe7a3';ctx.lineWidth=4;ctx.beginPath();ctx.arc(128,128,93,0,Math.PI*2);ctx.stroke();
    ctx.fillStyle='#ff3b122d';ctx.beginPath();ctx.arc(128,128,88,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#ffcc7b';ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(103,103);ctx.lineTo(153,153);ctx.moveTo(153,103);ctx.lineTo(103,153);ctx.stroke();
    const warningTexture=uploadNeonCanvas(device,raster,canvas);textures.push(warningTexture);
    for(let i=0;i<MAX_FIREBALLS;i++) {
      const warningMaterial=new BasicMaterial({texture:warningTexture,blending:'additive',depthWrite:false,cullMode:'none'});
      this.hazards.push({rock:add(`Falling fireball ${i}`,rock,volcanicRock),fire:add(`Fireball flame ${i}`,plume,fire),
        warning:add(`Fireball landing warning ${i}`,createPlane3D({width:1,height:1,normal:'y'}),warningMaterial),warningMaterial});
    }
    this.update(0,[0,0,0],[]);
  }
  static async create(world:World,device:GPUDevice,raster:NeonRaster,track:RaceTrack):Promise<VolcanoEnvironment> {
    const textures=await Promise.all(['volcano-panorama','smoke-puff','volcanic-rock'].map(name=>raster.loadTexture(device,name)));
    return new VolcanoEnvironment(world,device,textures,track,raster);
  }
  update(time:number,eye:ArrayLike<number>,balls:readonly FallingFireball[]):void {
    this.sky.setPosition(eye[0]!,eye[1]!,eye[2]!);this.flame.update(time,1);
    for(const e of this.eruptions) {
      const t=(time*.25+e.index/16)%1,a=e.index*2.39996,r=t*380;
      e.transform.setPosition(e.origin[0]!+Math.cos(a)*r,e.origin[1]!+Math.sin(t*Math.PI)*780-60,e.origin[2]!+Math.sin(a)*r).setScale(...Array(3).fill(9+(e.index%4)*3) as [number,number,number]);
    }
    for(const e of this.smoke) {
      const t=(time*.055+e.index/10)%1,x=e.origin[0]!+t*500,y=e.origin[1]!+t*1600;
      e.transform.setPosition(x,y,e.origin[2]!).setScale(300+t*850,300+t*850,1).setRotation(0,Math.atan2(eye[0]!-x,eye[2]!-e.origin[2]!),0);
    }
    for(const [i,h] of this.hazards.entries()) {
      const ball=balls[i];
      if(!ball){h.rock.setScale(0,0,0);h.fire.setScale(0,0,0);h.warning.setScale(0,0,0);continue;}
      const p=racePose(this.track,{distance:ball.distance,lateral:ball.lateral});
      const t=Math.min(1,ball.age/ball.fallTime),blast=Math.max(0,ball.age-ball.fallTime),height=(1-t*t)*650;
      const size=ball.radius*(blast>0?1+blast*2:1);
      h.rock.setPosition(p.x,p.y+height+10,p.z).setScale(...Array(3).fill(blast>0?0:ball.radius*.6) as [number,number,number]);
      h.fire.setPosition(p.x,p.y+height+size*.8,p.z).setScale(size*2.4,size*5*(blast>0?Math.max(0,1-blast/.9):1),1).setRotation(0,Math.atan2(eye[0]!-p.x,eye[2]!-p.z),0);
      h.warning.setPosition(p.x,p.y+2.5,p.z).setRotation(-p.pitch,p.heading,p.bank).setScale(size*2.4,1,size*2.4);
      h.warningMaterial.color=[1,.65+.35*Math.sin(time*18)**2,.5,blast>0?Math.max(0,1-blast/.9):.85];
    }
  }
  destroy():void {this.flame.destroy();for(const texture of this.textures)texture.destroy();}
}
