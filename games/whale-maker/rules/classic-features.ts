import type { Enemy, Level, State } from './model';
import { makeEnemy } from './body-factory';
import { playerBodies, visitPlayers } from './coop-state';
import { emit } from './events';

export interface ClassicGate {
    start: number;
    end: number;
    restart: number;
    checks: { x: number; y: number; w: number; h: number }[];
}
export interface ClassicSpawner {
    kind: 'fish' | 'cannonball' | 'lakitu';
    start: number;
    end: number;
    y: number;
    period: number;
}
export interface ClassicFeatures { maze?: ClassicGate[]; spawners?: ClassicSpawner[] }
export interface ClassicRuntime { gate: number; hits: boolean[]; clocks: number[]; cycles: number[] }

export function initClassicFeatures(level: Level): ClassicRuntime {
    return { gate: 0, hits: [], clocks: level.classicFeatures?.spawners?.map(spawner => spawner.period) ?? [], cycles: [] };
}

export function validClassicFeatures(value: ClassicFeatures, level: Level): boolean {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    if (Object.keys(value).some(key => key !== 'maze' && key !== 'spawners')) return false;
    const x = (number: number) => Number.isFinite(number) && number >= 0 && number <= level.width;
    if (value.maze !== undefined && (!Array.isArray(value.maze) || value.maze.length > 16 || !value.maze.every(gate =>
        gate && x(gate.start) && x(gate.end) && x(gate.restart) && gate.restart <= gate.start && gate.end > gate.start &&
        Array.isArray(gate.checks) && gate.checks.length > 0 && gate.checks.length <= 16 &&
        gate.checks.every(c => c && x(c.x) && Number.isFinite(c.y) && c.y >= 0 && Number.isFinite(c.w) && c.w > 0 &&
            c.x + c.w <= level.width && Number.isFinite(c.h) && c.h > 0 && c.y + c.h <= level.height)))) return false;
    return value.spawners === undefined || Array.isArray(value.spawners) && value.spawners.length <= 16 &&
        value.spawners.every(spawner => spawner && ['fish', 'cannonball', 'lakitu'].includes(spawner.kind) &&
            x(spawner.start) && x(spawner.end) && spawner.start < spawner.end && Number.isFinite(spawner.y) &&
            spawner.y >= 0 && spawner.y <= level.height && Number.isFinite(spawner.period) && spawner.period >= .5 && spawner.period <= 30);
}

/** A wrong corridor returns the party to the beginning of that castle puzzle. */
export function advanceClassicMaze(s: State): boolean {
    const gates = s.level.classicFeatures?.maze, runtime = s.classicRuntime;
    const gate = gates?.[runtime.gate];
    if (!gate || s.pipe || s.phase !== 'playing') return false;
    const p = s.player, centerY = p.y + p.h / 2;
    if (gate.checks.some(c => p.x + p.w > c.x && p.x < c.x + c.w && centerY >= c.y && centerY < c.y + c.h)) runtime.hits[runtime.gate] = true;
    if (p.x + p.w / 2 < gate.end) return false;
    if (runtime.hits[runtime.gate]) { runtime.gate++; return false; }
    const restart = gates!.findIndex(check => check.start === gate.restart);
    runtime.gate = Math.max(0, restart);
    runtime.hits.fill(false, runtime.gate);
    const x = Math.floor(gate.restart), column = Math.min(s.level.width - 1, x);
    let floor = 15;
    for (let y = s.level.height - 1; y >= 3; y--) {
        const at = y * s.level.width + column;
        if (s.level.cells[at] === '#' && !['#', 'B'].includes(s.level.cells[at - s.level.width]!)) { floor = y; break; }
    }
    visitPlayers(s, () => {
        s.player.x = x; s.player.y = floor - s.player.h;
        s.player.vx = s.player.vy = 0; s.grounded = false;
        s.invincible = Math.max(s.invincible, .8);
    });
    s.areaFade = .4;
    s.notice = '走错城堡通道，返回这一段的起点';
    emit(s, 'pipe', x);
    return true;
}

/** Deterministic waves reproduce bridge fish, stray bills and cloud riders. */
export function advanceClassicSpawners(s: State, dt: number): void {
    const runtime = s.classicRuntime;
    for (const [index, source] of (s.level.classicFeatures?.spawners ?? []).entries()) {
        const player = playerBodies(s).find(p => p.x >= source.start - 12 && p.x <= source.end);
        if (!player) continue;
        runtime.clocks[index] = (runtime.clocks[index] ?? 0) - dt;
        if (runtime.clocks[index]! > 0 || s.enemies.filter(e => e.alive).length >= 192) continue;
        runtime.clocks[index] = source.period;
        const cycle = runtime.cycles[index] ?? 0;
        if (source.kind === 'lakitu') {
            if (cycle > 0) continue;
            const enemy = makeEnemy('turtle', Math.max(source.start, player.x + 6), source.y);
            enemy.lakitu = { start: source.start, end: source.end, y: source.y, wait: source.period };
            enemy.vx = enemy.vy = 0;
            s.enemies.push(enemy);
        } else if (source.kind === 'fish') {
            const x = Math.max(source.start, Math.min(source.end, player.x + (cycle % 2 ? 5 : -3)));
            const lava = s.level.cells.findIndex((t, at) => at % s.level.width === Math.floor(x) && t === 'lava');
            const y = lava < 0 ? s.level.height - .2 : Math.floor(lava / s.level.width) - 1;
            const enemy = makeEnemy('fish', x, y);
            enemy.classicFlight = true;
            enemy.vx = cycle % 2 ? -3.5 : 3.5; enemy.vy = -Math.sqrt(40 * 7);
            s.enemies.push(enemy);
        } else {
            const enemy = makeEnemy('cannonball', Math.min(s.level.width - 2, player.x + 16), Math.max(2, player.y - cycle % 3));
            enemy.vx = -5; s.enemies.push(enemy);
        }
        runtime.cycles[index] = cycle + 1;
    }
}

export function updateClassicEnemy(s: State, enemy: Enemy, dt: number): boolean {
    const rider = enemy.kind === 'turtle' ? enemy.lakitu : undefined;
    if (rider) {
        if (s.player.x > rider.end + 8) { enemy.alive = false; return true; }
        const target = Math.min(rider.end, Math.max(rider.start, s.player.x + s.facing * 4));
        enemy.vx = Math.max(-4, Math.min(4, (target - enemy.x) * 1.4));
        enemy.x += enemy.vx * dt;
        enemy.y = rider.y + Math.sin(s.time * 2) * .3;
        enemy.vy = 0; enemy.grounded = false;
        rider.wait -= dt;
        if (rider.wait <= 0 && s.enemies.filter(e => e.alive && e.kind === 'spiky').length < 24) {
            rider.wait = 2.5;
            const spiky = makeEnemy('spiky', enemy.x, enemy.y + .6);
            spiky.vx = s.player.x < enemy.x ? -1.5 : 1.5; spiky.vy = -2;
            s.enemies.push(spiky); emit(s, 'throw', enemy.x);
        }
        return true;
    }
    if (!enemy.classicFlight) return false;
    enemy.vy += 20 * dt; enemy.x += enemy.vx * dt; enemy.y += enemy.vy * dt;
    if (enemy.y > s.level.height + 1 || enemy.x < -2 || enemy.x > s.level.width + 2) enemy.alive = false;
    return true;
}
