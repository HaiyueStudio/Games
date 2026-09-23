import type { Puzzle } from './rules';
export type Language = 'zh' | 'en' | 'ja';
export const LANGUAGES: readonly Language[] = ['zh', 'en', 'ja'];
export const LANGUAGE_NAMES = ['中文', 'English', '日本語'];
export function languageOf(value: string): Language { return value.startsWith('zh') ? 'zh' : value.startsWith('ja') ? 'ja' : 'en'; }
const copy = {
  back: ['返回', 'Back', '戻る'],
  skin: ['皮肤', 'Theme', 'テーマ'], darkSkin: ['深色流光', 'Midnight', 'ミッドナイト'], lightBlueSkin: ['晴空浅蓝', 'Sky blue', 'スカイブルー'],
  title: ['流光数独', 'LED Sudoku', 'LED 数独'], settings: ['设置', 'Settings', '設定'], language: ['语言', 'Language', '言語'],
  done: ['完成', 'Done', '完了'], cancel: ['取消', 'Cancel', 'キャンセル'], okay: ['知道了', 'OK', 'OK'],
  newGame: ['新数独', 'New puzzle', '新しい数独'], start: ['开始新数独', 'Start puzzle', '開始'],
  easy: ['入门', 'Easy', '初級'], normal: ['标准', 'Standard', '標準'], hard: ['挑战', 'Challenge', '上級'],
  notes: ['笔记', 'Notes', 'メモ'], undo: ['撤销', 'Undo', '元に戻す'], erase: ['擦除', 'Erase', '消去'], hint: ['提示', 'Hint', 'ヒント'], explain: ['解释', 'Explain', '解説'],
  rules: ['规则', 'Rules', 'ルール'], answer: ['答案', 'Solution', '解答'], classic: ['常规', 'Classic', '通常'],
  ruleCount: ['{n} 项附加规则', '{n} extra rules', '追加ルール {n} 個'], completed: ['已完成', 'Complete', '完成'],
  cell: ['R{r} · C{c}', 'R{r} · C{c}', '{r} 行 · {c} 列'], selectCell: ['选择格子', 'Select a cell', 'マスを選択'], candidateCount: ['{n} 个候选', '{n} candidates', '候補 {n} 個'],
  crossCandidate: ['划去候选 {n}', 'Cross out candidate {n}', '候補 {n} に取消線'],
  restoreCandidate: ['恢复候选 {n}', 'Restore candidate {n}', '候補 {n} の取消線を解除'],
  enter: ['填入 {n}', 'Enter {n}', '{n} を入力'], elapsed: ['用时 {time}', 'Time {time}', '経過時間 {time}'],
  manualCandidates: ['禁用基础规则自动剔除候选数', 'Disable automatic candidate elimination', '候補の自動除外を無効にする'],
  manualCandidatesDetail: ['开启后由自己推理：1–9 全部可选，行列宫、LED 和附加规则都不会自动删减候选或更新其他格的笔记。笔记点击划去，再点恢复；提示仍可主动使用。', 'Play manually: all digits 1–9 remain available. Rows, columns, boxes, LED clues and extra rules will not automatically remove candidates or update other cells’ notes. Tap notes to cross out or restore; hints remain available on request.', 'オンにすると 1〜9 を自由に選べます。行・列・ブロック・LED・追加ルールによる候補や他のマスのメモの自動除外を停止します。メモはタップで取消・復元でき、ヒントは必要なときに使えます。'],
  manualCandidatesActive: ['手动推理模式已开启；关闭上方选项后可恢复自动辅助。', 'Manual play is enabled. Turn off the option above to restore automatic assistance.', '手動プレイ中です。上の設定をオフにすると自動補助を再開できます。'],
  filter: ['自动剔除不符合规则的候选数', 'Filter invalid candidates', 'ルールに合わない候補を除外'],
  filterDetail: ['根据当前棋盘、LED 和附加规则过滤，不读取答案。关闭后可自由填写 1–9。', 'Use the current board, LED clues and enabled rules, without looking at the solution. Turn off to enter any digit from 1 to 9.', '現在の盤面・LED・追加ルールで判定し、解答は参照しません。オフなら 1〜9 を自由に入力できます。'],
  boardCandidates: ['在盘面显示候选数', 'Show candidates on the board', '盤面に候補を表示'],
  boardCandidatesDetail: ['以九宫格小数字展示；笔记模式下点击划去，再点恢复。', 'Display candidates in a 3×3 grid. In Notes, tap to cross out; tap again to restore.', '候補を 3×3 で表示します。メモではタップで取消線を付け、再タップで戻します。'],
  requiresFilter: ['请先开启自动剔除候选数', 'Enable candidate filtering first', '先に候補の自動除外をオンにしてください'],
  holdHelp: ['点击问号查看详细规则', 'Tap ? for rule details', '「?」をタップしてルールの詳細を表示'],
  unique: ['每局验证唯一解 · 挑战需要进一步推理', 'Unique solution verified · Challenge needs deeper reasoning', '解は必ず一つ · 上級はより深い推理が必要'],
  switchedOff: ['已关闭 {names}，避免规则冲突。', 'Disabled {names} to avoid conflicting rules.', 'ルールの衝突を避けるため {names} をオフにしました。'],
  loading: ['正在载入…', 'Loading…', '読み込み中…'], generating: ['正在出题并验证唯一解…', 'Generating and verifying a unique solution…', '問題を生成し、唯一解を確認中…'],
  generatingHard: ['正在验证唯一解并筛选挑战难度…', 'Verifying uniqueness and challenge difficulty…', '唯一解と上級の難易度を確認中…'],
  generationError: ['出题失败，请点“新数独”重试。', 'Generation failed. Tap New puzzle to retry.', '生成に失敗しました。「新しい数独」から再試行してください。'],
  loadError: ['载入失败，请重新打开游戏。', 'Unable to load. Please reopen the game.', '読み込めませんでした。アプリを開き直してください。'],
  saveError: ['存档失败，请检查设备存储。', 'Unable to save. Check device storage.', '保存できません。端末の空き容量を確認してください。'],
  inference: ['推理解释', 'Hint explanation', 'ヒントの解説'], wrong: ['先修正高亮的错误填数，再继续推理。', 'Correct the highlighted entry before continuing.', '先に強調された誤った数字を修正してください。'],
  noHint: ['当前支持的技巧暂未找到下一步，可继续结合更多规则推理。', 'The supported techniques have not found a next step. Try combining more constraints.', '対応する解法では次の一手が見つかりませんでした。さらに条件を組み合わせてみてください。'],
  answerTitle: ['显示完整答案？', 'Reveal the solution?', '解答を表示しますか？'],
  answerBody: ['本局将记为辅助完成，可以撤销。', 'This puzzle will be marked as assisted. You can undo this action.', '補助ありでの完成として記録します。元に戻すこともできます。'],
  continue: ['继续推理', 'Keep solving', '続ける'], basic: ['每行、每列、每个 3×3 宫内数字不能重复。', 'Digits cannot repeat in any row, column or 3×3 box.', '各行・列・3×3 ブロックで数字は重複できません。'],
  nakedHint: ['R{r}C{c} 只剩 {v}。', 'R{r}C{c} has only one candidate: {v}.', '{r} 行 {c} 列の候補は {v} だけです。'],
  ledHint: ['规则候选 {digits}，亮起灯段进一步排除不匹配的数字。', 'Rule candidates: {digits}. Lit LED segments eliminate the other digits.', 'ルール上の候補は {digits}。点灯セグメントに合わない数字をさらに除外します。'],
  ruleHint: ['依据行、列、宫及已启用的附加规则，其他数字均被排除。', 'Rows, columns, boxes and enabled rules eliminate the other digits.', '行・列・ブロックと追加ルールにより、他の数字は除外されます。'],
  hiddenHint: ['此完整行、列、宫{diagonal}{slants}{extra}中，{v} 只能放在 R{r}C{c}。候选已包含{led}附加规则。', 'In a complete row, column or box{diagonal}{slants}{extra}, {v} can only go in R{r}C{c}. Candidates include {led}extra rules.', '完全な行・列・ブロック{diagonal}{slants}{extra}では、{v} を置けるのは {r} 行 {c} 列だけです。候補は{led}追加ルールも考慮しています。'],
  extraUnit: ['或额外区域', ', or extra region', '・追加領域'], extraRegionName: ['额外区域 {name}', 'extra region {name}', '追加領域 {name}'],
  diagonalUnit: ['或对角线', ', or enabled diagonal', '・有効な対角線'], slantUnit: ['或九格斜线', ', or nine-cell slant', '・9 マスの斜線'],
  ledAnd: [' LED 与', 'LED clues and ', 'LED と'], current: ['当前', '', '現在の'],
  legacy: ['旧版 Renban：紫线上不同数字组成连续整数，顺序不限；新开数独使用连续升序或降序规则。', 'Legacy Renban: distinct digits on a purple line form a consecutive set in any order. New puzzles use ascending or descending sequences.', '旧 Renban：紫線の異なる数字は順不同の連続整数です。新しい問題は昇順または降順の連続数になります。'],
  odd: ['奇', 'O', '奇'], even: ['偶', 'E', '偶'],
} as const;
export type TextKey = keyof typeof copy;
export function t(language: Language, key: TextKey, values: Record<string, string | number> = {}): string {
  return copy[key][LANGUAGES.indexOf(language)]!.replace(/\{(\w+)\}/g, (match, name: string) => String(values[name] ?? match));
}
export const RULE_KEYS = ['led','staircase','diagonal','missing','killer','renban','consecutive','inequality','multiDiagonal','exclusion','parity','thermometer','skyscraper','xv','quadruple','extraRegion','nonConsecutive','littleKiller','antiKing'] as const;
export type RuleId = typeof RULE_KEYS[number];
// Each locale supplies a name and a complete, player-facing explanation.
const rules: Record<RuleId, readonly [readonly [string,string], readonly [string,string], readonly [string,string]]> = {
 staircase: [['阶梯数独','12 个 3×3 宫组成阶梯盘面，共 108 格。行、列跨过空白缺口，各有 9 个可填格，必须包含 1–9 各一次；每个宫也一样。空白缺口不是格子，不填数字。可叠加 LED、奇偶规则，其他规则暂不与阶梯盘面组合。'],['Staircase Sudoku','Twelve 3×3 boxes form a staircase of 108 cells. Rows and columns cross the gaps and each contain nine playable cells with 1–9 exactly once, as does each box. Gaps are not cells. Supports LED and odd/even clues; other variants cannot currently be combined with this board.'],['階段数独','12 個の 3×3 ブロック、合計 108 マスの階段型盤面です。行・列は空白をまたいで 9 マスとなり、各行・列・ブロックに 1〜9 を一つずつ入れます。空白部分には数字を入れません。LED・奇偶ルールを併用できます。他の追加ルールとは現在併用できません。']],
 antiKing: [['无缘数独','每个格子与左上、右上、左下、右下紧邻的可填格不能填相同数字，包括跨宫相邻的格子。仅限制斜角相邻一格，不要求整条对角线互异。普通行、列、宫规则仍然有效，盘面不额外添加符号。'],['Anti-king','Diagonally adjacent playable cells cannot contain the same digit, including across box boundaries. Only immediate diagonal neighbors are restricted; whole diagonals need not be different. Standard row, column and box rules still apply. No extra markers are drawn.'],['アンチキング','左上・右上・左下・右下で接する入力可能なマスには同じ数字を入れられません。ブロックをまたぐ斜め隣も対象です。制限は斜め隣の 1 マスだけで、対角線全体の重複は禁止しません。通常の行・列・ブロックのルールも有効で、記号は追加しません。']],
 nonConsecutive: [['不连续数独','每个格子与上、下、左、右的可填相邻格都不能相差 1。例如 3 旁边不能放 2 或 4；斜角相邻不受这条规则限制。普通行列宫仍然有效，盘面不额外添加符号。与白点连续数、紫色连续线互斥。'],['Non-consecutive','Orthogonally adjacent playable cells cannot differ by 1. A 3 cannot have a 2 or 4 immediately above, below, left or right. Diagonal neighbors are unrestricted by this rule. Standard Sudoku rules still apply. No extra markers are drawn. Cannot combine with white-dot consecutive pairs or purple consecutive lines.'],['非連続数独','上下左右で隣り合う入力可能なマスの差は 1 にできません。3 の上下左右には 2・4 を置けません。斜め隣はこの制約の対象外です。通常の数独ルールも有効で、盤面に記号は追加しません。白丸の連続数・紫の連続線とは併用できません。']],
 extraRegion: [['额外区域','每个有边界的色块区域都是额外的宫，含 9 格，必须恰好包含 1–9 各一次。普通行、列、3×3 宫规则仍然有效。区域可为偏移方宫或不规则形状，优先旋转对称布局；A、B 等字母标识不同区域。不能与缺一门、奇偶底色组合。'],['Extra regions','Each outlined shaded region is an extra nine-cell house containing 1–9 exactly once. Standard rows, columns and 3×3 boxes still apply. Offset boxes or irregular shapes use rotationally symmetric layouts; letters A, B, etc. identify separate regions. Cannot combine with missing cells or odd/even shading.'],['追加領域','輪郭のある色付き領域は、1〜9 を一つずつ入れる追加の 9 マスのブロックです。通常の行・列・3×3 ブロックのルールも有効です。ずらした正方形や不規則な形を回転対称に配置し、A・B などで区別します。欠けマス・奇偶の背景色とは併用できません。']],
 led: [['LED 灯管','亮起的灯段必须包含在答案数字中；暗段表示未知，不代表必须熄灭。例如中间横段亮起时排除 1、7。全暗灯管格仍需填数。'],['LED segments','Every lit segment must occur in the digit. Dark segments are unknown, not forbidden. A lit middle bar excludes 1 and 7. Cells with fully dark segments still need a digit.'],['LED セグメント','点灯した部分を含む数字を入れます。暗い部分は不明であり、点灯してはいけないという意味ではありません。中央の横棒が点灯すると 1 と 7 を除外します。全消灯のマスにも数字を入れます。']],
 diagonal: [['对角线','两条完整的主对角线上数字不能重复。与缺一门组合时，只要求可填格不重复，不要求填齐 1–9。'],['Diagonals','Digits cannot repeat along either main diagonal. With missing cells, only playable cells participate; shortened diagonals need not contain all nine digits.'],['対角線','2 本の主対角線で数字を重複させません。欠けマスがある場合は入力可能なマスだけを対象とし、1〜9 をすべて含む必要はありません。']],
 missing: [['缺一门','每行、每列、每宫各有一个 × 黑格，黑格不填。其余八格使用 1–9 且不重复，不要求全盘缺同一个数字。'],['Missing cells','Each row, column and box has one black × cell. Leave it empty. The other eight cells use distinct digits from 1–9; the omitted digit can differ between units.'],['欠けマス','各行・列・ブロックに × の黒いマスが一つあり、そこは空欄にします。残りの 8 マスには異なる数字を入れます。欠ける数字は同じでなくても構いません。']],
 killer: [['杀手数独','同一虚线笼内数字不重复，数字总和等于笼左上角的标注。笼可能跨越行、列或宫。'],['Killer cages','Digits in a dashed cage are all different and add up to the clue at its upper-left corner. A cage may cross rows, columns or boxes.'],['キラー数独','点線のケージ内の数字は重複せず、合計が左上の数字と一致します。ケージは行・列・ブロックをまたぐことがあります。']],
 renban: [['连续数 · 升/降','沿整条紫线每步差 1，全部升序或全部降序，不能乱序或中途转向。例如 2→3→4、4→3→2 合法，2→4→3 不合法。'],['Consecutive line','Follow the whole purple line in steps of 1, either entirely ascending or entirely descending. 2→3→4 and 4→3→2 are valid; 2→4→3 and changing direction are not.'],['連続数 · 昇順/降順','紫線全体で数字が 1 ずつ増えるか、1 ずつ減ります。2→3→4 と 4→3→2 は有効ですが、2→4→3 や途中で向きが変わる並びは無効です。']],
 consecutive: [['相邻连续 · 差 1','白点两侧的数字相差 1，升降均可。所有差 1 的相邻格都会标白点；没有白点的相邻格不能相差 1。这与紫线连续数是独立规则。'],['Adjacent consecutive','Digits on either side of a white dot differ by 1, in either order. All such adjacent pairs are marked: unmarked pairs cannot differ by 1. This is separate from purple lines.'],['隣接連続数','白点の両側は順序に関係なく差が 1 です。該当する隣接ペアにはすべて白点があり、白点がないペアの差は 1 ではありません。紫線とは別のルールです。']],
 inequality: [['数比数独','相邻格间的 >、< 表示数字大小，尖端指向较小的数字。例如 3 < 7。未填的另一端也会限制可选数字。'],['Inequalities','The > and < signs compare adjacent digits. The pointed end faces the smaller digit, for example 3 < 7. Even an empty neighbor can restrict a candidate.'],['不等号','隣接マスの >・< は大小関係を表します。尖った側が小さい数字です（例：3 < 7）。隣が空欄でも候補が制限されることがあります。']],
 multiDiagonal: [['多对角线','金色虚线连接盘面边缘，相同编号标记同一条斜线。线上可填格数字不重复；短于九格的线不要求包含全部 1–9。'],['Multiple diagonals','Gold dashed lines connect board edges. Matching numbers identify one line. Playable cells on each line cannot repeat digits; short lines need not contain all nine digits.'],['複数の対角線','金色の破線が盤面の端を結び、同じ番号は同じ線を表します。線上の入力可能なマスでは数字を重複させません。短い線に 1〜9 が全部必要なわけではありません。']],
 exclusion: [['排除点','交点圆圈的数字不能出现在周围四格。LED 圆圈排除所有匹配亮段的数字，暗段未知。例如仅左上竖管亮起，会排除 4、5、6、8、9。'],['Exclusion circles','The digit in an intersection circle is forbidden in all four surrounding cells. An LED circle forbids every digit matching its lit segments. A lit upper-left segment excludes 4, 5, 6, 8 and 9.'],['除外点','交点の丸に書かれた数字は周囲 4 マスに入りません。LED の丸は点灯部分に一致する数字をすべて除外します。左上の縦棒だけなら 4・5・6・8・9 を除外します。']],
 parity: [['奇偶数独','红色背景的标记格只能填奇数 1、3、5、7、9；蓝色背景只能填偶数 2、4、6、8。没有背景标记的格子没有额外奇偶限制。'],['Odd / even','Red marked cells contain odd digits: 1, 3, 5, 7, 9. Blue marked cells contain even digits: 2, 4, 6, 8. Unmarked cells have no extra parity restriction.'],['奇数・偶数','赤いマスには奇数 1・3・5・7・9、青いマスには偶数 2・4・6・8 を入れます。色のないマスには追加の奇偶制限はありません。']],
 thermometer: [['温度计','从青绿色温度计的圆灯泡到平头，数字严格递增，可以跳号，例如 1→3→8。方向不能反转；与紫线连续数互斥。'],['Thermometers','Digits strictly increase from the round bulb to the flat tip. Gaps are allowed, such as 1→3→8, but reversing direction is not. Cannot combine with purple consecutive lines.'],['温度計','青緑の丸い球から先端へ数字が必ず増えます。1→3→8 のように飛び飛びでも構いませんが、逆方向にはできません。紫線の連続数とは併用できません。']],
 littleKiller: [['小杀手','外侧带斜箭头的数字是沿箭头方向直至盘面另一边的所有格子的总和。数字允许重复，但仍须遵守行、列、宫及已启用规则。与摩天大楼、缺一门互斥。'],['Little killer','An outside number with a diagonal arrow gives the sum of all cells along that diagonal to the opposite edge. Digits may repeat if other rules allow it. Cannot combine with Skyscrapers or missing cells.'],['リトルキラー','盤外の斜め矢印付き数字は、矢印の方向へ盤面の端まで続くマスの合計です。行・列・ブロックなどのルールに反しなければ数字は重複できます。摩天楼・欠けマスとは併用できません。']],
 skyscraper: [['摩天大楼','把数字看作建筑物高度。外侧数字表示从该方向能看到几栋楼，较高楼会遮住后方较低楼。外侧空白不限制可见数；不能与缺一门组合。'],['Skyscrapers','Digits are building heights. An outside clue counts buildings visible from that side; taller buildings hide shorter ones behind them. A blank outside position adds no restriction. Cannot combine with missing cells.'],['摩天楼','数字を建物の高さと考えます。外側の数字はその方向から見える建物の数で、高い建物は後ろの低い建物を隠します。外側が空白なら制限はありません。欠けマスとは併用できません。']],
 xv: [['XV 数独','V 两侧数字和为 5，X 两侧和为 10。所有符合的相邻格都已标记，因此无标记的相邻格之和不能是 5 或 10。与数比、白点规则互斥。'],['XV Sudoku','Digits across V add up to 5; digits across X add up to 10. All such pairs are marked, so unmarked adjacent pairs cannot add up to 5 or 10. Cannot combine with inequalities or white dots.'],['XV 数独','V の両側は合計 5、X の両側は合計 10 です。該当ペアはすべて表示されるため、記号がない隣接ペアの合計は 5・10 以外です。不等号・白点とは併用できません。']],
 quadruple: [['四数和','交点处蓝色菱形 Σ 内的数字是周围四格的总和。只要行列宫允许，这四格可以出现相同数字；与排除点互斥。'],['Four-cell sums','The number in a blue Σ diamond is the sum of the four surrounding cells. Repeats are allowed if rows, columns and boxes permit them. Cannot combine with exclusion circles.'],['四マスの和','交点の青い Σ 菱形は、周囲 4 マスの合計を表します。行・列・ブロックのルールに反しなければ同じ数字も使えます。除外点とは併用できません。']],
};
export function ruleCopy(language: Language, key: RuleId): readonly [string,string] { return rules[key][LANGUAGES.indexOf(language)]!; }
export function activeRuleDetails(p: Puzzle, language: Language): string[] {
  return RULE_KEYS.filter(k => p.options[k]).map(k => k === 'renban' && !p.lineRule ? t(language,'legacy') : `${ruleCopy(language,k)[0]}: ${ruleCopy(language,k)[1]}`);
}
