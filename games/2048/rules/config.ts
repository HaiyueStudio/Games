export interface Game2048Palette {
  bg: string;
  fg: string;
}

export interface Game2048Config {
  rows: number;
  cols: number;
  geometry: {
    cellSize: number;
    cellWidth: number;
    cellHeight: number;
    tileWidth: number;
    tileHeight: number;
  };
  animation: {
    moveDurationMs: number;
  };
  input: {
    swipeThreshold: number;
  };
  hud: {
    modal: {
      winTitle: string;
      winMessage: string;
      lostTitle: string;
      lostMessage: string;
      confirmText: string;
      cancelText: string;
    };
  };
  colors: {
    fallback: Game2048Palette;
    tiles: Record<string, Game2048Palette>;
  };
}

export async function loadGame2048Config(url = './config.json'): Promise<Game2048Config> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load 2048 config: ${response.status}`);
  return parseGame2048Config(await response.json());
}

export function parseGame2048Config(value: unknown): Game2048Config {
  if (!isRecord(value)) throw new TypeError('2048 config must be an object.');
  const geometry = requiredRecord(value.geometry, 'geometry');
  const animation = requiredRecord(value.animation, 'animation');
  const input = requiredRecord(value.input, 'input');
  const hud = requiredRecord(value.hud, 'hud');
  const modal = requiredRecord(hud.modal, 'hud.modal');
  const colors = requiredRecord(value.colors, 'colors');
  const tiles = requiredRecord(colors.tiles, 'colors.tiles');

  const parsedTiles: Record<string, Game2048Palette> = {};
  for (const [tile, palette] of Object.entries(tiles)) {
    if (!/^(0|[1-9]\d*)$/.test(tile)) throw new TypeError(`Invalid 2048 tile color key: ${tile}`);
    parsedTiles[tile] = parsePalette(palette, `colors.tiles.${tile}`);
  }
  if (!parsedTiles['0']) throw new TypeError('2048 config must define colors.tiles.0.');

  return {
    rows: positiveInteger(value.rows, 'rows', 2),
    cols: positiveInteger(value.cols, 'cols', 2),
    geometry: {
      cellSize: positiveNumber(geometry.cellSize, 'geometry.cellSize'),
      cellWidth: positiveNumber(geometry.cellWidth, 'geometry.cellWidth'),
      cellHeight: positiveNumber(geometry.cellHeight, 'geometry.cellHeight'),
      tileWidth: positiveNumber(geometry.tileWidth, 'geometry.tileWidth'),
      tileHeight: positiveNumber(geometry.tileHeight, 'geometry.tileHeight'),
    },
    animation: {
      moveDurationMs: positiveNumber(animation.moveDurationMs, 'animation.moveDurationMs'),
    },
    input: {
      swipeThreshold: positiveNumber(input.swipeThreshold, 'input.swipeThreshold'),
    },
    hud: {
      modal: {
        winTitle: nonEmptyString(modal.winTitle, 'hud.modal.winTitle'),
        winMessage: nonEmptyString(modal.winMessage, 'hud.modal.winMessage'),
        lostTitle: nonEmptyString(modal.lostTitle, 'hud.modal.lostTitle'),
        lostMessage: nonEmptyString(modal.lostMessage, 'hud.modal.lostMessage'),
        confirmText: nonEmptyString(modal.confirmText, 'hud.modal.confirmText'),
        cancelText: nonEmptyString(modal.cancelText, 'hud.modal.cancelText'),
      },
    },
    colors: {
      fallback: parsePalette(colors.fallback, 'colors.fallback'),
      tiles: parsedTiles,
    },
  };
}

function parsePalette(value: unknown, path: string): Game2048Palette {
  const palette = requiredRecord(value, path);
  return {
    bg: hexColor(palette.bg, `${path}.bg`),
    fg: hexColor(palette.fg, `${path}.fg`),
  };
}

function requiredRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) throw new TypeError(`2048 config ${path} must be an object.`);
  return value;
}

function positiveInteger(value: unknown, path: string, minimum = 1): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    throw new TypeError(`2048 config ${path} must be an integer of at least ${minimum}.`);
  }
  return value as number;
}

function positiveNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new TypeError(`2048 config ${path} must be a positive number.`);
  }
  return value;
}

function hexColor(value: unknown, path: string): string {
  if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) {
    throw new TypeError(`2048 config ${path} must be a six-digit hex color.`);
  }
  return value;
}

function nonEmptyString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`2048 config ${path} must be a non-empty string.`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
