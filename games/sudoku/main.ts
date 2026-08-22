import { HaiyueEngine } from '@haiyue/engine';
import { requireEngineCanvas } from '@haiyue/engine/experimental';
import { World } from '@haiyue/engine';
import { Entity } from '@haiyue/engine';
import { Camera3D } from '@haiyue/engine';
import { CanvasTextComponent } from '@haiyue/engine/components';
import { CartesianTransform3D } from '@haiyue/engine';
import { Mesh3D } from '@haiyue/engine';
import { RenderIntegration } from '@haiyue/engine/experimental';
import { Render3DSystem } from '@haiyue/engine/systems';
import { BasicMaterial } from '@haiyue/engine';
import { CssMaterial, type CssMaterialStyle } from '@haiyue/engine/material';
import { createBox3D } from '@haiyue/engine';
import { createPlane3D } from '@haiyue/engine';
import { requiredItemAt, requiredNumberAt } from '../arrayAccess';
import { SingleSlotGameSave, isRecord } from '../save/SingleSlotGameSave';

export type SudokuDifficulty = 'easy' | 'normal' | 'hard';
type Board = number[][];

export interface SudokuConfig {
  difficulty: SudokuDifficulty;
}

interface SudokuSaveData {
  difficulty: SudokuDifficulty;
  puzzle: Board;
  board: Board;
  solution: Board;
}

function isBoard(value: unknown): value is Board {
  return Array.isArray(value) && value.length === SIZE
    && value.every(row => Array.isArray(row) && row.length === SIZE
      && row.every(cell => Number.isSafeInteger(cell) && cell >= 0 && cell <= 9));
}

function isSudokuSaveData(value: unknown): value is SudokuSaveData {
  return isRecord(value)
    && (value.difficulty === 'easy' || value.difficulty === 'normal' || value.difficulty === 'hard')
    && isBoard(value.puzzle)
    && isBoard(value.board)
    && isBoard(value.solution);
}

interface Hint {
  row: number;
  col: number;
  value: number;
  technique: string;
  explanation: string;
}

interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ButtonVisual {
  entity: Entity;
  material: CssMaterial;
  rect: PixelRect;
  label: string;
  kind: 'primary' | 'active' | 'number';
  onClick: () => void;
}

const CANVAS_W = 900;
const CANVAS_H = 600;
const SIZE = 9;
const BOX = 3;
const CELL_SIZE = 0.62;
const CELL_GAP = 0.015;
const BOARD_PIXEL_SIZE = 405;
const BOARD_PIXEL_TOP = 96;
const DIFFICULTY_HOLES: Record<SudokuDifficulty, number> = {
  easy: 36,
  normal: 46,
  hard: 56,
};

const BOARD_WORLD_SIZE = SIZE * CELL_SIZE;
const BOARD_VIEW_WIDTH = BOARD_WORLD_SIZE * CANVAS_W / BOARD_PIXEL_SIZE;
const BOARD_VIEW_HEIGHT = BOARD_VIEW_WIDTH * CANVAS_H / CANVAS_W;
const CELL_TEXTURE_SIZE = 96;
const geoCell = createPlane3D({ width: CELL_SIZE - CELL_GAP, height: CELL_SIZE - CELL_GAP, normal: 'y' });

function emptyBoard(): Board {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
}

function cloneBoard(board: Board): Board {
  return board.map(row => row.slice());
}

function boardRow(board: Board, row: number): number[] {
  return requiredItemAt(board, row, 'Sudoku board rows');
}

function boardValue(board: Board, row: number, col: number): number {
  return requiredNumberAt(boardRow(board, row), col, 'Sudoku board cells');
}

function setBoardValue(board: Board, row: number, col: number, value: number): void {
  boardRow(board, row)[col] = value;
}

function shuffle<T>(items: T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const current = requiredItemAt(out, i, 'Sudoku shuffle items');
    out[i] = requiredItemAt(out, j, 'Sudoku shuffle items');
    out[j] = current;
  }
  return out;
}

function isAllowed(board: Board, row: number, col: number, value: number): boolean {
  for (let i = 0; i < SIZE; i++) {
    if (boardValue(board, row, i) === value || boardValue(board, i, col) === value) return false;
  }
  const br = Math.floor(row / BOX) * BOX;
  const bc = Math.floor(col / BOX) * BOX;
  for (let r = br; r < br + BOX; r++) {
    for (let c = bc; c < bc + BOX; c++) {
      if (boardValue(board, r, c) === value) return false;
    }
  }
  return true;
}

function fillBoard(board: Board): boolean {
  let bestRow = -1;
  let bestCol = -1;
  let bestCandidates: number[] = [];

  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (boardValue(board, r, c) !== 0) continue;
      const candidates = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9])
        .filter(value => isAllowed(board, r, c, value));
      if (bestRow === -1 || candidates.length < bestCandidates.length) {
        bestRow = r;
        bestCol = c;
        bestCandidates = candidates;
      }
    }
  }

  if (bestRow === -1) return true;
  for (const value of bestCandidates) {
    setBoardValue(board, bestRow, bestCol, value);
    if (fillBoard(board)) return true;
    setBoardValue(board, bestRow, bestCol, 0);
  }
  return false;
}

function countSolutions(board: Board, limit = 2): number {
  let count = 0;
  const work = cloneBoard(board);

  const solve = (): boolean => {
    let bestRow = -1;
    let bestCol = -1;
    let bestCandidates: number[] = [];
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (boardValue(work, r, c) !== 0) continue;
        const candidates = [1, 2, 3, 4, 5, 6, 7, 8, 9]
          .filter(value => isAllowed(work, r, c, value));
        if (candidates.length === 0) return false;
        if (bestRow === -1 || candidates.length < bestCandidates.length) {
          bestRow = r;
          bestCol = c;
          bestCandidates = candidates;
        }
      }
    }

    if (bestRow === -1) {
      count++;
      return count >= limit;
    }

    for (const value of bestCandidates) {
      setBoardValue(work, bestRow, bestCol, value);
      if (solve()) return true;
      setBoardValue(work, bestRow, bestCol, 0);
    }
    return false;
  };

  solve();
  return count;
}

function generatePuzzle(difficulty: SudokuDifficulty): { puzzle: Board; solution: Board } {
  const solution = emptyBoard();
  fillBoard(solution);
  const puzzle = cloneBoard(solution);
  const holes = DIFFICULTY_HOLES[difficulty];
  const cells = shuffle(Array.from({ length: SIZE * SIZE }, (_, i) => i));
  let removed = 0;

  for (const index of cells) {
    if (removed >= holes) break;
    const row = Math.floor(index / SIZE);
    const col = index % SIZE;
    const backup = boardValue(puzzle, row, col);
    setBoardValue(puzzle, row, col, 0);
    if (countSolutions(puzzle) === 1) {
      removed++;
    } else {
      setBoardValue(puzzle, row, col, backup);
    }
  }

  return { puzzle, solution };
}

export class SudokuGame {
  private readonly saves = new SingleSlotGameSave<SudokuSaveData>({
    gameId: 'sudoku',
    name: 'Sudoku 自动存档',
    validateData: isSudokuSaveData,
  });
  private engine!: HaiyueEngine;
  private world!: World;
  private puzzle: Board = emptyBoard();
  private board: Board = emptyBoard();
  private solution: Board = emptyBoard();
  private difficulty: SudokuDifficulty;
  private selected: { row: number; col: number } | null = null;
  private hint: Hint | null = null;
  private renderFramesRemaining = 0;

  private cellMats: CssMaterial[] = [];
  private buttonVisuals: ButtonVisual[] = [];
  private padButtonVisuals: ButtonVisual[] = [];
  private statusMaterial!: CssMaterial;
  private explainMaterial!: CssMaterial;
  private explainEntity!: Entity;
  private canvas: HTMLCanvasElement | null = null;
  private readonly canvasClickHandler = (event: MouseEvent): void => this._handleCanvasClick(event);

  constructor(config: Partial<SudokuConfig> = {}) {
    this.difficulty = config.difficulty ?? 'normal';
  }

  async init(canvas: HTMLCanvasElement): Promise<void> {
    this.canvas = canvas;
    this.engine = new HaiyueEngine({
      canvas,
      clearColor: { r: 0.95, g: 0.92, b: 0.86, a: 1 },
    });
    await this.engine.init();

    this.world = new World('Sudoku');
    this._setupScene();
    this._buildBoardMesh();
    this._buildScreenUI();
    canvas.addEventListener('click', this.canvasClickHandler);
    await this._loadOrCreateState();
    this.engine.on('update', ({ detail: { time, delta } }) => {
      if (this.renderFramesRemaining <= 0) return;
      this.world.update(time, delta);
      this.renderFramesRemaining--;
    });
    this.engine.run();
  }

  clickAt(x: number, y: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    this._handlePixelClick(x, y);
  }

  stop(): void {
    this.canvas?.removeEventListener('click', this.canvasClickHandler);
    this.world?.destroy();
    this.engine?.stop();
    this.canvas = null;
  }

  private _setupScene() {
    const cam = new Camera3D({
      type: 'orthographic',
      near: 0.1,
      far: 100,
      left: -BOARD_VIEW_WIDTH / 2,
      right: BOARD_VIEW_WIDTH / 2,
      top: BOARD_VIEW_HEIGHT / 2,
      bottom: -BOARD_VIEW_HEIGHT / 2,
    });
    const transform = new CartesianTransform3D({ position: [0, 8, 0] });
    transform.setRotation(-Math.PI / 2, 0, 0);
    const camEntity = new Entity('Camera3D');
    camEntity.addComponent(cam);
    camEntity.addComponent(transform);
    this.world.addEntity(camEntity);
    const renderIntegration = new RenderIntegration(this.engine, { label: 'Sudoku.render' });
    this.world.addRuntimeIntegration(renderIntegration);
    this.world.addSystem(new Render3DSystem(this.engine, camEntity, {
      priority: 0,
      loadOp: 'clear',
    }));
    renderIntegration.registerAll(this.world, () => ({ pass: 'shared' }));
  }

  private _buildBoardMesh() {
    const boardMaterial = new BasicMaterial({ color: [0.14, 0.2, 0.28, 1] });
    const boardEntity = new Entity('SudokuBoardBackplate');
    boardEntity.addComponent(new CartesianTransform3D({ position: [0, -0.035, 0] }));
    boardEntity.addComponent(new Mesh3D(
      createBox3D({ width: BOARD_WORLD_SIZE + 0.16, height: 0.04, depth: BOARD_WORLD_SIZE + 0.16 }),
      boardMaterial,
    ));
    this.world.addEntity(boardEntity);

    for (let row = 0; row < SIZE; row++) {
      for (let col = 0; col < SIZE; col++) {
        const mat = new CssMaterial({
          text: '',
          style: this._cellStyle('#ede7dc', '#2563eb', 0, false, false),
        });
        const entity = new Entity(`cell_${row}_${col}`);
        entity.addComponent(new CartesianTransform3D({
          position: [this._cellX(col), 0, this._cellZ(row)],
        }));
        const text = new CanvasTextComponent({ material: mat });
        entity.addComponent(text);
        entity.addComponent(new Mesh3D(geoCell, text.material));
        this.world.addEntity(entity);
        this.cellMats.push(mat);
      }
    }

    this._buildGridLines();
  }

  private _buildGridLines() {
    const material = new BasicMaterial({ color: [0.14, 0.2, 0.28, 1] });
    const lineHeight = 0.035;
    const board = SIZE * CELL_SIZE;
    for (let i = 0; i <= SIZE; i++) {
      const thick = i % BOX === 0;
      const width = thick ? 0.045 : 0.016;
      const offset = -board / 2 + i * CELL_SIZE;

      const vertical = new Entity(`grid_v_${i}`);
      vertical.addComponent(new CartesianTransform3D({ position: [offset, 0.025, 0] }));
      vertical.addComponent(new Mesh3D(createBox3D({ width, height: lineHeight, depth: board + width }), material));
      this.world.addEntity(vertical);

      const horizontal = new Entity(`grid_h_${i}`);
      horizontal.addComponent(new CartesianTransform3D({ position: [0, 0.026, offset] }));
      horizontal.addComponent(new Mesh3D(createBox3D({ width: board + width, height: lineHeight, depth: width }), material));
      this.world.addEntity(horizontal);
    }
  }

  private _cellX(col: number): number {
    return (col - (SIZE - 1) / 2) * CELL_SIZE;
  }

  private _cellZ(row: number): number {
    return (row - (SIZE - 1) / 2) * CELL_SIZE;
  }

  private _handleCanvasClick(event: MouseEvent) {
    const rect = requireEngineCanvas(this.engine).getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const px = (event.clientX - rect.left) * CANVAS_W / rect.width;
    const py = (event.clientY - rect.top) * CANVAS_H / rect.height;
    this._handlePixelClick(px, py);
  }

  private _handlePixelClick(px: number, py: number): void {
    const hitButton = [...this.padButtonVisuals, ...this.buttonVisuals].find(button => this._contains(button.rect, px, py));
    if (hitButton) {
      hitButton.onClick();
      return;
    }

    const boardLeft = (CANVAS_W - BOARD_PIXEL_SIZE) / 2;
    const x = px - boardLeft;
    const y = py - BOARD_PIXEL_TOP;
    if (x < 0 || y < 0 || x >= BOARD_PIXEL_SIZE || y >= BOARD_PIXEL_SIZE) return;
    const col = Math.floor(x / (BOARD_PIXEL_SIZE / SIZE));
    const row = Math.floor(y / (BOARD_PIXEL_SIZE / SIZE));
    this._selectCell(row, col);
  }

  private _contains(rect: PixelRect, x: number, y: number): boolean {
    return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
  }

  private _buildScreenUI() {
    this._createTextVisual('Title', 'Sudoku', { x: 26, y: 18, width: 210, height: 48 }, this._labelStyle(42, '#243447', 900, 'left'));
    this._createTextVisual(
      'Subtitle',
      'Generated puzzles have a unique solution.',
      { x: 26, y: 66, width: 360, height: 26 },
      this._labelStyle(14, '#6b7280', 800, 'left'),
    );

    this.statusMaterial = this._createTextVisual(
      'Status',
      '',
      { x: 260, y: 508, width: 380, height: 24 },
      this._labelStyle(16, '#6b7280', 900, 'center'),
    );

    this.explainMaterial = this._createTextVisual(
      'Explain',
      '',
      { x: 639, y: 432, width: 235, height: 116 },
      {
        width: 470,
        height: 232,
        resolutionScale: 2,
        backgroundColor: 'rgba(255,255,255,0.92)',
        borderColor: 'rgba(36,52,71,0.18)',
        borderWidth: 2,
        borderRadius: 10,
        padding: 20,
        textAlign: 'left',
        verticalAlign: 'middle',
        fontSize: 24,
        fontFamily: 'Arial, Helvetica, sans-serif',
        fontWeight: 800,
        lineHeight: 1.35,
        color: '#374151',
        whiteSpace: 'normal',
      },
    );
    this.explainEntity.disabled = true;

    for (const item of this._layoutTopButtons()) {
      this.buttonVisuals.push(this._createButtonVisual(item.rect, item.label, 'primary', item.onClick, 'button'));
    }
    this._syncOverlayButtonVisuals();
  }

  private _createTextVisual(name: string, text: string, rect: PixelRect, style: CssMaterialStyle): CssMaterial {
    const material = new CssMaterial({
      text,
      style: {
        ...style,
        width: Math.max(1, Math.floor(rect.width * 2)),
        height: Math.max(1, Math.floor(rect.height * 2)),
      },
    });
    const entity = new Entity(name);
    entity.addComponent(new CartesianTransform3D({ position: this._screenRectToWorld(rect, 0.1) }));
    const component = new CanvasTextComponent({ material });
    entity.addComponent(component);
    entity.addComponent(new Mesh3D(
      createPlane3D({
        width: rect.width / CANVAS_W * BOARD_VIEW_WIDTH,
        height: rect.height / CANVAS_H * BOARD_VIEW_HEIGHT,
        normal: 'y',
      }),
      component.material,
    ));
    this.world.addEntity(entity);
    if (name === 'Explain') this.explainEntity = entity;
    return material;
  }

  private _layoutTopButtons(): Array<{ label: string; rect: PixelRect; onClick: () => void }> {
    const definitions: Array<{ label: string; onClick: () => void }> = [
      { label: 'Easy', onClick: () => { this.difficulty = 'easy'; this._newPuzzle(); } },
      { label: 'Normal', onClick: () => { this.difficulty = 'normal'; this._newPuzzle(); } },
      { label: 'Hard', onClick: () => { this.difficulty = 'hard'; this._newPuzzle(); } },
      { label: 'Hint', onClick: () => this._showHint() },
      { label: 'Explain', onClick: () => this._showExplanation() },
      { label: 'Solve', onClick: () => this._solve() },
      { label: 'New', onClick: () => this._newPuzzle() },
    ];
    let right = CANVAS_W - 26;
    return definitions.slice().reverse().map(def => {
      const width = Math.max(62, def.label.length * 10 + 28);
      right -= width;
      const rect = { x: right, y: 18, width, height: 36 };
      right -= 8;
      return { ...def, rect };
    }).reverse();
  }

  private _createButtonVisual(
    rect: PixelRect,
    label: string,
    kind: ButtonVisual['kind'],
    onClick: () => void,
    name: string,
  ): ButtonVisual {
    const material = new CssMaterial({
      text: label,
      style: this._buttonStyle(kind, rect.width, rect.height),
    });
    const entity = new Entity(`${name}_${label}`);
    entity.addComponent(new CartesianTransform3D({
      position: this._screenRectToWorld(rect, 0.12),
    }));
    const component = new CanvasTextComponent({ material });
    entity.addComponent(component);
    entity.addComponent(new Mesh3D(
      createPlane3D({
        width: rect.width / CANVAS_W * BOARD_VIEW_WIDTH,
        height: rect.height / CANVAS_H * BOARD_VIEW_HEIGHT,
        normal: 'y',
      }),
      component.material,
    ));
    this.world.addEntity(entity);
    return { entity, material, rect, label, kind, onClick };
  }

  private _screenRectToWorld(rect: PixelRect, yLayer: number): [number, number, number] {
    const centerX = rect.x + rect.width / 2;
    const centerY = rect.y + rect.height / 2;
    return [
      (centerX / CANVAS_W - 0.5) * BOARD_VIEW_WIDTH,
      yLayer,
      (centerY / CANVAS_H - 0.5) * BOARD_VIEW_HEIGHT,
    ];
  }

  private _syncOverlayButtonVisuals() {
    for (const visual of this.buttonVisuals) {
      const active = visual.label.toLowerCase() === this.difficulty;
      const kind: ButtonVisual['kind'] = active ? 'active' : 'primary';
      visual.kind = kind;
      visual.material.setStyle(this._buttonStyle(kind, visual.rect.width, visual.rect.height));
    }
  }

  private _labelStyle(
    fontSize: number,
    color: string,
    fontWeight: number,
    textAlign: 'left' | 'center' | 'right',
  ): CssMaterialStyle {
    return {
      resolutionScale: 2,
      backgroundColor: 'rgba(255,255,255,0)',
      padding: 0,
      textAlign,
      verticalAlign: 'middle',
      fontSize: fontSize * 2,
      lineHeight: 1.05,
      fontFamily: 'Arial, Helvetica, sans-serif',
      fontWeight,
      color,
    };
  }

  private _buttonStyle(kind: ButtonVisual['kind'], width: number, height: number): CssMaterialStyle {
    const active = kind === 'active';
    const number = kind === 'number';
    return {
      width: Math.max(1, Math.floor(width * 2)),
      height: Math.max(1, Math.floor(height * 2)),
      resolutionScale: 2,
      backgroundColor: active ? '#2563eb' : number ? '#2563eb' : '#d8d1c4',
      borderColor: active ? '#1d4ed8' : number ? '#1d4ed8' : '#b7ad9d',
      borderWidth: 2,
      borderRadius: 10,
      padding: 0,
      textAlign: 'center',
      verticalAlign: 'middle',
      fontSize: number ? 36 : 24,
      fontFamily: 'Arial, Helvetica, sans-serif',
      fontWeight: 900,
      color: active || number ? '#ffffff' : '#243447',
    };
  }

  private _newPuzzle() {
    this._setStatus('Generating unique puzzle...');
    requestAnimationFrame(() => {
      const generated = generatePuzzle(this.difficulty);
      this.puzzle = generated.puzzle;
      this.solution = generated.solution;
      this.board = cloneBoard(this.puzzle);
      this.selected = null;
      this.hint = null;
      this._hideExplanation();
      this._setStatus(`${this._difficultyLabel()} puzzle ready`);
      this._render();
      this._updatePad();
      this._saveState();
    });
  }

  private async _loadOrCreateState(): Promise<void> {
    const saved = await this.saves.load();
    if (!saved) {
      this._newPuzzle();
      return;
    }
    this.difficulty = saved.difficulty;
    this.puzzle = cloneBoard(saved.puzzle);
    this.board = cloneBoard(saved.board);
    this.solution = cloneBoard(saved.solution);
    this.selected = null;
    this.hint = null;
    this._hideExplanation();
    this._setStatus(this._isComplete() ? 'Solved' : `${this._difficultyLabel()} puzzle restored`);
    this._render();
    this._updatePad();
  }

  private _saveState(): void {
    this.saves.save({
      difficulty: this.difficulty,
      puzzle: cloneBoard(this.puzzle),
      board: cloneBoard(this.board),
      solution: cloneBoard(this.solution),
    });
  }

  private _selectCell(row: number, col: number) {
    this.selected = { row, col };
    this.hint = null;
    this._hideExplanation();
    this._render();
    this._updatePad();
  }

  private _render() {
    this._syncOverlayButtonVisuals();

    for (let row = 0; row < SIZE; row++) {
      for (let col = 0; col < SIZE; col++) {
        const idx = row * SIZE + col;
        const value = boardValue(this.board, row, col);
        const selected = this.selected?.row === row && this.selected?.col === col;
        const peer = this.selected ? this._isPeer(row, col, this.selected.row, this.selected.col) : false;
        const selectedValue = this.selected ? boardValue(this.board, this.selected.row, this.selected.col) : 0;
        const same = value !== 0 && selectedValue !== 0 && value === selectedValue;
        const hinted = this.hint?.row === row && this.hint?.col === col;
        const wrong = value !== 0 && value !== boardValue(this.solution, row, col);
        const given = boardValue(this.puzzle, row, col) !== 0;

        const background = selected ? '#fde68a' : hinted ? '#fbbf24' : same ? '#7c3aed' : peer ? '#bfdbfe' : given ? '#f8fafc' : '#ede7dc';
        const textColor = wrong ? '#dc2626' : same ? '#ffffff' : given ? '#1f2937' : '#2563eb';
        const material = requiredItemAt(this.cellMats, idx, 'Sudoku cell materials');
        material.setText(value ? String(value) : '');
        material.setStyle(this._cellStyle(background, textColor, value, given, wrong));
      }
    }
    this._requestRender();
  }

  private _cellStyle(
    backgroundColor: string,
    color: string,
    value: number,
    given: boolean,
    wrong: boolean,
  ): CssMaterialStyle {
    return {
      width: CELL_TEXTURE_SIZE,
      height: CELL_TEXTURE_SIZE,
      resolutionScale: 2,
      backgroundColor,
      borderColor: 'rgba(36,52,71,0.22)',
      borderWidth: 1,
      borderRadius: 3,
      padding: 0,
      textAlign: 'center',
      verticalAlign: 'middle',
      fontSize: value ? 54 : 1,
      fontFamily: 'Arial, Helvetica, sans-serif',
      fontWeight: given ? 900 : 800,
      color: wrong ? '#dc2626' : color,
    };
  }

  private _requestRender(frames = 16) {
    this.renderFramesRemaining = Math.max(this.renderFramesRemaining, frames);
    window.setTimeout(() => {
      this.renderFramesRemaining = Math.max(this.renderFramesRemaining, 3);
    }, 80);
  }

  private _updatePad() {
    for (const visual of this.padButtonVisuals) {
      this.world.removeEntity(visual.entity);
    }
    this.padButtonVisuals = [];
    if (!this.selected) {
      this._requestRender();
      return;
    }
    const { row, col } = this.selected;
    if (boardValue(this.puzzle, row, col) !== 0) {
      this._requestRender();
      return;
    }

    const candidates = this._candidates(row, col);
    const totalWidth = candidates.length * 42 + Math.max(0, candidates.length - 1) * 8;
    let x = (CANVAS_W - totalWidth) / 2;
    this.padButtonVisuals = candidates.map(value => {
      const rect = { x, y: CANVAS_H - 68, width: 42, height: 42 };
      x += 50;
      return this._createButtonVisual(rect, String(value), 'number', () => this._placeValue(row, col, value), 'pad');
    });
    this._requestRender();
  }

  private _placeValue(row: number, col: number, value: number) {
    setBoardValue(this.board, row, col, value);
    this.hint = null;
    this._hideExplanation();
    this._render();
    this._updatePad();
    if (this._isComplete()) {
      this._setStatus('Solved');
    }
    this._saveState();
  }

  private _candidates(row: number, col: number): number[] {
    const current = boardValue(this.board, row, col);
    setBoardValue(this.board, row, col, 0);
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9]
      .filter(value => isAllowed(this.board, row, col, value));
    setBoardValue(this.board, row, col, current);
    return values;
  }

  private _solve() {
    this.board = cloneBoard(this.solution);
    this.selected = null;
    this.hint = null;
    this._hideExplanation();
    this._setStatus('Solved automatically');
    this._render();
    this._updatePad();
    this._saveState();
  }

  private _isComplete(): boolean {
    return this.board.every((row, r) => (
      row.every((value, c) => value === boardValue(this.solution, r, c))
    ));
  }

  private _showHint() {
    this.hint = this._findHint();
    this._hideExplanation();
    if (!this.hint) {
      this._setStatus('No simple logical hint found');
      this._render();
      return;
    }

    this.selected = { row: this.hint.row, col: this.hint.col };
    this._setStatus(`${this.hint.technique}: highlighted one solvable cell`);
    this._render();
    this._updatePad();
  }

  private _showExplanation() {
    if (!this.hint) {
      this.hint = this._findHint();
      if (this.hint) {
        this.selected = { row: this.hint.row, col: this.hint.col };
        this._render();
        this._updatePad();
      }
    }

    if (!this.hint) {
      this._setExplanation('No simple logical hint is currently available.');
    } else {
      this._setExplanation(this.hint.explanation);
    }
  }

  private _setStatus(text: string) {
    this.statusMaterial?.setText(text);
    this._requestRender();
  }

  private _setExplanation(text: string) {
    this.explainMaterial.setText(text);
    this.explainEntity.disabled = false;
    this._requestRender();
  }

  private _hideExplanation() {
    if (this.explainEntity) this.explainEntity.disabled = true;
    this._requestRender();
  }

  private _findHint(): Hint | null {
    return this._findNakedSingle() ||
      this._findHiddenSingleInRows() ||
      this._findHiddenSingleInCols() ||
      this._findHiddenSingleInBoxes();
  }

  private _findNakedSingle(): Hint | null {
    for (let row = 0; row < SIZE; row++) {
      for (let col = 0; col < SIZE; col++) {
        if (boardValue(this.board, row, col) !== 0) continue;
        const candidates = this._candidates(row, col);
        if (candidates.length === 1) {
          const value = requiredNumberAt(candidates, 0, 'Sudoku hint candidates');
          return {
            row,
            col,
            value,
            technique: 'Single candidate',
            explanation: `Cell ${this._cellName(row, col)} can only be ${value}. The other numbers are already blocked by its row, column, or 3x3 box.`,
          };
        }
      }
    }
    return null;
  }

  private _findHiddenSingleInRows(): Hint | null {
    for (let row = 0; row < SIZE; row++) {
      for (let value = 1; value <= 9; value++) {
        const places: number[] = [];
        for (let col = 0; col < SIZE; col++) {
          if (boardValue(this.board, row, col) === 0 && this._candidates(row, col).includes(value)) {
            places.push(col);
          }
        }
        if (places.length === 1) {
          const col = requiredNumberAt(places, 0, 'Sudoku row hint places');
          return {
            row,
            col,
            value,
            technique: 'Row single',
            explanation: `In row ${row + 1}, ${value} can go only in cell ${this._cellName(row, col)}. Every other empty cell in that row is blocked by its column or box.`,
          };
        }
      }
    }
    return null;
  }

  private _findHiddenSingleInCols(): Hint | null {
    for (let col = 0; col < SIZE; col++) {
      for (let value = 1; value <= 9; value++) {
        const places: number[] = [];
        for (let row = 0; row < SIZE; row++) {
          if (boardValue(this.board, row, col) === 0 && this._candidates(row, col).includes(value)) {
            places.push(row);
          }
        }
        if (places.length === 1) {
          const row = requiredNumberAt(places, 0, 'Sudoku column hint places');
          return {
            row,
            col,
            value,
            technique: 'Column single',
            explanation: `In column ${col + 1}, ${value} can go only in cell ${this._cellName(row, col)}. Every other empty cell in that column is blocked by its row or box.`,
          };
        }
      }
    }
    return null;
  }

  private _findHiddenSingleInBoxes(): Hint | null {
    for (let br = 0; br < SIZE; br += BOX) {
      for (let bc = 0; bc < SIZE; bc += BOX) {
        for (let value = 1; value <= 9; value++) {
          const places: Array<{ row: number; col: number }> = [];
          for (let row = br; row < br + BOX; row++) {
            for (let col = bc; col < bc + BOX; col++) {
              if (boardValue(this.board, row, col) === 0 && this._candidates(row, col).includes(value)) {
                places.push({ row, col });
              }
            }
          }
          if (places.length === 1) {
            const { row, col } = requiredItemAt(places, 0, 'Sudoku box hint places');
            return {
              row,
              col,
              value,
              technique: 'Box single',
              explanation: `In the 3x3 box covering rows ${br + 1}-${br + 3} and columns ${bc + 1}-${bc + 3}, ${value} can go only in cell ${this._cellName(row, col)}.`,
            };
          }
        }
      }
    }
    return null;
  }

  private _cellName(row: number, col: number): string {
    return `R${row + 1}C${col + 1}`;
  }

  private _isPeer(row: number, col: number, selectedRow: number, selectedCol: number): boolean {
    return row === selectedRow ||
      col === selectedCol ||
      (Math.floor(row / BOX) === Math.floor(selectedRow / BOX) &&
        Math.floor(col / BOX) === Math.floor(selectedCol / BOX));
  }

  private _difficultyLabel(): string {
    return this.difficulty === 'easy' ? 'Easy' : this.difficulty === 'hard' ? 'Hard' : 'Normal';
  }
}

async function main(canvas: HTMLCanvasElement): Promise<void> {
  const cfg = await fetch('./config.json')
    .then(r => r.json())
    .catch(() => ({ difficulty: 'normal' })) as Partial<SudokuConfig>;
  const game = new SudokuGame(cfg);
  await game.init(canvas);
}

const standaloneCanvas = document.querySelector<HTMLCanvasElement>('[data-sudoku-game]');
if (standaloneCanvas) {
  void main(standaloneCanvas).catch(error => console.error(error));
}
