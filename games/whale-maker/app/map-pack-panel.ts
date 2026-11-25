import { GuiElement, GuiInput, type GuiButton, type GuiLabel, type GuiRect, type GuiRoot, type GuiSystem } from '@haiyue/engine/gui';
import { MapPackLibrary } from '../editor/map-pack-library';
import type { CourseDestination } from '../rules/course-travel';

type Host = {
    ui: GuiRoot; system: GuiSystem;
    rect(node: GuiElement, rect: GuiRect): GuiElement;
    label(text: string, x: number, y: number, width: number, height?: number): GuiLabel;
    button(text: string, x: number, y: number, width: number, action: () => void): GuiButton;
    highlight(button: GuiButton, selected: boolean): void;
};
type PackActions = { save(): void; export(pack: string): void; import(): void };

export class MapPackPanel {
    private readonly nodes: GuiElement[] = [];
    private readonly packs: GuiButton[] = [];
    private readonly courses: GuiButton[] = [];
    private readonly worlds: GuiLabel[] = [];
    private readonly management: GuiElement[] = [];
    private readonly title: GuiLabel;
    private readonly description: GuiLabel;
    private readonly selection: GuiLabel;
    private readonly nameInput: GuiInput;
    private readonly applyName: GuiButton;
    private readonly editButton: GuiButton;
    private readonly startButton: GuiButton;
    private readonly firstButton: GuiButton;
    private readonly sequenceButton: GuiButton;
    private readonly packPrevious: GuiButton;
    private readonly packNext: GuiButton;
    private readonly coursePrevious: GuiButton;
    private readonly courseNext: GuiButton;
    private packId = 'classic';
    private index = 0;
    private coursePage = 0;
    private packPage = 0;
    private editing = false;
    private renameMode: 'pack' | 'course' | null = null;
    private target: ((destination: CourseDestination | null) => void) | null = null;
    open = false;

    constructor(private readonly host: Host, private readonly library: MapPackLibrary,
        private readonly launch: (pack: string, index: number, edit: boolean) => void,
        private readonly closed: () => void, actions: PackActions) {
        const label = (text: string, x: number, y: number, width: number, height = 30) => {
            const node = host.label(text, x, y, width, height); this.nodes.push(node); return node;
        };
        const button = (text: string, x: number, y: number, width: number, action: () => void) => {
            const node = host.button(text, x, y, width, action); this.nodes.push(node); return node;
        };
        const manage = (text: string, x: number, y: number, width: number, action: () => void) => {
            const node = button(text, x, y, width, () => this.change(action)); this.management.push(node); return node;
        };
        for (const [x, y, width, height, color] of [[0, 0, 1280, 800, '#061b29cf'], [112, 110, 1056, 594, '#123546']] as const) {
            const node = new GuiElement({ pointerFilter: 'stop', style: { backgroundColor: color, radius: 16 } });
            host.ui.add(host.rect(node, { x, y, width, height })); this.nodes.push(node);
        }
        label('地图包', 140, 133, 200, 40);
        button('关闭', 1054, 137, 84, () => this.close());
        for (let index = 0; index < 4; index++) this.packs.push(button('', 140, 208 + index * 52, 198, () => {
            const pack = library.list()[this.packPage * 4 + index];
            if (!pack) return;
            this.packId = pack.id; this.index = this.coursePage = 0; this.renameMode = null; this.refresh();
        }));
        this.packPrevious = button('上一页', 140, 420, 94, () => { this.packPage = Math.max(0, this.packPage - 1); this.refresh(); });
        this.packNext = button('下一页', 244, 420, 94, () => { this.packPage++; this.refresh(); });
        this.title = label('', 380, 143, 620, 36);
        this.description = label('', 380, 187, 544);
        this.coursePrevious = button('上一页', 950, 187, 86, () => this.changePage(-1));
        this.courseNext = button('下一页', 1052, 187, 86, () => this.changePage(1));
        for (let world = 0; world < 8; world++) this.worlds.push(label('', 380, 242 + world * 44, 88));
        for (let index = 0; index < 32; index++) this.courses.push(button('', 484 + index % 4 * 160, 238 + Math.floor(index / 4) * 44, 146, () => {
            this.index = this.coursePage * 32 + index; this.renameMode = null; this.refresh();
        }));
        this.selection = label('', 380, 606, 650);
        this.sequenceButton = button('', 1040, 606, 98, () => this.change(() => {
            const pack = library.editable(this.packId); pack.sequential = !pack.sequential;
        }));
        this.firstButton = button('从头闯关', 380, 638, 160, () => {
            if (this.target) { const callback = this.target; this.close(); callback(null); }
            else this.choose(0, false);
        });
        this.editButton = button('载入编辑', 800, 638, 150, () => this.choose(this.index, true));
        this.startButton = button('开始游玩', 968, 638, 170, () => this.choose(this.index, false));
        manage('新建包', 140, 462, 94, () => this.selectCreated(library.create()));
        manage('复制包', 244, 462, 94, () => this.selectCreated(library.create(this.packId)));
        manage('包改名', 140, 504, 94, () => this.beginRename('pack'));
        manage('关卡改名', 244, 504, 94, () => this.beginRename('course'));
        manage('新增关卡', 140, 546, 94, () => {
            const course = library.addCourse(this.packId); this.selectCourse(course.id);
        });
        manage('复制关卡', 244, 546, 94, () => {
            const course = library.addCourse(this.packId, this.selectedId()); this.selectCourse(course.id);
        });
        manage('删除关卡', 140, 588, 94, () => { this.index = library.remove(this.packId, this.selectedId()); this.coursePage = Math.floor(this.index / 32); });
        manage('↑', 244, 588, 42, () => this.moveCourse(-1));
        manage('↓', 296, 588, 42, () => this.moveCourse(1));
        manage('导出包', 140, 638, 94, () => actions.export(this.packId));
        manage('导入包', 244, 638, 94, () => actions.import());
        manage('保存地图包', 556, 638, 150, () => actions.save());
        this.nameInput = new GuiInput({ value: '', maxLength: 120, onSubmit: () => this.commitName(),
            style: { backgroundColor: '#123d4e', color: '#e6fbff', borderColor: '#56c7c7', radius: 8, padding: 8 } });
        host.ui.add(host.rect(this.nameInput, { x: 380, y: 600, width: 450, height: 36 })); this.nodes.push(this.nameInput);
        this.applyName = button('应用名称', 846, 600, 140, () => this.commitName());
        this.nodes.forEach(node => node.setVisible(false));
    }
    private selectedId(): string { return this.library.get(this.packId).courses[this.index]!.id; }
    message(text: string): void { this.selection.setText(text); }
    private selectCreated(pack: { id: string }): void {
        this.packId = pack.id; this.index = this.coursePage = 0;
        this.packPage = Math.floor(this.library.list().findIndex(item => item.id === pack.id) / 4);
    }
    private selectCourse(id: string): void {
        this.index = this.library.get(this.packId).courses.findIndex(course => course.id === id);
        this.coursePage = Math.floor(this.index / 32);
    }
    private moveCourse(delta: number): void {
        this.index = this.library.move(this.packId, this.selectedId(), delta); this.coursePage = Math.floor(this.index / 32);
    }
    private change(action: () => void): void {
        try { action(); this.refresh(); }
        catch (error) { this.selection.setText(String(error)); }
    }
    private beginRename(mode: 'pack' | 'course'): void {
        this.renameMode = mode;
        const pack = this.library.get(this.packId);
        this.nameInput.setValue(mode === 'pack' ? pack.title : pack.courses[this.index]!.title);
        this.refresh(); this.host.system.focus.focus(this.nameInput);
    }
    private commitName(): void {
        if (!this.renameMode) return;
        this.change(() => {
            this.library.rename(this.packId, this.nameInput.value, this.renameMode === 'course' ? this.selectedId() : undefined);
            this.renameMode = null; this.host.system.focus.blur();
        });
    }
    private changePage(delta: number): void {
        this.coursePage = Math.max(0, Math.min(Math.ceil(this.library.get(this.packId).courses.length / 32) - 1, this.coursePage + delta));
        this.index = this.coursePage * 32; this.refresh();
    }
    private refresh(): void {
        const pack = this.library.get(this.packId), packs = this.library.list();
        this.packPage = Math.max(0, Math.min(Math.ceil(packs.length / 4) - 1, this.packPage));
        this.title.setText(this.target ? '选择跳关目的地' : (this.editing ? '编辑地图包 · ' : '') + pack.title);
        this.description.setText(pack.description);
        this.packs.forEach((button, index) => {
            const item = packs[this.packPage * 4 + index]; button.setVisible(this.open && !!item);
            if (item) button.setText(item.title);
            this.host.highlight(button, item?.id === this.packId);
        });
        for (const button of [this.packPrevious, this.packNext]) button.setVisible(this.open && packs.length > 4);
        for (const button of [this.coursePrevious, this.courseNext]) button.setVisible(this.open && pack.courses.length > 32);
        this.courses.forEach((button, slot) => {
            const index = this.coursePage * 32 + slot, course = pack.courses[index];
            button.setVisible(this.open && !!course); if (course) button.setText(course.title);
            this.host.highlight(button, this.index === index);
        });
        this.worlds.forEach((label, index) => {
            const course = pack.courses[this.coursePage * 32 + index * 4];
            label.setVisible(this.open && !!course && (pack.id === 'classic' || pack.id === 'lost-levels'));
            if (course) label.setText('世界 ' + course.title.split('-')[0]);
        });
        this.selection.setText('选择关卡  ' + pack.courses[this.index]!.title);
        this.selection.setVisible(this.open && !this.renameMode);
        this.management.forEach(node => node.setVisible(this.open && this.editing && !this.target));
        this.sequenceButton.setVisible(this.open && this.editing && !this.target && !this.renameMode);
        this.sequenceButton.setText(pack.sequential ? '顺序闯关 开' : '顺序闯关 关');
        this.nameInput.setVisible(this.open && !!this.renameMode); this.applyName.setVisible(this.open && !!this.renameMode);
        this.editButton.setVisible(this.open && !this.target);
        this.startButton.setText(this.target ? '使用此关' : '开始游玩');
        this.firstButton.setText(this.target ? '清除跳关' : '从头闯关');
    }
    show(pack = 'classic', index = 0, editing = false, target?: (destination: CourseDestination | null) => void): void {
        this.packId = this.library.get(pack).id;
        this.index = Math.max(0, Math.min(this.library.get(pack).courses.length - 1, index));
        this.coursePage = Math.floor(this.index / 32); this.packPage = Math.floor(this.library.list().findIndex(item => item.id === pack) / 4);
        this.editing = editing; this.target = target ?? null; this.renameMode = null;
        this.open = true; this.nodes.forEach(node => node.setVisible(true)); this.refresh();
    }
    close(): void {
        if (!this.open) return;
        this.open = false; this.target = null; this.renameMode = null;
        this.nodes.forEach(node => node.setVisible(false)); this.host.system.focus.blur(); this.closed();
    }
    private choose(index: number, edit: boolean): void {
        const pack = this.packId, callback = this.target, destination = { pack, course: this.library.get(pack).courses[index]!.id };
        this.close();
        if (callback) callback(destination); else this.launch(pack, index, edit);
    }
    key(event: KeyboardEvent): void {
        if (this.renameMode) {
            if (event.code === 'Escape') { event.preventDefault(); this.renameMode = null; this.host.system.focus.blur(); this.refresh(); }
            return;
        }
        event.preventDefault(); if (event.repeat) return;
        if (event.code === 'Escape') this.close();
        else if (event.code === 'Enter' || event.code === 'Space') this.choose(this.index, false);
        else {
            const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -4, ArrowDown: 4 };
            const offset = offsets[event.code];
            if (offset !== undefined) this.index = Math.max(0, Math.min(this.library.get(this.packId).courses.length - 1, this.index + offset));
            this.coursePage = Math.floor(this.index / 32); this.refresh();
        }
    }
}
