import {P2_ENEMIES,P2_BOSSES,WEARABLES} from '../rules/p2-schema';
import { P1_ENEMIES } from '../rules/p1-schema';
import { TOOLS, type Tile } from '../rules/model';

export const PALETTE_CATEGORIES=['敌人','砖块及路径','道具','装饰'] as const;
const enemies=new Set<Tile>(['J','T','plant','fish','squid','spiky','stone','cannon','ghost','iron-turtle','cannonball','firebar','turtle-boss','fire-jumper','bomb','hammer-otter','cactus','cannon-basic','bill-blaster',...P1_ENEMIES,...P2_ENEMIES,...P2_BOSSES]);
const items=new Set<Tile>(['o','G','F','giant-pearl','spring-h','spring-v','basin','p-switch','star','pow','key','ice-flower','wood-crate','snowball','snowball-large','red-pow','cat-bell','boomerang-flower','hammer-suit','pink-coin','koopa-car','one-up','coin-10','coin-30','coin-50',...WEARABLES]);
const decoration=new Set<Tile>(['C','E','water','lava','quicksand','smile-cloud']);
export const categoryOf=(tile:Tile):number=>enemies.has(tile)?0:items.has(tile)?2:decoration.has(tile)?3:1;
export const categoryTools=(category:number):Tile[]=>TOOLS.filter(tile=>categoryOf(tile)===category);
export const categoryPages=(category:number):number=>Math.max(1,Math.ceil(categoryTools(category).length/12));
