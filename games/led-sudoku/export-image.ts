import { paintBoard } from './board-painter';
import { t, activeRuleDetails } from './i18n';
import { wrapGuiText } from './gui-layout';
import { autoCandidateFiltering, noteDisplayMasks, noteCrossedMasks, type Preferences } from './preferences';
import { THEMES } from './theme';
import type { SaveData } from './rules';

/** Render from a snapshot, without selection, hint highlights or hidden solution values. */
export function exportPuzzleImage(state: SaveData, prefs: Preferences, canvas: (w: number, h: number) => HTMLCanvasElement): HTMLCanvasElement {
  const colors = THEMES[prefs.theme], language = prefs.language;
  const board = canvas(1260, 1260), filter = autoCandidateFiltering(prefs);
  paintBoard(board.getContext('2d')!, {
    ...state, theme: prefs.theme, language, selected: -1, hint: -1,
    crossed: noteCrossedMasks(state, filter),
    candidateMasks: noteDisplayMasks(state, -1, false, filter, prefs.showCandidates),
  });
  const metrics = canvas(1, 1).getContext('2d')!;
  metrics.font = '26px sans-serif';
  const rules = [t(language, 'basic'), ...activeRuleDetails(state.puzzle, language)];
  const lines = rules.flatMap(text => [...wrapGuiText(text, 1260, 26, value => metrics.measureText(value).width), '']);
  const result = canvas(1380, 1590 + lines.length * 38), ctx = result.getContext('2d')!;
  ctx.fillStyle = colors.background; ctx.fillRect(0, 0, result.width, result.height);
  ctx.textBaseline = 'top'; ctx.fillStyle = colors.text; ctx.font = 'bold 42px sans-serif';
  ctx.fillText(t(language, 'title'), 60, 40);
  ctx.font = '26px sans-serif'; ctx.fillStyle = colors.muted;
  ctx.fillText(`${t(language, state.puzzle.options.difficulty)} · #${state.puzzle.seed}`, 60, 100);
  ctx.drawImage(board, 60, 160, 1260, 1260);
  ctx.fillStyle = colors.text; ctx.font = 'bold 32px sans-serif';
  ctx.fillText(t(language, 'rules'), 60, 1460);
  ctx.font = '26px sans-serif';
  lines.forEach((line, i) => ctx.fillText(line, 60, 1520 + i * 38));
  return result;
}

/** Shared monochrome export glyph, matching the existing outline toolbar icons. */
export function paintExportIcon(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d')!;
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(20, 58); ctx.lineTo(20, 79); ctx.lineTo(76, 79); ctx.lineTo(76, 58);
  ctx.moveTo(48, 14); ctx.lineTo(48, 61); ctx.moveTo(30, 43); ctx.lineTo(48, 61); ctx.lineTo(66, 43); ctx.stroke();
}
