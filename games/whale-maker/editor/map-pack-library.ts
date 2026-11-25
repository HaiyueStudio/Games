import { MAP_PACKS, type MapPack } from '../rules/map-packs';
import { validate, type Level } from '../rules/model';
import { courseDestinations, type CourseDestination } from '../rules/course-travel';
import { modernLevel } from '../rules/profile';
import {packArea,unpackArea,type PackedArea} from '../levels/classic-codec';

export interface EditableCourse { id: string; title: string; level: Level }
export interface EditableMapPack {
    kind: 'whale-map-pack';
    version: 1;
    id: string;
    title: string;
    description: string;
    sequential: boolean;
    courses: EditableCourse[];
}
interface StoredCourse {id:string;title:string;level?:PackedArea;builtin?:CourseDestination}
interface StoredPack extends Omit<EditableMapPack,'courses'> {courses:StoredCourse[]}
export type PackLibrarySave = {version:1;packs:EditableMapPack[]} | {version:2;packs:StoredPack[]};
const copyTitle=(title:string)=>title.slice(0,117)+' 副本';
const validId = (id: unknown): id is string => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(id);
const validTitle = (title: unknown): title is string => typeof title === 'string' && title.trim().length > 0 && title.length <= 120;

export function validateMapPack(value: unknown): EditableMapPack {
    const pack = value as EditableMapPack;
    if (!pack || pack.kind !== 'whale-map-pack' || pack.version !== 1 || !validId(pack.id) || !validTitle(pack.title) ||
        typeof pack.description !== 'string' || typeof pack.sequential !== 'boolean' || !Array.isArray(pack.courses) || pack.courses.length === 0) {
        throw Error('地图包格式无效');
    }
    const ids = new Set<string>();
    const courses = pack.courses.map(course => {
        if (!course || !validId(course.id) || !validTitle(course.title) || ids.has(course.id)) throw Error('关卡编号无效或重复');
        ids.add(course.id);
        return { id: course.id, title: course.title, level: validate(course.level) };
    });
    return { kind: 'whale-map-pack', version: 1, id: pack.id, title: pack.title.trim(), description: pack.description, sequential: pack.sequential, courses };
}

export function validPackLibrary(value: unknown): value is PackLibrarySave {
    try {
        const save = value as PackLibrarySave;
        if (!save || ![1,2].includes(save.version) || !Array.isArray(save.packs)) return false;
        const ids = new Set<string>();
        for (const pack of save.packs) { decodePack(pack,save.version); if (ids.has(pack.id)) return false; ids.add(pack.id); }
        return true;
    } catch { return false; }
}
function builtinLevel(target:CourseDestination):Level {
    const course=MAP_PACKS.find(pack=>pack.id===target.pack)?.courses.find(course=>course.id===target.course);
    if(!course)throw Error('内置关卡引用不存在');return course.make();
}
function decodePack(value:unknown,version:number):EditableMapPack {
    if(version===1)return validateMapPack(value);
    const pack=value as StoredPack;
    if(!pack||!Array.isArray(pack.courses))throw Error('地图包格式无效');
    return validateMapPack({...pack,courses:pack.courses.map(course=>{
        if(!course||!!course.level===!!course.builtin)throw Error('关卡引用格式无效');
        return {...course,level:course.builtin?builtinLevel(course.builtin):unpackArea(course.level)};
    })});
}

export function blankPackCourse(index: number): EditableCourse {
    const width = 100, height = 18, cells: Level['cells'] = Array(width * height).fill('.');
    for (let y = 15; y < height; y++) cells.fill('#', y * width, (y + 1) * width);
    cells[14 * width + 95] = 'E';
    return { id: 'course-' + index, title: '关卡 ' + index,
        level: modernLevel({ version: 1, name: '关卡 ' + index, width, height, cells, spawn: [2, 14.2] }) };
}

/** Built-ins are blueprints. Edited copies and their stable course IDs live here. */
export class MapPackLibrary {
    private readonly overrides = new Map<string, EditableMapPack>();
    private references=new WeakMap<Level,{target:CourseDestination;canonical:string}>();
    private blueprint(id:string):EditableMapPack {
        const source=this.get(id);
        return {kind:'whale-map-pack',version:1,id,title:source.title,description:source.description,sequential:source.sequential,
            courses:source.courses.map(course=>{const level=course.make();this.references.set(level,{target:{pack:id,course:course.id},canonical:JSON.stringify(packArea(level))});return {id:course.id,title:course.title,level};})};
    }

    list(): MapPack[] {
        const ids = [...new Set([...MAP_PACKS.map(pack => pack.id), ...this.overrides.keys()])];
        return ids.map(id => this.get(id));
    }
    get(id: string): MapPack {
        const saved = this.overrides.get(id);
        if (saved) return { ...saved, courses: saved.courses.map(course => ({ id: course.id, title: course.title, make: () => structuredClone(course.level) })) };
        const builtin = MAP_PACKS.find(pack => pack.id === id);
        if (!builtin) throw Error('地图包不存在');
        return builtin;
    }
    level(pack: string, course: string): Level {
        const item = this.get(pack).courses.find(item => item.id === course);
        if (!item) throw Error('跳关目标不存在，请重新设置目的关卡');
        return item.make();
    }
    editable(id: string): EditableMapPack {
        let saved = this.overrides.get(id);
        if (!saved) {
            saved = this.blueprint(id);
            this.overrides.set(id, saved);
        }
        return saved;
    }
    update(pack: string, course: string, level: Level): void {
        const saved = this.editable(pack).courses.find(item => item.id === course);
        if (!saved) throw Error('当前关卡已删除，请重新选择关卡');
        const reference=this.references.get(saved.level);saved.level = structuredClone(level);if(reference)this.references.set(saved.level,reference);
    }
    create(copy?: string): EditableMapPack {
        let index = 1;
        while (this.list().some(pack => pack.id === 'user-' + index)) index++;
        const source = copy ? this.overrides.get(copy)??this.blueprint(copy) : undefined;
        const pack: EditableMapPack = source ? structuredClone(source) :
            { kind: 'whale-map-pack', version: 1, id: '', title: '我的地图包', description: '自制地图包', sequential: true, courses: [blankPackCourse(1)] };
        pack.id = 'user-' + index;
        if (source) {
            pack.title = copyTitle(pack.title);
            for(let i=0;i<pack.courses.length;i++){const ref=this.references.get(source.courses[i]!.level);if(ref)this.references.set(pack.courses[i]!.level,ref);}
            for (const course of pack.courses) this.retarget(course.level, source.id, pack.id);
        }
        this.overrides.set(pack.id, pack);
        return pack;
    }
    private retarget(level: Level, from: string, to: string): void {
        for (const destination of courseDestinations(level)) if (destination.pack === from) destination.pack = to;
    }
    addCourse(packId: string, source?: string): EditableCourse {
        const pack = this.editable(packId);
        let index = 1;
        while (pack.courses.some(course => course.id === 'course-' + index)) index++;
        const original = source ? pack.courses.find(course => course.id === source) : undefined;
        if (source && !original) throw Error('复制的关卡不存在');
        const course = original ? structuredClone(original) : blankPackCourse(index);
        course.id = 'course-' + index;
        if (original) { course.title = copyTitle(course.title); course.level.name = course.title; }
        pack.courses.push(course);
        return course;
    }
    rename(packId: string, title: string, courseId?: string): void {
        if (!validTitle(title)) throw Error('名称不能为空，最多 120 个字符');
        const pack = this.editable(packId);
        if (!courseId) pack.title = title.trim();
        else {
            const course = pack.courses.find(course => course.id === courseId);
            if (!course) throw Error('关卡不存在');
            course.title = course.level.name = title.trim();
        }
    }
    move(packId: string, courseId: string, delta: number): number {
        const courses = this.editable(packId).courses, index = courses.findIndex(course => course.id === courseId);
        const next = Math.max(0, Math.min(courses.length - 1, index + delta));
        if (index < 0) throw Error('关卡不存在');
        const [course] = courses.splice(index, 1); courses.splice(next, 0, course!);
        return next;
    }
    remove(packId: string, courseId: string): number {
        const pack = this.editable(packId), index = pack.courses.findIndex(course => course.id === courseId);
        if (pack.courses.length === 1) throw Error('地图包至少需要一关');
        if (index < 0) throw Error('关卡不存在');
        pack.courses.splice(index, 1);
        for (const document of this.overrides.values()) for (const course of document.courses) this.clearDestination(course.level, { pack: packId, course: courseId });
        return Math.min(index, pack.courses.length - 1);
    }
    private clearDestination(level: Level, removed: CourseDestination): void {
        const matches = (target?: CourseDestination) => target?.pack === removed.pack && target.course === removed.course;
        if (matches(level.nextCourse)) delete level.nextCourse;
        for (const props of Object.values(level.properties ?? {})) if (matches(props.destination)) delete props.destination;
        for (const area of Object.values(level.areas ?? {})) this.clearDestination(area, removed);
    }
    import(value: unknown): EditableMapPack {
        const pack = validateMapPack(value);
        const candidate = new MapPackLibrary(); candidate.restore(this.snapshot()); candidate.overrides.set(pack.id, pack);
        for(const document of candidate.overrides.values())candidate.check(document,true);
        this.overrides.set(pack.id, pack);
        return pack;
    }
    check(pack: EditableMapPack,validated=false): void {
        for (const course of pack.courses) {
            if(!validated)validate(course.level);
            for (const destination of courseDestinations(course.level))if(!this.get(destination.pack).courses.some(course=>course.id===destination.course))
                throw Error('跳关目标不存在，请重新设置目的关卡');
        }
    }
    snapshot(): PackLibrarySave { return {version:2,packs:[...this.overrides.values()].map(pack=>({...pack,courses:pack.courses.map(course=>{
        const level=packArea(course.level),reference=this.references.get(course.level);
        return {id:course.id,title:course.title,...(reference&&JSON.stringify(level)===reference.canonical?{builtin:{...reference.target}}:{level})};
    })}))}; }
    adopt(candidate:MapPackLibrary):void {this.overrides.clear();for(const [id,pack]of candidate.overrides)this.overrides.set(id,pack);this.references=candidate.references;}
    restore(save: PackLibrarySave): void {
        if(!save||![1,2].includes(save.version)||!Array.isArray(save.packs))throw Error('地图包存档格式无效');
        const candidate=new MapPackLibrary();
        for(const stored of save.packs){const pack=decodePack(stored,save.version);if(candidate.overrides.has(pack.id))throw Error('地图包编号重复');candidate.overrides.set(pack.id,pack);
            if(save.version===2)for(let i=0;i<pack.courses.length;i++){const ref=(stored as StoredPack).courses[i]!.builtin;if(ref)candidate.references.set(pack.courses[i]!.level,{target:{...ref},canonical:JSON.stringify(packArea(pack.courses[i]!.level))});}
        }
        for(const pack of candidate.overrides.values())candidate.check(pack,true);
        this.adopt(candidate);
    }
}
