import { Entity, World } from '@haiyue/engine';
import { GuiRoot, GuiLabel, GuiButton, GuiSelect, type GuiElement, type GuiRect } from '@haiyue/engine/gui';
import { WEEKDAY_NAMES, VIEW_WIDTH, VIEW_HEIGHT } from '../game/model';
import { TRIANGLE_CALENDAR_PIECES } from '../rules/triangleCalendarLogic';
export type CalendarAction = 'today' | 'reset' | 'rotate' | 'flip';
export const FONT_CHARS = [...new Set('三角日历拼图块覆盖棋盘只留下所选月份日期与星期今天重置旋转水平翻转已吸附先点选一个再完成手柄移动指针拾取拖动返回首页继续游戏新当前暂停是否？「」！，。 /·°' + WEEKDAY_NAMES.join('') + TRIANGLE_CALENDAR_PIECES.map(p => p.name).join('') + Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join(''))].join('');
/** All HUD controls and board text use Engine GUI on the same render surface as the meshes. */
export class CalendarHud {
    readonly root = new GuiRoot({ theme: { fontFamily: 'Microsoft YaHei, sans-serif', fontSize: 15,
            colors: { text: '#33434a', textMuted: '#718087', primary: '#247f78', danger: '#c74e38', background: '#f1f4f4', surface: '#f8faf9', border: '#b7c7c8', hover: '#d7ece8', active: '#badbd3', disabled: '#a7b4b4' } } });
    readonly month: GuiSelect<number>;
    readonly day: GuiSelect<number>;
    readonly weekday: GuiSelect<number>;
    readonly status: GuiLabel;
    readonly completion: GuiLabel;
    private width = VIEW_WIDTH;
    private height = VIEW_HEIGHT;
    private readonly scalable: Array<{
        node: GuiElement;
        rect: GuiRect;
        font?: number;
    }> = [];
    constructor(world: World, action: (action: CalendarAction) => void, date: (month: number, day: number, weekday: number) => void) {
        const entity = new Entity('Calendar GUI');
        entity.addComponent(this.root);
        world.addEntity(entity);
        this.label('三角日历拼图', { x: 42, y: 22, width: 500, height: 49 }, 38, '#2d3438');
        this.label('覆盖棋盘，只留下所选月份、日期与星期', { x: 44, y: 75, width: 520, height: 24 }, 15, '#718087');
        const change = () => date(this.month.value ?? 1, this.day.value ?? 1, this.weekday.value ?? 0);
        const options = { style: { backgroundColor: '#f8faf9', color: '#33434a', borderColor: '#bccacb', padding: 5 }, optionHeight: 30, maxVisibleOptions: 8, onChange: change };
        this.month = this.place(new GuiSelect({ ...options, options: Array.from({ length: 12 }, (_, i) => ({ label: `${i + 1} 月`, value: i + 1 })) }), { x: 682, y: 24, width: 106, height: 36 });
        this.day = this.place(new GuiSelect({ ...options, options: [] }), { x: 796, y: 24, width: 106, height: 36 });
        this.weekday = this.place(new GuiSelect({ ...options, options: WEEKDAY_NAMES.map((label, value) => ({ label, value })) }), { x: 910, y: 24, width: 116, height: 36 });
        const button = (id: CalendarAction, text: string, x: number, y: number, width: number) => this.place(new GuiButton({ id, text, style: { backgroundColor: '#30474f', color: '#ffffff', hoverBackgroundColor: '#51767b', padding: 4 }, onClick: () => action(id) }), { x, y, width, height: 36 });
        button('today', '今天', 1034, 24, 120);
        button('reset', '重置', 682, 68, 106);
        button('rotate', '旋转 60°', 796, 68, 158);
        button('flip', '水平翻转', 962, 68, 192);
        this.status = this.label('', { x: 280, y: 701, width: 640, height: 34 }, 17, '#52686f');
        this.completion = this.label('', { x: 330, y: 555, width: 540, height: 64 }, 24, '#825013');
        this.completion.setStyle({ backgroundColor: '#fff2bb', borderColor: '#d8ac4e', padding: 12 });
        this.completion.setVisible(false);
    }
    place<T extends GuiElement>(node: T, rect: GuiRect, font?: number): T {
        const layout = node.layout.bind(node);
        node.layout = parent => { layout(parent); Object.assign(node.rect, { x: rect.x * this.width / VIEW_WIDTH, y: rect.y * this.height / VIEW_HEIGHT, width: rect.width * this.width / VIEW_WIDTH, height: rect.height * this.height / VIEW_HEIGHT }); };
        this.scalable.push({ node, rect, ...(font === undefined ? {} : { font }) });
        this.root.add(node);
        return node;
    }
    label(text: string, rect: GuiRect, font: number, color: string): GuiLabel {
        return this.place(new GuiLabel({ text, fontSize: font, textAlign: 'center', style: { color, padding: 0 } }), rect, font);
    }
    resize(width: number, height: number): void {
        if (this.width === width && this.height === height)
            return;
        this.width = width;
        this.height = height;
        const scale = width / VIEW_WIDTH;
        this.root.theme.fontSize = 15 * scale;
        for (const item of this.scalable) {
            if (item.node instanceof GuiLabel && item.font)
                item.node.setFontSize(item.font * scale);
            item.node.markDirty();
        }
        for (const select of [this.month, this.day, this.weekday])
            select.optionHeight = 30 * scale;
    }
    setDate(month: number, day: number, weekday: number): void {
        this.month.setValue(month, false);
        this.weekday.setValue(weekday, false);
        this.day.options = Array.from({ length: new Date(new Date().getFullYear(), month, 0).getDate() }, (_, i) => ({ label: `${i + 1} 日`, value: i + 1 }));
        this.day.setValue(day, false);
        this.day.markDirty();
    }
    hit(x: number, y: number): boolean {
        const px = x * this.width / VIEW_WIDTH, py = y * this.height / VIEW_HEIGHT;
        if ([this.month, this.day, this.weekday].some(select => select.open && select.containsPointIncludingPopup(px, py)))
            return true;
        const hit = this.root.hitTest(px, py);
        return hit instanceof GuiButton || hit instanceof GuiSelect;
    }
}
