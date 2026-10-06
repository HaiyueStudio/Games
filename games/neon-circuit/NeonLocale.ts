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
    raceSetup:'比赛模式', timeTrial:'单人计时', duel:'人机竞速', difficulty:'人机难度', easy:'简单', normal:'普通', hard:'困难', duelRules:'双方撞击只减速，率先完成 3 圈获胜。', trialRules:'保护赛车，挑战个人最佳纪录。', playerWin:'你赢了！', opponentWin:'人机获胜', tie:'并列冲线', position:'名次',
  title: '极速新星', league: '海月 / 反重力竞速联赛', intro: '选择你的赛道，向极速进发。',
  advice: '主动转向，提前刹车，守住车体耐久。',
  keys: 'W / ↑ 加速   S / ↓ 刹车   A D / ← → 转向', keysMore: 'P 暂停 / 继续   R 重开',
  touchHint: '左侧控制转向，右侧刹车与油门', gyroHint: '左右倾斜转向，右侧刹车与油门',
  swipe: '左右滑动切换赛道', swipeKeys: '左右滑动 / A D / ← → 切换赛道', start: '开始竞速',
  paused: '比赛暂停', resume: '继续游戏', home: '返回首页', retry: '再次挑战', finished: '比赛完成', destroyed: '赛车损毁', record: '新纪录！',
  lap: '圈数', time: '用时', best: '最佳', hull: '耐久', brake: '刹车', throttle: '油门',
  camera: '视角模式', chase: '第三人称', firstPerson: '第一人称', settings: '设置', language: '界面语言', controls: '控制方式', joystick: '虚拟摇杆', gyro: '陀螺仪', done: '完成',
  desktopControls: '键盘 / 触控', gyroUnavailable: '此设备不支持陀螺仪',
  loadingCar: '正在加载赛车…', loadingTrack: '正在加载赛道…', preparing: '正在准备极速新星…', startupError: '启动失败，请重新启动游戏。',
  laps: '圈', lapNotice: '第 {lap} / {total} 圈',
};
export type CopyKey = keyof typeof zh;
export const TEXT: Record<Language, Record<CopyKey, string>> = {
  zh,
  en: {
    raceSetup:'RACE MODE', timeTrial:'Time trial', duel:'Race AI', difficulty:'AI DIFFICULTY', easy:'Easy', normal:'Normal', hard:'Hard', duelRules:'Impacts slow both racers. First to finish 3 laps wins.', trialRules:'Protect your hull. Beat your personal best.', playerWin:'YOU WIN!', opponentWin:'AI WINS', tie:'PHOTO FINISH · TIE', position:'POS',
    title: 'VELOCITY NOVA', league: 'HAIYUE / ANTI-GRAVITY LEAGUE', intro: 'Choose your circuit. Chase the limit.',
    advice: 'Steer into turns. Brake early. Protect your hull.', keys: 'W / ↑ Throttle   S / ↓ Brake   A D / ← → Steer', keysMore: 'P Pause / resume   R Restart',
    touchHint: 'Steer on the left. Brake and throttle on the right.', gyroHint: 'Tilt to steer. Brake and throttle on the right.',
    swipe: 'Swipe to choose a circuit', swipeKeys: 'Swipe / A D / ← → to choose a circuit', start: 'RACE',
    paused: 'RACE PAUSED', resume: 'RESUME', home: 'HOME', retry: 'RACE AGAIN', finished: 'RACE COMPLETE', destroyed: 'SHIP WRECKED', record: 'NEW RECORD!',
    lap: 'LAP', time: 'TIME', best: 'BEST', hull: 'HULL', brake: 'BRAKE', throttle: 'THROTTLE',
    camera: 'CAMERA', chase: 'Chase camera', firstPerson: 'First person', settings: 'SETTINGS', language: 'LANGUAGE', controls: 'STEERING', joystick: 'Joystick', gyro: 'Tilt steering', done: 'DONE',
    desktopControls: 'Keyboard / touch', gyroUnavailable: 'Tilt steering unavailable on this device',
    loadingCar: 'Loading ship…', loadingTrack: 'Loading circuit…', preparing: 'Preparing Velocity Nova…', startupError: 'Unable to start. Please restart the game.',
    laps: 'LAPS', lapNotice: 'LAP {lap} / {total}',
  },
  ja: {
    raceSetup:'レースモード', timeTrial:'タイムアタック', duel:'AI対戦', difficulty:'AIの難易度', easy:'かんたん', normal:'ふつう', hard:'むずかしい', duelRules:'衝突は減速のみ。先に3周した方が勝利。', trialRules:'機体を守り、自己ベストに挑戦。', playerWin:'あなたの勝利！', opponentWin:'AIの勝利', tie:'同時ゴール', position:'順位',
    title: 'スピードノヴァ', league: 'HAIYUE / 反重力レーシングリーグ', intro: 'コースを選び、限界の速さへ。',
    advice: 'カーブでは早めに減速し、機体を守ろう。', keys: 'W / ↑ 加速   S / ↓ ブレーキ   A D / ← → 操舵', keysMore: 'P 一時停止 / 再開   R リスタート',
    touchHint: '左側で操舵、右側でブレーキとアクセル', gyroHint: '左右に傾けて操舵、右側でブレーキとアクセル',
    swipe: '左右にスワイプしてコース選択', swipeKeys: 'スワイプ / A D / ← → でコース選択', start: 'レース開始',
    paused: '一時停止', resume: 'レース再開', home: 'ホームへ', retry: 'もう一度挑戦', finished: 'レース完了', destroyed: '機体大破', record: '新記録！',
    lap: '周回', time: 'タイム', best: 'ベスト', hull: '耐久', brake: 'ブレーキ', throttle: 'アクセル',
    camera: 'カメラ視点', chase: '三人称', firstPerson: '一人称', settings: '設定', language: '言語', controls: '操作方法', joystick: 'ジョイスティック', gyro: 'ジャイロ', done: '完了',
    desktopControls: 'キーボード / タッチ', gyroUnavailable: 'この端末はジャイロ操作に非対応です',
    loadingCar: '機体を読み込み中…', loadingTrack: 'コースを読み込み中…', preparing: 'スピードノヴァを準備中…', startupError: '起動できません。ゲームを再起動してください。',
    laps: '周', lapNotice: '{lap} / {total} 周目',
  },
};
interface CourseText { name: string; difficulty: string; description: string }
export const COURSE_TEXT: Record<'en' | 'ja', Record<string, CourseText>> = {
  en: {
    'mobius-ring': {name:'Mobius Orbit',difficulty:'Extreme · Two-sided orbit',description:'Cross the half twist onto the reverse face.\nRace through flowing nebula patterns.'},
    'sky-harbor': {name:'Sky Harbor',difficulty:'Beginner · Sweeping turns',description:'Accelerate around the skyport.\nLearn to steer and brake on wide turns.'},
    'neon-city': {name:'Neon Metropolis',difficulty:'Advanced · Rolling circuit',description:'Race between the skyscrapers.\nMaster elevated turns and steep drops.'},
    'reactor-run': {name:'Reactor Run',difficulty:'Expert · Consecutive S-bends',description:'Dive into the energy core.\nHold your line through tight reversals.'},
    'rainbow-road': {name:'Rainbow Road',difficulty:'Ultimate · Cosmic crossings',description:'Fly through rings and meteor showers.\nClimb and dive along the rainbow road.'},
    'ashfall': {name:'Ashfall',difficulty:'Survival · Volcanic fireballs',description:'Race through erupting volcanoes.\nWatch the warnings and dodge falling fireballs.'},
    'sky-coaster': {name:'Sky Coaster',difficulty:'Extreme · Loops and spirals',description:'Soar above the sunlit clouds.\nTake on vertical loops, rolls and spirals.'},
  },
  ja: {
    'mobius-ring': {name:'メビウス軌道',difficulty:'極限 · 両面の星環',description:'半回転のねじれを越え、裏側の道へ。\n流れる星雲模様の上を駆け抜けよう。'},
    'sky-harbor': {name:'天空の港',difficulty:'初級 · 高速ワイドカーブ',description:'空港の外周で加速し、\n広いカーブで操舵と減速を覚えよう。'},
    'neon-city': {name:'ネオンシティ',difficulty:'上級 · 起伏のロングコース',description:'摩天楼の間を駆け抜け、\n高架の連続カーブと急降下を制覇しよう。'},
    'reactor-run': {name:'リアクター回廊',difficulty:'エキスパート · 連続Ｓ字',description:'エネルギーコアの奥へ。\n折り返しと連続カーブで機体を守ろう。'},
    'rainbow-road': {name:'レインボーロード',difficulty:'究極 · 宇宙の立体交差',description:'光のリングと流星群を越え、\n虹色の空中コースで上昇と降下に挑もう。'},
    'ashfall': {name:'灰燼の道',difficulty:'サバイバル · 火山弾',description:'噴火する火山と溶岩の谷を駆け抜け、\n着弾予告を見て火球を回避しよう。'},
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
