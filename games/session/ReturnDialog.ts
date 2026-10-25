import { Entity, World, type HaiyueEngine } from '@haiyue/engine';
import { RenderIntegration, RenderTargetManager } from '@haiyue/engine/experimental';
import { GuiRoot, GuiModal, GuiSystem, GuiImage, GuiLabel, GuiElement, GuiDirtyFlags, type GuiButton } from '@haiyue/engine/gui';
import { ConnectionNotifications, CONNECTION_NOTICE_CHARS } from '../gamepad/ui/ConnectionNotifications';
import { gamepadConnections } from '../gamepad/connectionMonitor';
import { OS_BUTTON_HOVER_MS, osButtonSnapshot, osButtonTheme } from '../launcher/buttonStyle';
import { returnDialogArt } from './returnDialogArt';
const CHARS = '是否返回首页？当前游戏已暂停。继续游戏确认取消方向键选择返回ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 /·';
/** A transient GUI world on the game's existing engine/canvas, rendered while gameplay is stopped. */
export class ReturnDialog {
    private readonly world = new World('Game session return confirmation');
    private readonly root = new GuiRoot({ theme: { fontFamily: 'Microsoft YaHei, sans-serif', fontSize: 17 } });
    private readonly gui: GuiSystem;
    private readonly modal: GuiModal;
    private readonly notifications: ConnectionNotifications;
    private readonly icon: GuiImage;
    private readonly divider: GuiElement;
    private readonly hint: GuiLabel;
    private lastDraw: number | null = null;
    private readonly motion = matchMedia('(prefers-reduced-motion: reduce)');
    private disposed = false;
    private selected: 'cancel' | 'confirm' = 'cancel';
    private pointer: {
        id: number;
        button: GuiButton;
    } | null = null;
    private readonly oldPosition: string;
    private readonly oldZIndex: string;
    constructor(private readonly engine: HaiyueEngine, private readonly choose: (home: boolean) => void) {
        const entity = new Entity('Return dialog');
        entity.addComponent(this.root);
        this.world.addEntity(entity);
        const art = returnDialogArt();
        this.root.add(new GuiImage({ width: '100%', height: '100%', source: art.ambient, pointerFilter: 'ignore' }));
        this.modal = this.root.add(new GuiModal({ title: '是否返回首页？', message: '当前游戏已暂停。',
            width: 480, height: 324, confirmText: '返回首页', cancelText: '继续游戏',
            showCloseButton: false, showConfirmButton: true, showCancelButton: true, closeOnBackdrop: false,
            backdropColor: 'rgba(3,9,19,.6)', style: { backgroundColor: 'transparent', color: '#edf8ff', borderColor: 'transparent', radius: 24,
                nineSlice: Object.freeze({ source: art.panel, sourceWidth: art.panel.width, sourceHeight: art.panel.height, cuts: [72,72,72,72] as const, pixelRatio: 2 }) } }));
        this.icon = this.modal.add(new GuiImage({ source: art.icon, pointerFilter: 'ignore' }));
        this.divider = this.modal.add(new GuiElement({ pointerFilter: 'ignore', style: { backgroundColor: 'rgba(115,184,220,.18)' } }));
        this.hint = this.modal.add(new GuiLabel({ text: 'Enter / A 确认 · Esc / B 继续', fontSize: 11, textAlign: 'center', pointerFilter: 'ignore', style: { color: '#829fb5', padding: 0 } }));
        this.modal.messageLabel.setStyle({ color: '#abc2d3' });
        this.modal.cancelButton.setThemeResource(osButtonTheme('primary'));
        this.modal.confirmButton.setThemeResource(osButtonTheme('secondary'));
        for (const button of [this.modal.cancelButton, this.modal.confirmButton]) { button.hoverTransition = true; button.hoverTransitionMs = OS_BUTTON_HOVER_MS; }
        this.modal.show();
        const layout = this.modal.layout.bind(this.modal);
        this.modal.layout = () => {
            const area = engine.canvas!.getBoundingClientRect();
            const scaleX = engine.displayWidth / area.width, scaleY = engine.displayHeight / area.height;
            layout({ x: Math.max(0, -area.left) * scaleX, y: Math.max(0, -area.top) * scaleY,
                width: Math.min(area.right, innerWidth) * scaleX - Math.max(area.left, 0) * scaleX,
                height: Math.min(area.bottom, innerHeight) * scaleY - Math.max(area.top, 0) * scaleY });
            const r = this.modal.dialogRect, tight = r.height < 280, short = r.height < 230, tiny = r.height < 178;
            const inset = tiny ? 20 : r.width < 360 ? 24 : 32, gap = 12, buttonWidth = (r.width - inset * 2 - gap) / 2;
            this.icon.setVisible(!tiny); this.divider.setVisible(!tiny); this.hint.setVisible(!short); this.modal.messageLabel.setVisible(!tiny);
            this.icon.rect = { x: r.x + (tight ? 28 : (r.width - 64) / 2), y: r.y + (short ? 22 : 28), width: short ? 36 : tight ? 48 : 64, height: short ? 36 : tight ? 48 : 64 };
            this.modal.titleLabel.setFontSize(tiny ? 18 : short ? 20 : tight ? 22 : 26);
            this.modal.titleLabel.setTextAlign(tight && !tiny ? 'left' : 'center');
            const textX = tight && !tiny ? short ? 78 : 94 : inset;
            this.modal.titleLabel.rect = { x: r.x + textX, y: r.y + (tiny ? 18 : short ? 20 : tight ? 30 : 108), width: r.width - textX - inset, height: 34 };
            this.modal.messageLabel.setFontSize(short ? 12 : tight ? 13 : 15); this.modal.messageLabel.setTextAlign(tight ? 'left' : 'center');
            this.modal.messageLabel.rect = { x: r.x + textX, y: r.y + (short ? 52 : tight ? 68 : 150), width: r.width - textX - inset, height: 24 };
            const buttonHeight = tiny ? 34 : short ? 38 : 46, buttonTop = r.y + r.height - (tiny ? 54 : short ? 62 : 88);
            this.modal.cancelButton.rect = { x: r.x + inset, y: buttonTop, width: buttonWidth, height: buttonHeight };
            this.modal.confirmButton.rect = { x: r.x + inset + buttonWidth + gap, y: buttonTop, width: buttonWidth, height: buttonHeight };
            this.divider.rect = { x: r.x + inset, y: buttonTop - 18, width: r.width - inset * 2, height: 1 };
            this.hint.rect = { x: r.x + inset, y: r.y + r.height - 31, width: r.width - inset * 2, height: 16 };
        };
        this.notifications = new ConnectionNotifications(this.root, gamepadConnections);
        // Passive notices share the modal's paint layer so its backdrop cannot dim them.
        const noticePanels = this.notifications.elements.filter(element => element.parent === this.root.root);
        for (const panel of noticePanels) this.modal.add(panel);
        const layoutWithNotices = this.modal.layout.bind(this.modal);
        this.modal.layout = area => {
            layoutWithNotices(area);
            for (const panel of noticePanels) panel.layout(this.modal.rect);
        };
        this.gui = new GuiSystem(engine, { loadOp: 'clear', font: { chars: CHARS + CONNECTION_NOTICE_CHARS, fontFamily: 'Microsoft YaHei, sans-serif', fontSize: 28, atlasSize: 1024 } });
        this.world.addSystem(this.gui);
        const integration = new RenderIntegration(engine, { label: 'GameSession.confirm' });
        this.world.addRuntimeIntegration(integration);
        integration.registerAll(this.world, () => ({ pass: 'shared' }));
        const canvas = engine.canvas!;
        this.oldPosition = canvas.style.position;
        this.oldZIndex = canvas.style.zIndex;
        if (getComputedStyle(canvas).position === 'static')
            canvas.style.position = 'relative';
        canvas.style.zIndex = '2147483646';
        // Present the modal directly. WebGPU swapchain textures expire after presentation;
        // an asynchronous canvas snapshot cannot safely retain them across frames.
        this.select('cancel');
    }
    select(choice: 'cancel' | 'confirm'): void {
        this.selected = choice;
        const button = choice === 'cancel' ? this.modal.cancelButton : this.modal.confirmButton;
        this.gui.focus.focus(button);
    }
    move(): void { this.select(this.selected === 'cancel' ? 'confirm' : 'cancel'); }
    confirm(): void { this.choose(this.selected === 'confirm'); }
    cancel(): void { this.choose(false); }
    pointerEvent(event: PointerEvent): void {
        const area = this.engine.canvas!.getBoundingClientRect();
        const hit = this.root.hitTest((event.clientX - area.left) * this.engine.displayWidth / area.width, (event.clientY - area.top) * this.engine.displayHeight / area.height);
        const button = hit === this.modal.cancelButton || hit === this.modal.confirmButton ? hit : null;
        if (event.type === 'pointerdown' && button && event.button === 0) {
            this.select(button === this.modal.cancelButton ? 'cancel' : 'confirm');
            this.pointer = { id: event.pointerId, button: button as GuiButton };
        }
        else if (event.type === 'pointerup') {
            const activate = this.pointer?.id === event.pointerId && this.pointer.button === button;
            this.pointer = null;
            if (activate) { this.confirm(); return; }
        }
        else if (event.type === 'pointercancel')
            this.pointer = null;
        for (const item of [this.modal.cancelButton, this.modal.confirmButton]) {
            const hovered = event.pointerType !== 'touch' && event.type !== 'pointercancel' && item === button;
            const pressed = this.pointer?.id === event.pointerId && this.pointer.button === item && item === button;
            if (item.hovered !== hovered || item.pressed !== pressed) { item.hovered = hovered; item.pressed = pressed; item.markDirty(GuiDirtyFlags.Visual | GuiDirtyFlags.Input); }
        }
    }
    draw(time: number): void {
        if (this.disposed || this.engine.state !== 'ready')
            return;
        this.engine.resizeToDisplaySize();
        // The normal Engine frame loop is stopped. Begin a presentation frame through
        // its public render-target owner so the GUI receives the current swapchain view.
        if (this.engine.renderTarget instanceof RenderTargetManager)
            this.engine.renderTarget.beginFrame();
        this.notifications.update(performance.now());
        const delta = this.lastDraw === null ? 0 : Math.max(0, Math.min(100, time - this.lastDraw)); this.lastDraw = time;
        for (const button of [this.modal.cancelButton, this.modal.confirmButton]) button.hoverTransitionMs = this.motion.matches ? 0 : OS_BUTTON_HOVER_MS;
        // Advance only the transient GUI clock; the paused gameplay worlds stay stopped.
        this.world.update(time, delta);
    }
    snapshot() {
        return { selected: this.selected, renderer: 'engine-gui', canvasCount: document.querySelectorAll('canvas').length,
            viewport: { ...this.root.viewport }, visible: this.modal.visible, notifications: this.notifications.snapshot(),
            dialog: { ...this.modal.dialogRect }, glass: true, icon: { ...this.icon.rect },
            styles: { cancel: osButtonSnapshot(this.modal.cancelButton), confirm: osButtonSnapshot(this.modal.confirmButton) },
            buttons: { cancel: { ...this.modal.cancelButton.rect }, confirm: { ...this.modal.confirmButton.rect } } };
    }
    dispose(): void {
        if (this.disposed)
            return;
        this.disposed = true;
        this.world.destroy();
        this.engine.canvas!.style.position = this.oldPosition;
        this.engine.canvas!.style.zIndex = this.oldZIndex;
    }
}
