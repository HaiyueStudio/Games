export type ThemeId = 'dark' | 'light-blue';
export const THEME_IDS: readonly ThemeId[] = ['dark', 'light-blue'];
const dark = {
  region:'#233747', regionPeer:'#294759', regionBorder:'#91a0ba',
  background:'#061015', panel:'#10262e', text:'#d6e9ea', muted:'#8ba6ae', accent:'#83ffc1',
  accentText:'#0a2920', cyan:'#75e4ef', line:'#355760', border:'#29464e', active:'#13332d',
  given:'#75e4ef', user:'#83ffc1', clue:'#ffc16a', wrong:'#ff6586', tube:'#162b33',
  crossed:'#c08894', strike:'#dc9aa7', focus:'#ffd18a', lesson:'#0b2028', pulse:'#3d7862', sweep:'99,255,197',
};
export const THEMES: Record<ThemeId, typeof dark> = {
  dark,
  'light-blue': {
    region:'#e0e7f2', regionPeer:'#d2deef', regionBorder:'#7084a3',
    background:'#edf6fc', panel:'#f7fbff', text:'#183c55', muted:'#536f84', accent:'#1669a6',
    accentText:'#ffffff', cyan:'#246b87', line:'#789db7', border:'#adc9dc', active:'#d5eafa',
    given:'#183f5f', user:'#146999', clue:'#8b5100', wrong:'#b52950', tube:'#c2d4e0',
    crossed:'#975164', strike:'#a43e5e', focus:'#916000', lesson:'#e2f0fa', pulse:'#88b6d6', sweep:'72,155,216',
  },
};
/** Keep rule identities consistent while making their ink legible on light cells. */
const lightBoard: Record<string,string> = {
  '#061218':'#f3f9fe', '#020609':'#2c4659', '#16474d':'#b9def6', '#4b3b20':'#f8e4b6',
  '#16413e':'#cee7f7', '#0c252c':'#e3f1fb', '#091a22':'#f9fcff', '#23333e':'#8ba8bc',
  '#bc466550':'#d4567140', '#377fce60':'#4a94d54d', '#ff9fb3':'#9e284b', '#91caff':'#205e97',
  '#7261bd33':'#8065b82b', '#ffcb70a0':'#a87218b0', '#ffcb70':'#b87917', '#122027':'#ffffff',
  '#41948c':'#54a6a5', '#16393d':'#d4eeed', '#61b8a7':'#297c79', '#af88ff70':'#9770d780',
  '#e9a85b99':'#a86c27bb', '#6caebb99':'#428298bb', '#ffc16a':'#8b5100',
  '#c08894':'#975164', '#83b6ba':'#315f7b', '#dc9aa7':'#a43e5e', '#73ffcf':'#167ab8',
  '#1c3943':'#bfd5e4', '#4c7f88':'#7297b0', '#e8fdff':'#ffffff', '#08171e':'#f3f9fe',
  '#ffdea1':'#885407', '#ffbf73':'#935200', '#c7ecff':'#2e698b', '#e2f6ff':'#245571',
  '#19213e':'#eee8fa', '#c1b5ff':'#7f64ac', '#ede4ff':'#59417c',
  '#062c39':'#dcf1fc', '#71ddff':'#2882a5', '#b8eeff':'#195d7b',
  '#ffd18a':'#916000', '#73e3f2':'#08718b', '#07171e':'#f3f9fe',
  '#321d26':'#f8dfe5', '#ffb1bd':'#a52d50', '#a9c7ff':'#345f94',
};
export function boardInk(theme: ThemeId, color: string): string { return theme === 'light-blue' ? lightBoard[color] ?? color : color; }
