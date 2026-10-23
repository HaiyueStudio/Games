import { Camera2D, Entity, World } from '@haiyue/engine';
import { Mesh2DRenderSystem } from '@haiyue/engine/systems';
import { RenderIntegration } from '@haiyue/engine/experimental';
import { GuiSystem } from '@haiyue/engine/gui';
import { GameEngine } from '../../session/GameEngine';
import { SingleSlotGameSave } from '../../save/SingleSlotGameSave';
import { isTriangleCalendarSaveData, type TriangleCalendarSaveData } from '../save/saveState';
import { CalendarBoard } from '../rendering/CalendarBoard';
import { CalendarHud, FONT_CHARS, type CalendarAction } from '../ui/CalendarHud';
import { TRIANGLE_CALENDAR_PIECES, createTriangleCalendarBoard, positionBoardCells, createDateTargetKeys, orientTrianglePiece, findBestPiecePlacement, triangleVertices, type Point2D } from '../rules/triangleCalendarLogic';
import { BOARD_ORIGIN, PIECE_HOMES, SIDE, SNAP_DISTANCE, VIEW_HEIGHT, VIEW_WIDTH, WEEKDAY_NAMES, type PieceState } from './model';
export class TriangleCalendarGame {
    private readonly engine: GameEngine;
    private readonly world = new World('Triangle calendar puzzle');
    private readonly lifetime = new AbortController();
    private readonly board = createTriangleCalendarBoard();
    private readonly positions = positionBoardCells(this.board, BOARD_ORIGIN, SIDE);
    private readonly pieces: PieceState[] = TRIANGLE_CALENDAR_PIECES.map(definition => ({ definition, rotation: 0, flipped: false, pivotX: 0, pivotY: 0, placed: false, occupiedKeys: [] }));
    private readonly occupancy = new Set<string>();
    private readonly saves = new SingleSlotGameSave<TriangleCalendarSaveData>({ gameId: 'triangle-calendar-puzzle', name: 'Triangle Calendar Puzzle 自动存档', validateData: isTriangleCalendarSaveData });
    private hud!: CalendarHud;
    private view!: CalendarBoard;
    private selected: PieceState | null = null;
    private drag: {
        piece: PieceState;
        id: number;
        offsetX: number;
        offsetY: number;
        before: Omit<PieceState, 'definition'>;
    } | null = null;
    private targets = new Set<string>();
    private month = new Date().getMonth() + 1;
    private day = new Date().getDate();
    private weekday = new Date().getDay();
    private disposed = false;
    private readonly resizeObserver: ResizeObserver;
    constructor(private readonly canvas: HTMLCanvasElement) {
        this.engine = new GameEngine({ canvas, msaaSamples: 4, clearColor: { r: .95, g: .96, b: .96, a: 1 }, devicePixelRatio: () => Math.min(devicePixelRatio || 1, 2) });
        this.resizeObserver = new ResizeObserver(() => this.resize());
    }
    async init(): Promise<void> {
        await this.engine.init();
        if (this.disposed)
            return;
        const camera = new Entity('Calendar camera');
        camera.addComponent(new Camera2D({ width: VIEW_WIDTH, height: VIEW_HEIGHT, designWidth: VIEW_WIDTH, designHeight: VIEW_HEIGHT, viewportMode: 'fit' }));
        this.world.addEntity(camera);
        this.hud = new CalendarHud(this.world, action => this.action(action), (month, day, weekday) => this.setDate(month, day, weekday));
        this.view = new CalendarBoard(this.world, this.board, this.positions, this.hud);
        this.world.addSystem(new Mesh2DRenderSystem(this.engine, camera, { loadOp: 'clear', priority: 10 }));
        const gui = new GuiSystem(this.engine, { loadOp: 'load', font: { chars: FONT_CHARS, fontFamily: 'Microsoft YaHei, sans-serif', fontSize: 30, atlasSize: 2048 } });
        gui.priority = 20;
        this.world.addSystem(gui);
        const integration = new RenderIntegration(this.engine, { label: 'TriangleCalendar.render' });
        this.world.addRuntimeIntegration(integration);
        integration.registerAll(this.world, () => ({ pass: 'shared' }));
        this.targets = createDateTargetKeys(this.month, this.day, this.weekday);
        this.reset();
        await this.restore();
        if (this.disposed)
            return;
        this.hud.setDate(this.month, this.day, this.weekday);
        this.sync();
        this.bindInput();
        this.resizeObserver.observe(this.canvas);
        this.resize();
        this.engine.on('update', ({ detail }) => this.world.update(detail.time, detail.delta));
        this.engine.run();
        document.body.dataset.renderStatus = 'passed';
        if (new URLSearchParams(location.search).has('verify'))
            Object.defineProperty(window, '__triangleCalendar', { configurable: true, value: { snapshot: () => this.snapshot() } });
    }
    private resize(): void { if (this.engine.state === 'ready' && this.hud) {
        this.engine.resizeToDisplaySize();
        this.hud.resize(this.engine.displayWidth, this.engine.displayHeight);
    } }
    private oriented(piece: PieceState) { return orientTrianglePiece(piece.definition, piece.rotation, piece.flipped, SIDE); }
    private setDate(month: number, day: number, weekday: number): void {
        this.cancelDrag();
        this.month = month;
        this.day = Math.min(day, new Date(new Date().getFullYear(), month, 0).getDate());
        this.weekday = weekday;
        this.targets = createDateTargetKeys(this.month, this.day, this.weekday);
        this.hud.setDate(this.month, this.day, this.weekday);
        this.reset();
        this.save();
    }
    private action(action: CalendarAction): void {
        if (action === 'today') {
            const now = new Date();
            this.setDate(now.getMonth() + 1, now.getDate(), now.getDay());
            return;
        }
        if (action === 'reset') {
            this.cancelDrag();
            this.reset();
            this.save();
            return;
        }
        const piece = this.selected;
        if (!piece) {
            this.hud.status.setText(`先点选一个拼图块，再${action === 'rotate' ? '旋转' : '翻转'}。`);
            return;
        }
        this.clearOccupancy(piece);
        if (action === 'rotate')
            piece.rotation = (piece.rotation + 1) % 6;
        else
            piece.flipped = !piece.flipped;
        this.clamp(piece);
        if (!this.drag)
            this.snap(piece);
        this.sync();
        if (!this.drag)
            this.save();
    }
    private reset(): void {
        this.selected = null;
        this.occupancy.clear();
        this.pieces.forEach((piece, index) => {
            piece.rotation = 0;
            piece.flipped = false;
            piece.placed = false;
            piece.occupiedKeys = [];
            const bounds = this.bounds(piece, 0, 0), home = PIECE_HOMES[index]!;
            piece.pivotX = home.x - (bounds.minX + bounds.maxX) / 2;
            piece.pivotY = home.y - (bounds.minY + bounds.maxY) / 2;
            this.clamp(piece);
        });
        this.sync();
    }
    private clearOccupancy(piece: PieceState): void { for (const key of piece.occupiedKeys)
        this.occupancy.delete(key); piece.occupiedKeys = []; piece.placed = false; }
    private placement(piece: PieceState) { return findBestPiecePlacement(this.oriented(piece), { x: piece.pivotX, y: piece.pivotY }, this.positions, this.targets, this.occupancy, SNAP_DISTANCE); }
    private snap(piece: PieceState): void {
        const placement = this.placement(piece);
        if (!placement)
            return;
        piece.pivotX = placement.pivotX;
        piece.pivotY = placement.pivotY;
        piece.occupiedKeys = placement.cellKeys;
        piece.placed = true;
        for (const key of piece.occupiedKeys)
            this.occupancy.add(key);
    }
    private bounds(piece: PieceState, x = piece.pivotX, y = piece.pivotY) {
        const vertices = this.oriented(piece).flatMap(cell => triangleVertices({ x: x + cell.offsetX, y: y + cell.offsetY }, cell.up, SIDE));
        return { minX: Math.min(...vertices.map(v => v.x)), maxX: Math.max(...vertices.map(v => v.x)), minY: Math.min(...vertices.map(v => v.y)), maxY: Math.max(...vertices.map(v => v.y)) };
    }
    private clamp(piece: PieceState): void {
        const b = this.bounds(piece);
        if (b.minX < 10)
            piece.pivotX += 10 - b.minX;
        if (b.maxX > VIEW_WIDTH - 10)
            piece.pivotX -= b.maxX - (VIEW_WIDTH - 10);
        if (b.minY < 112)
            piece.pivotY += 112 - b.minY;
        if (b.maxY > VIEW_HEIGHT - 60)
            piece.pivotY -= b.maxY - (VIEW_HEIGHT - 60);
    }
    private sync(): void {
        let preview: 'valid' | 'invalid' | null = null;
        if (this.drag) {
            if (this.placement(this.drag.piece))
                preview = 'valid';
            else if (this.positions.some(p => Math.hypot(p.x - this.drag!.piece.pivotX, p.y - this.drag!.piece.pivotY) < SNAP_DISTANCE))
                preview = 'invalid';
        }
        this.view.sync(this.pieces, this.selected, this.targets, preview);
        const placed = this.pieces.filter(p => p.placed).length;
        this.hud.status.setText(`已吸附 ${placed}/${this.pieces.length}${this.selected ? ` · 已选「${this.selected.definition.name}」` : ''} · R 旋转 / F 翻转`);
        const complete = placed === this.pieces.length && this.occupancy.size === this.board.length - this.targets.size;
        this.hud.completion.setVisible(complete);
        if (complete)
            this.hud.completion.setText(`${this.month} 月 ${this.day} 日 · ${WEEKDAY_NAMES[this.weekday]} 完成！`);
    }
    private point(event: MouseEvent): Point2D { const r = this.canvas.getBoundingClientRect(); return { x: (event.clientX - r.left) * VIEW_WIDTH / r.width, y: (event.clientY - r.top) * VIEW_HEIGHT / r.height }; }
    private pick(point: Point2D): PieceState | null {
        if (this.selected && this.view.contains(this.selected, point))
            return this.selected;
        return [...this.pieces].reverse().find(piece => this.view.contains(piece, point)) ?? null;
    }
    private bindInput(): void {
        const options = { signal: this.lifetime.signal };
        this.canvas.addEventListener('pointerdown', event => {
            if (event.button !== 0 || this.drag)
                return;
            const point = this.point(event);
            if (this.hud.hit(point.x, point.y))
                return;
            const piece = this.pick(point);
            this.selected = piece;
            if (piece) {
                event.preventDefault();
                this.canvas.focus({ preventScroll: true });
                const before = { rotation: piece.rotation, flipped: piece.flipped, pivotX: piece.pivotX, pivotY: piece.pivotY, placed: piece.placed, occupiedKeys: [...piece.occupiedKeys] };
                this.clearOccupancy(piece);
                this.drag = { piece, id: event.pointerId, offsetX: point.x - piece.pivotX, offsetY: point.y - piece.pivotY, before };
                this.canvas.setPointerCapture(event.pointerId);
            }
            this.sync();
        }, options);
        this.canvas.addEventListener('pointermove', event => {
            if (!this.drag || this.drag.id !== event.pointerId)
                return;
            const p = this.point(event), piece = this.drag.piece;
            piece.pivotX = p.x - this.drag.offsetX;
            piece.pivotY = p.y - this.drag.offsetY;
            this.clamp(piece);
            this.sync();
        }, options);
        this.canvas.addEventListener('pointerup', event => {
            if (!this.drag || this.drag.id !== event.pointerId)
                return;
            const piece = this.drag.piece;
            this.releaseCapture();
            this.drag = null;
            this.snap(piece);
            this.sync();
            this.save();
        }, options);
        this.canvas.addEventListener('pointercancel', () => this.cancelDrag(), options);
        this.canvas.addEventListener('dblclick', event => { const p = this.point(event); if (this.hud.hit(p.x, p.y))
            return; this.selected = this.pick(p); this.action('rotate'); }, options);
        this.canvas.addEventListener('contextmenu', event => { event.preventDefault(); const p = this.point(event); if (this.hud.hit(p.x, p.y))
            return; this.selected = this.pick(p); this.action('flip'); }, options);
        window.addEventListener('keydown', event => {
            if (event.repeat)
                return;
            if (event.code === 'KeyR' || event.code === 'KeyF') {
                event.preventDefault();
                this.action(event.code === 'KeyR' ? 'rotate' : 'flip');
            }
            if (event.code === 'Tab') {
                event.preventDefault();
                const i = this.selected ? this.pieces.indexOf(this.selected) : -1;
                this.selected = this.pieces[(i + (event.shiftKey ? -1 : 1) + this.pieces.length) % this.pieces.length]!;
                this.sync();
            }
        }, options);
    }
    private releaseCapture(): void { if (this.drag && this.canvas.hasPointerCapture(this.drag.id))
        this.canvas.releasePointerCapture(this.drag.id); }
    private cancelDrag(): void {
        if (!this.drag)
            return;
        const { piece, before } = this.drag;
        this.releaseCapture();
        this.drag = null;
        Object.assign(piece, before);
        for (const key of piece.occupiedKeys)
            this.occupancy.add(key);
        this.sync();
    }
    private async restore(): Promise<void> {
        const saved = await this.saves.load();
        if (this.disposed)
            return;
        if (!saved || saved.pieces.length !== this.pieces.length) {
            this.save();
            return;
        }
        this.month = saved.month;
        this.day = Math.min(saved.day, new Date(new Date().getFullYear(), saved.month, 0).getDate());
        this.weekday = saved.weekday;
        this.targets = createDateTargetKeys(this.month, this.day, this.weekday);
        this.occupancy.clear();
        saved.pieces.forEach((data, index) => {
            const piece = this.pieces[index]!;
            piece.rotation = data.rotation % 6;
            piece.flipped = data.flipped;
            piece.pivotX = data.pivotX;
            piece.pivotY = data.pivotY;
            piece.placed = false;
            piece.occupiedKeys = [];
            this.clamp(piece);
            // Revalidate placement against actual geometry instead of trusting stale saved occupied keys.
            if (data.placed)
                this.snap(piece);
        });
    }
    private save(): void { this.saves.save({ month: this.month, day: this.day, weekday: this.weekday, pieces: this.pieces.map(({ definition: _definition, ...data }) => ({ ...data, occupiedKeys: [...data.occupiedKeys] })) }); }
    private snapshot() { return { renderer: 'haiyue-mesh2d-gui', month: this.month, day: this.day, weekday: this.weekday, selected: this.selected?.definition.id, dragging: !!this.drag, targets: [...this.targets], pieces: this.pieces.map(({ definition, ...p }) => ({ ...p, id: definition.id, center: { x: p.pivotX, y: p.pivotY } })), controls: { month: { ...this.hud.month.rect }, day: { ...this.hud.day.rect }, weekday: { ...this.hud.weekday.rect } } }; }
    destroy(): void { if (this.disposed)
        return; this.disposed = true; this.lifetime.abort(); this.resizeObserver.disconnect(); this.engine.stop(); this.world.destroy(); this.engine.destroy(); }
}
