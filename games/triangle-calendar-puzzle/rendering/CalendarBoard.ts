import { ColorSRGB, Entity, Geometry2D, Material2D, Mesh2D, Transform2D, World } from '@haiyue/engine';
import type { GuiLabel } from '@haiyue/engine/gui';
import { triangleVertices, orientTrianglePiece, type Point2D, type TriangleBoardCell, type PositionedTriangleCell } from '../rules/triangleCalendarLogic';
import { SIDE, VIEW_WIDTH, VIEW_HEIGHT, type PieceState } from '../game/model';
import type { CalendarHud } from '../ui/CalendarHud';
interface Surface {
    entity: Entity;
    geometry: Geometry2D;
    material: Material2D;
    transform: Transform2D;
}
function appendTriangle(data: number[], points: readonly Point2D[]): void { for (const p of points)
    data.push(p.x, -p.y); }
function contains(p: Point2D, v: readonly Point2D[]): boolean {
    const a = v[0]!, b = v[1]!, c = v[2]!;
    const side = (u: Point2D, w: Point2D) => (p.x - w.x) * (u.y - w.y) - (u.x - w.x) * (p.y - w.y);
    const d = [side(a, b), side(b, c), side(c, a)];
    return !(d.some(n => n < 0) && d.some(n => n > 0));
}
export class CalendarBoard {
    private readonly cells = new Map<string, {
        surface: Surface;
        label: GuiLabel;
        position: PositionedTriangleCell;
        kind: string;
    }>();
    private readonly pieces = new Map<PieceState, {
        fill: Surface;
        outline: Surface;
        signature: string;
    }>();
    private lastSelected: PieceState | null = null;
    constructor(private readonly world: World, board: readonly TriangleBoardCell[], positions: readonly PositionedTriangleCell[], hud: CalendarHud) {
        const backing: number[] = [];
        for (const cell of positions)
            appendTriangle(backing, triangleVertices(cell, cell.up, SIDE + 7));
        this.surface('Board frame', backing, '#ba9b75');
        board.forEach((cell, index) => {
            const position = positions[index]!;
            const data: number[] = [];
            appendTriangle(data, triangleVertices(position, cell.up, SIDE - 2.4));
            const surface = this.surface(cell.key, data, '#fbf6e9');
            const label = hud.label(cell.label, { x: position.x - 26, y: position.y - 12, width: 52, height: 24 }, cell.kind === 'day' ? 16 : 13, '#7d654b');
            this.cells.set(cell.key, { surface, label, position, kind: cell.kind });
        });
    }
    private surface(name: string, positions: number[], fill: string): Surface {
        const entity = new Entity(name), geometry = new Geometry2D(new Float32Array(positions.length ? positions : [0, 0, 0, 0, 0, 0]));
        const material = new Material2D({ color: ColorSRGB.fromHex(fill) }), transform = new Transform2D({ x: -VIEW_WIDTH / 2, y: VIEW_HEIGHT / 2 });
        entity.addComponent(transform);
        entity.addComponent(new Mesh2D(geometry, material));
        this.world.addEntity(entity);
        return { entity, geometry, material, transform };
    }
    sync(pieces: readonly PieceState[], selected: PieceState | null, targets: Set<string>, preview: 'valid' | 'invalid' | null): void {
        for (const piece of pieces) {
            let visual = this.pieces.get(piece);
            if (!visual) {
                visual = { outline: this.surface(piece.definition.id + ' outline', [], '#273f46'), fill: this.surface(piece.definition.id, [], piece.definition.color), signature: '' };
                this.pieces.set(piece, visual);
            }
            const signature = `${piece.rotation}/${piece.flipped}/${piece === selected}`;
            if (signature !== visual.signature) {
                const fill: number[] = [], outline: number[] = [];
                const edges = new Map<string, {
                    a: Point2D;
                    b: Point2D;
                    count: number;
                }>();
                for (const cell of orientTrianglePiece(piece.definition, piece.rotation, piece.flipped, SIDE)) {
                    const center = { x: cell.offsetX, y: cell.offsetY };
                    appendTriangle(fill, triangleVertices(center, cell.up, SIDE));
                    const vertices = triangleVertices(center, cell.up, SIDE);
                    vertices.forEach((a, i) => { const b = vertices[(i + 1) % 3]!; const keys = [`${a.x.toFixed(2)},${a.y.toFixed(2)}`, `${b.x.toFixed(2)},${b.y.toFixed(2)}`].sort(); const key = keys.join('/'); const edge = edges.get(key); if (edge)
                        edge.count++;
                    else
                        edges.set(key, { a, b, count: 1 }); });
                }
                // Piece outline geometry is game content; submission, buffers, batching and transforms remain Engine-owned.
                for (const { a, b, count } of edges.values())
                    if (count === 1) {
                        const length = Math.hypot(b.x - a.x, b.y - a.y), w = piece === selected ? 4 : 2;
                        const dx = (b.y - a.y) / length * w, dy = -(b.x - a.x) / length * w;
                        const q = [{ x: a.x + dx, y: a.y + dy }, { x: b.x + dx, y: b.y + dy }, { x: b.x - dx, y: b.y - dy }, { x: a.x - dx, y: a.y - dy }];
                        appendTriangle(outline, [q[0]!, q[1]!, q[2]!]);
                        appendTriangle(outline, [q[0]!, q[2]!, q[3]!]);
                    }
                visual.fill.geometry.setPositions(new Float32Array(fill));
                visual.outline.geometry.setPositions(new Float32Array(outline));
                visual.signature = signature;
            }
            for (const surface of [visual.outline, visual.fill])
                surface.transform.setPosition(piece.pivotX - VIEW_WIDTH / 2, VIEW_HEIGHT / 2 - piece.pivotY);
            visual.outline.material.color = ColorSRGB.fromHex(piece === selected ? (preview === 'valid' ? '#22b56e' : preview === 'invalid' ? '#db4433' : '#ffffff') : '#273f46');
        }
        // Draw the selected piece last and hide covered date labels, including during a drag.
        if (selected !== this.lastSelected) {
            for (const piece of [...pieces.filter(p => p !== selected), ...(selected ? [selected] : [])]) {
                const visual = this.pieces.get(piece)!;
                for (const surface of [visual.outline, visual.fill]) {
                    this.world.removeEntity(surface.entity);
                    this.world.addEntity(surface.entity);
                }
            }
            this.lastSelected = selected;
        }
        for (const [key, cell] of this.cells) {
            const target = targets.has(key);
            cell.surface.material.color = ColorSRGB.fromHex(target ? '#ffe291' : cell.kind === 'weekday' ? '#edf7f5' : '#fbf6e9');
            cell.label.setStyle({ color: target ? '#b72c20' : '#7d654b' });
            cell.label.setVisible(!pieces.some(piece => this.contains(piece, cell.position)));
        }
    }
    contains(piece: PieceState, point: Point2D): boolean {
        return orientTrianglePiece(piece.definition, piece.rotation, piece.flipped, SIDE).some(cell => contains(point, triangleVertices({ x: piece.pivotX + cell.offsetX, y: piece.pivotY + cell.offsetY }, cell.up, SIDE)));
    }
}
