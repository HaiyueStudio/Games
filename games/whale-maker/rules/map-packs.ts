import { classicLevel, classicStageName, CLASSIC_STAGE_COUNT } from './classic';
import { demo, type Level } from './model';
import { frostLevel } from './frost-level';
import { workshopLevel } from './workshop-level';
import { desertLevel } from './desert-level';
import { p0Level } from './p0-level';
import { p1Level, P1_DEMOS } from './p1-levels';
import { p2Level, P2_DEMOS } from './p2-levels';
import { modernLevel } from './profile';
import { lostLevelsData } from '../levels/lost-levels-data';

export interface PackCourse { id: string; title: string; make(): Level }
export interface MapPack { id: string; title: string; description: string; sequential: boolean; courses: readonly PackCourse[] }

const courses = (prefix: string, titles: readonly string[], factory: (index: number) => Level): PackCourse[] =>
    titles.map((title, index) => ({ id: `${prefix}-${index + 1}`, title, make: () => modernLevel(factory(index)) }));

export const MAP_PACKS: readonly MapPack[] = [
    {
        id: 'classic', title: '初代马里奥',
        description: '8 个世界 · 32 关 · 按顺序闯关，也可自由选关',
        sequential: true,
        courses: Array.from({ length: CLASSIC_STAGE_COUNT }, (_, index) => ({
            id: classicStageName(index), title: classicStageName(index), make: () => modernLevel(classicLevel(index)),
        })),
    },
    {
        id: 'whale', title: '鲸屿冒险',
        description: '教学冒险、冰火、流沙与机关工坊',
        sequential: false,
        courses: [
            ...courses('coast', ['珍珠海岸', '反墙星湾', '机关试验海岸', '藤蔓秘境', '火焰机关城'], demo),
            { id: 'frost', title: '鲸鱼娘冰火试验', make: () => modernLevel(frostLevel()) },
            { id: 'workshop', title: '机关工坊', make: () => modernLevel(workshopLevel()) },
            { id: 'desert', title: '沙漠与流沙', make: () => modernLevel(desertLevel()) },
        ],
    },
    {
        id: 'trials', title: '机关试验',
        description: '冰晶基础、人物能力、穿戴与首领试验',
        sequential: false,
        courses: [
            { id: 'p0', title: '冰晶试验', make: () => p0Level() },
            ...courses('p1', P1_DEMOS, p1Level),
            ...courses('p2', P2_DEMOS, p2Level),
        ],
    },
    {
        id: 'lost-levels', title: '失落的关卡',
        description: '日版二代 · 1–9、A–D 世界 · 52 关 · 毒珍珠',
        sequential: true,
        courses: lostLevelsData.map((level, index) => {
            const id = `${['1','2','3','4','5','6','7','8','9','A','B','C','D'][Math.floor(index / 4)]}-${index % 4 + 1}`;
            return { id, title: id, make: () => modernLevel(level()) };
        }),
    },
];

export function mapPack(id: string): MapPack {
    const pack = MAP_PACKS.find(pack => pack.id === id);
    if (!pack) throw Error('地图包不存在');
    return pack;
}

export function packLevel(id: string, index: number): Level {
    const pack = mapPack(id);
    if (!Number.isInteger(index) || index < 0 || index >= pack.courses.length) throw Error('地图包关卡编号无效');
    return pack.courses[index]!.make();
}

export const MAP_PACK_CHARS = MAP_PACKS.map(pack => pack.title + pack.description + pack.courses.map(course => course.title).join('')).join('') +
    '地图包选择关卡选择世界关卡从头闯关开始游玩载入编辑关闭返回初代八世界全部完成准备进入下一关选择后开始游玩会重新开始当前关卡城堡水下夜色自由选关第下一张重开走错城堡通道，返回这一段的起点金币密室水下航道云上宝藏地上出口城堡通道新建包复制包改名新增删除关卡导出包导入包保存地图包应用名称顺序闯关选择跳关目的地使用此关清除跳关设置跳关终点后续关当前关卡已保存失落险峻秘径深层日版毒珍珠自制副本我的地图';
