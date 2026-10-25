// Presentation metadata only; playable entries and assets come from the manifest.
const entries = [
  ['glass-rush', '玻璃疾驰', 'arcade', '驾驭易碎玻璃球，穿越蜿蜒霓虹隧道。躲开障碍，在不断加速中挑战生存纪录。', '◇'],
  ['fruit-ninja', '水果忍者', 'arcade', '划出刀光，切开鲜果。避开炸弹，抓住加时道具，在一分钟内挑战最高分。', '果'],
  ['valley-of-light', '谷外之光', 'puzzle', '转动金桥，连接看似不可能的道路。跟随旅行者微，在光影与错觉之间寻找山谷的出口。', '光'],
  ['tank-battle', '铁甲前线', 'arcade', '穿过砖墙与丛林，守住最后的基地。独自出击，或与朋友并肩迎战。', '坦'],
  ['2048', '2048', 'puzzle', '滑动、合并，再走一步。让相同的数字相遇，向 2048 发起挑战。', '20'],
  ['billiards-3d', '立体台球', 'physics', '找准角度，控制力度。在立体球桌上，打出漂亮的一杆。', '3D'],
  ['billiards', '经典台球', 'physics', '从俯视视角观察球桌，用精准的击球逐个清空目标。', '8'],
  ['jigsaw-puzzle', '拾光拼图', 'puzzle', '上传喜欢的图片，选择行列与旋转模式。让曲线拼块相遇，拼出属于你的风景。', '拼'],
  ['triangle-calendar-puzzle', '三角日历', 'puzzle', '旋转几何拼片，在三角形棋盘上拼出属于今天的答案。', '△'],
  ['entanglement-path', '阡陌交通', 'puzzle', '转动一块拼片，让路线继续延伸。每次选择，都可能走得更远。', '∞'],
  ['icosahedron-minesweeper', '多面体扫雷', 'puzzle', '让熟悉的数字线索绕上二十面体，换个角度挑战你的推理。', '◆'],
  ['gravity-maze', '重力迷宫', 'physics', '轻轻倾斜迷宫，带小球穿过弯道，避开陷阱，抵达终点。', '●'],
  ['match-3', '缤纷消除', 'puzzle', '交换彩色方块，寻找连锁反应。下一次消除，也许会点亮整个棋盘。', '✦'],
  ['neon-circuit', '极速新星', 'arcade', '驶入霓虹赛道，穿越悬空弯道与环形跑道。全速向前，刷新你的圈速。', '速'],
  ['minesweeper', '扫雷', 'puzzle', '读懂数字，插上旗帜。用耐心与推理，安全揭开整张棋盘。', '✹'],
  ['minecraft-lite', '方块世界', 'sandbox', '漫步彩色体素世界，拆下一块，再搭上一块。把想象变成风景。', '▦'],
  ['mugen', 'MUGEN 格斗', 'arcade', '选择角色，进入竞技场。在攻防之间抓住时机，打出你的连招。', 'VS'],
  ['pad-simulator', '节奏打击垫', 'audio', '用指尖敲出节奏，让每一次触碰成为一段新的律动。', '▤'],
  ['pacman', '吃豆人', 'arcade', '吃掉豆子，躲开幽灵。在经典迷宫中，把握反击的机会。', 'ᗧ'],
  ['piano', '钢琴', 'audio', '把键盘变成琴键。随手弹奏，或跟随自动演奏，享受一段旋律。', '♬'],
  ['pong', 'Pong 对决', 'arcade', '反应、回击、得分。与朋友在立体球场上，迎接越来越快的来球。', 'VS'],
  ['sokoban-3d', '立体推箱子', 'puzzle', '看清每一条通道，把箱子推到目标位置。小心，一步也会改变全局。', '⬡'],
  ['sky-strike', '星际突击', 'arcade', '驾驶战机突破密集编队，在弹幕之间穿梭，向下一波敌人进发。', '▲'],
  ['spider-solitaire', '蜘蛛纸牌', 'cards', '理清牌序，腾出空间。在牌与牌之间，找到完成整套花色的路径。', '♠'],
  ['sudoku', '数独', 'puzzle', '从一格确定的数字开始，用笔记和推理，一步步解开谜题。', '9'],
  ['tetris', '俄罗斯方块', 'arcade', '旋转、落下、消行。在不断加速的方块中，保持你的节奏。', '▥'],
  ['wfc-map', '无限小镇', 'procedural', '看模块拼成新的世界，沿着小路探索，每一片地图都有新的可能。', '⌘'],
  ['rubiks-cube', '魔方实验室', 'puzzle', '从二阶到四阶，从经典到镜面。转动魔方，寻找还原的乐趣。', '3×3'],
  ['ak47-range', '前线训练场', 'arcade', '进入训练场，瞄准移动目标，在一次次射击中磨炼反应与准度。', '准'],
  ['pinball', '纸上弹球', 'physics', '在手绘球台上弹起小球，击中星星与蘑菇，让风车为你转动。', '弹'],
  ['ink-pinball', '墨游 · 龙鲤', 'physics', '以墨为球，在宣纸山水间游玩。云龙、游鲤与晕开的笔触，陪你开启水墨之旅。', '墨'],
];

export const genreLabels = { puzzle: '益智', arcade: '街机', physics: '物理', sandbox: '沙盒', procedural: '探索', audio: '音乐', cards: '纸牌', game: '游戏' };
export const filterOptions = [['all', '全部'], ['puzzle', '益智'], ['3d', '立体世界'], ['physics', '物理'], ['arcade', '街机'], ['audio', '音乐']];
const details = new Map(entries.map(([id, title, genre, description, mark]) => [id, { title, genre, description, mark }]));
export const detailFor = game => details.get(game.id) ?? { title: game.title, genre: 'game', description: '选择游戏，开启新的体验。', mark: game.title.slice(0, 2) };
export const is3d = game => game.capabilities.some(value => value.toLowerCase().includes('3d'));
export const gameUrl = (game, gamesRoot = './games/') => `${gamesRoot}${encodeURIComponent(game.id)}/index.html`;
export const thumbnailUrl = (game, siteRoot = './') => `${siteRoot}${game.thumbnail}`;

export function filterGames(games, { category = 'all', term = '', view = 'all', favorites = [], recent = [] } = {}) {
  const query = term.trim().toLocaleLowerCase();
  const result = games.filter(game => {
    const detail = detailFor(game);
    if (view === 'favorites' && !favorites.includes(game.id)) return false;
    if (view === 'recent' && !recent.includes(game.id)) return false;
    if (category === '3d' ? !is3d(game) : category === 'physics'
      ? detail.genre !== 'physics' && !game.capabilities.some(value => value.includes('physics'))
      : category !== 'all' && detail.genre !== category) return false;
    return `${game.id} ${game.title} ${detail.title} ${detail.description} ${genreLabels[detail.genre]}`.toLocaleLowerCase().includes(query);
  });
  return view === 'recent' ? result.sort((a, b) => recent.indexOf(a.id) - recent.indexOf(b.id)) : result;
}
