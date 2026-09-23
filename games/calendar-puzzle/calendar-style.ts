/** Per-game palettes; switching appearance never mutates another game instance. */
export const CALENDAR_SKIN_IDS = ['white', 'blue', 'purple'] as const;
export type CalendarSkinId = typeof CALENDAR_SKIN_IDS[number];
export function calendarSkinId(value: unknown): CalendarSkinId {
  return CALENDAR_SKIN_IDS.find(id => id === value) ?? 'white';
}
export const CALENDAR_SKINS = {
  white: {
    colors: { text: '#243d3b', textMuted: '#607572', primary: '#17847b', danger: '#c34555', background: '#f7f9f8', surface: '#ffffff', border: '#cadbd5', hover: '#e8f2ee', active: '#d4e8e0', disabled: '#9aaea6' },
    panel: { background: '#eaf1ed', border: '#cadbd5', radius: 24, borderWidth: 2 },
    cell: { background: '#ffffff', border: '#d4e0db', radius: 7, text: '#47625a' },
    selected: { background: '#c6efe6', border: '#17847b', text: '#096659' },
    completed: '#cfedce', star: '#a9690e', backdrop: 'rgba(22,40,35,0.30)',
  },
  blue: {
    colors: { text: '#234564', textMuted: '#52728f', primary: '#287ab1', danger: '#bf4561', background: '#edf7ff', surface: '#f8fcff', border: '#b6d7ec', hover: '#dcefff', active: '#c4e2f6', disabled: '#91b0c6' },
    panel: { background: '#d9ecf8', border: '#abcfe6', radius: 24, borderWidth: 2 },
    cell: { background: '#f6fcff', border: '#bdd9ea', radius: 7, text: '#385d7c' },
    selected: { background: '#b9e2fc', border: '#287ab1', text: '#165984' },
    completed: '#bce7e7', star: '#975e10', backdrop: 'rgba(20,49,75,0.32)',
  },
  purple: {
    colors: { text: '#f2eaff', textMuted: '#c0acd9', primary: '#c3a1ff', danger: '#ff9bad', background: '#1d142e', surface: '#30213f', border: '#61477e', hover: '#49305f', active: '#624080', disabled: '#89709d' },
    panel: { background: '#302040', border: '#60447b', radius: 24, borderWidth: 2 },
    cell: { background: '#402c53', border: '#65497e', radius: 7, text: '#e0cfee' },
    selected: { background: '#64428a', border: '#c3a1ff', text: '#ffffff' },
    completed: '#395751', star: '#ffd276', backdrop: 'rgba(10,5,20,0.54)',
  },
};
export type CalendarSkin = typeof CALENDAR_SKINS[CalendarSkinId];
/** Default appearance for consumers without a skin selection. */
export const CALENDAR_STYLE = CALENDAR_SKINS.white;
export const SKIN_COPY = {
  zh: { label: '皮肤', white: '简约白', blue: '琉璃蓝', purple: '神秘紫' },
  en: { label: 'Appearance', white: 'Simple White', blue: 'Glaze Blue', purple: 'Mystic Purple' },
  ja: { label: 'テーマ', white: 'シンプルホワイト', blue: '瑠璃ブルー', purple: '神秘のパープル' },
  fr: { label: 'Thème', white: 'Blanc épuré', blue: 'Bleu azur', purple: 'Violet mystique' },
  de: { label: 'Design', white: 'Schlichtes Weiß', blue: 'Glasblau', purple: 'Mystisches Lila' },
  es: { label: 'Tema', white: 'Blanco sencillo', blue: 'Azul cristal', purple: 'Morado místico' },
};
