import { Camera3D, CartesianTransform3D, ColorSRGB, DirectionalLight, Entity, PbrMaterial, type HaiyueEngine, type World } from '@haiyue/engine';
import { InstancedMesh3D } from '@haiyue/engine/components';
import { createRoundedBox3D } from '@haiyue/engine/geometry';
import { AmbientLight, EnvironmentLight } from '@haiyue/engine/lighting';
import { InstancedPbrMaterial, RadialShadowMaterial } from '@haiyue/engine/material';
import { InstancedMesh3DRenderSystem, RadialShadowRenderFeature, Render3DSystem } from '@haiyue/engine/systems';
import { compassRects } from '../ui/tablePresentation';
import { tileUv, type TileAtlas } from '../ui/TileAtlas';
import type { Rect } from '../ui/layout';
import type { Observation, Seat } from '../rules/types';
import { CAMERA_ELEVATION, CAMERA_FOV, HAND_STAND_ANGLE, dealerPosition, projectSurfaceRect, tableFrame, tilePose, tileScreenRect, wallTiles, type TableFrame, type TableDock, TILE_THICKNESS, WALL_TILE_PITCH, type TableTile, type WallState } from './tableModel';
import { TileAnimationTimeline, flightAt, tileKey } from './tileAnimations';
import { TableBatch as Batch, type TileBatchPose as Pose } from './TableBatch';
import { RoundedTileBodies } from './RoundedTileBodies';
import { TableSurface, type TableArt } from './TableSurface';

function createTableFrame(world:World){
  const material=new InstancedPbrMaterial(3,{metallic:.08,roughness:.72});
  const geometry=createRoundedBox3D({width:1,height:1,depth:1,radius:.035,segments:2});
  const parts=[
    {w:1000,d:1000,h:43,y:-23.5,color:'#182e22'},
    {w:996,d:996,h:5,y:-2.5,color:'#294d38'},
    {w:941,d:941,h:1.5,y:-.75,color:'#aa8548'},
  ];
  parts.forEach((p,index)=>{
    const matrix=new Float32Array([p.w,0,0,0,0,p.h,0,0,0,0,p.d,0,0,p.y,0,1]);
    const color=ColorSRGB.fromHex(p.color).writeLinear(new Float32Array(4));
    material.setTransform(index,matrix);material.setColor(index,color[0]!,color[1]!,color[2]!,1);
  });
  world.addEntity(new Entity('Instanced PBR table frame').addComponent(new CartesianTransform3D()).addComponent(new InstancedMesh3D(geometry,material)));
}

export class MahjongTable3D {
  private readonly camera=new Camera3D({type:'perspective',fov:CAMERA_FOV,near:1,far:10000});
  private readonly cameraTransform=new CartesianTransform3D({rotation:[-CAMERA_ELEVATION,0,0]});
  private readonly bodies:RoundedTileBodies;
  private readonly surface:TableSurface;
  private readonly faces:Batch;
  private readonly shadow:Batch;
  private readonly faceMaterial:PbrMaterial;
  private readonly instances:InstancedMesh3DRenderSystem;
  private readonly timeline=new TileAnimationTimeline();
  private readonly moving:{faces:Batch;shadow:Batch};
  private frame:TableFrame;
  private key='';
  private wall:ReturnType<typeof wallTiles>=[];
  private dealer=0;
  private staticTileCount=0;
  private staticBuilds=0;
  private movingBuilds=0;
  private viewportKey='';
  private dock:TableDock='none';
  private tileRects=new WeakMap<Rect,Map<string,Rect>>();
  constructor(private readonly engine:HaiyueEngine,world:World,atlas:TileAtlas,art:TableArt){
    this.frame=tableFrame(engine.canvas!.clientWidth,engine.canvas!.clientHeight);
    const camera=new Entity('Mahjong · 30° perspective camera').addComponent(this.camera).addComponent(this.cameraTransform);world.addEntity(camera);
    world.addEntity(new Entity('Mahjong ambient').addComponent(new AmbientLight({color:[.87,.94,.9],intensity:.65})));
    world.addEntity(new Entity('Mahjong soft environment').addComponent(new EnvironmentLight({intensity:.65,diffuseColor:[.8,.9,.82,1],specularColor:[.12,.16,.13,1]})));
    world.addEntity(new Entity('Mahjong key').addComponent(new DirectionalLight({color:[1,.94,.82],intensity:1.6,direction:[-.5,-1,-.35]})));
    world.addSystem(new Render3DSystem(engine,camera,{priority:10,loadOp:'load'}));
    this.instances=new InstancedMesh3DRenderSystem(engine,camera,{loadOp:'load'});this.instances.priority=15;world.addSystem(this.instances);
    world.addSystem(new RadialShadowRenderFeature(engine,camera,{priority:20,loadOp:'load'}));
    createTableFrame(world);
    this.surface=new TableSurface(world,art);this.bodies=new RoundedTileBodies(world);
    this.faceMaterial=new PbrMaterial({baseColorTexture:atlas.source,normalTexture:atlas.normal,normalScale:.38,baseColor:[1,1,1,1],
      metallic:0,roughness:.34,clearcoatFactor:.16,clearcoatRoughnessFactor:.3,doubleSided:true,alphaMode:'mask',alphaCutoff:.12,
      samplers:{baseColor:{minFilter:'linear',magFilter:'linear',mipmapFilter:'linear',maxAnisotropy:8},normal:{minFilter:'linear',magFilter:'linear',mipmapFilter:'linear',maxAnisotropy:8}}});
    this.faces=new Batch(world,'PBR engraved Mahjong faces',this.faceMaterial,1024,true);
    const shadowMaterial=new RadialShadowMaterial({opacity:.25,innerRadius:.34});
    this.shadow=new Batch(world,'Tile contact shadows',shadowMaterial,1024,true);
    this.moving={faces:new Batch(world,'Flying PBR Mahjong faces',this.faceMaterial,256,true),
      shadow:new Batch(world,'Flying shadows',shadowMaterial,128,true)};
    this.drawMoving();this.resize();
  }
  setDock(dock:TableDock){if(this.dock===dock)return;this.dock=dock;this.resize();}
  resize(){
    const canvas=this.engine.canvas!,key=`${canvas.clientWidth}:${canvas.clientHeight}:${this.dock}`;if(key===this.viewportKey)return;
    this.viewportKey=key;this.tileRects=new WeakMap();
    const f=this.frame=tableFrame(canvas.clientWidth,canvas.clientHeight,this.dock);this.cameraTransform.setPosition(f.cameraX,f.cameraY,f.cameraZ);
    this.camera.aspect=f.width/f.height;this.camera.near=Math.max(10,f.distance/4);this.camera.far=f.distance+5000;
  }
  project(rect:Rect,height=0,billboard=false){return projectSurfaceRect(this.frame,rect,height,billboard);}
  tileRect(tile:Pick<TableTile,'rect'|'role'|'emphasis'|'yaw'|'flat'>){
    const key=`${tile.role}:${tile.emphasis==='selected'}:${tile.yaw??0}:${tile.flat??false}`;
    let variants=this.tileRects.get(tile.rect);if(!variants)this.tileRects.set(tile.rect,variants=new Map());
    let rect=variants.get(key);if(!rect){rect=Object.freeze(tileScreenRect(this.frame,tile));variants.set(key,rect);}return rect;
  }
  get animating(){return this.timeline.active;}
  tick(delta:number,paused:boolean,suspended=false){
    if(this.timeline.advance(delta,paused,suspended)){this.drawMoving();if(!this.animating)this.key='';}
  }
  private addTile(tile:number|null,pose:Pose,width:number,depth:number,emphasis='',moving=false){
    const b=moving?this.moving:{faces:this.faces,shadow:this.shadow};
    this.bodies.add(pose,width,depth,['selected','eligible','called','hu'].includes(emphasis),moving);
    // The face sits inside the rounded cap; both atlas maps use exactly the same UVs.
    const faceWidth=Math.max(1,width-3.8),faceDepth=Math.max(1,depth-3.8);
    b.faces.face(pose,faceWidth,faceDepth,TILE_THICKNESS+.12,tileUv(tile));
    if((pose.angle??0)>.01){const [u,v,w,h]=tileUv(tile);b.faces.face(pose,faceWidth,faceDepth,-.12,[u+w,v,-w,h],true);}
    b.shadow.face({x:pose.x+2,y:.75,z:pose.z+3},width*1.22,depth*1.16,0);
  }
  private drawMoving(){
    this.movingBuilds++;this.bodies.beginMoving();this.moving.faces.clear();this.moving.shadow.clear();
    if(this.animating)for(const f of this.timeline.flights){const p=flightAt(f,this.timeline.elapsed);this.addTile(p.tile,p.pose,p.width,p.depth,f.kind==='hu'?'hu':'',true);}
    this.bodies.commit();this.moving.faces.commit();this.moving.shadow.commit();
  }
  sync(tiles:TableTile[],observation:Observation,view:Seat,wall:WallState,epoch:number,paused:boolean,winningTile:number|null){
    this.resize();this.surface.sync(observation,view);
    const changed=this.timeline.sync({tiles,observation,view,wall,epoch,winningTile},paused),hidden=this.timeline.hiddenTargets();
    this.staticTileCount=tiles.filter(t=>!hidden.has(tileKey(t))).length;
    const key=`${view}:${epoch}:${this.animating}:${wall.head}:${wall.tail}:${observation.dealer}:${JSON.stringify(tiles)}`;
    if(key===this.key){if(changed)this.drawMoving();return;}this.key=key;this.staticBuilds++;
    this.bodies.beginStatic();this.faces.clear();this.shadow.clear();
    for(const tile of tiles)if(!hidden.has(tileKey(tile)))this.addTile(tile.tile,tilePose(tile),tile.rect.width,tile.rect.height,tile.emphasis);
    this.dealer=(observation.dealer-view+4)%4;this.wall=wallTiles(wall,this.dealer);
    for(const tile of this.wall)this.addTile(null,{x:tile.x,y:1+tile.layer*WALL_TILE_PITCH,z:tile.z,yaw:tile.yaw},28,38);
    this.faces.commit();this.shadow.commit();this.drawMoving();
  }
  snapshot(){
    const batches=[this.faces,this.shadow,this.moving.faces,this.moving.shadow,this.surface.batch];
    const compass=compassRects({x:500,y:500},{x:0,y:0,width:1000,height:1000});
    return {renderer:'haiyue-mesh3d',projection:this.camera.projectionType,elevationDegrees:Math.round(CAMERA_ELEVATION*180/Math.PI),handStandingDegrees:Math.round(HAND_STAND_ANGLE*180/Math.PI),
      table:{...this.frame.table},viewport:{...this.frame.viewport},heightRatio:this.frame.table.height/this.frame.height,
      dock:this.dock,zoom:this.frame.zoom,tileMeshes:this.staticTileCount+this.wall.length+(this.animating?this.timeline.flights.length:0),batches:7,
      sharedAtlasMaterial:this.faces.material===this.moving.faces.material,
      tileMaterial:{type:'pbr',normalMap:'tiles-normal-v1.png',normalColorSpace:'linear',normalScale:this.faceMaterial.normalScale,roughness:this.faceMaterial.roughness},
      bodies:this.bodies.snapshot(),instanceRendering:{batches:this.instances.getGpuProfile().batchCount,allocations:{...this.instances.allocationStats}},surface:{...this.surface.snapshot(),compassRect:this.project(compass.panel,.65)},
      work:{staticBuilds:this.staticBuilds,movingBuilds:this.movingBuilds,geometryCommits:batches.reduce((n,b)=>n+b.commits,0),geometryPublishedBytes:batches.reduce((n,b)=>n+b.publishedBytes,0)},
      animations:this.timeline.snapshot(),wall:{remaining:this.wall.length,tiles:this.wall.map(t=>({...t}))},
      dealer:{relative:this.dealer,rect:this.project(dealerPosition(this.dealer),.65)}} ;
  }
}
