import { defineVirtualListComponents, type HYVirtualList, type HYVirtualListItemClickDetail, type HYVirtualListRangeChangeDetail } from '@haiyue/ui/virtual-list';
import { defineSelectComponents, HYSelect, type HYSelectOption } from '@haiyue/ui/select';
import { defineCheckboxComponents, HYCheckbox } from '@haiyue/ui/checkbox';
import { defineRangeComponents, HYRange } from '@haiyue/ui/range';
import { MugenImportFailure } from './import/diagnostics';
import { collectMugenInputsFromDirectoryHandle, collectMugenInputsFromFileList } from './import/vfs/browserDirectory';
import type { MugenVfsInput } from './import/vfs/MugenVfs';
import { createMugenImportWorkerClient, isMugenWorkerAbort, type MugenImportWorkerClient, type MugenWorkerImportResult } from './import/worker/MugenImportWorkerClient';
import type { MugenWorkerProgressReply } from './import/worker/protocol';
import { decodeMugenPackage } from './package/codec';
import {
  createMugenCharacterModel,
  discoverMugenCharacterDefCandidates,
  spriteReferenceResolver,
  type MugenCharacterModel,
  type MugenViewerAction,
} from './viewer/MugenCharacterModel';
import { firstDrawableTick, lastInspectableTick, MugenViewerController } from './viewer/MugenViewerController';
import { MugenViewerPreferenceStore } from './viewer/MugenViewerPreferences';
import { MugenWebGpuView, type MugenViewerBackground } from './viewer/MugenWebGpuView';
import { createMugenActionListItem, defineMugenActionListItem } from './viewer/MugenActionListItem';
import { MugenViewerAudio } from './viewer/MugenViewerAudio';

defineVirtualListComponents();
defineSelectComponents();
defineCheckboxComponents();
defineRangeComponents();
defineMugenActionListItem();

const VIEWER_BUILD_REVISION = '20260903-virtual-list-window-1';

class MugenCharacterViewerApp {
  readonly #view: MugenWebGpuView;
  readonly #preferences = new MugenViewerPreferenceStore();
  readonly #audio = new MugenViewerAudio();
  #worker: MugenImportWorkerClient | null = null;
  #activeImport: AbortController | null = null;
  #pendingInputs: readonly MugenVfsInput[] | null = null;
  #importGeneration = 0;
  #model: MugenCharacterModel | null = null;
  #controller: MugenViewerController | null = null;
  #spriteById: ReturnType<typeof spriteReferenceResolver> | null = null;
  #animationFrame: number | null = null;
  #lastFrameTime = performance.now();
  #zoom = 2;
  #panX = 0;
  #panY = 0;
  #drag: { pointerId: number; x: number; y: number } | null = null;
  #lastInspectorKey = '';
  #disposed = false;
  #longTaskObserver: PerformanceObserver | null = null;

  readonly #directoryInput = element<HTMLInputElement>('directory-input');
  readonly #fileButton = element<HTMLButtonElement>('file-button');
  readonly #pickerButton = element<HTMLButtonElement>('picker-button');
  readonly #cancelImportButton = element<HTMLButtonElement>('cancel-import');
  readonly #entryChoice = element<HTMLElement>('entry-choice');
  readonly #entrySelect = element<HYSelect>('entry-select');
  readonly #entryImport = element<HTMLButtonElement>('entry-import');
  readonly #importState = element<HTMLElement>('import-state');
  readonly #importProgress = element<HTMLElement>('import-progress');
  readonly #characterName = element<HTMLElement>('character-name');
  readonly #characterMeta = element<HTMLElement>('character-meta');
  readonly #summaryActions = element<HTMLElement>('summary-actions');
  readonly #summarySprites = element<HTMLElement>('summary-sprites');
  readonly #summaryUsed = element<HTMLElement>('summary-used');
  readonly #summaryPalettes = element<HTMLElement>('summary-palettes');
  readonly #actionSearch = element<HTMLInputElement>('action-search');
  readonly #actionFilter = element<HYSelect>('action-filter');
  readonly #actionList = element<HYVirtualList<MugenViewerAction>>('action-list');
  readonly #catalogCount = element<HTMLElement>('catalog-count');
  readonly #dropHint = element<HTMLElement>('drop-hint');
  readonly #visualNotice = element<HTMLElement>('visual-notice');
  readonly #frameBadge = element<HTMLElement>('frame-badge');
  readonly #gpuBadge = element<HTMLElement>('gpu-badge');
  readonly #playToggle = element<HTMLButtonElement>('play-toggle');
  readonly #timeline = element<HYRange>('timeline');
  readonly #tickValue = element<HTMLElement>('tick-value');
  readonly #tickLimit = element<HTMLElement>('tick-limit');
  readonly #loopToggle = element<HYCheckbox>('loop-toggle');
  readonly #speedSelect = element<HYSelect>('speed-select');
  readonly #volumeControl = element<HYRange>('volume-control');
  readonly #volumeValue = element<HTMLElement>('volume-value');
  readonly #audioStatus = element<HTMLElement>('audio-status');
  readonly #zoomValue = element<HTMLElement>('zoom-value');
  readonly #paletteSelect = element<HYSelect>('palette-select');
  readonly #backgroundSelect = element<HYSelect>('background-select');
  readonly #frameDetails = element<HTMLElement>('frame-details');
  readonly #actionLabel = element<HTMLElement>('action-label');
  readonly #diagnostics = element<HTMLElement>('diagnostics');
  readonly #diagnosticCount = element<HTMLElement>('diagnostic-count');

  constructor() {
    const canvas = element<HTMLCanvasElement>('viewer-canvas');
    const overlay = element<HTMLCanvasElement>('debug-canvas');
    const stage = element<HTMLElement>('viewer-stage');
    this.#view = new MugenWebGpuView(canvas, overlay, stage, error => this.#showError(error));
    this.#actionList.renderItem = action => createMugenActionListItem(action, action.id === this.#controller?.selected.id);
    replaceOptions(this.#actionFilter, [
      { value: 'all', label: '全部动作' }, { value: 'loop', label: '带 LoopStart' },
      { value: 'audio', label: '携带音频' }, { value: 'infinite', label: '无限末帧' },
      { value: 'collision', label: '含碰撞框' }, { value: 'drawable', label: '完整可显示' },
      { value: 'blank', label: '逻辑空动作' }, { value: 'missing', label: '当前 SFF 无素材' }, { value: 'warning', label: '有警告' },
    ]);
    replaceOptions(this.#speedSelect, [
      { value: '0.25', label: '0.25×' }, { value: '0.5', label: '0.5×' }, { value: '1', label: '1×' },
      { value: '2', label: '2×' }, { value: '4', label: '4×' },
    ]); this.#speedSelect.value = '1';
    replaceOptions(this.#paletteSelect, [{ value: '', label: '自动' }]);
    replaceOptions(this.#backgroundSelect, [{ value: 'checker', label: '棋盘' }, { value: 'dark', label: '深色' }, { value: 'light', label: '浅色' }]);
    this.#backgroundSelect.value = 'checker';
    this.#audio.setVolume(this.#volumeControl.value / 100);
  }

  async init(): Promise<void> {
    document.body.dataset.viewerRevision = VIEWER_BUILD_REVISION;
    console.info('[MUGEN viewer] Preview initialized.', { revision: VIEWER_BUILD_REVISION, moduleUrl: import.meta.url });
    this.#worker = createMugenImportWorkerClient({ workerUrl: revisionedWorkerUrl(), onProgress: progress => this.#showProgress(progress) });
    this.#bindImportControls();
    this.#bindCatalogControls();
    this.#bindPlaybackControls();
    this.#bindViewportControls();
    this.#bindBrowserVerificationControls();
    await this.#restorePreferences();
    try {
      await this.#view.init();
      this.#gpuBadge.textContent = 'WEBGPU READY';
      document.body.dataset.gpuAdapter = this.#view.adapterDescription;
      document.body.dataset.deviceGeneration = String(this.#view.deviceGeneration);
      document.body.dataset.gpuStatus = 'ready';
    } catch (error) {
      document.body.dataset.gpuStatus = 'error';
      this.#gpuBadge.textContent = 'WEBGPU UNAVAILABLE';
      console.error('[MUGEN viewer] WebGPU initialization failed; action parsing remains available.', error);
      this.#importState.textContent = 'WebGPU 初始化失败，仍可导入并查看 action 列表';
    }
    document.body.dataset.renderStatus = 'ready';
    this.#animationFrame = requestAnimationFrame(time => this.#frame(time));
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#activeImport?.abort(); this.#activeImport = null;
    this.#worker?.dispose(); this.#worker = null;
    if (this.#animationFrame !== null) cancelAnimationFrame(this.#animationFrame);
    this.#animationFrame = null;
    this.#view.dispose();
    this.#audio.dispose();
    void this.#preferences.flush();
    this.#longTaskObserver?.disconnect(); this.#longTaskObserver = null;
    this.#pendingInputs = null; this.#model = null; this.#controller = null; this.#spriteById = null;
  }

  #bindImportControls(): void {
    this.#fileButton.addEventListener('click', () => { void this.#audio.unlock(); this.#directoryInput.click(); });
    this.#directoryInput.addEventListener('change', () => {
      const files = this.#directoryInput.files;
      if (!files || files.length === 0) return;
      void this.#collectFiles(files);
      this.#directoryInput.value = '';
    });
    const pickerWindow = window as Window & { showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle> };
    if (!pickerWindow.showDirectoryPicker) this.#pickerButton.hidden = true;
    this.#pickerButton.addEventListener('click', () => {
      void this.#audio.unlock();
      void (async () => {
        try {
          const handle = await pickerWindow.showDirectoryPicker?.();
          if (handle) this.#prepareInputs(await collectMugenInputsFromDirectoryHandle(handle));
        } catch (error) {
          if (!isPickerCancel(error)) this.#showError(error);
        }
      })();
    });
    this.#cancelImportButton.addEventListener('click', () => this.#cancelImport());
    this.#entryImport.addEventListener('click', () => {
      if (this.#pendingInputs) void this.#startImport(this.#pendingInputs, this.#entrySelect.value);
    });
  }

  #bindCatalogControls(): void {
    this.#actionSearch.addEventListener('input', () => this.#renderActionCatalog());
    this.#actionFilter.addEventListener('value-change', () => this.#renderActionCatalog());
    this.#actionList.addEventListener('item-click', event => {
      void this.#audio.unlock();
      const action = (event as CustomEvent<HYVirtualListItemClickDetail<MugenViewerAction>>).detail.item;
      if (this.#model?.actions.includes(action)) this.#selectAction(action);
    });
    this.#actionList.addEventListener('visible-range-change', event => {
      const detail = (event as CustomEvent<HYVirtualListRangeChangeDetail>).detail;
      if (detail.total > 0 && detail.renderedCount === 0) {
        console.error('[MUGEN viewer] Virtual action window became empty.', {
          detail,
          itemCount: this.#actionList.items.length,
          connected: this.#actionList.isConnected,
          bounds: this.#actionList.getBoundingClientRect().toJSON(),
        });
      }
    });
  }

  #bindPlaybackControls(): void {
    this.#playToggle.addEventListener('click', () => { void this.#togglePlayback(); });
    element<HTMLButtonElement>('go-first').addEventListener('click', () => { this.#controller?.first(); this.#stopPreviewAudio(); this.#syncTransport(); });
    element<HTMLButtonElement>('go-last').addEventListener('click', () => { this.#controller?.last(); this.#stopPreviewAudio(); this.#syncTransport(); });
    element<HTMLButtonElement>('previous-tick').addEventListener('click', () => { this.#controller?.stepTick(-1); this.#stopPreviewAudio(); this.#syncTransport(); });
    element<HTMLButtonElement>('next-tick').addEventListener('click', () => { this.#controller?.stepTick(1); this.#stopPreviewAudio(); this.#syncTransport(); });
    element<HTMLButtonElement>('previous-element').addEventListener('click', () => { this.#controller?.stepElement(-1); this.#stopPreviewAudio(); this.#syncTransport(); });
    element<HTMLButtonElement>('next-element').addEventListener('click', () => { this.#controller?.stepElement(1); this.#stopPreviewAudio(); this.#syncTransport(); });
    this.#timeline.addEventListener('value-input', () => { this.#controller?.seek(this.#timeline.value); this.#stopPreviewAudio(); this.#syncTransport(); });
    this.#loopToggle.addEventListener('change', () => { this.#controller?.setLoop(this.#loopToggle.checked); this.#syncTransport(); });
    this.#loopToggle.addEventListener('change', () => this.#savePreferences());
    this.#speedSelect.addEventListener('value-change', () => { this.#controller?.setSpeed(Number(this.#speedSelect.value)); this.#savePreferences(); });
    this.#volumeControl.addEventListener('value-input', () => this.#setVolume(this.#volumeControl.value));
    this.#volumeControl.addEventListener('value-change', () => { this.#setVolume(this.#volumeControl.value); this.#savePreferences(); });
    document.addEventListener('keydown', event => {
      if (event.code === 'Space' && !isInteractiveControl(event.target)) { event.preventDefault(); void this.#togglePlayback(); }
    });
  }

  #bindViewportControls(): void {
    const overlay = this.#view.overlay;
    overlay.addEventListener('pointerdown', event => { overlay.setPointerCapture(event.pointerId); this.#drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY }; });
    overlay.addEventListener('pointermove', event => {
      if (!this.#drag || this.#drag.pointerId !== event.pointerId) return;
      this.#panX += event.clientX - this.#drag.x; this.#panY += event.clientY - this.#drag.y;
      this.#drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    });
    const stopDrag = (event: PointerEvent) => { if (this.#drag?.pointerId === event.pointerId) this.#drag = null; };
    overlay.addEventListener('pointerup', stopDrag); overlay.addEventListener('pointercancel', stopDrag);
    overlay.addEventListener('wheel', event => {
      event.preventDefault();
      this.#zoom = Math.max(0.1, Math.min(16, this.#zoom * Math.exp(-event.deltaY * 0.001)));
      this.#zoomValue.textContent = `${Math.round(this.#zoom * 100)}%`;
    }, { passive: false });
    element<HTMLButtonElement>('reset-view').addEventListener('click', () => { this.#zoom = 2; this.#panX = 0; this.#panY = 0; this.#zoomValue.textContent = '200%'; });
    this.#backgroundSelect.addEventListener('value-change', () => this.#savePreferences());
    for (const id of ['debug-origin', 'debug-axis', 'debug-bounds', 'debug-clsn1', 'debug-clsn2']) {
      element<HYCheckbox>(id).addEventListener('change', () => this.#savePreferences());
    }
  }

  async #collectFiles(files: FileList): Promise<void> {
    try {
      const inputs = await collectMugenInputsFromFileList(files);
      console.info('[MUGEN viewer] Character directory collected.', { files: inputs.length });
      this.#prepareInputs(inputs);
    }
    catch (error) { this.#showError(error); }
  }

  #prepareInputs(inputs: readonly MugenVfsInput[]): void {
    const candidates = discoverMugenCharacterDefCandidates(inputs);
    console.info('[MUGEN viewer] Character entry candidates discovered.', { files: inputs.length, candidates });
    if (candidates.length === 0) { this.#showError(new Error('所选目录中没有找到角色 DEF 文件。')); return; }
    this.#pendingInputs = inputs;
    replaceOptions(this.#entrySelect, candidates.map(path => ({ value: path, label: path })));
    if (candidates.length > 1) {
      this.#entryChoice.hidden = false;
      this.#importState.textContent = `请选择 ${candidates.length} 个候选入口之一`;
      return;
    }
    this.#entryChoice.hidden = true;
    void this.#startImport(inputs, candidates[0]!);
  }

  async #startImport(inputs: readonly MugenVfsInput[], entryDef: string): Promise<void> {
    if (!this.#worker) {
      this.#showError(new Error('MUGEN 导入 Worker 尚未初始化。'));
      return;
    }
    this.#cancelImport(false);
    const generation = ++this.#importGeneration;
    const abortController = new AbortController();
    this.#activeImport = abortController;
    this.#entryChoice.hidden = true;
    this.#cancelImportButton.hidden = false;
    this.#importProgress.hidden = false;
    this.#setProgress(0.02);
    this.#importState.textContent = `正在读取 ${entryDef}`;
    console.info('[MUGEN viewer] Character import started.', { revision: VIEWER_BUILD_REVISION, entryDef, files: inputs.length, generation });
    try {
      const result: MugenWorkerImportResult = await this.#worker.import(inputs, { contentRole: 'local-content', entryKind: 'character', entryDef, scriptProfile: 'none' }, abortController.signal);
      if (generation !== this.#importGeneration) return;
      this.#importState.textContent = '正在验证确定性资源包'; this.#setProgress(0.86);
      const decoded = await decodeMugenPackage(result.packageBytes);
      if (generation !== this.#importGeneration) return;
      const model = createMugenCharacterModel(decoded.package, result.metadata, { viewerAudioCues: result.viewerAudioCues });
      console.info('[MUGEN viewer] Character model decoded.', {
        entryDef: model.metadata.entryDef,
        actions: model.actions.length,
        sprites: model.sprites.length,
        palettes: model.palettes.length,
        audioCues: result.viewerAudioCues.length,
      });
      this.#audio.reset();
      this.#model = model;
      this.#controller = new MugenViewerController(requireFirstAction(model));
      this.#controller.setLoop(this.#loopToggle.checked);
      this.#controller.setSpeed(Number(this.#speedSelect.value));
      this.#spriteById = spriteReferenceResolver(model);
      this.#pendingInputs = null;
      this.#resetViewForModel(model);
      this.#renderModel(result.packageSha256);
      this.#dropHint.hidden = true;
      this.#importState.textContent = '动作目录已就绪，正在上传 WebGPU atlas'; this.#setProgress(0.92);
      const stats = await this.#view.install(model, abortController.signal);
      if (generation !== this.#importGeneration) return;
      this.#actionList.refresh();
      this.#verifyActionCatalog('gpu-atlas-installed');
      this.#gpuBadge.textContent = `${stats.pageCount} ATLAS · ${formatBytes(stats.gpuBytes)}`;
      console.info('[MUGEN viewer] WebGPU atlas installed.', stats);
      this.#importState.textContent = '导入完成'; this.#setProgress(1);
      this.#lastInspectorKey = '';
    } catch (error) {
      if (generation !== this.#importGeneration) return;
      if (isMugenWorkerAbort(error) || abortController.signal.aborted) {
        this.#importState.textContent = this.#model ? '导入已取消，保留上一角色' : '导入已取消';
      } else this.#showError(error);
    } finally {
      if (generation === this.#importGeneration) {
        this.#activeImport = null; this.#cancelImportButton.hidden = true;
        setTimeout(() => { if (!this.#activeImport) this.#importProgress.hidden = true; }, 400);
      }
    }
  }

  #cancelImport(increment = true): void {
    if (increment) this.#importGeneration++;
    this.#activeImport?.abort(); this.#activeImport = null;
    this.#cancelImportButton.hidden = true;
  }

  #showProgress(progress: MugenWorkerProgressReply): void {
    const phases = { receive: [0.03, 0.48], vfs: [0.48, 0.58], parse: [0.58, 0.8], package: [0.8, 0.86] } as const;
    const range = phases[progress.phase];
    const portion = progress.total <= 0 ? 0 : Math.min(1, progress.completed / progress.total);
    this.#setProgress(range[0] + (range[1] - range[0]) * portion);
    this.#importState.textContent = ({ receive: '传输本地文件', vfs: '建立只读文件系统', parse: '解析角色素材', package: '生成确定性资源包' } as const)[progress.phase];
  }

  #setProgress(value: number): void { const bar = this.#importProgress.querySelector<HTMLElement>('span'); if (bar) bar.style.width = `${Math.round(value * 100)}%`; }

  #renderModel(packageSha256: string): void {
    const model = this.#model!;
    const title = model.metadata.displayName ?? model.metadata.name ?? model.metadata.entryDef;
    this.#characterName.textContent = title;
    this.#characterMeta.textContent = [model.metadata.author ? `作者 ${model.metadata.author}` : null, model.metadata.mugenVersion ? `MUGEN ${model.metadata.mugenVersion}` : null, model.metadata.localCoord ? `${model.metadata.localCoord[0]}×${model.metadata.localCoord[1]}` : null].filter(Boolean).join(' · ') || model.metadata.entryDef;
    this.#summaryActions.textContent = String(model.actions.length);
    this.#summarySprites.textContent = String(model.sprites.length);
    this.#summaryUsed.textContent = String(model.referencedSpriteCount);
    this.#summaryPalettes.textContent = String(model.palettes.length);
    replaceOptions(this.#paletteSelect, [{ value: '', label: '自动（Sprite 默认）' }, ...model.palettes.map(palette => ({ value: palette.id, label: `${palette.group},${palette.item} · ${palette.sourcePath}` }))]);
    this.#renderActionCatalog();
    this.#renderDiagnostics(packageSha256);
    this.#selectAction(this.#controller!.selected);
  }

  #renderActionCatalog(): void {
    if (!this.#model) return;
    const query = this.#actionSearch.value.trim().toLocaleLowerCase('zh-CN');
    const filter = this.#actionFilter.value;
    const actions = this.#model.actions.filter(value => {
      const searchable = `${value.action.number} ${value.label ?? ''} ${value.sourcePath}`.toLocaleLowerCase('zh-CN');
      if (query && !searchable.includes(query)) return false;
      if (filter === 'loop' && value.action.loopStart === 0) return false;
      if (filter === 'audio' && value.audioCues.length === 0) return false;
      if (filter === 'infinite' && value.action.totalTicks !== null) return false;
      if (filter === 'collision' && value.clsn1Count + value.clsn2Count === 0) return false;
      if (filter === 'drawable' && value.visualStatus !== 'drawable') return false;
      if (filter === 'blank' && value.visualStatus !== 'blank') return false;
      if (filter === 'missing' && value.visualStatus !== 'missing' && value.visualStatus !== 'partial') return false;
      if (filter === 'warning' && value.warningCount === 0) return false;
      return true;
    });
    this.#catalogCount.textContent = `${actions.length} / ${this.#model.actions.length}`;
    const emptyState = this.#actionList.querySelector<HTMLElement>('[slot="empty"]');
    if (emptyState) emptyState.textContent = actions.length === 0 ? '没有匹配的 action' : '载入角色后显示 AIR actions';
    this.#actionList.items = actions;
    // Force the current window to be rebuilt after the catalog changes. This
    // also recovers when the list's first layout measurement was zero-sized.
    this.#actionList.refresh();
    requestAnimationFrame(() => this.#verifyActionCatalog('catalog-animation-frame'));
  }

  #verifyActionCatalog(stage: string): void {
    const itemCount = this.#actionList.items.length;
    const renderedRows = this.#actionList.shadowRoot?.querySelectorAll('[data-hy-virtual-list-generated]').length ?? 0;
    if (itemCount === 0 || renderedRows > 0) return;
    console.error('[MUGEN viewer] Action data exists but the virtual window has no rows.', {
      stage,
      itemCount,
      renderedRows,
      connected: this.#actionList.isConnected,
      bounds: this.#actionList.getBoundingClientRect().toJSON(),
    });
    this.#actionList.refresh();
  }

  #selectAction(action: MugenViewerAction): void {
    if (!this.#controller) return;
    this.#controller.select(action);
    const firstVisible = firstDrawableTick(action); if (action.visualStatus === 'partial' && firstVisible !== null && firstVisible > 0) this.#controller.seek(firstVisible);
    this.#audio.select(action, this.#controller.playing);
    this.#actionLabel.textContent = action.label ?? '自定义动作';
    this.#audioStatus.textContent = action.audioCues.length === 0 ? '未关联音频' : `${action.audioCues.length} 个音频触发`;
    this.#audioStatus.classList.toggle('available', action.audioCues.length > 0);
    this.#syncTransport();
    this.#syncVisualNotice(action);
    this.#lastInspectorKey = '';
  }

  #syncTransport(): void {
    const controller = this.#controller;
    if (!controller) return;
    const inspectable = lastInspectableTick(controller.selected);
    const maximum = controller.selected.action.totalTicks === null ? Math.max(inspectable + 300, controller.tick) : inspectable;
    this.#timeline.max = Math.max(1, maximum);
    this.#timeline.value = Math.min(controller.displayTick, maximum);
    this.#tickValue.textContent = String(controller.displayTick);
    this.#tickLimit.textContent = controller.selected.action.totalTicks === null ? `${inspectable}+∞ tick` : `${controller.selected.action.totalTicks} ticks`;
    this.#playToggle.textContent = controller.playing ? '暂停' : '播放';
    this.#loopToggle.checked = controller.loop;
  }

  #renderDiagnostics(packageSha256: string): void {
    const model = this.#model!;
    const diagnostics = model.diagnostics;
    this.#diagnosticCount.textContent = `${diagnostics.length} diagnostics`;
    this.#diagnostics.replaceChildren();
    const facts = document.createElement('div'); facts.className = 'diagnostic';
    const blankActions = model.actions.filter(action => action.visualStatus === 'blank').length; const missingActions = model.actions.filter(action => action.visualStatus === 'missing').length; const partialActions = model.actions.filter(action => action.visualStatus === 'partial').length;
    facts.textContent = `入口 ${model.metadata.entryDef} · 依赖 ${model.metadata.dependencies.length} · SHA ${packageSha256.slice(0, 12)}… · 逻辑空动作 ${blankActions} · 完全缺图 ${missingActions} · 部分缺帧 ${partialActions} · 缺失 sprite 引用 ${model.missingSpriteReferenceCount}`;
    this.#diagnostics.append(facts);
    for (const diagnostic of diagnostics) {
      const item = document.createElement('div'); item.className = `diagnostic ${diagnostic.severity}`;
      const code = document.createElement('code'); code.textContent = diagnostic.code;
      item.append(code, document.createTextNode(` ${diagnostic.message}${diagnostic.canonicalPath ? ` · ${diagnostic.canonicalPath}:${diagnostic.line ?? 1}` : ''}`));
      this.#diagnostics.append(item);
    }
  }

  #frame(time: number): void {
    if (this.#disposed) return;
    const elapsed = Math.max(0, (time - this.#lastFrameTime) / 1000); this.#lastFrameTime = time;
    const model = this.#model; const controller = this.#controller;
    if (model && controller && this.#spriteById) {
      try {
        const previousTick = controller.tick;
        const advanced = controller.advanceSeconds(elapsed);
        if (advanced > 0) this.#audio.advance(controller.selected, previousTick, controller.tick);
        const viewport = this.#view.resize();
        const originX = viewport.width / 2 + this.#panX * viewport.devicePixelRatio;
        const originY = viewport.height * 0.72 + this.#panY * viewport.devicePixelRatio;
        const snapshot = controller.snapshot({ x: originX, y: originY, coordinateScale: this.#zoom * viewport.devicePixelRatio, spriteById: this.#spriteById });
        if (this.#view.model === model) {
          this.#view.render(snapshot, {
            background: this.#backgroundSelect.value as MugenViewerBackground,
            paletteId: this.#paletteSelect.value || null,
            originX, originY,
            debug: {
              origin: checked('debug-origin'), axis: checked('debug-axis'), spriteBounds: checked('debug-bounds'),
              clsn1: checked('debug-clsn1'), clsn2: checked('debug-clsn2'),
            },
          });
        }
        this.#updateInspector(snapshot, controller.displayTick);
        this.#syncTransport();
      } catch (error) {
        controller.setPlaying(false); this.#showError(error);
      }
    }
    this.#animationFrame = requestAnimationFrame(next => this.#frame(next));
  }

  #updateInspector(snapshot: ReturnType<MugenViewerController['snapshot']>, displayTick: number): void {
    const key = `${snapshot.actionNumber}:${snapshot.frameIndex}:${snapshot.frameTick}:${displayTick}:${this.#paletteSelect.value}`;
    if (key === this.#lastInspectorKey) return;
    this.#lastInspectorKey = key;
    const elementValue = snapshot.element;
    this.#frameBadge.textContent = `ACTION ${snapshot.actionNumber} · ELEMENT ${snapshot.frameIndex} · TICK ${displayTick}`;
    this.#syncVisualNotice(this.#controller!.selected, snapshot);
    const blend = snapshot.render.blend;
    replaceDetails(this.#frameDetails, [
      ['Sprite', `${elementValue.spriteGroup},${elementValue.spriteItem}${snapshot.render.missingSprite ? ' · MISSING' : ''}`],
      ['Duration', elementValue.durationTicks === -1 ? '∞ (time = -1)' : `${elementValue.durationTicks} ticks · frame ${snapshot.frameTick}`],
      ['Offset', `${elementValue.offsetX}, ${elementValue.offsetY}`],
      ['Flip', `${snapshot.render.flipX ? 'H' : '—'} / ${snapshot.render.flipY ? 'V' : '—'}`],
      ['Scale', `${formatNumber(elementValue.scaleX)} × ${formatNumber(elementValue.scaleY)}`],
      ['Angle', `${formatNumber(elementValue.angleDegrees)}°`],
      ['Blend', `${blend.mode} · S${formatNumber(blend.sourceAlpha)} D${formatNumber(blend.destinationAlpha)}`],
      ['Collision', `Clsn1 ${snapshot.clsn1.length} · Clsn2 ${snapshot.clsn2.length}`],
      ['Palette', selectedLabel(this.#paletteSelect) || '自动'],
    ]);
  }

  #syncVisualNotice(action: MugenViewerAction, snapshot?: ReturnType<MugenViewerController['snapshot']>): void {
    const currentMissing = snapshot?.render.missingSprite === true;
    if (action.visualStatus === 'blank') { this.#visualNotice.dataset.kind = 'blank'; this.#visualNotice.textContent = '这是合法的逻辑空动作：AIR 只保留碰撞框、占位或控制时序，因此没有角色画面。'; this.#visualNotice.hidden = false; return; }
    if (action.visualStatus === 'missing' || currentMissing) { const element = snapshot?.element ?? action.action.elements.find(value => value.spriteGroup !== -1 && value.spriteItem !== -1 && value.spriteId === null); this.#visualNotice.dataset.kind = 'missing'; this.#visualNotice.textContent = `当前角色的 SFF 中没有精灵 ${element === undefined ? '引用' : `${element.spriteGroup},${element.spriteItem}`}。它可能是为 ChangeAnim2 跨角色动作预留的引用，也可能是角色包残留的缺图；不是 WebGPU 渲染失败。`; this.#visualNotice.hidden = false; return; }
    this.#visualNotice.hidden = true; delete this.#visualNotice.dataset.kind;
  }

  #resetViewForModel(model: MugenCharacterModel): void {
    const localWidth = model.metadata.localCoord?.[0] ?? 320;
    this.#zoom = Math.max(0.5, Math.min(3, 640 / localWidth)); this.#panX = 0; this.#panY = 0;
    this.#zoomValue.textContent = `${Math.round(this.#zoom * 100)}%`;
  }

  #showError(error: unknown): void {
    const diagnostics = error instanceof MugenImportFailure ? error.diagnostics : [];
    console.error('[MUGEN viewer] Operation failed.', error, diagnostics);
    this.#importState.textContent = diagnostics[0]?.message ?? (error instanceof Error ? error.message : String(error));
    this.#diagnosticCount.textContent = `${Math.max(1, diagnostics.length)} diagnostics`;
    this.#diagnostics.replaceChildren();
    for (const diagnostic of diagnostics) {
      const item = document.createElement('div'); item.className = `diagnostic ${diagnostic.severity}`;
      item.textContent = `${diagnostic.code} · ${diagnostic.message}`; this.#diagnostics.append(item);
    }
    if (diagnostics.length === 0) { const item = document.createElement('div'); item.className = 'diagnostic error'; item.textContent = error instanceof Error ? error.message : String(error); this.#diagnostics.append(item); }
  }

  async #restorePreferences(): Promise<void> {
    const value = await this.#preferences.load();
    if (!value) return;
    this.#backgroundSelect.value = value.background;
    this.#loopToggle.checked = value.loop;
    this.#speedSelect.value = String(value.speed);
    this.#setVolume((value.volume ?? 0.8) * 100);
    element<HYCheckbox>('debug-origin').checked = value.origin;
    element<HYCheckbox>('debug-axis').checked = value.axis;
    element<HYCheckbox>('debug-bounds').checked = value.spriteBounds;
    element<HYCheckbox>('debug-clsn1').checked = value.clsn1;
    element<HYCheckbox>('debug-clsn2').checked = value.clsn2;
  }

  #savePreferences(): void {
    this.#preferences.save({
      background: this.#backgroundSelect.value as MugenViewerBackground,
      loop: this.#loopToggle.checked,
      speed: Number(this.#speedSelect.value),
      volume: this.#volumeControl.value / 100,
      origin: checked('debug-origin'),
      axis: checked('debug-axis'),
      spriteBounds: checked('debug-bounds'),
      clsn1: checked('debug-clsn1'),
      clsn2: checked('debug-clsn2'),
    });
  }

  async #togglePlayback(): Promise<void> {
    const controller = this.#controller; if (!controller) return;
    controller.togglePlaying();
    const playing = controller.playing;
    await this.#audio.setPlaying(playing);
    if (this.#controller !== controller || controller.playing !== playing) return;
    if (playing && controller.tick === 0) this.#audio.playAtTick(controller.selected, 0);
    this.#syncTransport();
  }

  #stopPreviewAudio(): void { this.#audio.stop(); if (this.#controller) this.#audio.select(this.#controller.selected, false); }

  #setVolume(percent: number): void {
    const normalized = Math.max(0, Math.min(100, Math.round(percent)));
    this.#volumeControl.value = normalized;
    this.#volumeValue.textContent = `${normalized}%`;
    this.#audio.setVolume(normalized / 100);
  }

  #bindBrowserVerificationControls(): void {
    const button = element<HTMLButtonElement>('device-loss-test');
    if (new URLSearchParams(location.search).get('verify') !== '1') return;
    document.body.dataset.longTaskCount = '0';
    document.body.dataset.longTaskMaxMs = '0';
    if (PerformanceObserver.supportedEntryTypes.includes('longtask')) {
      this.#longTaskObserver = new PerformanceObserver(list => {
        const entries = list.getEntries();
        const count = Number(document.body.dataset.longTaskCount ?? 0) + entries.length;
        const maximum = Math.max(Number(document.body.dataset.longTaskMaxMs ?? 0), ...entries.map(entry => entry.duration));
        document.body.dataset.longTaskCount = String(count);
        document.body.dataset.longTaskMaxMs = maximum.toFixed(3);
      });
      this.#longTaskObserver.observe({ entryTypes: ['longtask'] });
    }
    button.hidden = false;
    button.addEventListener('click', () => {
      void (async () => {
        button.disabled = true;
        this.#gpuBadge.textContent = 'DEVICE RECOVERING';
        try {
          const generation = await this.#view.forceDeviceLossForTesting();
          this.#gpuBadge.textContent = `WEBGPU RECOVERED · G${generation}`;
          document.body.dataset.gpuAdapter = this.#view.adapterDescription;
          document.body.dataset.deviceGeneration = String(generation);
        } catch (error) { this.#showError(error); }
        finally { button.disabled = false; }
      })();
    });
  }
}

function checked(id: string): boolean { return element<HYCheckbox>(id).checked; }
function requireFirstAction(model: MugenCharacterModel): MugenViewerAction { const action = model.actions[0]; if (!action) throw new Error('角色 AIR 没有可查看的 action。'); return action; }
function formatNumber(value: number): string { return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/0+$/, '').replace(/\.$/, ''); }
function formatBytes(value: number): string { return value < 1024 * 1024 ? `${Math.ceil(value / 1024)} KiB` : `${(value / 1024 / 1024).toFixed(1)} MiB`; }
function isPickerCancel(error: unknown): boolean { return error instanceof DOMException && (error.name === 'AbortError' || error.name === 'NotAllowedError'); }

function replaceOptions(select: HYSelect, values: readonly HYSelectOption[]): void { select.options = values.map(value => ({ ...value })); if (!values.some(value => value.value === select.value)) select.value = values[0]?.value ?? ''; }
function selectedLabel(select: HYSelect): string { return select.options.find(value => value.value === select.value)?.label ?? ''; }
function isInteractiveControl(value: EventTarget | null): boolean { return value instanceof HTMLInputElement || value instanceof HTMLButtonElement || value instanceof HYSelect || value instanceof HYCheckbox || value instanceof HYRange; }
function revisionedWorkerUrl(): URL { const url = new URL('./mugenImport.worker.js', import.meta.url); url.searchParams.set('v', VIEWER_BUILD_REVISION); return url; }

function replaceDetails(container: HTMLElement, values: readonly (readonly [string, string])[]): void {
  const fragment = document.createDocumentFragment();
  for (const [label, value] of values) { const row = document.createElement('div'); const term = document.createElement('dt'); const detail = document.createElement('dd'); term.textContent = label; detail.textContent = value; row.append(term, detail); fragment.append(row); }
  container.replaceChildren(fragment);
}

function element<T extends HTMLElement>(id: string): T { const value = document.getElementById(id); if (!value) throw new Error(`Missing MUGEN viewer element #${id}.`); return value as T; }

const app = new MugenCharacterViewerApp();
void app.init().catch(error => {
  console.error('[MUGEN viewer] Preview initialization failed.', error);
  document.body.dataset.renderStatus = 'error';
  element<HTMLElement>('import-state').textContent = error instanceof Error ? error.message : String(error);
});
window.addEventListener('pagehide', () => app.dispose(), { once: true });
