import { Entity, CartesianTransform3D, Geometry3D, Mesh3D, PbrMaterial, ColorSRGB, createSphere3D, type World } from '@haiyue/engine';
import { createRoundedBox3D, createCylinder3D } from '@haiyue/engine/geometry';
import { CellMaterials, createCellFlag, type CellFlag, type CellSurface } from '../../shared/minesweeper/Theme';

export const CELL_SIZE = 1.1;
export const TILE_TOP = 0.175;
export const REVEAL_DROP = -0.12;

function tileCap(): Geometry3D {
  const rim = [[-.43,-.5],[.43,-.5],[.5,-.43],[.5,.43],[.43,.5],[-.43,.5],[-.5,.43],[-.5,-.43]] as const;
  const positions: number[] = [], normals: number[] = [], uv: number[] = [];
  const triangle = (points: Array<readonly [number, number, number]>, normal: readonly number[]) => {
    for (const [x,y,z] of points) { positions.push(x,y,z); normals.push(...normal); uv.push(x+.5,z+.5); }
  };
  for (let i=0;i<rim.length;i++) {
    const a=rim[i]!,b=rim[(i+1)%rim.length]!;
    const ia=[a[0]*.92,TILE_TOP,a[1]*.92] as const, ib=[b[0]*.92,TILE_TOP,b[1]*.92] as const;
    const oa=[a[0],TILE_TOP-.038,a[1]] as const, ob=[b[0],TILE_TOP-.038,b[1]] as const;
    triangle([[0,TILE_TOP,0],ib,ia],[0,1,0]);
    const dx=b[0]-a[0], dz=b[1]-a[1], length=Math.hypot(dx,dz), n=[dz/length,.8,-dx/length];
    const nl=Math.hypot(...n), normal=n.map(v=>v/nl);
    triangle([ia,ib,ob],normal); triangle([ia,ob,oa],normal);
  }
  return new Geometry3D({positions:new Float32Array(positions),normals:new Float32Array(normals),
    textureCoordinates:[{set:0,data:new Float32Array(uv)}],cullMode:'none'});
}

export interface TileVisual { root: Entity; top: Mesh3D; flag: CellFlag | null; mine: Entity | null }

/** Grid-specific composition; the shared theme supplies the same albedos and flag mesh as spherical mines. */
export class BoardScene {
  private readonly cap=tileCap();
  private readonly body=createRoundedBox3D({width:1,height:.28,depth:1,radius:.035,segments:2});
  private readonly side=new PbrMaterial({baseColor:new ColorSRGB(.11,.24,.3),metallic:.48,roughness:.43});
  private readonly casing=new PbrMaterial({baseColor:new ColorSRGB(.08,.14,.19),metallic:.5,roughness:.5});
  private readonly mineMaterial=new PbrMaterial({baseColor:new ColorSRGB(.10,.12,.15),metallic:.72,roughness:.28});
  private readonly mineShape=createSphere3D({radius:.24,widthSegments:20,heightSegments:14});
  constructor(private readonly world:World,readonly materials:CellMaterials,rows:number,cols:number) {
    const width=cols*CELL_SIZE+.38,depth=rows*CELL_SIZE+.38,cx=(cols-1)*CELL_SIZE/2,cz=(rows-1)*CELL_SIZE/2;
    world.addEntity(new Entity('Titanium board tray').addComponent(new CartesianTransform3D({position:[cx,-.34,cz]}))
      .addComponent(new Mesh3D(createRoundedBox3D({width,height:.3,depth,radius:.12,segments:3}),this.casing)));
    const bolt=createCylinder3D({radiusTop:.075,radiusBottom:.075,height:.035,radialSegments:12});
    for (const x of [-.67,(cols-1)*CELL_SIZE+.67]) for (const z of [-.67,(rows-1)*CELL_SIZE+.67])
      world.addEntity(new Entity('Brass tray screw').addComponent(new CartesianTransform3D({position:[x,-.17,z]})).addComponent(new Mesh3D(bolt,materials.pole)));
  }

  tile(row:number,col:number):TileVisual {
    const root=new Entity(`cell_${row}_${col}`).addComponent(new CartesianTransform3D({position:[col*CELL_SIZE,0,row*CELL_SIZE]}));
    root.addChild(new Entity('Metal tile body').addComponent(new CartesianTransform3D()).addComponent(new Mesh3D(this.body,this.side)));
    const top=new Mesh3D(this.cap,this.materials.surfaces.hidden);
    root.addChild(new Entity('Textured tile face').addComponent(new CartesianTransform3D()).addComponent(top));
    this.world.addEntity(root);return {root,top,flag:null,mine:null};
  }

  update(visual:TileVisual,row:number,col:number,state:'hidden'|'revealed'|'flagged',count:number,surface:CellSurface):void {
    const x=col*CELL_SIZE,z=row*CELL_SIZE,drop=state==='revealed'?REVEAL_DROP:0;
    visual.root.getComponent(CartesianTransform3D)!.setPosition(x,drop,z);
    visual.top.material=surface==='revealed'?this.materials.numbers[count]!:this.materials.surfaces[surface];
    if (state==='flagged'&&!visual.flag) visual.flag=createCellFlag(this.world,[0,1,0],row*1000+col,this.materials,
      {origin:[x,TILE_TOP,z],scale:2.4,right:[1,0,0]});
    if (visual.flag) {
      visual.flag.root.disabled=state!=='flagged';
      visual.flag.cloth.material=surface==='wrong-flag'?this.materials.wrongCloth:this.materials.cloth;
    }
    if (surface==='mine'&&!visual.mine) {
      visual.mine=new Entity(`mine_${row}_${col}`).addComponent(new CartesianTransform3D({position:[x,.26,z]}))
        .addComponent(new Mesh3D(this.mineShape,this.mineMaterial));
      this.world.addEntity(visual.mine);
    }
    if (visual.mine) visual.mine.disabled=surface!=='mine';
  }
}
