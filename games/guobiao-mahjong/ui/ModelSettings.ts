import { GuiButton, GuiInput, GuiLabel, GuiModal, GuiSelect, GuiSlider, type GuiElement, type GuiRoot } from '@haiyue/engine/gui';
import type { MatchController } from '../app/MatchController';
import type { ModelHub } from '../api/ModelHub';
import { seat, WINDS } from '../rules/types';
export const MODEL_SETTINGS_CHARS = '模型服务地址连接刷新应用取消温度随机种子可用失败选择内置加载参数学生集成个设置正在已无效所选先本地不兼容你正在此位保持稳定增加多样性';
export class ModelSettings {
  private readonly modal: GuiModal;
  private readonly address: GuiInput;
  private readonly refresh: GuiButton;
  private readonly status: GuiLabel;
  private readonly labels: GuiLabel[];
  private readonly seats: GuiSelect<string>[];
  private readonly temperature: GuiSlider;
  private readonly temperatureLabel: GuiLabel;
  private readonly seedInput: GuiInput;
  private readonly apply: GuiButton;
  private readonly hub: ModelHub;
  private readonly game: MatchController;
  private resume = false;
  private epoch = -1;
  constructor(root: GuiRoot, canvas: HTMLCanvasElement, game: MatchController, hub: ModelHub) {
    this.game = game; this.hub = hub;
    const modal = this.modal = root.add(new GuiModal({ title: 'AI 模型', message: '', visible: false, width: 600, height: 556,
      showCloseButton: false, showConfirmButton: false, showCancelButton: true, cancelText: '关闭', onClose: () => this.finish(),
      style: { backgroundColor: '#10271f', borderColor: '#e8c17c', color: '#e8ede0', radius: 14 } }));
    const label = (text = '') => modal.add(new GuiLabel({ text, pointerFilter: 'ignore', style: { color: '#98b7ab', padding: 0 } }));
    this.address = modal.add(new GuiInput({ value: hub.endpoint, placeholder: 'http://127.0.0.1:8787', maxLength: 200, style: { backgroundColor: '#1c3b30', color: '#e8ede0' } }));
    this.refresh = modal.add(new GuiButton({ text: '连接 / 刷新', onClick: () => { void this.connect(); } }));
    this.status = label(hub.status);
    this.labels = Array.from({ length: 4 }, () => label());
    this.seats = Array.from({ length: 4 }, (_, who) => modal.add(new GuiSelect<string>({ value: hub.assignments[who] ?? 'builtin', options: [{ label: '内置 AI', value: 'builtin' }], optionHeight: 30, maxVisibleOptions: 5 }))) ;
    this.temperatureLabel = label();
    this.temperature = modal.add(new GuiSlider({ min: 0, max: 2, step: .1, value: hub.parameters.temperature, onChange: value => this.temperatureLabel.setText(`温度 ${value.toFixed(1)} · 0 保持稳定，增加多样性`) }));
    this.seedInput = modal.add(new GuiInput({ value: String(hub.parameters.seed), inputType: 'number', maxLength: 10 }));
    const seedLabel = label('随机种子');
    this.apply = modal.add(new GuiButton({ text: '应用', style: { backgroundColor: '#e8c17c', color: '#282112' }, onClick: () => {
      try { hub.apply(this.seats.map(s => s.value ?? 'builtin'), { temperature: this.temperature.value, seed: Number(this.seedInput.value) }); this.close(); }
      catch (error) { this.status.setText(String(error)); }
    } }));
    modal.layout = p => {
      const scale = p.width / Math.max(1, canvas.clientWidth), w = p.width / scale, h = p.height / scale;
      const width = Math.min(600, w - 24), height = Math.min(556, h - 40);
      Object.assign(modal.rect, p); Object.assign(modal.dialogRect, { x: p.x + (w - width) / 2 * scale, y: p.y + (h - height) / 2 * scale, width: width * scale, height: height * scale });
      const place = (node: GuiElement, x: number, y: number, ww: number, hh: number, font = 13) => { Object.assign(node.rect, { x: modal.dialogRect.x + x * scale, y: modal.dialogRect.y + y * scale, width: ww * scale, height: hh * scale }); if (node instanceof GuiLabel) node.setFontSize(font * scale); };
      place(modal.titleLabel, 20, 16, width - 40, 34, 23); place(modal.messageLabel, -2000, 0, 1, 1);
      place(this.address, 20, 66, width - 148, 36); place(this.refresh, width - 118, 66, 98, 36);
      place(this.status, 20, 110, width - 40, 28, w < 500 ? 10 : 12);
      this.seats.forEach((select, i) => { place(this.labels[i]!, 20, 153 + i * 47, w < 500 ? 65 : 112, 34, 12); place(select, w < 500 ? 87 : 140, 153 + i * 47, width - (w < 500 ? 107 : 160), 34); });
      place(this.temperatureLabel, 20, 348, width - 40, 26, w < 500 ? 10 : 12);
      place(this.temperature, 24, 380, width - 48, 20);
      place(seedLabel, 20, 417, 100, 32, 12); place(this.seedInput, 130, 417, width - 150, 32);
      place(modal.cancelButton, width / 2 - 116, height - 59, 106, 36); place(this.apply, width / 2 + 10, height - 59, 106, 36);
    };
  }
  private updateOptions(): void {
    const o = this.game.observation();
    this.seats.forEach((select, i) => {
      this.labels[i]!.setText(`${WINDS[seat(i - o.dealer)]}家${i === this.game.human ? ' · 你' : ''}`);
      select.options = [{ label: '内置 AI', value: 'builtin' }, ...this.hub.models.map(m => ({ label: m.name + (m.available ? '' : ' · 不可用'), value: m.id, disabled: !m.available }))];
      select.setDisabled(i === this.game.human); select.setValue(this.hub.assignments[i] ?? 'builtin');
      select.markDirty();
    });
    this.status.setText(this.hub.status);
  }
  private async connect(): Promise<void> {
    this.refresh.setDisabled(true); this.status.setText('正在连接模型服务…');
    try { await this.hub.refresh(this.address.value); this.updateOptions(); }
    catch (error) { this.status.setText(`连接失败 · ${String(error)}`); }
    finally { this.refresh.setDisabled(false); }
  }
  open(): void {
    if (this.modal.visible) return;
    this.resume = this.game.started && !this.game.paused; this.epoch = this.game.presentationEpoch; this.game.pause(true);
    this.address.setValue(this.hub.endpoint); this.temperature.setValue(this.hub.parameters.temperature);
    this.temperatureLabel.setText(`温度 ${this.hub.parameters.temperature.toFixed(1)} · 0 保持稳定，增加多样性`); this.seedInput.setValue(String(this.hub.parameters.seed));
    this.updateOptions(); this.modal.show();
  }
  private finish(): void { if (this.resume && this.epoch === this.game.presentationEpoch) this.game.pause(false); this.resume = false; }
  close(): void { this.modal.close(); }
  get visible(): boolean { return this.modal.visible; }
  snapshot() { return { visible: this.visible, status: this.status.text, temperature: this.temperature.value, seed: this.seedInput.value, rect: { ...this.modal.dialogRect }, closeRect: { ...this.modal.cancelButton.rect }, refreshRect: { ...this.refresh.rect }, temperatureRect: { ...this.temperature.rect }, applyRect: { ...this.apply.rect }, addressRect: { ...this.address.rect }, selects: this.seats.map(s => ({ rect: { ...s.rect }, popupRect: { ...s.popupRect }, value: s.value, options: s.options, disabled: s.disabled })) }; }
}
