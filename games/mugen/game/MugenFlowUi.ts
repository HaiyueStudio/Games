import { Entity, HaiyueEngine, World } from '@haiyue/engine';
import { KeyboardComponent } from '@haiyue/engine/components';
import { RenderIntegration } from '@haiyue/engine/experimental';
import { GuiButton, GuiImage, GuiLabel, GuiProgress, GuiRoot, GuiSystem, type GuiImageSource } from '@haiyue/engine/gui';
import { mugenCharacterGridColumns } from './MugenCharacterSelection';
import type { MugenRoundPhase } from '../runtime/match/MugenMatchState';

export type MugenGameMode = 'single' | 'versus' | 'ai';
export type MugenFlowScreen = 'title' | 'select' | 'stage' | 'fight' | 'settings';

export interface MugenFlowCallbacks {
  readonly chooseMode: (mode: MugenGameMode) => void;
  readonly moveCharacter: (player: 0 | 1, deltaColumn: number, deltaRow: number) => void;
  readonly selectCharacter: (player: 0 | 1, characterId: string) => void;
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
  readonly characters: readonly Readonly<{ id: string; label: string; portrait: GuiImageSource }>[];
  readonly p1CharacterId: string;
  readonly p2CharacterId: string;
  readonly previewVersion: number;
  readonly p1Name: string;
  readonly p2Name: string;
  readonly stageName: string;
  readonly p1Life: number;
  readonly p2Life: number;
  readonly p1Power: number;
  readonly p2Power: number;
  readonly p1Wins: number;
  readonly p2Wins: number;
  readonly round: number;
  readonly phase: MugenRoundPhase;
  readonly phaseTime: number;
  readonly roundWinnerId: string | null;
  readonly time: string;
  readonly paused: boolean;
  readonly fightLoading: boolean;
  readonly result: string;
  readonly p1Keys: string;
  readonly p2Keys: string;
}

const MODE_NAMES: Readonly<Record<MugenGameMode, string>> = Object.freeze({ single: '单人模式', versus: '双人模式', ai: 'AI 对战' });
const FLOW_FONT_CHARACTERS = ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~·∞‹›↑↓←→…角色与舞台资源载入中单人模式双对战设置选择确认阵容返回进战斗继续暂停主菜单详细按键恢复默认方向攻击电脑简单普通困难最高小键盘空格初始化图形解析音频上传显存准备完成正在首次会动作并精灵目录到';

export class MugenFlowUi {
  readonly #canvas: HTMLCanvasElement;
  readonly #callbacks: MugenFlowCallbacks;
  #engine: HaiyueEngine | null = null;
  #world: World | null = null;
  #root: GuiRoot | null = null;
  #keyboard: KeyboardComponent | null = null;
  #model: MugenFlowViewModel | null = null;
  #signature = '';
  #lastUiUpdate = Number.NEGATIVE_INFINITY;
  #uiDirty = true;

  constructor(canvas: HTMLCanvasElement, callbacks: MugenFlowCallbacks) { this.#canvas = canvas; this.#callbacks = callbacks; }

  async init(): Promise<void> {
    const engine = new HaiyueEngine({ canvas: this.#canvas, clearColor: { r: 0, g: 0, b: 0, a: 0 }, alphaMode: 'premultiplied', msaaSamples: 1 }); await engine.init(); engine.resizeToDisplaySize(true);
    const world = new World('MUGEN Flow UI'); const entity = new Entity('MUGEN Flow Root'); const root = new GuiRoot({ theme: { fontFamily: 'Inter, "Microsoft YaHei", sans-serif', fontSize: 18, radius: 8, colors: { text: '#fff8df', textMuted: '#aaa3c3', primary: '#e6a64f', danger: '#d94c68', background: 'rgba(0,0,0,0)', surface: 'rgba(10,9,22,.82)', border: '#665587', hover: '#493966', active: '#b87638', disabled: '#514c60' } } }); entity.addComponent(root); world.addEntity(entity);
    const inputEntity = new Entity('MUGEN Character Select Input'); const keyboard = new KeyboardComponent(); inputEntity.addComponent(keyboard); world.addEntity(inputEntity);
    const gui = new GuiSystem(engine, { loadOp: 'clear', font: { chars: FLOW_FONT_CHARACTERS, fontFamily: '"Microsoft YaHei", sans-serif', atlasSize: 1024 } }); world.addSystem(gui); const integration = new RenderIntegration(engine, { label: 'MugenFlowUi.render' }); world.addRuntimeIntegration(integration); integration.registerAll(world, () => ({ pass: 'shared' }));
    engine.on('update', ({ detail: { time, delta } }) => {
      if (!this.#uiDirty && time - this.#lastUiUpdate < 1000 / 30) return;
      engine.resizeToDisplaySize(); world.update(time, delta); this.#pollCharacterSelection(); this.#lastUiUpdate = time; this.#uiDirty = false;
    }); this.#engine = engine; this.#world = world; this.#root = root; this.#keyboard = keyboard; engine.run();
  }

  update(model: MugenFlowViewModel): void {
    this.#model = model; const signature = JSON.stringify(model); if (signature === this.#signature || this.#root === null) return; this.#signature = signature; this.#rebuild(model); this.#uiDirty = true;
  }

  dispose(): void { this.#world?.destroy(); this.#world = null; this.#root = null; this.#keyboard = null; this.#model = null; this.#engine?.destroy(); this.#engine = null; }

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
    label(root, MODE_NAMES[model.mode], '3%', '4%', '18%', 40, 14, '#d5b16b', 'left'); label(root, '选择角色 · SELECT FIGHTER', '13%', '4%', '74%', 48, 24, '#fff0b5'); label(root, 'PLAYER 1 · WASD', '3%', '15%', '30%', 28, 13, '#65ceff', 'left'); label(root, 'PLAYER 2 · ARROW KEYS', '67%', '15%', '30%', 28, 13, '#ff718d', 'right');
    label(root, model.p1Name, '3%', '21%', '27%', 54, 22, '#ffffff'); label(root, model.p2Name, '70%', '21%', '27%', 54, 22, '#ffffff');
    const columns = mugenCharacterGridColumns(model.characters.length); const rows = Math.ceil(model.characters.length / columns); const gridWidth = Math.min(54, columns * 11); const left = (100 - gridWidth) / 2; const cellWidth = gridWidth / columns; const rowHeight = Math.min(16, 54 / rows); const cellHeight = Math.max(8, rowHeight - 2);
    for (const [index, character] of model.characters.entries()) {
      const column = index % columns; const row = Math.floor(index / columns); const x = left + column * cellWidth; const y = 31 + row * rowHeight; const p1 = character.id === model.p1CharacterId; const p2 = character.id === model.p2CharacterId; const border = p1 && p2 ? '#ffe36f' : p1 ? '#45c8ff' : p2 ? '#ff6684' : '#665587';
      rect(root, `${x + .35}%`, `${y}%`, `${cellWidth - .7}%`, `${cellHeight}%`, p1 || p2 ? '#1b2038ee' : '#0b0b17d9', border, 3);
      if (character.portrait !== null) root.add(new GuiImage({ x: `${x + .8}%`, y: `${y + .5}%`, width: `${cellWidth - 1.6}%`, height: `${Math.max(4, cellHeight - 4)}%`, source: character.portrait, sourceKey: `mugen-portrait:${character.id}:${model.previewVersion}`, onClick: () => queueMicrotask(() => this.#callbacks.selectCharacter(0, character.id)) }));
      label(root, character.label.toLocaleUpperCase(), `${x + .4}%`, `${y + cellHeight - 3.3}%`, `${cellWidth - .8}%`, 24, 9, '#ffffff');
      if (p1) label(root, 'P1', `${x + .5}%`, `${y + .3}%`, '3%', 20, 10, '#65ceff', 'left');
      if (p2) label(root, 'P2', `${x + cellWidth - 3.5}%`, `${y + .3}%`, '3%', 20, 10, '#ff718d', 'right');
    }
    button(root, '返回', '5%', '92%', '16%', 42, this.#callbacks.goTitle); button(root, model.ready ? '确认阵容' : '角色载入中…', '39%', '90%', '22%', 48, this.#callbacks.confirmCharacters, true, !model.ready);
  }

  #stage(root: GuiRoot, model: MugenFlowViewModel): void {
    label(root, '选择舞台', '8%', '7%', '84%', 58, 38, '#fff0b5'); label(root, model.stageName, '20%', '72%', '60%', 52, 28, '#ffffff'); button(root, '‹', '8%', '74%', '10%', 48, () => this.#callbacks.cycleStage(-1)); button(root, '›', '82%', '74%', '10%', 48, () => this.#callbacks.cycleStage(1)); button(root, '返回选人', '5%', '91%', '18%', 44, () => this.#callbacks.chooseMode(model.mode)); button(root, '进入战斗', '39%', '88%', '22%', 54, this.#callbacks.startFight, true, !model.ready);
  }

  #fight(root: GuiRoot, model: MugenFlowViewModel): void {
    hudPlate(root, '3%', 8, '41%', 23);
    hudPlate(root, '56%', 8, '41%', 23);
    label(root, model.p1Name.toLocaleUpperCase(), '4%', 8, '34%', 23, 15, '#ffffff', 'left');
    label(root, `WIN ${model.p1Wins}`, '38%', 8, '5%', 23, 11, '#ffe36f', 'right');
    label(root, `WIN ${model.p2Wins}`, '57%', 8, '5%', 23, 11, '#ffe36f', 'left');
    label(root, model.p2Name.toLocaleUpperCase(), '62%', 8, '34%', 23, 15, '#ffffff', 'right');

    hudGauge(root, model.p1Life, 'left', 34, 24, 'life');
    hudGauge(root, model.p2Life, 'right', 34, 24, 'life');
    hudGauge(root, model.p1Power, 'left', 64, 11, 'power');
    hudGauge(root, model.p2Power, 'right', 64, 11, 'power');
    label(root, `POWER ${formatGaugePercent(model.p1Power)}`, '3%', 77, '18%', 18, 10, '#8bd7ff', 'left');
    label(root, `POWER ${formatGaugePercent(model.p2Power)}`, '79%', 77, '18%', 18, 10, '#8bd7ff', 'right');

    rect(root, '45.4%', 6, '9.2%', 70, '#080b12e8', '#e8edf3', 3);
    rect(root, '46%', 10, '8%', 62, '#182036ee', '#59677d', 2);
    label(root, `ROUND ${model.round}`, '46%', 11, '8%', 17, 10, '#ffd96c');
    label(root, model.time, '46%', 25, '8%', 42, 36, model.time === '00' ? '#ff6b60' : '#ffffff');
    const callout = model.fightLoading ? null : fightCallout(model);
    if (callout !== null) {
      rect(root, '25%', '37%', '50%', 112, '#05070cb8', '#d7b865', 2);
      label(root, callout.title, '20%', '39%', '60%', 62, 48, '#fff0a6');
      if (callout.subtitle !== '') label(root, callout.subtitle, '25%', '49%', '50%', 30, 14, '#ffffff');
    }
    if (model.paused) label(root, 'PAUSED', '42%', 83, '16%', 26, 16, '#ffd96c');
    if (!model.fightLoading && model.result !== '') label(root, model.result, '20%', '36%', '60%', 90, 54, '#fff1a8');
    if (model.fightLoading) { rect(root, '20%', '38%', '60%', 120, '#05070ce8', '#d7b865', 3); label(root, 'LOADING FIGHTERS', '20%', '41%', '60%', 50, 24, '#fff0a6'); label(root, model.loadingLabel, '22%', '49%', '56%', 32, 13, '#ffffff'); }
    button(root, model.paused ? '继续' : '暂停', '77%', '91%', '9%', 38, this.#callbacks.togglePause, false, model.fightLoading);
    button(root, '主菜单', '87%', '91%', '10%', 38, this.#callbacks.exitFight, false, model.fightLoading);
  }

  #settings(root: GuiRoot, model: MugenFlowViewModel): void {
    const [p1Move = '', p1Attack = ''] = model.p1Keys.split('\n'); const [p2Move = '', p2Attack = ''] = model.p2Keys.split('\n');
    label(root, '设置', '8%', '8%', '84%', 60, 40, '#fff0b5'); label(root, 'PLAYER 1', '16%', '27%', '28%', 30, 14, '#65ceff'); label(root, p1Move, '7%', '34%', '43%', 34, 16, '#ffffff'); label(root, p1Attack, '7%', '40%', '43%', 34, 16, '#ffffff'); label(root, 'PLAYER 2', '56%', '27%', '28%', 30, 14, '#ff718d'); label(root, p2Move, '50%', '34%', '43%', 34, 16, '#ffffff'); label(root, p2Attack, '50%', '40%', '43%', 34, 16, '#ffffff'); button(root, '详细按键设置', '35%', '57%', '30%', 50, this.#callbacks.openKeySettings, true); button(root, '恢复默认按键', '35%', '67%', '30%', 46, this.#callbacks.resetKeys); button(root, '返回主菜单', '35%', '82%', '30%', 46, this.#callbacks.goTitle);
  }

  #pollCharacterSelection(): void {
    const keyboard = this.#keyboard; const model = this.#model; if (keyboard === null || model?.screen !== 'select' || !model.ready) return;
    if (keyboard.wasPressed('KeyA')) this.#callbacks.moveCharacter(0, -1, 0); else if (keyboard.wasPressed('KeyD')) this.#callbacks.moveCharacter(0, 1, 0); else if (keyboard.wasPressed('KeyW')) this.#callbacks.moveCharacter(0, 0, -1); else if (keyboard.wasPressed('KeyS')) this.#callbacks.moveCharacter(0, 0, 1);
    if (keyboard.wasPressed('ArrowLeft')) this.#callbacks.moveCharacter(1, -1, 0); else if (keyboard.wasPressed('ArrowRight')) this.#callbacks.moveCharacter(1, 1, 0); else if (keyboard.wasPressed('ArrowUp')) this.#callbacks.moveCharacter(1, 0, -1); else if (keyboard.wasPressed('ArrowDown')) this.#callbacks.moveCharacter(1, 0, 1);
    if (keyboard.wasPressed('Enter') || keyboard.wasPressed('Space')) this.#callbacks.confirmCharacters();
  }

}

function label(root: GuiRoot, text: string, x: number | `${number}%`, y: number | `${number}%`, width: number | `${number}%`, height: number, fontSize: number, color: string, textAlign: 'left' | 'center' | 'right' = 'center'): GuiLabel { return root.add(new GuiLabel({ x, y, width, height, text, fontSize, textAlign, style: { color, backgroundColor: 'rgba(0,0,0,0)', borderColor: 'rgba(0,0,0,0)', padding: 4 } })); }
function button(root: GuiRoot, text: string, x: number | `${number}%`, y: number | `${number}%`, width: number | `${number}%`, height: number, onClick: () => void, primary = false, disabled = false): GuiButton { return root.add(new GuiButton({ x, y, width, height, text, variant: primary ? 'primary' : 'default', disabled, onClick: () => queueMicrotask(onClick), style: { backgroundColor: primary ? '#d69145' : 'rgba(17,14,33,.9)', hoverBackgroundColor: primary ? '#efb65f' : '#362b52', borderColor: primary ? '#ffd17c' : '#65567e', color: primary ? '#1a1016' : '#f4efff', hoverColor: '#ffffff', radius: 7, padding: 10 } })); }

function hudPlate(root: GuiRoot, x: `${number}%`, y: number, width: `${number}%`, height: number): void {
  rect(root, x, y + 2, width, height, '#070a12b8', '#080b12', 2);
  rect(root, x, y, width, height, '#111827e8', '#aeb7c7', 2);
}

function hudGauge(root: GuiRoot, ratio: number, side: 'left' | 'right', y: number, height: number, kind: 'life' | 'power'): void {
  const normalized = clampRatio(ratio);
  const trackX = side === 'left' ? 3 : 56;
  const trackWidth = 41;
  const insetX = trackX + .35;
  const insetWidth = trackWidth - .7;
  const fillWidth = insetWidth * normalized;
  const fillX = side === 'left' ? insetX : insetX + insetWidth - fillWidth;
  const trackColor = kind === 'life' ? '#ced4de' : '#7d8da6';
  const fillColor = kind === 'power' ? '#259cff' : normalized <= .25 ? '#ef493f' : normalized <= .5 ? '#ff9f27' : '#d9ec24';
  const highlightColor = kind === 'power' ? '#8cddff' : normalized <= .25 ? '#ff938a' : normalized <= .5 ? '#ffd081' : '#fbff9a';

  rect(root, `${trackX}%`, y + 3, `${trackWidth}%`, height, '#05070cbb', '#05070c', 2);
  rect(root, `${trackX}%`, y, `${trackWidth}%`, height, trackColor, '#f4f6f8', 2);
  rect(root, `${insetX}%`, y + 3, `${insetWidth}%`, height - 6, '#171b25', '#080b10', 1);
  if (fillWidth <= 0) return;
  rect(root, `${fillX}%`, y + 3, `${fillWidth}%`, height - 6, fillColor, fillColor, 1);
  rect(root, `${fillX}%`, y + 4, `${fillWidth}%`, Math.max(2, Math.round((height - 6) * .28)), highlightColor, highlightColor, 1);
}

function rect(root: GuiRoot, x: number | `${number}%`, y: number | `${number}%`, width: number | `${number}%`, height: number | `${number}%`, backgroundColor: string, borderColor = backgroundColor, radius = 0): GuiLabel {
  return root.add(new GuiLabel({ x, y, width, height, text: '', style: { backgroundColor, borderColor, radius, padding: 0 } }));
}

function clampRatio(value: number): number { return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)); }
function formatGaugePercent(value: number): string { return `${String(Math.round(clampRatio(value) * 100)).padStart(3, '0')}%`; }

function fightCallout(model: MugenFlowViewModel): Readonly<{ title: string; subtitle: string }> | null {
  if (model.phase === 'ready' && model.phaseTime < 45) return Object.freeze({ title: `ROUND ${model.round}`, subtitle: 'GET READY' });
  if (model.phase === 'ready') return Object.freeze({ title: 'READY', subtitle: '' });
  if (model.phase === 'fight' && model.phaseTime < 30) return Object.freeze({ title: 'FIGHT!', subtitle: '' });
  if (model.phase === 'ko') return Object.freeze({ title: model.roundWinnerId === null ? 'DOUBLE K.O.' : 'K.O.', subtitle: model.roundWinnerId === null ? '' : `${model.roundWinnerId} TAKES THE ROUND` });
  return null;
}
