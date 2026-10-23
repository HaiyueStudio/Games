export interface GamepadProfile {
  cursor?: boolean;
  engineHud?: boolean;
  directions?: readonly [string, string, string, string]; // up, right, down, left
  buttons: Readonly<Record<number, string>>;
  second?: Readonly<Record<number, string>>;
  secondDirections?: readonly [string, string, string, string];
  native?: boolean;
  direct?: boolean;
  help: string;
}
const arrows = ['ArrowUp','ArrowRight','ArrowDown','ArrowLeft'] as const;
const wasd = ['KeyW','KeyD','KeyS','KeyA'] as const;
const puzzle = { cursor:true, buttons:{3:'KeyR'}, help:'左摇杆/方向键移动指针 · A 点选/拖拽 · B 右键 · X/Y 调整选项' };
/** Explicit, reviewed mappings for every manifest entry. No guessed fallback bindings. */
export const GAMEPAD_PROFILES: Readonly<Record<string, GamepadProfile>> = {
  'valley-of-light':{directions:['KeyQ','KeyD','KeyE','KeyA'],buttons:{0:'Space',1:'Escape',2:'KeyH',3:'KeyJ',4:'KeyQ',5:'KeyE',9:'KeyR'},help:'左摇杆平移/旋转桥 · A 行走 · X 提示 · Y 日志 · LB/RB 转桥'},
  'tank-battle':{engineHud:true,directions:wasd,buttons:{0:'KeyJ',2:'KeyJ',9:'KeyP'},secondDirections:arrows,second:{0:'Enter',2:'Enter',9:'KeyP'},help:'左摇杆/方向键移动 · A/X 开火 · Start 暂停 · 第二手柄控制 2P'},
  '2048':{directions:arrows,buttons:{},help:'左摇杆/方向键滑动方块'},
  'billiards-3d':{...puzzle,help:'左摇杆瞄准指针 · 按住 A 拖动球杆，松开发球'},
  billiards:{...puzzle,help:'左摇杆瞄准指针 · 按住 A 拖动，松开发球'},
  'jigsaw-puzzle':{cursor:true,buttons:{2:'KeyR',3:'KeyV'},help:'左摇杆移动指针 · A 拖动拼块/组合 · X 旋转 · Y 原图'},
  'fruit-ninja':{cursor:true,buttons:{2:'KeyP',9:'Space'},help:'左摇杆挥刀 · A 点选界面 · X 暂停/继续 · Start 开始/暂停'},
  'triangle-calendar-puzzle':{...puzzle,buttons:{2:'KeyR',3:'KeyF'},help:'左摇杆移动指针 · A 拾取/拖动拼块 · X 旋转 · Y 翻转'},
  'entanglement-path':{directions:arrows,buttons:{0:'Enter',2:'KeyR',4:'BracketLeft',5:'BracketRight'},help:'左右旋转 · A 放置 · LB/RB 切关'},
  'icosahedron-minesweeper':puzzle,
  'gravity-maze':{directions:arrows,buttons:{0:'Enter',3:'KeyR'},help:'左摇杆/方向键倾斜迷宫 · A 下一关 · Y 重开'},
  'match-3':puzzle,
  'neon-circuit':{directions:wasd,buttons:{0:'Enter',2:'KeyR',6:'KeyS',7:'KeyW',9:'KeyP'},help:'左摇杆转向 · RT 油门 · LT 刹车 · A 确认 · Start 暂停'},
  minesweeper:puzzle,
  'minecraft-lite':{directions:wasd,buttons:{0:'Space',2:'ShiftLeft',4:'Digit1',5:'Digit2'},direct:true,help:'左摇杆移动 · 右摇杆视角 · A 跳跃 · X 疾跑 · RT 挖掘 · LT 放置'},
  mugen:{native:true,buttons:{},help:'左摇杆移动 · A/B/X/Y/LB/RB 攻击 · Start 开始 · 支持双手柄'},
  'pad-simulator':puzzle,
  pacman:{directions:arrows,buttons:{0:'Enter',3:'KeyR',9:'KeyP'},help:'左摇杆/方向键移动 · A 开始 · Start 暂停'},
  piano:{...puzzle,buttons:{},help:'左摇杆移动指针 · A 弹奏琴键 · RT 按住琴键'},
  pong:{directions:wasd,buttons:{0:'Space',3:'KeyR',9:'KeyP'},secondDirections:arrows,second:{9:'KeyP'},help:'左摇杆上下移动球拍 · A 开始 · Start 暂停 · 第二手柄控制右球拍'},
  'sokoban-3d':{directions:arrows,buttons:{0:'Enter',1:'KeyZ',2:'KeyR'},help:'左摇杆/方向键推箱子 · B 撤销 · X 重开'},
  'sky-strike':{directions:wasd,buttons:{0:'KeyJ',1:'KeyK',2:'KeyB',9:'KeyP'},help:'左摇杆移动 · A 开火/出击 · B/X 炸弹 · Start 暂停'},
  'spider-solitaire':{...puzzle,buttons:{},help:'左摇杆移动指针 · 按住 A 拖动纸牌 · RT 点击菜单/发牌'},
  sudoku:{...puzzle,buttons:{},help:'左摇杆选择格子和数字面板 · A 点选 · RT 点击菜单'},
  tetris:{directions:arrows,buttons:{0:'ArrowUp',1:'ArrowDown',2:'Space',9:'KeyP'},help:'左右移动 · 下加速 · A 旋转 · X 硬降 · Start 暂停'},
  'wfc-map':{directions:arrows,buttons:{3:'KeyR'},help:'左摇杆/方向键移动 · Y 重新生成 · 右摇杆操作面板'},
  'rubiks-cube':{...puzzle,buttons:{},help:'左摇杆移动指针 · 按住 A 拖动转层/转视角 · RT 点击菜单'},
  'ak47-range':{direct:true,buttons:{},help:'左摇杆移动 · 右摇杆瞄准 · RT 开火 · X 装弹'},
  pinball:{directions:arrows,buttons:{0:'ArrowDown',1:'Space',2:'KeyR',4:'ArrowLeft',5:'ArrowRight',9:'KeyP'},help:'LB/RB 挡板 · 按住 A 蓄力，松开发射 · B 发射 · Start 暂停'},
  'ink-pinball':{directions:arrows,buttons:{0:'ArrowDown',1:'Space',2:'KeyR',4:'ArrowLeft',5:'ArrowRight',9:'KeyP'},help:'LB/RB 挡板 · 按住 A 蓄力，松开发射 · B 发射 · Start 暂停'},
};

export function keyboardKey(code: string): string {
  if(code.startsWith('Key'))return code.slice(3).toLowerCase();
  if(code.startsWith('Digit'))return code.slice(5);
  return ({Space:' ',ShiftLeft:'Shift',BracketLeft:'[',BracketRight:']',Slash:'/'} as Record<string,string>)[code]??code;
}
