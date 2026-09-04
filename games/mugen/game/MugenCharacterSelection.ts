export function mugenCharacterGridColumns(characterCount: number): number {
  const count = positiveInteger(characterCount, 'characterCount');
  return Math.min(8, Math.max(3, Math.ceil(Math.sqrt(count * 1.5))));
}

export function moveMugenCharacterSelection(currentIndex: number, characterCount: number, deltaColumn: number, deltaRow: number): number {
  const count = positiveInteger(characterCount, 'characterCount'); const current = boundedIndex(currentIndex, count); const columns = mugenCharacterGridColumns(count);
  const column = current % columns; const row = Math.floor(current / columns); const rows = Math.ceil(count / columns);
  let nextRow = modulo(row + Math.sign(deltaRow), rows); const nextColumn = modulo(column + Math.sign(deltaColumn), columns); let next = nextRow * columns + nextColumn;
  if (next >= count) {
    if (deltaRow !== 0) { nextRow = deltaRow > 0 ? 0 : rows - 1; next = Math.min(count - 1, nextRow * columns + column); }
    else next = Math.min(count - 1, row * columns + nextColumn);
  }
  return next;
}

export function mugenCharacterPreviewScale(naturalScale: number, standingSize: readonly [number, number], viewport: Readonly<{ width: number; height: number }>): number {
  const scale = positive(naturalScale, 'naturalScale'); const width = positive(standingSize[0], 'standingSize.width'); const height = positive(standingSize[1], 'standingSize.height'); const viewportWidth = positive(viewport.width, 'viewport.width'); const viewportHeight = positive(viewport.height, 'viewport.height');
  return scale * Math.min(1, viewportWidth * .28 / (width * scale), viewportHeight * .45 / (height * scale));
}

function positiveInteger(value: number, label: string): number { if (!Number.isSafeInteger(value) || value < 1) throw new RangeError(`${label} must be a positive integer.`); return value; }
function positive(value: number, label: string): number { if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} must be finite and positive.`); return value; }
function boundedIndex(value: number, count: number): number { if (!Number.isSafeInteger(value) || value < 0 || value >= count) throw new RangeError('currentIndex is outside the character grid.'); return value; }
function modulo(value: number, divisor: number): number { return (value % divisor + divisor) % divisor; }
