export const LANGUAGES = ['zh', 'en', 'ja'] as const;
export type Language = typeof LANGUAGES[number];
export const LANGUAGE_NAMES: Record<Language, string> = { zh: '简体中文', en: 'English', ja: '日本語' };
export function normalizeLanguage(value: unknown): Language { return value === 'en' || value === 'ja' ? value : 'zh'; }
export interface LanguageStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
export const LANGUAGE_KEY = 'neon.language';
export function readLanguage(storage?: LanguageStorage): Language {
  try { return normalizeLanguage(storage?.getItem(LANGUAGE_KEY)); } catch { return 'zh'; }
}
export function saveLanguage(storage: LanguageStorage | undefined, language: Language): void {
  try { storage?.setItem(LANGUAGE_KEY, language); } catch { /* The current session still switches if storage is unavailable. */ }
}
const zh = {
  title: '极速新星', league: '海月 / 反重力竞速联赛', intro: '选择你的赛道，向极速进发。',
  advice: '主动转向，提前刹车，守住车体耐久。',
  keys: 'W / ↑ 加速   S / ↓ 刹车   A D / ← → 转向', keysMore: 'P 暂停 / 继续   R 重开',
  touchHint: '左侧控制转向，右侧刹车与油门', gyroHint: '左右倾斜转向，右侧刹车与油门',
  swipe: '左右滑动切换赛道', swipeKeys: '左右滑动 / A D / ← → 切换赛道', start: '开始竞速',
  paused: '比赛暂停', resume: '继续游戏', home: '返回首页', retry: '再次挑战', finished: '比赛完成', destroyed: '赛车损毁', record: '新纪录！',
  lap: '圈数', time: '用时', best: '最佳', hull: '耐久', brake: '刹车', throttle: '油门',
  settings: '设置', language: '界面语言', controls: '控制方式', joystick: '虚拟摇杆', gyro: '陀螺仪', done: '完成',
  desktopControls: '键盘 / 触控', gyroUnavailable: '此设备不支持陀螺仪',
  loadingCar: '正在加载赛车…', loadingTrack: '正在加载赛道…', preparing: '正在准备极速新星…', startupError: '启动失败，请重新启动游戏。',
  laps: '圈', lapNotice: '第 {lap} / {total} 圈',
};
export type CopyKey = keyof typeof zh;
export const TEXT: Record<Language, Record<CopyKey, string>> = {
  zh,
  en: {
    title: 'VELOCITY NOVA', league: 'HAIYUE / ANTI-GRAVITY LEAGUE', intro: 'Choose your circuit. Chase the limit.',
    advice: 'Steer into turns. Brake early. Protect your hull.', keys: 'W / ↑ Throttle   S / ↓ Brake   A D / ← → Steer', keysMore: 'P Pause / resume   R Restart',
    touchHint: 'Steer on the left. Brake and throttle on the right.', gyroHint: 'Tilt to steer. Brake and throttle on the right.',
    swipe: 'Swipe to choose a circuit', swipeKeys: 'Swipe / A D / ← → to choose a circuit', start: 'RACE',
    paused: 'RACE PAUSED', resume: 'RESUME', home: 'HOME', retry: 'RACE AGAIN', finished: 'RACE COMPLETE', destroyed: 'SHIP WRECKED', record: 'NEW RECORD!',
    lap: 'LAP', time: 'TIME', best: 'BEST', hull: 'HULL', brake: 'BRAKE', throttle: 'THROTTLE',
    settings: 'SETTINGS', language: 'LANGUAGE', controls: 'STEERING', joystick: 'Joystick', gyro: 'Tilt steering', done: 'DONE',
    desktopControls: 'Keyboard / touch', gyroUnavailable: 'Tilt steering unavailable on this device',
    loadingCar: 'Loading ship…', loadingTrack: 'Loading circuit…', preparing: 'Preparing Velocity Nova…', startupError: 'Unable to start. Please restart the game.',
    laps: 'LAPS', lapNotice: 'LAP {lap} / {total}',
  },
  ja: {
    title: 'スピードノヴァ', league: 'HAIYUE / 反重力レーシングリーグ', intro: 'コースを選び、限界の速さへ。',
    advice: 'カーブでは早めに減速し、機体を守ろう。', keys: 'W / ↑ 加速   S / ↓ ブレーキ   A D / ← → 操舵', keysMore: 'P 一時停止 / 再開   R リスタート',
    touchHint: '左側で操舵、右側でブレーキとアクセル', gyroHint: '左右に傾けて操舵、右側でブレーキとアクセル',
    swipe: '左右にスワイプしてコース選択', swipeKeys: 'スワイプ / A D / ← → でコース選択', start: 'レース開始',
    paused: '一時停止', resume: 'レース再開', home: 'ホームへ', retry: 'もう一度挑戦', finished: 'レース完了', destroyed: '機体大破', record: '新記録！',
    lap: '周回', time: 'タイム', best: 'ベスト', hull: '耐久', brake: 'ブレーキ', throttle: 'アクセル',
    settings: '設定', language: '言語', controls: '操作方法', joystick: 'ジョイスティック', gyro: 'ジャイロ', done: '完了',
    desktopControls: 'キーボード / タッチ', gyroUnavailable: 'この端末はジャイロ操作に非対応です',
    loadingCar: '機体を読み込み中…', loadingTrack: 'コースを読み込み中…', preparing: 'スピードノヴァを準備中…', startupError: '起動できません。ゲームを再起動してください。',
    laps: '周', lapNotice: '{lap} / {total} 周目',
  },
};
interface CourseText { name: string; difficulty: string; description: string }
export const COURSE_TEXT: Record<'en' | 'ja', Record<string, CourseText>> = {
  en: {
    'sky-harbor': {name:'Sky Harbor',difficulty:'Beginner · Sweeping turns',description:'Accelerate around the skyport.\nLearn to steer and brake on wide turns.'},
    'neon-city': {name:'Neon Metropolis',difficulty:'Advanced · Rolling circuit',description:'Race between the skyscrapers.\nMaster elevated turns and steep drops.'},
    'reactor-run': {name:'Reactor Run',difficulty:'Expert · Consecutive S-bends',description:'Dive into the energy core.\nHold your line through tight reversals.'},
    'rainbow-road': {name:'Rainbow Road',difficulty:'Ultimate · Cosmic crossings',description:'Fly through rings and meteor showers.\nClimb and dive along the rainbow road.'},
    'sky-coaster': {name:'Sky Coaster',difficulty:'Extreme · Loops and spirals',description:'Soar above the sunlit clouds.\nTake on vertical loops, rolls and spirals.'},
  },
  ja: {
    'sky-harbor': {name:'天空の港',difficulty:'初級 · 高速ワイドカーブ',description:'空港の外周で加速し、\n広いカーブで操舵と減速を覚えよう。'},
    'neon-city': {name:'ネオンシティ',difficulty:'上級 · 起伏のロングコース',description:'摩天楼の間を駆け抜け、\n高架の連続カーブと急降下を制覇しよう。'},
    'reactor-run': {name:'リアクター回廊',difficulty:'エキスパート · 連続Ｓ字',description:'エネルギーコアの奥へ。\n折り返しと連続カーブで機体を守ろう。'},
    'rainbow-road': {name:'レインボーロード',difficulty:'究極 · 宇宙の立体交差',description:'光のリングと流星群を越え、\n虹色の空中コースで上昇と降下に挑もう。'},
    'sky-coaster': {name:'スカイコースター',difficulty:'極限 · ループとスパイラル',description:'晴れ渡る雲海の上を飛び、\n垂直ループとひねり、らせんを走り抜けよう。'},
  },
};
export function localizeCourse<T extends CourseText & {id:string}>(course:T,language:Language):T {
  return language === 'zh' ? course : {...course,...COURSE_TEXT[language][course.id]};
}
export function lapNotice(language:Language,lap:number,total:number):string {
  return TEXT[language].lapNotice.replace('{lap}',String(lap)).replace('{total}',String(total));
}
export const LOCALE_GLYPHS = [...new Set(JSON.stringify(TEXT)+JSON.stringify(COURSE_TEXT)+Object.values(LANGUAGE_NAMES).join(''))].join('');
