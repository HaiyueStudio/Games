/** XSB maps preserve the author's spaces and ragged rows; '_' exists only in prepared runtime maps. */
export function prepareLevelMap(raw: readonly string[]): string[] {
  const width = Math.max(0, ...raw.map(row => row.length)), height = raw.length;
  if (width < 3 || height < 3 || raw.some(row => !/^[# .$@*+]+$/.test(row))) throw new Error('Invalid Sokoban map symbols or dimensions');
  const cells = raw.map(row => [...row.padEnd(width, ' ')]);
  const outside: [number, number][] = [];
  const visit = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height || cells[y]![x] !== ' ') return;
    cells[y]![x] = '_'; outside.push([x, y]);
  };
  for (let x = 0; x < width; x++) { visit(x, 0); visit(x, height - 1); }
  for (let y = 0; y < height; y++) { visit(0, y); visit(width - 1, y); }
  for (let i = 0; i < outside.length; i++) {
    const [x, y] = outside[i]!;
    visit(x - 1, y); visit(x + 1, y); visit(x, y - 1); visit(x, y + 1);
  }
  let players = 0, boxes = 0, targets = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const cell = cells[y]![x]!;
    if ('@+'.includes(cell)) players++;
    if ('$*'.includes(cell)) boxes++;
    if ('.*+'.includes(cell)) targets++;
    if (cell === '#' || cell === '_') continue;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const neighbor = cells[y + dy!]?.[x + dx!];
      if (neighbor === undefined || neighbor === '_') throw new Error('Sokoban playable floor has an open boundary');
    }
  }
  if (players !== 1 || boxes === 0 || boxes !== targets) throw new Error('Invalid Sokoban player, crate or target count');
  return cells.map(row => row.join(''));
}

export function parseSasquatch(text: string): { number: number; map: string[] }[] {
  const levels: { number: number; map: string[] }[] = [];
  for (const line of text.replaceAll('\r\n', '\n').split('\n')) {
    const marker = /^;\s*(\d+)\s*$/.exec(line);
    if (marker) levels.push({ number: Number(marker[1]), map: [] });
    else if (/^[ #.$@*+]+$/.test(line) && line.includes('#')) {
      const level = levels.at(-1);
      if (!level) throw new Error('Sasquatch map has no level number');
      level.map.push(line);
    }
  }
  if (!levels.length || levels.some((level, index) => level.number !== index + 1 || !level.map.length)) throw new Error('Invalid Sasquatch level sequence');
  for (const level of levels) prepareLevelMap(level.map);
  return levels;
}
