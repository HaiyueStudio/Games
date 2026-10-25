export interface WallSection {
  readonly row: number;
  readonly column: number;
  readonly width: number;
  readonly depth: number;
}

// Work in tile units. Insets belong only on exposed edges; shared edges
// meet at the tile boundary, including the cap above the wall body.
export function buildWallSections(
  cells: readonly string[],
  insetX: number,
  insetZ: number,
): WallSection[] {
  const sections: WallSection[] = [];
  const lastBySpan = new Map<string, number>();
  const wallAt = (row: number, column: number): boolean => cells[row]?.[column] === '#';
  for (let row = 0; row < cells.length; row += 1) {
    const columns = cells[row]?.length ?? 0;
    let column = 0;
    while (column < columns) {
      if (!wallAt(row, column)) {
        column += 1;
        continue;
      }
      const start = column;
      const above = wallAt(row - 1, column);
      const below = wallAt(row + 1, column);
      // Merge horizontally while the exposed top/bottom edges stay the same.
      do { column += 1; } while (
        column < columns && wallAt(row, column)
        && wallAt(row - 1, column) === above
        && wallAt(row + 1, column) === below
      );
      const left = start - 0.5 + (wallAt(row, start - 1) ? 0 : insetX);
      const right = column - 0.5 - (wallAt(row, column) ? 0 : insetX);
      const top = row - 0.5 + (above ? 0 : insetZ);
      const bottom = row + 0.5 - (below ? 0 : insetZ);
      const section = {
        row: (top + bottom) / 2,
        column: (left + right) / 2,
        width: right - left,
        depth: bottom - top,
      };
      const span = `${left}:${right}`;
      const previousIndex = lastBySpan.get(span);
      const previous = previousIndex === undefined ? undefined : sections[previousIndex];
      if (previous && previousIndex !== undefined
        && Math.abs(previous.row + previous.depth / 2 - top) < 1e-9) {
        // A straight vertical stretch can share one box as well.
        const previousTop = previous.row - previous.depth / 2;
        sections[previousIndex] = { ...section, row: (previousTop + bottom) / 2, depth: bottom - previousTop };
      } else {
        lastBySpan.set(span, sections.length);
        sections.push(section);
      }
    }
  }
  return sections;
}
