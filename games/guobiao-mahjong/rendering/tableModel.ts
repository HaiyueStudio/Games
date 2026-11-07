import type { Rect } from '../ui/layout';

export const TILE_THICKNESS = 15, WALL_TILE_PITCH = TILE_THICKNESS + .8, TABLE_ZOOM = 1.15;
export type TableDock = 'none' | 'left' | 'right';
export const TABLE_SIZE = 1000, TABLE_DEPTH = 45, CAMERA_ELEVATION = Math.PI / 6;
export const HAND_STAND_ANGLE = 70 * Math.PI / 180, OPPONENT_STAND_ANGLE = Math.PI / 2, WALL_RADIUS = 350;
export const CAMERA_FOV = 12 * Math.PI / 180;
const SIN = Math.sin(CAMERA_ELEVATION), COS = Math.cos(CAMERA_ELEVATION);
let cachedFrame: TableFrame | undefined;
export interface TableFrame {
  scale: number; cx: number; cy: number; width: number; height: number;
  table: Rect; viewport: Rect; panel: Rect; compact: boolean;
  dock: TableDock; zoom: number;
  focal: number; distance: number; cameraX: number; cameraY: number; cameraZ: number; targetUp: number;
}
/** The physical tabletop fills 95% of the height when the viewport is wide enough. */
export function tableFrame(width: number, height: number, dock: TableDock = 'none'): TableFrame {
  width = Math.max(1, width); height = Math.max(1, height);
  if (cachedFrame?.width === width && cachedFrame.height === height && cachedFrame.dock === dock) return cachedFrame;
  const compact = width < 900, margin = compact ? 10 : 16;
  const sidebar = dock !== 'none' && width >= 1100 ? 352 : 0;
  const available = Math.max(1, width - margin * 2 - sidebar);
  const previousAvailable = Math.max(1, width - margin * 2 - (compact ? 0 : 246));
  const desiredWidth = Math.min(available, previousAvailable * TABLE_ZOOM);
  const tableCenter = margin + available / 2 + (dock === 'left' ? sidebar : 0);
  const focal = height / (2 * Math.tan(CAMERA_FOV / 2));
  // Include the tops of standing racks so the opposite player's cards cannot clip out of view.
  const top = Math.max(500 * SIN,450 * SIN + 65 * COS), far = 450 * COS - 65 * SIN;
  const bottom = 500 * SIN + TABLE_DEPTH * COS, near = 500 * COS - TABLE_DEPTH * SIN;
  const playHeight=height<600?Math.max(1,height-92):height;
  const limit = .95 * playHeight / (2 * focal);
  const distance = Math.max(((top + bottom) / limit - far + near) / 2, focal * TABLE_SIZE / desiredWidth + 460 * COS);
  const targetUp = ((top - bottom) * distance - top * near - bottom * far) / (2 * distance + far - near)+(height<600?-42*distance/focal:0);
  const cameraX = (width / 2 - tableCenter) * (distance - 460 * COS) / focal;
  const scale = focal / distance, cx = width / 2 - cameraX * scale, cy = height / 2 + targetUp * scale;
  const frame = { width, height, compact, dock, zoom: TABLE_ZOOM, scale, cx, cy, focal, distance, cameraX, targetUp,
    cameraY: distance * SIN + targetUp * COS, cameraZ: distance * COS - targetUp * SIN };
  const outline = [[-460,-500],[460,-500],[500,-460],[500,460],[460,500],[-460,500],[-500,460],[-500,-460]];
  const table = bounds(outline.flatMap(([x,z]) => [0,-TABLE_DEPTH].map(y => projectPoint(frame, x!, y, z!))));
  return cachedFrame = Object.freeze({ ...frame, table: Object.freeze(table),
    viewport: Object.freeze({ x: dock === 'left' ? sidebar : 0, y: height<600?8:height*.025, width: width - sidebar, height: playHeight*.95 }),
    panel: Object.freeze({ x: width - 340 - margin, y: 12, width: 340, height: height - 24 }) });
}
type Projection = Pick<TableFrame, 'width' | 'height' | 'focal' | 'distance' | 'cameraX' | 'targetUp'>;
/** Perspective divide matches the public Engine camera and its translated 30-degree view. */
export function projectPoint(frame: Projection, x: number, y: number, z: number) {
  const depth = frame.distance - y * SIN - z * COS, scale = frame.focal / depth;
  return { x: frame.width / 2 + (x - frame.cameraX) * scale,
    y: frame.height / 2 - (y * COS - z * SIN - frame.targetUp) * scale, scale, depth };
}
function bounds(points: Array<{ x: number; y: number }>): Rect {
  const x = Math.min(...points.map(p => p.x)), y = Math.min(...points.map(p => p.y));
  return { x, y, width: Math.max(...points.map(p => p.x)) - x, height: Math.max(...points.map(p => p.y)) - y };
}
export function projectSurfaceRect(frame: TableFrame, rect: Rect, height = 0, billboard = false): Rect {
  const c = projectPoint(frame, rect.x + rect.width / 2 - 500, height, rect.y + rect.height / 2 - 500);
  if (billboard) return { x: c.x - rect.width * c.scale / 2, y: c.y - rect.height * c.scale / 2, width: rect.width * c.scale, height: rect.height * c.scale };
  return bounds([rect.x, rect.x + rect.width].flatMap(x => [rect.y, rect.y + rect.height].map(z => projectPoint(frame, x - 500, height, z - 500))));
}
export interface TableTile {
  tile: number | null; rect: Rect; role: string; seat: number; sourceIndex: number; group: number;
  drawn: boolean; emphasis: string;
  yaw?: number;
  flat?: boolean;
}
export function tilePose(tile: Pick<TableTile, 'rect' | 'role' | 'emphasis' | 'yaw' | 'flat'>) {
  const angle = tile.flat ? 0 : tile.role==='concealed' ? OPPONENT_STAND_ANGLE : ['hand','revealed'].includes(tile.role) ? HAND_STAND_ANGLE : 0;
  const raised = !tile.flat && tile.emphasis === 'selected' ? 9 : 0;
  return { x: tile.rect.x + tile.rect.width / 2 - 500, z: tile.rect.y + tile.rect.height / 2 - 500,
    y: Math.sin(angle) * tile.rect.height / 2 + raised + 1, angle, yaw:tile.yaw??0, thickness: TILE_THICKNESS };
}
export function tileScreenRect(frame: TableFrame, tile: Pick<TableTile, 'rect' | 'role' | 'emphasis' | 'yaw' | 'flat'>): Rect {
  const pose = tilePose(tile), points = [];
  for (const x of [-tile.rect.width / 2, tile.rect.width / 2]) for (const z of [-tile.rect.height / 2, tile.rect.height / 2]) for (const y of [0, pose.thickness]) {
    const yy=y*Math.cos(pose.angle)-z*Math.sin(pose.angle), zz=y*Math.sin(pose.angle)+z*Math.cos(pose.angle);
    points.push(projectPoint(frame,pose.x+x*Math.cos(pose.yaw)+zz*Math.sin(pose.yaw),pose.y+yy,pose.z-x*Math.sin(pose.yaw)+zz*Math.cos(pose.yaw)));
  }
  return bounds(points);
}
export interface WallState { head: number; tail: number }
export interface WallTile { index: number; side: number; stack: number; layer: number; x: number; z: number; yaw: number }
export function wallTile(wall:WallState,index:number,dealerRelative=0):WallTile|null {
  if(index<wall.head||index>wall.tail||index<0||index>=144)return null;
  const stack=Math.floor(index/2),first=stack*2;
  const side=(dealerRelative-Math.floor(stack/18)+4)%4,along=(stack%18-8.5)*30;
  const full=first>=wall.head&&first+1<=wall.tail;
  return {index,side,stack:stack%18,layer:full?1-index%2:0,
    x:side===0?-along:side===1?WALL_RADIUS:side===2?along:-WALL_RADIUS,
    z:side===0?WALL_RADIUS:side===1?along:side===2?-WALL_RADIUS:-along,yaw:side%2?Math.PI/2:0};
}
/** Positions only: this presentation data never contains any undrawn tile identity. */
export function wallTiles(wall: WallState, dealerRelative = 0): WallTile[] {
  const result: WallTile[] = [];
  // Seats advance anticlockwise; the wall is consumed clockwise.
  for(let index=Math.max(0,wall.head);index<=Math.min(143,wall.tail);index++)result.push(wallTile(wall,index,dealerRelative)!);
  return result;
}
export function dealerPosition(relative: number): Rect {
  return [{ x: 875, y: 887, width: 44, height: 44 }, { x: 866, y: 825, width: 44, height: 44 },
    { x: 123, y: 52, width: 44, height: 44 }, { x: 90, y: 825, width: 44, height: 44 }][relative]!;
}
