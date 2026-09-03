import { Entity, HaiyueEngine, World } from '@haiyue/engine';
import { RenderIntegration } from '@haiyue/engine/experimental';
import { GuiButton, GuiLabel, GuiProgress, GuiRoot, GuiSystem } from '@haiyue/engine/gui';

export type MugenGameMode = 'single' | 'versus' | 'ai';
export type MugenFlowScreen = 'title' | 'select' | 'stage' | 'fight' | 'settings';

export interface MugenFlowCallbacks {
  readonly chooseMode: (mode: MugenGameMode) => void;
  readonly cycleCharacter: (player: 0 | 1, direction: -1 | 1) => void;
  readonly confirmCharacters: () => void;
  readonly cycleStage: (direction: -1 | 1) => void;
  readonly startFight: () => void;
  readonly togglePause: () => void;
  readonly exitFight: () => void;
  readonly showSettings: () => void;
  readonly openKeySettings: () => void;
  readonly resetKeys: () => void;
  readonly goTitle: () => void;
}

export interface MugenFlowViewModel {
  readonly screen: MugenFlowScreen;
  readonly ready: boolean;
  readonly loadingProgress: number;
  readonly loadingLabel: string;
  readonly mode: MugenGameMode;
  readonly p1Name: string;
  readonly p2Name: string;
  readonly stageName: string;
  readonly p1Life: number;
  readonly p2Life: number;
  readonly round: number;
  readonly time: string;
  readonly paused: boolean;
  readonly result: string;
  readonly p1Keys: string;
  readonly p2Keys: string;
}

const MODE_NAMES: Readonly<Record<MugenGameMode, string>> = Object.freeze({ single: '单人模式', versus: '双人模式', ai: 'AI 对战' });
const FLOW_FONT_CHARACTERS = ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~·∞‹›█░↑↓←→…角色与舞台资源载入中单人模式双对战设置选择确认阵容返回进战斗继续暂停主菜单详细按键恢复默认方向攻击电脑简单普通困难最高小键盘空格初始化图形解析音频上传显存准备完成正在首次会动作并精灵目录到';

export class MugenFlowUi {
  readonly #canvas: HTMLCanvasElement;
  readonly #callbacks: MugenFlowCallbacks;
  #engine: HaiyueEngine | null = null;
  #world: World | null = null;
  #root: GuiRoot | null = null;
  #signature = '';
  #lastUiUpdate = Number.NEGATIVE_INFINITY;
  #uiDirty = true;

  constructor(canvas: HTMLCanvasElement, callbacks: MugenFlowCallbacks) { this.#canvas = canvas; this.#callbacks = callbacks; }

  async init(): Promise<void> {
    const engine = new HaiyueEngine({ canvas: this.#canvas, clearColor: { r: 0, g: 0, b: 0, a: 0 }, alphaMode: 'premultiplied', msaaSamples: 1 }); await engine.init(); engine.resizeToDisplaySize(true);
    const world = new World('MUGEN Flow UI'); const entity = new Entity('MUGEN Flow Root'); const root = new GuiRoot({ theme: { fontFamily: 'Inter, "Microsoft YaHei", sans-serif', fontSize: 18, radius: 8, colors: { text: '#fff8df', textMuted: '#aaa3c3', primary: '#e6a64f', danger: '#d94c68', background: 'rgba(0,0,0,0)', surface: 'rgba(10,9,22,.82)', border: '#665587', hover: '#493966', active: '#b87638', disabled: '#514c60' } } }); entity.addComponent(root); world.addEntity(entity);
    const gui = new GuiSystem(engine, { loadOp: 'clear', font: { chars: FLOW_FONT_CHARACTERS, fontFamily: '"Microsoft YaHei", sans-serif', atlasSize: 1024 } }); world.addSystem(gui); const integration = new RenderIntegration(engine, { label: 'MugenFlowUi.render' }); world.addRuntimeIntegration(integration); integration.registerAll(world, () => ({ pass: 'shared' }));
    engine.on('update', ({ detail: { time, delta } }) => {
      if (!this.#uiDirty && time - this.#lastUiUpdate < 1000 / 30) return;
      engine.resizeToDisplaySize(); world.update(time, delta); this.#lastUiUpdate = time; this.#uiDirty = false;
    }); this.#engine = engine; this.#world = world; this.#root = root; engine.run();
  }

  update(model: MugenFlowViewModel): void {
    const signature = JSON.stringify(model); if (signature === this.#signature || this.#root === null) return; this.#signature = signature; this.#rebuild(model); this.#uiDirty = true;
  }

  dispose(): void { this.#world?.destroy(); this.#world = null; this.#root = null; this.#engine?.destroy(); this.#engine = null; }

  #rebuild(model: MugenFlowViewModel): void {
    const root = this.#root!; for (const child of [...root.root.children]) root.remove(child);
    if (model.screen === 'title') this.#title(root, model); else if (model.screen === 'select') this.#select(root, model); else if (model.screen === 'stage') this.#stage(root, model); else if (model.screen === 'fight') this.#fight(root, model); else this.#settings(root, model);
  }

  #title(root: GuiRoot, model: MugenFlowViewModel): void {
    label(root, 'HAIYUE', '8%', '8%', '84%', 36, 16, '#d5b16b'); label(root, 'MUGEN ARENA', '8%', '13%', '84%', 92, 64, '#fff3c4'); label(root, 'BUILD YOUR FIGHT · DEFINE YOUR LEGEND', '8%', '24%', '84%', 34, 14, '#b9aed6');
    if (!model.ready) {
      label(root, model.loadingLabel, '22%', '42%', '56%', 38, 17, '#eee7ff');
      root.add(new GuiProgress({ x: '25%', y: '50%', width: '50%', height: 22, value: model.loadingProgress, min: 0, max: 1, showText: true, style: { backgroundColor: '#302747', radius: 8 } }));
      label(root, '首次载入会解析角色动作并上传精灵', '20%', '57%', '60%', 30, 13, '#8f86a8');
    } else {
      button(root, '单人模式', '37%', '40%', '26%', 54, () => this.#callbacks.chooseMode('single'), true); button(root, '双人模式', '37%', '49%', '26%', 54, () => this.#callbacks.chooseMode('versus')); button(root, 'AI 对战', '37%', '58%', '26%', 54, () => this.#callbacks.chooseMode('ai')); button(root, '设置', '37%', '70%', '26%', 46, this.#callbacks.showSettings);
    }
    label(root, 'WebGPU · HAIYUE ENGINE', '8%', '91%', '84%', 28, 12, '#756c91');
  }

  #select(root: GuiRoot, model: MugenFlowViewModel): void {
    label(root, `${MODE_NAMES[model.mode]}  ·  选择角色`, '6%', '6%', '88%', 60, 36, '#fff0b5'); label(root, 'PLAYER 1', '8%', '19%', '34%', 28, 13, '#65ceff'); label(root, 'PLAYER 2', '58%', '19%', '34%', 28, 13, '#ff718d');
    label(root, model.p1Name, '5%', '72%', '40%', 48, 24, '#ffffff'); label(root, model.p2Name, '55%', '72%', '40%', 48, 24, '#ffffff');
    button(root, '‹', '7%', '82%', '8%', 48, () => this.#callbacks.cycleCharacter(0, -1)); button(root, '›', '35%', '82%', '8%', 48, () => this.#callbacks.cycleCharacter(0, 1)); button(root, '‹', '57%', '82%', '8%', 48, () => this.#callbacks.cycleCharacter(1, -1)); button(root, '›', '85%', '82%', '8%', 48, () => this.#callbacks.cycleCharacter(1, 1));
    button(root, '返回', '5%', '92%', '16%', 42, this.#callbacks.goTitle); button(root, '确认阵容', '39%', '90%', '22%', 48, this.#callbacks.confirmCharacters, true);
  }

  #stage(root: GuiRoot, model: MugenFlowViewModel): void {
    label(root, '选择舞台', '8%', '7%', '84%', 58, 38, '#fff0b5'); label(root, model.stageName, '20%', '72%', '60%', 52, 28, '#ffffff'); button(root, '‹', '8%', '74%', '10%', 48, () => this.#callbacks.cycleStage(-1)); button(root, '›', '82%', '74%', '10%', 48, () => this.#callbacks.cycleStage(1)); button(root, '返回选人', '5%', '91%', '18%', 44, () => this.#callbacks.chooseMode(model.mode)); button(root, '进入战斗', '39%', '88%', '22%', 54, this.#callbacks.startFight, true, !model.ready);
  }

  #fight(root: GuiRoot, model: MugenFlowViewModel): void {
    label(root, `${model.p1Name}  ${gauge(model.p1Life)}`, '3%', '3%', '40%', 32, 15, '#75e3bd', 'left'); label(root, `${gauge(model.p2Life)}  ${model.p2Name}`, '57%', '3%', '40%', 32, 15, '#f0df75', 'right'); label(root, `ROUND ${model.round}   ${model.time}${model.paused ? '   PAUSED' : ''}`, '39%', '3%', '22%', 32, 14, '#fff4d3');
    if (model.result !== '') label(root, model.result, '20%', '36%', '60%', 90, 54, '#fff1a8'); button(root, model.paused ? '继续' : '暂停', '77%', '91%', '9%', 38, this.#callbacks.togglePause); button(root, '主菜单', '87%', '91%', '10%', 38, this.#callbacks.exitFight);
  }

  #settings(root: GuiRoot, model: MugenFlowViewModel): void {
    const [p1Move = '', p1Attack = ''] = model.p1Keys.split('\n'); const [p2Move = '', p2Attack = ''] = model.p2Keys.split('\n');
    label(root, '设置', '8%', '8%', '84%', 60, 40, '#fff0b5'); label(root, 'PLAYER 1', '16%', '27%', '28%', 30, 14, '#65ceff'); label(root, p1Move, '7%', '34%', '43%', 34, 16, '#ffffff'); label(root, p1Attack, '7%', '40%', '43%', 34, 16, '#ffffff'); label(root, 'PLAYER 2', '56%', '27%', '28%', 30, 14, '#ff718d'); label(root, p2Move, '50%', '34%', '43%', 34, 16, '#ffffff'); label(root, p2Attack, '50%', '40%', '43%', 34, 16, '#ffffff'); button(root, '详细按键设置', '35%', '57%', '30%', 50, this.#callbacks.openKeySettings, true); button(root, '恢复默认按键', '35%', '67%', '30%', 46, this.#callbacks.resetKeys); button(root, '返回主菜单', '35%', '82%', '30%', 46, this.#callbacks.goTitle);
  }

}

function label(root: GuiRoot, text: string, x: number | `${number}%`, y: number | `${number}%`, width: number | `${number}%`, height: number, fontSize: number, color: string, textAlign: 'left' | 'center' | 'right' = 'center'): GuiLabel { return root.add(new GuiLabel({ x, y, width, height, text, fontSize, textAlign, style: { color, backgroundColor: 'rgba(0,0,0,0)', borderColor: 'rgba(0,0,0,0)', padding: 4 } })); }
function button(root: GuiRoot, text: string, x: number | `${number}%`, y: number | `${number}%`, width: number | `${number}%`, height: number, onClick: () => void, primary = false, disabled = false): GuiButton { return root.add(new GuiButton({ x, y, width, height, text, variant: primary ? 'primary' : 'default', disabled, onClick: () => queueMicrotask(onClick), style: { backgroundColor: primary ? '#d69145' : 'rgba(17,14,33,.9)', hoverBackgroundColor: primary ? '#efb65f' : '#362b52', borderColor: primary ? '#ffd17c' : '#65567e', color: primary ? '#1a1016' : '#f4efff', hoverColor: '#ffffff', radius: 7, padding: 10 } })); }
function gauge(ratio: number): string { const count = Math.round(Math.max(0, Math.min(1, ratio)) * 12); return `${'█'.repeat(count)}${'░'.repeat(12 - count)}`; }
