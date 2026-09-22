export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
/** Shared CSS-pixel / DIP layout. Desktop gets a side panel; phones keep a top board. */
export function sudokuLayout(width: number, height: number) {
  const w = Math.max(280, width),
    h = Math.max(460, height),
    wide = w >= 760;
  const gap = 6,
    top = 68,
    bottom = 52;
  const board = Math.floor(
    wide ? Math.min(h - top - 24, w * 0.61, 670) : Math.min(w - 24, Math.max(180, h - 370)),
  );
  const x = wide ? Math.max(12, (w - board - 326) / 2) : (w - board) / 2,
    y = top;
  const panel: Rect = wide
    ? { x: x + board + 18, y: top, width: 290, height: Math.min(h - top - 16, 670) }
    : { x: 12, y: y + board + 8, width: w - 24, height: h - y - board - 20 };
  const tools = Math.max(44, Math.min(52, Math.floor((panel.width - 5 * gap) / 6)));
  const keyTop = panel.y + tools + 30,
    keyHeight = Math.max(50, Math.min(66, (panel.height - tools - 30 - bottom - 42) / 3));
  return {
    wide,
    board: { x, y, width: board, height: board },
    panel,
    tools,
    keyTop,
    keyHeight,
    bottom: Math.min(h - 54, keyTop + keyHeight * 3 + 14),
    width: w,
    height: h,
  };
}
/** Wrap CJK by character and Latin text by word. Hosts can supply font metrics. */
export function wrapGuiText(
  text: string,
  width: number,
  fontSize: number,
  measure?: (text: string, size: number) => number,
): string[] {
  const sizeOf =
    measure ??
    ((value: string, size: number) =>
      Array.from(value).reduce(
        (sum, ch) => sum + size * (/[\u0000-\u00ff]/.test(ch) ? (ch === ' ' ? 0.32 : 0.62) : 1),
        0,
      ));
  const result: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    const tokens = paragraph.match(/[A-Za-z0-9][A-Za-z0-9'’.,:;!?()/→−-]*|[^A-Za-z0-9]/gu) ?? [];
    for (const token of tokens) {
      if (line && sizeOf(line + token, fontSize) > width) {
        result.push(line.trimEnd());
        line = '';
      }
      if (!line && token === ' ') continue;
      if (sizeOf(token, fontSize) > width) {
        for (const ch of token) {
          if (line && sizeOf(line + ch, fontSize) > width) {
            result.push(line);
            line = '';
          }
          line += ch;
        }
      } else line += token;
    }
    result.push(line.trimEnd());
  }
  return result;
}
