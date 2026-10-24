import { GuiButton, GuiDirtyFlags, GuiElement, GuiImage, GuiLabel, GuiRoot } from '@haiyue/engine/gui';
import { deviceLayout, type DeviceMode } from './layout';
import type { DesktopRect } from '../launcher/layout';

export const SIMULATOR_TEXT = 'HAIYUE DEVICE OS平板手机模拟器游戏图标桌面返回游戏库主页独立打开切换滑动切换点击启动触屏操作鼠标模拟触摸键盘手柄直接游玩正在加载屏幕设置上一页下一页';
export class DeviceGui {
  readonly root = new GuiRoot({ style: { fontFamily: 'Microsoft YaHei, Segoe UI, sans-serif', fontSize: 14 }, theme: { fontFamily: 'Microsoft YaHei, Segoe UI, sans-serif', fontSize: 14 } });
  readonly nodes = new Map<string, GuiElement>();
  private readonly rectangles = new Map<GuiElement, DesktopRect>();
  private readonly images = new Set<HTMLImageElement>();
  layout = deviceLayout(1040, 760, 'pad');
  constructor(chrome = true) {
    if (!chrome) return;
    this.label('device-brand', 'HAIYUE / DEVICE OS', 20, '#dbffb0');
    this.label('device-hint', '滑动切换 · 点击启动 · 鼠标模拟触摸', 13, '#bad6f1');
    this.panel('device-shadow', 'rgba(0,0,0,.3)', 32); this.panel('device-body', '#1a2241', 28); this.panel('device-rim', '#080e20', 24);
    this.panel('device-camera', '#394764', 5); this.panel('device-home-line', '#9dafe0', 3);
  }
  add<T extends GuiElement>(node: T, parent = this.root.root): T {
    const rectangle = { x: 0, y: 0, width: 0, height: 0 }, layout = node.layout.bind(node);
    this.rectangles.set(node, rectangle); this.nodes.set(node.id, node);
    node.layout = area => layout({ x: area.x + rectangle.x, y: area.y + rectangle.y, width: rectangle.width, height: rectangle.height });
    parent.add(node); return node;
  }
  place(node: string | GuiElement, rectangle: DesktopRect): void {
    const element = typeof node === 'string' ? this.nodes.get(node)! : node, previous = this.rectangles.get(element)!;
    if (Object.entries(rectangle).every(([key, value]) => previous[key as keyof DesktopRect] === value)) return;
    Object.assign(previous, rectangle); element.markDirty(GuiDirtyFlags.All);
  }
  panel(id: string, color: string, radius = 0, parent = this.root.root) { return this.add(new GuiElement({ id, width: '100%', height: '100%', pointerFilter: 'ignore', style: { backgroundColor: color, borderColor: 'transparent', padding: 0, radius } }), parent); }
  label(id: string, text: string, fontSize: number, color = '#e7f5ff', parent = this.root.root) { return this.add(new GuiLabel({ id, text, fontSize, width: '100%', height: '100%', pointerFilter: 'ignore', style: { color, padding: 0 } }), parent); }
  button(id: string, text: string, click: () => void, color = '#7054dc') { return this.add(new GuiButton({ id, text, onClick: () => queueMicrotask(click), width: '100%', height: '100%', hoverTransition: true, style: { backgroundColor: color, borderColor: '#9184e8', color: '#ffffff', radius: 8, padding: 0 } })); }
  image(id: string, parent = this.root.root) { return this.add(new GuiImage({ id, width: '100%', height: '100%', pointerFilter: 'ignore' }), parent); }
  thumbnail(node: GuiImage, url: string): void {
    const image = new Image(); this.images.add(image); image.decoding = 'async'; image.onload = () => node.setSource(image); image.src = url;
  }
  resize(width: number, height: number, mode: DeviceMode): void {
    this.layout = deviceLayout(width, height, mode); const { body } = this.layout;
    this.place('device-brand', { x: width < 600 ? 12 : 24, y: 17, width: width < 600 ? 86 : Math.max(150, width - 400), height: 34 });
    (this.nodes.get('device-brand') as GuiLabel).setText(width < 600 ? 'DEVICE OS' : 'HAIYUE / DEVICE OS');
    (this.nodes.get('device-brand') as GuiLabel).setFontSize(width < 600 ? 13 : 20);
    this.place('device-hint', { x: 24, y: height - 38, width: width - 48, height: 28 });
    this.place('device-shadow', { x: body.x - 8, y: body.y + 10, width: body.width + 16, height: body.height + 8 }); this.place('device-body', body);
    this.place('device-rim', { x: body.x + 3, y: body.y + 3, width: body.width - 6, height: body.height - 6 });
    this.place('device-camera', { x: width / 2 - 20, y: body.y + 10, width: 40, height: 5 });
    this.place('device-home-line', { x: width / 2 - 28, y: body.y + body.height - 11, width: 56, height: 3 });
    this.root.root.markDirty();
  }
  snapshot() { return [...this.nodes.values()].filter(node => node.visible).map(node => ({ id: node.id, type: node.constructor.name, text: node instanceof GuiLabel || node instanceof GuiButton ? node.text : '', rect: { ...node.rect } })); }
  destroy(): void { for (const image of this.images) { image.onload = null; image.onerror = null; } this.images.clear(); }
}
