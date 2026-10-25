import { BasicMaterial, Camera3D, CartesianTransform3D, Entity, Geometry3D, Mesh3D, World, type HaiyueEngine } from '@haiyue/engine';
import { Render3DSystem } from '@haiyue/engine/systems';
import { RenderIntegration } from '@haiyue/engine/experimental';
import { pieceCenter, rotate, type Group, type Point, type Puzzle } from '../rules/model';
import type { PieceTexture } from './images';

export interface DeskView { x: number; y: number; width: number; height: number; center: Point; scale: number }
export function project(point: Point, view: DeskView): Point {
  return { x: view.x + view.width / 2 + (point.x - view.center.x) * view.scale, y: view.y + view.height / 2 + (point.y - view.center.y) * view.scale };
}
export function unproject(point: Point, view: DeskView): Point {
  return { x: view.center.x + (point.x - view.x - view.width / 2) / view.scale, y: view.center.y + (point.y - view.y - view.height / 2) / view.scale };
}
function plane(width: number, height: number): Geometry3D {
  return new Geometry3D({ positions: new Float32Array([-width / 2, height / 2, 0, -width / 2, -height / 2, 0, width / 2, -height / 2, 0, width / 2, height / 2, 0]),
    textureCoordinates: [{ set: 0, data: new Float32Array([0, 0, 0, 1, 1, 1, 1, 0]) }], indices: new Uint16Array([0, 1, 2, 0, 2, 3]), cullMode: 'none' });
}
/** Textured quads, alpha blending, camera projection and GPU resource lifetime are Engine-owned. */
export class JigsawScene {
  readonly world = new World('Jigsaw pieces');
  private readonly camera = new Camera3D({ type: 'orthographic', near: .1, far: 2000 });
  private readonly transforms: CartesianTransform3D[] = [];
  private readonly materials: BasicMaterial[] = [];
  private readonly board: CartesianTransform3D;
  private readonly table: CartesianTransform3D;
  private readonly hitContext = document.createElement('canvas').getContext('2d')!;
  constructor(private readonly engine: HaiyueEngine, readonly puzzle: Puzzle, private readonly textures: PieceTexture[], image: HTMLCanvasElement, private readonly deskTexture: HTMLCanvasElement) {
    const cameraEntity = new Entity('Jigsaw orthographic camera').addComponent(this.camera).addComponent(new CartesianTransform3D({ position: [0, 0, 1000] }));
    this.world.addEntity(cameraEntity);
    const render = new Render3DSystem(engine, cameraEntity, { loadOp: 'clear' }); render.transparentSort = true;
    this.world.addSystem(render);
    this.table = this.mesh('Oak tabletop', 1, 1, deskTexture).transform;
    const guide = document.createElement('canvas'); guide.width = image.width; guide.height = image.height;
    const ctx = guide.getContext('2d')!; ctx.fillStyle = '#ffedc514'; ctx.fillRect(0, 0, guide.width, guide.height);
    ctx.globalAlpha = .14; ctx.drawImage(image, 0, 0); ctx.globalAlpha = 1;
    ctx.strokeStyle = '#68462d99'; ctx.lineWidth = 3; ctx.strokeRect(1.5, 1.5, guide.width - 3, guide.height - 3);
    this.board = this.mesh('Image frame', puzzle.width, puzzle.height, guide).transform;
    for (const piece of puzzle.pieces) {
      const texture = textures[piece.id]!;
      const visual = this.mesh(`Piece ${piece.id}`, puzzle.cellWidth + 2 * texture.padding, puzzle.cellHeight + 2 * texture.padding, texture.canvas);
      this.transforms.push(visual.transform); this.materials.push(visual.material);
    }
    const integration = new RenderIntegration(engine, { label: 'Jigsaw.render' });
    this.world.addRuntimeIntegration(integration); integration.registerAll(this.world, () => ({ pass: 'shared' }));
  }
  private mesh(name: string, width: number, height: number, texture: HTMLCanvasElement) {
    const transform = new CartesianTransform3D(), material = new BasicMaterial({ texture, blending: 'normal', depthWrite: false, cullMode: 'none' });
    this.world.addEntity(new Entity(name).addComponent(transform).addComponent(new Mesh3D(plane(width, height), material)));
    return { transform, material };
  }
  sync(view: DeskView, selected: Group | null): void {
    const width = this.engine.displayWidth, height = this.engine.displayHeight;
    this.camera.orthoLeft = -width / 2; this.camera.orthoRight = width / 2; this.camera.orthoTop = height / 2; this.camera.orthoBottom = -height / 2;
    // Cover the viewport without stretching the grain. The tabletop stays still while pieces pan/zoom.
    const tableScale = Math.max(width / this.deskTexture.width, height / this.deskTexture.height);
    this.table.setPosition(0, 0, -20); this.table.setScale(this.deskTexture.width * tableScale, this.deskTexture.height * tableScale, 1);
    const place = (transform: CartesianTransform3D, point: Point, angle: number, z: number) => {
      const p = project(point, view); transform.setPosition(p.x - width / 2, height / 2 - p.y, z);
      transform.setRotation(0, 0, -angle * Math.PI / 2); transform.setScale(view.scale, view.scale, 1);
    };
    place(this.board, { x: 0, y: 0 }, 0, -10);
    [...this.puzzle.groups].sort((a, b) => a.order - b.order).forEach((group, rank) => {
      for (const id of group.pieces) {
        place(this.transforms[id]!, pieceCenter(this.puzzle.pieces[id]!, group), group.angle, rank * .1);
        this.materials[id]!.color = group === selected ? [1, 1, 1, 1] : [.94, .94, .94, 1];
      }
    });
  }
  pick(point: Point): Group | null {
    for (const group of [...this.puzzle.groups].sort((a, b) => b.order - a.order)) {
      const local = rotate({ x: point.x - group.x, y: point.y - group.y }, -group.angle);
      for (const id of group.pieces) {
        const piece = this.puzzle.pieces[id]!;
        if (this.hitContext.isPointInPath(this.textures[id]!.path, local.x - piece.center.x + this.puzzle.cellWidth / 2, local.y - piece.center.y + this.puzzle.cellHeight / 2)) return group;
      }
    }
    return null;
  }
  draw(time: number, delta: number): void { this.world.update(time, delta); }
  destroy(): void { this.world.destroy(); }
}
