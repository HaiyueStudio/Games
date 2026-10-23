import { Entity, World, type HaiyueEngine } from '@haiyue/engine';
import { RenderIntegration, RenderTargetManager } from '@haiyue/engine/experimental';
import { GuiRoot, GuiModal, GuiSystem, type GuiButton } from '@haiyue/engine/gui';
import { ConnectionNotifications, CONNECTION_NOTICE_CHARS } from '../gamepad/ui/ConnectionNotifications';
import { gamepadConnections } from '../gamepad/connectionMonitor';
const CHARS = '是否返回首页？当前游戏已暂停。继续游戏确认取消方向键选择返回ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 /·';
/** A transient GUI world on the game's existing engine/canvas, rendered while gameplay is stopped. */
export class ReturnDialog {
    private readonly world = new World('Game session return confirmation');
    private readonly root = new GuiRoot({ theme: { fontFamily: 'Microsoft YaHei, sans-serif', fontSize: 17 } });
    private readonly gui: GuiSystem;
    private readonly modal: GuiModal;
    private readonly notifications: ConnectionNotifications;
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
        this.modal = this.root.add(new GuiModal({ title: '是否返回首页？', message: '当前游戏已暂停。',
            width: '86%', height: 230, confirmText: '返回首页', cancelText: '继续游戏',
            showCloseButton: false, showConfirmButton: true, showCancelButton: true, closeOnBackdrop: false,
            backdropColor: 'rgba(8,13,23,0.78)', style: { backgroundColor: '#172437', color: '#eff4ff', borderColor: '#536783' } }));
        this.modal.show();
        const layout = this.modal.layout.bind(this.modal);
        this.modal.layout = () => {
            const area = engine.canvas!.getBoundingClientRect();
            const scaleX = engine.displayWidth / area.width, scaleY = engine.displayHeight / area.height;
            layout({ x: Math.max(0, -area.left) * scaleX, y: Math.max(0, -area.top) * scaleY,
                width: Math.min(area.right, innerWidth) * scaleX - Math.max(area.left, 0) * scaleX,
                height: Math.min(area.bottom, innerHeight) * scaleY - Math.max(area.top, 0) * scaleY });
        };
        this.notifications = new ConnectionNotifications(this.root, gamepadConnections);
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
        for (const item of [this.modal.cancelButton, this.modal.confirmButton])
            item.setStyle({ backgroundColor: item === button ? '#f2c879' : '#283c57', color: item === button ? '#152030' : '#eff4ff' });
    }
    move(): void { this.select(this.selected === 'cancel' ? 'confirm' : 'cancel'); }
    confirm(): void { this.choose(this.selected === 'confirm'); }
    cancel(): void { this.choose(false); }
    pointerEvent(event: PointerEvent): void {
        const area = this.engine.canvas!.getBoundingClientRect();
        const hit = this.root.hitTest((event.clientX - area.left) * this.engine.displayWidth / area.width, (event.clientY - area.top) * this.engine.displayHeight / area.height);
        const button = hit === this.modal.cancelButton || hit === this.modal.confirmButton ? hit : null;
        if (event.type === 'pointerdown' && button) {
            this.select(button === this.modal.cancelButton ? 'cancel' : 'confirm');
            this.pointer = { id: event.pointerId, button: button as GuiButton };
        }
        else if (event.type === 'pointerup') {
            const activate = this.pointer?.id === event.pointerId && this.pointer.button === button;
            this.pointer = null;
            if (activate)
                this.confirm();
        }
        else if (event.type === 'pointercancel')
            this.pointer = null;
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
        this.world.update(time, 0);
    }
    snapshot() {
        return { selected: this.selected, renderer: 'engine-gui', canvasCount: document.querySelectorAll('canvas').length,
            viewport: { ...this.root.viewport }, visible: this.modal.visible, notifications: this.notifications.snapshot(),
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
