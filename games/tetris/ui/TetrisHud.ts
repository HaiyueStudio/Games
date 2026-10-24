import { GuiButton, GuiImage } from '@haiyue/engine/gui';
import { GameHud } from '../../shared/ui/GameHud';
import type { HaiyueEngine, World } from '@haiyue/engine';
import type { NeonChrome } from '../rendering/NeonChrome';
export class TetrisHud extends GameHud {
    readonly score;
    readonly title;
    readonly detail;
    readonly pause;
    readonly next;
    readonly sound;
    readonly lines;
    private readonly feedback;
    private readonly statusPanel;
    private flash = 0;
    private readonly buttonSkins: { button: GuiButton; image: GuiImage }[] = [];
    constructor(engine: HaiyueEngine, world: World, pause: () => void, restart: () => void, mute: () => void, chrome: NeonChrome) {
        super(engine, world, '←↑→↓·移动旋转落下暂停继续新局音效开关已结束按恢复得分自动存档实时虹彩游戏直再来');
        this.root.theme.colors = { text: '#e5faff', textMuted: '#8b99ca', primary: '#854aff', danger: '#ff4da6', background: '#080d22', surface: '#131b38', border: '#678cff', hover: '#394a80', active: '#603cac', disabled: '#343956' };
        const panel = (x: number, y: number, w: number, h: number, source: GPUTexture) => {
            this.place(new GuiImage({ source, pointerFilter: 'ignore' }), { x, y, width: w, height: h });
        };
        panel(10, 10, 230, 125, chrome.titlePanel); panel(770, 10, 220, 310, chrome.panel);
        this.label('TETRIS', 30, 26, 190, 46, 34).setStyle({ color: '#91f5ff', backgroundColor: 'transparent' });
        this.label('CHROMATIC / 01', 30, 78, 190, 24, 12).setStyle({ color: '#b7a7ff', backgroundColor: 'transparent' });
        this.label('实时虹彩 · 自动存档', 30, 104, 190, 22, 11).setStyle({ color: '#8c9bbf', backgroundColor: 'transparent' });
        this.label('← → / A D 移动   ↑ / W 旋转', 20, 557, 310, 26, 13).setStyle({ color: '#8da9c7', backgroundColor: 'transparent' });
        this.label('↓ / S 下落   SPACE 直落   P 暂停', 20, 587, 310, 26, 12).setStyle({ color: '#8da9c7', backgroundColor: 'transparent' });
        this.label('SCORE', 797, 32, 166, 24, 12).setStyle({ color: '#a6aad3', backgroundColor: 'transparent' });
        this.score = this.label('0', 797, 58, 166, 48, 36);
        this.score.setStyle({ color: '#92f6ff', backgroundColor: 'transparent' });
        this.lines = this.label('LINES  0', 797, 114, 166, 24, 12);
        this.lines.setStyle({ color: '#b6a5ff', backgroundColor: 'transparent' });
        this.label('NEXT', 797, 155, 166, 24, 12).setStyle({ color: '#a6aad3', backgroundColor: 'transparent' });
        this.next = Array.from({ length: 16 }, (_, i) => {
            const node = this.root.add(new GuiImage({ pointerFilter: 'ignore', style: { backgroundColor: '#17213f', radius: 4 } }));
            node.layout = parent => {
                const scale = Math.min(parent.width / this.width, parent.height / this.height);
                Object.assign(node.rect, { x: parent.x + (parent.width - this.width * scale) / 2 + (820 + i % 4 * 28) * scale,
                    y: parent.y + 190 * Math.max(.65, scale) + Math.floor(i / 4) * 28 * scale, width: 25 * scale, height: 25 * scale });
            };
            return node;
        });
        this.title = this.label('', 300, 250, 400, 65, 30);
        this.detail = this.label('', 300, 315, 400, 45);
        this.statusPanel = this.place(new GuiImage({ source: chrome.titlePanel, pointerFilter: 'ignore', visible: false }), { x: 286, y: 238, width: 428, height: 138 });
        this.title.setStyle({ color: '#a3f8ff', backgroundColor: 'transparent' });
        this.detail.setStyle({ color: '#c0b6ff', backgroundColor: 'transparent' });
        this.feedback = this.label('', 350, 90, 300, 44, 22);
        this.feedback.setStyle({ color: '#9dffff', backgroundColor: 'transparent' });
        this.title.setVisible(false);
        this.detail.setVisible(false);
        this.sound = this.button('音效 开', 634, 586, 104, mute);
        this.pause = this.button('暂停', 750, 586, 104, pause);
        const reset = this.button('新局', 866, 586, 114, restart);
        for (const button of [this.sound, this.pause, reset]) {
            button.setStyle({ backgroundColor: 'transparent', hoverBackgroundColor: 'transparent', borderColor: 'transparent', color: '#d4f9ff', radius: 9 });
            const image = this.root.add(new GuiImage({ source: chrome.button, pointerFilter: 'ignore' }));
            // Follow the actual control rectangle, including the portrait toolbar reflow.
            image.layout = () => Object.assign(image.rect, { x: button.rect.x - 7, y: button.rect.y - 7, width: button.rect.width + 14, height: button.rect.height + 14 });
            this.buttonSkins.push({ button, image });
        }
    }
    cleared(count: number): void { this.flash = 1; this.feedback.setText(count === 4 ? 'TETRIS // x4' : `LINE CLEAR // x${count}`); }
    resetFeedback(): void { this.flash = 0; this.feedback.setVisible(false); }
    chromeSnapshot() {
        return this.buttonSkins.map(({ button, image }) => ({ text: button.text, hovered: button.hovered, pressed: button.pressed, tint: image.tint }));
    }
    animate(seconds: number, delta: number): void {
        this.flash = Math.max(0, this.flash - delta / 1250);
        this.statusPanel.setVisible(this.title.visible);
        this.feedback.setVisible(this.flash > 0); this.feedback.setStyle({ opacity: Math.min(1, this.flash * 3) });
        this.score.setStyle({ color: `rgb(${Math.round(145 + Math.sin(seconds) * 25)},235,255)` });
        for (const { button, image } of this.buttonSkins) {
            image.setTint(button.disabled ? '#46516d' : button.pressed ? '#b096ff' : button.hovered || button.focused ? '#ffffff' : '#a4c2e8');
            button.setStyle({ color: button.disabled ? '#647292' : button.hovered || button.focused ? '#ffffff' : '#c6ebff' });
        }
    }
}
