export const SKY_LANGUAGES = ['zh', 'en', 'ja'] as const;
export type SkyLanguage = typeof SKY_LANGUAGES[number];
export const SKY_LANGUAGE_KEY = 'sky-strike.language.v1';
export const SKY_LANGUAGE_NAMES: Record<SkyLanguage, string> = { zh: '简体中文', en: 'English', ja: '日本語' };
const zh = {
  'asteroid-forge':'陨星矿场', 'ore-reaper':'星矿收割者', 'binary-nova':'双星新纪', 'twin-red':'红蓝双子', 'twin-blue':'蓝色双子', 'fission-elite':'裂变战舰', revival:'复活倒计时',
  audioOn:'音效：开启', audioOff:'音效：关闭', volume:'音量', audioSaveFailed:'音效设置未能保存。',
  title: '天际突击', select: '选择关卡', missionChannel: '任务指挥 / 星区扫描', start: '开始出击', retry: '再次出击', failedSelect: '任务失败 · 选择关卡', swipe: '左右滑动切换', sector: '星区', boss: '首领',
  score: '得分', best: '最高', wave: '关卡', hull: '护甲', lives: '生命', basic: '标准弹', red: '红色散射', blue: '蓝色连射', purple: '紫色激光', base: '初始', level: '级', bomb: '炸弹', pause: '暂停', resume: '继续', home: '返回首页',
  paused: '已暂停', lost: '任务失败', standby: '飞行控制 / 待命', pauseCopy: '准备好后，继续出击。', options: '设置', language: '语言', languageHint: '选择后立即生效', close: '返回', saveFailed: '语言未保存，下次启动将恢复原设置。', preparing: '正在准备战场…', startupFailed: '启动失败，请重新打开游戏。', saveName: '天际突击自动存档',
  'orbital-gate': '轨道之门', 'ion-tempest': '离子风暴', 'void-hunt': '虚空狩猎', 'carrier-siege': '航母围攻', 'prism-eclipse': '棱镜日蚀', 'serpent-rail': '蛇行星轨',
  dreadnought: '无畏战舰', 'ion-seraph': '离子炽天使', 'void-mantis': '虚空螳螂', 'star-carrier': '星际航母', 'helios-prism': '太阳棱镜', 'iron-serpent': '钢铁巨蛇',
};
export type SkyText = keyof typeof zh;
type Catalog = Record<SkyText, string>;
export const SKY_TEXT: Record<SkyLanguage, Catalog> = {
  zh,
  en: {
    'asteroid-forge':'Asteroid Forge', 'ore-reaper':'ORE REAPER', 'binary-nova':'Binary Nova', 'twin-red':'CHROMATIC TWINS', 'twin-blue':'BLUE TWIN', 'fission-elite':'FISSION CRUISER', revival:'Revival',
    audioOn:'SOUND: ON', audioOff:'SOUND: OFF', volume:'Volume', audioSaveFailed:'Sound settings could not be saved.',
    title: 'SKY STRIKE', select: 'Select Mission', missionChannel: 'MISSION CONTROL / SECTOR SCAN', start: 'LAUNCH', retry: 'RETRY', failedSelect: 'Mission Failed', swipe: 'Swipe to change mission', sector: 'SECTOR', boss: 'BOSS',
    score: 'SCORE', best: 'BEST', wave: 'WAVE', hull: 'HULL', lives: 'LIVES', basic: 'STANDARD', red: 'RED SPREAD', blue: 'BLUE BURST', purple: 'PURPLE LASER', base: 'BASE', level: 'LV', bomb: 'BOMB', pause: 'PAUSE', resume: 'RESUME', home: 'MAIN MENU',
    paused: 'PAUSED', lost: 'MISSION LOST', standby: 'FLIGHT CONTROL / STANDBY', pauseCopy: 'Ready when you are, pilot.', options: 'OPTIONS', language: 'Language', languageHint: 'Changes apply immediately', close: 'BACK', saveFailed: 'Language could not be saved.', preparing: 'Preparing the battlefield…', startupFailed: 'Unable to start. Please reopen the game.', saveName: 'Sky Strike Autosave',
    'orbital-gate': 'Orbital Gate', 'ion-tempest': 'Ion Storm', 'void-hunt': 'Void Hunt', 'carrier-siege': 'Carrier Siege', 'prism-eclipse': 'Prism Eclipse', 'serpent-rail': 'Serpent Orbit',
    dreadnought: 'DREADNOUGHT', 'ion-seraph': 'ION SERAPH', 'void-mantis': 'VOID MANTIS', 'star-carrier': 'STAR CARRIER', 'helios-prism': 'HELIOS PRISM', 'iron-serpent': 'IRON SERPENT',
  },
  ja: {
    'asteroid-forge':'隕石の鉱場', 'ore-reaper':'鉱石の収穫者', 'binary-nova':'双星の新紀', 'twin-red':'紅蒼の双子', 'twin-blue':'蒼の双子', 'fission-elite':'分裂巡洋艦', revival:'復活まで',
    audioOn:'効果音：オン', audioOff:'効果音：オフ', volume:'音量', audioSaveFailed:'効果音設定を保存できませんでした。',
    title: 'スカイストライク', select: 'ステージ選択', missionChannel: '作戦司令 / 宙域スキャン', start: '出撃する', retry: '再出撃', failedSelect: '作戦失敗', swipe: '左右にスワイプして選択', sector: '宙域', boss: 'ボス',
    score: 'スコア', best: '最高', wave: 'ステージ', hull: '装甲', lives: '残機', basic: '通常弾', red: '赤・拡散弾', blue: '青・連射弾', purple: '紫・レーザー', base: '初期', level: 'LV', bomb: 'ボム', pause: '一時停止', resume: '再開', home: 'ホームに戻る',
    paused: '一時停止中', lost: '作戦失敗', standby: '飛行制御 / 待機', pauseCopy: '準備ができたら、再び出撃しましょう。', options: '設定', language: '言語', languageHint: '選択するとすぐに反映されます', close: '戻る', saveFailed: '言語設定を保存できませんでした。', preparing: '戦場を準備しています…', startupFailed: '起動できません。ゲームを開き直してください。', saveName: 'スカイストライク自動保存',
    'orbital-gate': '軌道ゲート', 'ion-tempest': 'イオンの嵐', 'void-hunt': '虚空の狩猟', 'carrier-siege': '空母包囲戦', 'prism-eclipse': 'プリズム日食', 'serpent-rail': '蛇の星軌道',
    dreadnought: 'ドレッドノート', 'ion-seraph': 'イオンセラフ', 'void-mantis': 'ヴォイドマンティス', 'star-carrier': 'スターキャリア', 'helios-prism': 'ヘリオスプリズム', 'iron-serpent': 'アイアンサーペント',
  },
};
export interface SkyLanguageStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
export function isSkyLanguage(value: unknown): value is SkyLanguage { return SKY_LANGUAGES.includes(value as SkyLanguage); }
/** One per game. Locale preference is independent of career saves and never follows OS language. */
export class SkyStrikeLocale {
  private current: SkyLanguage = 'zh';
  private readonly listeners = new Set<() => void>();
  saveFailed = false;
  constructor(private readonly storage?: SkyLanguageStorage) {
    try { const saved = storage?.getItem(SKY_LANGUAGE_KEY); if (isSkyLanguage(saved)) this.current = saved; } catch { /* Chinese remains usable if storage is unavailable. */ }
  }
  get language(): SkyLanguage { return this.current; }
  text(key: SkyText): string { return SKY_TEXT[this.current][key]; }
  named(id: string): string { if (!Object.hasOwn(zh, id)) throw new Error(`Missing Sky Strike translation: ${id}`); return this.text(id as SkyText); }
  set(language: SkyLanguage): void {
    if (!isSkyLanguage(language)) throw new RangeError('Unsupported Sky Strike language.');
    this.current = language; this.saveFailed = false;
    try { this.storage?.setItem(SKY_LANGUAGE_KEY, language); } catch { this.saveFailed = true; }
    for (const listener of this.listeners) listener();
  }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
}
export function browserSkyStrikeLocale(): SkyStrikeLocale {
  try { return new SkyStrikeLocale(globalThis.localStorage); } catch { return new SkyStrikeLocale(); }
}
/** Preload all supported glyphs once, including native names, so switching needs no atlas rebuild. */
export const SKY_FONT_CHARACTERS = [...new Set(Array.from({length:95},(_,i)=>String.fromCharCode(32+i)).join('') + Object.values(SKY_TEXT).flatMap(c=>Object.values(c)).join('') + Object.values(SKY_LANGUAGE_NAMES).join('') + '·×…●○')].join('');
