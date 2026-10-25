import { Entity, World, type HaiyueEngine } from '@haiyue/engine';
import { RenderIntegration } from '@haiyue/engine/experimental';
import { GuiLabel, GuiRoot, GuiSystem } from '@haiyue/engine/gui';
import { GAMEPAD_PROFILES } from '../profiles';
import { gamepadConnections } from '../connectionMonitor';
import { ConnectionNotifications, CONNECTION_NOTICE_CHARS } from './ConnectionNotifications';

export const controllerOverlay = { visible: false, cursor: false, x: 0, y: 0, text: '' };
export const controllerFeedbackVisible = (): boolean => controllerOverlay.visible || gamepadConnections.visible(performance.now()).length > 0;
/** Non-interactive controller feedback shares the game's GPU canvas. */
export class ControllerOverlay {
  private readonly world = new World('Controller feedback');
  private readonly root = new GuiRoot();
  private readonly notifications: ConnectionNotifications;
  private readonly cursor = new GuiLabel({ text: '+', disabled: true, fontSize: 24, textAlign: 'center', style: { color: '#ffe08a', backgroundColor: '#142033aa', padding: 0, radius: 12 } });
  private readonly hint = new GuiLabel({ text: '', disabled: true, style: { color: '#fff1c5', backgroundColor: '#141b24dc', padding: 2 } });
  constructor(private readonly engine: HaiyueEngine) {
    const chars = Object.values(GAMEPAD_PROFILES).map(profile => profile.help).join('') + CONNECTION_NOTICE_CHARS + '指针模式摇杆移动点选拖拽右键滚动操作菜单返回首页切换指针切游戏 ·/ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+';
    this.root.add(this.hint); this.root.add(this.cursor);
    this.notifications = new ConnectionNotifications(this.root, gamepadConnections);
    if (new URLSearchParams(location.search).has('gamepadVerify')) {
      Object.defineProperty(window, '__controllerNotifications', { configurable: true, get: () => this.notifications.snapshot() });
      Object.defineProperty(window, '__controllerPointer', { configurable: true, get: () => {
        const area = engine.canvas!.getBoundingClientRect(), rect = this.cursor.rect;
        return { visible: this.cursor.visible, center: { x: area.left + (rect.x + rect.width / 2) * area.width / engine.displayWidth,
          y: area.top + (rect.y + rect.height / 2) * area.height / engine.displayHeight } };
      } });
    }
    this.world.addEntity(new Entity('Controller GUI').addComponent(this.root));
    this.world.addSystem(new GuiSystem(engine, { loadOp: 'load', font: { chars: [...new Set(chars)].join(''), fontFamily: 'Microsoft YaHei, sans-serif', atlasSize: 2048, fontSize: 24 } }));
    const integration = new RenderIntegration(engine, { label: 'Gamepad.feedback' });
    this.world.addRuntimeIntegration(integration); integration.registerAll(this.world, () => ({ pass: 'shared' }));
    this.hint.layout = parent => {
      Object.assign(this.hint.rect, { x: 4, y: parent.height - 24, width: parent.width - 8, height: 22 });
      this.hint.setFontSize(Math.max(7, Math.min(12, (parent.width - 16) / Math.max(1, controllerOverlay.text.length) * 1.4)));
    };
    this.cursor.layout = () => {
      const area = engine.canvas!.getBoundingClientRect(), sx = engine.displayWidth / area.width, sy = engine.displayHeight / area.height;
      Object.assign(this.cursor.rect, { x: (controllerOverlay.x - area.left) * sx - 12, y: (controllerOverlay.y - area.top) * sy - 12, width: 24, height: 24 });
    };
  }
  draw(time: number, delta: number): void {
    this.notifications.update(performance.now());
    this.hint.setVisible(controllerOverlay.visible && !!controllerOverlay.text); this.hint.setText(controllerOverlay.text);
    this.cursor.setVisible(controllerOverlay.visible && controllerOverlay.cursor);
    this.root.root.markDirty(); this.world.update(time, delta);
  }
  dispose(): void { this.world.destroy(); }
}
