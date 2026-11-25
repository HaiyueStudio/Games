import type { Input, Level, State } from './model';
import { pipeShape } from './pipes';
import { touchesWarp } from './warps';
import { emit } from './events';

export interface CourseDestination { pack: string; course: string }
export function cancelCourseTravel(s:State):void {
    s.courseDestination=null;s.pipe=s.door=null;
    if(s.coop){s.coop.traveler=-1;for(const player of s.coop.players)player.pipe=player.door=null;}
}
export const COURSE_PORTALS = new Set(['P', 'door', 'locked-door', 'p-door', 'warp-box', 'locked-warp']);
export const validCourseDestination = (value: unknown): value is CourseDestination => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const target = value as CourseDestination;
    return Object.keys(target).every(key => key === 'pack' || key === 'course') &&
        [target.pack, target.course].every(id => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(id));
};

/** Uses the existing pipe animation and cooperative party travel. */
export function enterCoursePortal(s: State, input: Input): boolean {
    if (s.courseDestination || s.pipe || s.door || s.pipeWait > 0 || s.areaCooldown > 0) return false;
    const p = s.player;
    for (const [cell, props] of Object.entries(s.level.properties ?? {})) {
        if (!props.destination) continue;
        const id = Number(cell), tile = s.level.cells[id], x = id % s.level.width, y = Math.floor(id / s.level.width);
        let direction: [number, number] = [0, 1];
        if (tile === 'P') {
            const pipe = pipeShape(s.level, id)!;
            const n = pipe.normal, cx = p.x + p.w / 2, cy = p.y + p.h / 2;
            const pressing = n[0] === 1 ? input.axis < 0 : n[0] === -1 ? input.axis > 0 : n[1] === -1 ? input.down : input.interact;
            const tangent = n[0] ? Math.abs(cy - pipe.mouth[1]) : Math.abs(cx - pipe.mouth[0]);
            const gap = (cx - pipe.mouth[0]) * n[0] + (cy - pipe.mouth[1]) * n[1] - (n[0] ? p.w : p.h) / 2;
            if (!pressing || tangent > .55 || gap < -.04 || gap > .1) continue;
            direction = [-n[0], -n[1]];
        } else if (tile === 'warp-box' || tile === 'locked-warp') {
            if (!touchesWarp(s, id) || s.usedWarps[id]) continue;
        } else {
            if (!input.interact || s.previous.interact || p.x + p.w <= x || p.x >= x + 1 || p.y + p.h < y + .5 || p.y > y + 1) continue;
            if (tile === 'p-door' && s.pTime <= 0) continue;
        }
        if ((tile === 'locked-door' || tile === 'locked-warp') && s.keys.length === 0) {
            s.notice = '需要钥匙才能进入跳关出口'; return false;
        }
        if (tile === 'locked-door' || tile === 'locked-warp') s.keys.shift();
        s.courseDestination = { ...props.destination };
        s.pipe = { age: 0, from: [p.x, p.y], to: [p.x, p.y], entryDirection: direction, exitDirection: [-direction[0], -direction[1]] };
        s.running = s.skidding = s.turning = s.spinning = s.pendingShot = false;
        s.jumpSustain = s.jumpCut = s.grounded = false;
        s.notice = '正在前往 ' + props.destination.course;
        emit(s, 'pipe');
        return true;
    }
    return false;
}

export function courseDestinations(level: Level): CourseDestination[] {
    return [
        ...(level.nextCourse ? [level.nextCourse] : []),
        ...Object.values(level.properties ?? {}).flatMap(props => props.destination ? [props.destination] : []),
        ...Object.values(level.areas ?? {}).flatMap(courseDestinations),
    ];
}
