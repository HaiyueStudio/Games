import type { GuiRect } from '@haiyue/engine/gui';

export function playLayout(width: number, height: number) {
  const margin = width < 600 ? 10 : 16;
  const button = width < 600 ? 42 : 46;
  const gap = 6;
  const widthOfToolbar = 4 * button + 3 * gap;
  const toolbar = { x: width - margin - widthOfToolbar, y: margin, width: widthOfToolbar, height: button };
  const centered = (w: number, h: number): GuiRect => ({ x: (width - w) / 2, y: (height - h) / 2, width: w, height: h });
  return { margin, button, gap, toolbar,
    library: centered(Math.min(width - 2 * margin, 540), Math.min(height - 2 * margin, 482)),
    pause: centered(Math.min(width - 2 * margin, 338), Math.min(height - 2 * margin, 278)),
  };
}

export function playGrid(width: number, height: number, cols: number, rows: number) {
  const { toolbar } = playLayout(width, height);
  const inset = Math.min(8, width * .018, height * .018);
  const fit = (top: number) => {
    const cell = Math.max(.1, Math.min((width - 2 * inset) / cols, (height - top - inset) / rows));
    return { x: (width - cols * cell) / 2, y: top + (height - top - inset - rows * cell) / 2, cell };
  };
  const grid = fit(inset);
  const crossesControls = grid.x + cols * grid.cell > toolbar.x - 4;
  return crossesControls && grid.y < toolbar.y + toolbar.height + 5 ? fit(toolbar.y + toolbar.height + 5) : grid;
}

export function editorLayout(width: number, height: number, room: { width: number; height: number }) {
  const compact = width < 700;
  const gap = compact ? 10 : 18;
  const outer = Math.min(1380, Math.max(1, width - gap * 2));
  const x = (width - outer) / 2;
  const header = { x, y: gap, width: outer, height: compact ? 87 : 58 };
  const y = header.y + header.height + gap;
  const openHeight = Math.max(30, height - y - gap);
  const panelWidth = compact ? outer : Math.min(350, Math.max(280, outer * .3));
  const boardWidth = compact ? outer : outer - panelWidth - gap;
  const boardHeight = compact ? Math.max(55, Math.min(openHeight * .54, boardWidth * room.height / room.width + 22)) : openHeight;
  const board = { x, y, width: boardWidth, height: boardHeight };
  const panel = { x: compact ? x : x + boardWidth + gap, y: compact ? y + boardHeight + gap : y,
    width: panelWidth, height: compact ? Math.max(1, openHeight - boardHeight - gap) : openHeight };
  return { compact, header, board, panel };
}
