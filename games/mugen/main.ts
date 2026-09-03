import { evaluateMugenAirAction } from './import/air/MugenAirRuntime';
import { createMugenImportWorkerClient, type MugenImportWorkerClient } from './import/worker/MugenImportWorkerClient';
import { MugenAfterImageHistory, type MugenAfterImageSource, type MugenAfterImageTrail } from './game/MugenAfterImageHistory';
import { loadMugenBuiltInGameFixtures, type MugenBuiltInGameFixture } from './game/MugenGameFixture';
import { MugenTransientAnimationLifecycle, type MugenTransientAnimationFrame, type MugenTransientAnimationSpawn } from './game/MugenTransientAnimationLifecycle';
import { MugenGameAudio } from './game/MugenGameAudio';
import { MugenBrowserOutput } from './game/MugenBrowserOutput';
import { applyMugenOutputTransform } from './game/MugenOutputRender';
import { loadMugenFightFx, loadMugenFightFxFromDirectoryHandle, loadMugenFightFxFromFileList, type MugenFightFxModel } from './game/MugenFightFx';
import { assignMugenKey, createMugenBrowserPlayerBindings, loadMugenKeyBindings, MUGEN_BINDABLE_ACTIONS, MUGEN_DEFAULT_KEY_BINDINGS, mugenKeyLabel, saveMugenKeyBindings, type MugenBindableAction, type MugenBindingPlayer, type MugenKeyBindings } from './game/MugenKeyBindings';
import { loadMugenStageFixture, type MugenStageFixture } from './game/MugenStageFixture';
import { MugenCombatRuntime } from './runtime/combat/MugenCombatRuntime';
import { MugenFixedStepInputDriver, MugenLegacyAiInput } from './runtime/input/index';
import { MugenHeadlessMatch, type MugenMatchConfig, type MugenMatchEvent, type MugenMatchSnapshot } from './runtime/match/MugenMatchState';
import { MugenScriptRuntime } from './runtime/script/MugenScriptRuntime';
import { mugenAfterImageColorMatrix, mugenPaletteColorMatrix, mugenShakeOffset, type MugenEntityOutputState, type MugenOutputAuthoritySnapshot } from './runtime/effects/MugenOutputAuthority';
import { MugenWebGpuView, type MugenViewerActorFrame } from './viewer/MugenWebGpuView';

type MugenRenderLayer = 'below' | 'fighters' | 'above';
interface MugenAfterImagePose {
  readonly animationOwnerId: string | 'fight';
  readonly animationNumber: number;
  readonly actionTime: number;
  readonly position: readonly [number, number];
  readonly facing: -1 | 1;
  readonly verticalFacing: -1 | 1;
  readonly coordinateSpace: 'stage' | 'screen';
  readonly localCoordWidth: number;
  readonly localCoordHeight: number;
  readonly layer: MugenRenderLayer;
  readonly order: number;
  readonly paletteId: string | null;
  readonly output: MugenEntityOutputState;
}
const AFTER_IMAGE_BROWSER_VERIFICATION_EFFECT = Object.freeze({ remainingTicks: 2, length: 8, paletteColor: 256, paletteInvertAll: false, paletteBright: Object.freeze([30, 10, 0]) as readonly [number, number, number], paletteContrast: Object.freeze([180, 120, 60]) as readonly [number, number, number], palettePostBright: Object.freeze([0, 0, 0]) as readonly [number, number, number], paletteAdd: Object.freeze([-8, -4, 0]) as readonly [number, number, number], paletteMultiply: Object.freeze([.9, .8, .7]) as readonly [number, number, number], timeGap: 1, frameGap: 2, transparency: 'add' as const });

class MugenFightApp {
  readonly #view: MugenWebGpuView;
  #driver: MugenFixedStepInputDriver;
  readonly #worker: MugenImportWorkerClient;
  readonly #audio = new MugenGameAudio();
  readonly #outputs = new MugenBrowserOutput();
  readonly #afterImages = new MugenAfterImageHistory<MugenAfterImagePose>();
  readonly #transientAnimations = new MugenTransientAnimationLifecycle();
  #keyBindings = loadMugenKeyBindings();
  #draftKeyBindings = this.#keyBindings;
  #capturingBinding: Readonly<{ player: MugenBindingPlayer; action: MugenBindableAction }> | null = null;
  #resumeAfterKeySettings = false;
  #fixtures = new Map<string, MugenBuiltInGameFixture>();
  #stageFixture: MugenStageFixture | null = null;
  #fightFx: MugenFightFxModel | null = null;
  #fightFxVerificationActor = false;
  #match: MugenHeadlessMatch | null = null;
  #combat: MugenCombatRuntime | null = null;
  #animationFrame: number | null = null;
  #lastFrameTime = performance.now();
  #running = false;
  #paused = false;
  #disposed = false;
  readonly #verifyAfterImage = new URLSearchParams(location.search).get('verifyAfterImage') === '1';
  readonly #verifyHitSpark = new URLSearchParams(location.search).get('verifyHitSpark') === '1';
  readonly #verifyFightSound = new URLSearchParams(location.search).get('verifyFightSound') === '1';

  readonly #arena = element<HTMLElement>('arena');
  readonly #runtimeStatus = element<HTMLElement>('runtime-status');
  readonly #phaseBanner = element<HTMLElement>('phase-banner');
  readonly #loadingError = element<HTMLElement>('loading-error');
  readonly #startButton = element<HTMLButtonElement>('start-match');
  readonly #pauseButton = element<HTMLButtonElement>('pause-match');
  readonly #deviceLossButton = element<HTMLButtonElement>('verify-device-loss');
  readonly #fightFxButton = element<HTMLButtonElement>('load-fightfx');
  readonly #fightFxInput = element<HTMLInputElement>('fightfx-directory');
  readonly #fightFxStatus = element<HTMLElement>('fightfx-status');
  readonly #debugBoxes = element<HTMLInputElement>('debug-boxes');
  readonly #p1Select = element<HTMLSelectElement>('p1-character');
  readonly #p2Select = element<HTMLSelectElement>('p2-character');
  readonly #p1Control = element<HTMLSelectElement>('p1-control');
  readonly #p2Control = element<HTMLSelectElement>('p2-control');
  readonly #p1Name = element<HTMLElement>('p1-name');
  readonly #p2Name = element<HTMLElement>('p2-name');
  readonly #p1Life = element<HTMLElement>('p1-life');
  readonly #p2Life = element<HTMLElement>('p2-life');
  readonly #p1Power = element<HTMLElement>('p1-power');
  readonly #p2Power = element<HTMLElement>('p2-power');
  readonly #p1Wins = element<HTMLElement>('p1-wins');
  readonly #p2Wins = element<HTMLElement>('p2-wins');
  readonly #roundNumber = element<HTMLElement>('round-number');
  readonly #roundTime = element<HTMLElement>('round-time');
  readonly #p1ControlHint = element<HTMLElement>('p1-control-hint');
  readonly #p2ControlHint = element<HTMLElement>('p2-control-hint');
  readonly #keySettingsButton = element<HTMLButtonElement>('open-key-settings');
  readonly #keySettingsDialog = element<HTMLDialogElement>('key-settings');
  readonly #keySettingsStatus = element<HTMLElement>('key-settings-status');
  readonly #saveKeySettingsButton = element<HTMLButtonElement>('save-key-settings');
  readonly #resetKeySettingsButton = element<HTMLButtonElement>('reset-key-settings');
  readonly #cancelKeySettingsButton = element<HTMLButtonElement>('cancel-key-settings');

  constructor() {
    this.#driver = this.#createInputDriver(this.#keyBindings);
    this.#view = new MugenWebGpuView(element<HTMLCanvasElement>('fight-canvas'), element<HTMLCanvasElement>('fight-debug'), this.#arena, error => this.#fail(error));
    this.#worker = createMugenImportWorkerClient({ workerUrl: new URL('./mugenImport.worker.js', import.meta.url), onProgress: progress => { this.#runtimeStatus.textContent = `角色资源 ${Math.round(progress.total <= 0 ? 0 : progress.completed / progress.total * 100)}%`; } });
  }

  async init(): Promise<void> {
    try {
      this.#bindControls();
      await this.#view.init();
      document.body.dataset.webgpuAdapter = this.#view.adapterDescription;
      document.body.dataset.browserIdentity = navigator.userAgent;
      document.body.dataset.devicePixelRatio = String(window.devicePixelRatio || 1);
      this.#runtimeStatus.textContent = '正在验证角色包…';
      const stage = await loadMugenStageFixture(); this.#stageFixture = stage; this.#applyStage(stage);
      const fixtures = await loadMugenBuiltInGameFixtures(this.#worker);
      await this.#audio.install(fixtures);
      await this.#view.installModels(fixtures.map(fixture => fixture.model));
      this.#fixtures = new Map(fixtures.map(fixture => [fixture.id, fixture]));
      this.#installCharacterOptions(fixtures);
      this.#refreshInputDriver();
      const verifyFightFx = new URLSearchParams(location.search).get('verifyFightFx') === '1';
      if (verifyFightFx) { await this.#installFightFx(this.#loadVerificationFightFx()); if (this.#fightFx === null) throw new Error(this.#fightFxStatus.textContent || 'FightFX verification resource installation failed.'); }
      this.#createAuthority();
      if (verifyFightFx) this.#spawnFightFxVerificationEntity();
      this.#syncNames(); this.#syncKeySettingsUi();
      this.#syncHud(this.#match!.snapshot());
      this.#showBanner('READY?', '选择角色后开始本地双人对战');
      this.#runtimeStatus.textContent = `WEBGPU READY · ${fixtures.map(value => value.packageSha256.slice(0, 6)).join(' + ')}`;
      const firstFixture = fixtures[0]; if (!firstFixture) throw new Error('MUGEN 角色目录为空。');
      document.body.dataset.packageSha256 = firstFixture.packageSha256; document.body.dataset.packageSha256s = fixtures.map(value => value.packageSha256).join(',');
      document.body.dataset.characterIds = fixtures.map(value => value.id).join(','); document.body.dataset.characterRuntimeProfile = firstFixture.runtimeProfile;
      document.body.dataset.deviceGeneration = String(this.#view.deviceGeneration);
      if (new URLSearchParams(location.search).get('verify') === '1') this.#deviceLossButton.hidden = false;
      this.#startButton.disabled = false;
      document.body.dataset.gameStatus = 'ready';
      this.#animationFrame = requestAnimationFrame(time => this.#frame(time));
    } catch (error) { this.#fail(error); }
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    if (this.#animationFrame !== null) cancelAnimationFrame(this.#animationFrame);
    this.#animationFrame = null;
    this.#afterImages.clear(); this.#transientAnimations.clear();
    this.#driver.dispose(); this.#worker.dispose(); this.#view.dispose(); this.#audio.dispose();
    document.body.dataset.lifecycleStatus = 'disposed';
  }

  #bindControls(): void {
    this.#startButton.addEventListener('click', () => this.#startMatch());
    this.#pauseButton.addEventListener('click', () => { void this.#togglePause(); });
    this.#deviceLossButton.addEventListener('click', () => { void this.#verifyDeviceLoss(); });
    this.#fightFxButton.addEventListener('click', () => { void this.#chooseFightFxDirectory(); });
    this.#fightFxInput.addEventListener('change', () => { const files = this.#fightFxInput.files; this.#fightFxInput.value = ''; if (files?.length) void this.#installFightFx(loadMugenFightFxFromFileList(files)); });
    this.#keySettingsButton.addEventListener('click', () => { void this.#openKeySettings(); });
    this.#saveKeySettingsButton.addEventListener('click', () => { void this.#saveKeySettings(); });
    this.#resetKeySettingsButton.addEventListener('click', () => { this.#draftKeyBindings = MUGEN_DEFAULT_KEY_BINDINGS; this.#capturingBinding = null; this.#keySettingsStatus.textContent = '已恢复默认方案，点击“保存并应用”生效。'; this.#syncKeySettingsUi(); });
    this.#cancelKeySettingsButton.addEventListener('click', () => { void this.#closeKeySettings(false); });
    this.#keySettingsDialog.addEventListener('cancel', event => { event.preventDefault(); void this.#closeKeySettings(false); });
    for (const button of this.#bindingButtons()) button.addEventListener('click', () => this.#beginBindingCapture(button));
    window.addEventListener('keydown', event => this.#captureBindingKey(event), { capture: true });
    this.#p1Select.addEventListener('change', () => { this.#preventDuplicateVariant(this.#p1Select, this.#p2Select); this.#syncNames(); this.#refreshInputDriver(); });
    this.#p2Select.addEventListener('change', () => { this.#preventDuplicateVariant(this.#p2Select, this.#p1Select); this.#syncNames(); this.#refreshInputDriver(); });
    this.#p1Control.addEventListener('change', () => this.#refreshInputDriver()); this.#p2Control.addEventListener('change', () => this.#refreshInputDriver());
    window.addEventListener('beforeunload', () => this.dispose(), { once: true });
  }

  #preventDuplicateVariant(changed: HTMLSelectElement, other: HTMLSelectElement): void { if (changed.value === other.value) other.value = [...this.#fixtures.keys()].find(id => id !== changed.value) ?? changed.value; }

  #createAuthority(): void {
    this.#afterImages.clear(); this.#transientAnimations.clear();
    const stage = this.#requireStage(); const p1Fixture = this.#requireFixture(this.#p1Select.value); const p2Fixture = this.#requireFixture(this.#p2Select.value);
    this.#audio.configureOwners({ P1: p1Fixture.packageSha256, P2: p2Fixture.packageSha256 });
    const fighters: MugenMatchConfig['fighters'] = Object.freeze([
      Object.freeze({ id: 'P1', displayName: p1Fixture.displayName, packageSha256: p1Fixture.packageSha256, spawn: Object.freeze([stage.spawn[0], 0]) as readonly [number, number], facing: 1 as const, initialControl: true }),
      Object.freeze({ id: 'P2', displayName: p2Fixture.displayName, packageSha256: p2Fixture.packageSha256, spawn: Object.freeze([stage.spawn[1], 0]) as readonly [number, number], facing: -1 as const, initialControl: true }),
    ]);
    const config: MugenMatchConfig = Object.freeze({
      seed: stage.seed, roundsToWin: 1, roundTimeTicks: 99 * 60, maxEventsPerTick: 512,
      fighters,
    });
    const script = new MugenScriptRuntime([{ fighterId: 'P1', name: p1Fixture.characterName, authorName: p1Fixture.authorName, commands: p1Fixture.commands, states: p1Fixture.states, localCoord: p1Fixture.localCoord, engineControlTransitions: p1Fixture.runtimeProfile === 'm09-native-character-common-v1' }, { fighterId: 'P2', name: p2Fixture.characterName, authorName: p2Fixture.authorName, commands: p2Fixture.commands, states: p2Fixture.states, localCoord: p2Fixture.localCoord, engineControlTransitions: p2Fixture.runtimeProfile === 'm09-native-character-common-v1' }]);
    this.#match = new MugenHeadlessMatch(config);
    this.#combat = new MugenCombatRuntime(script, { fighters: [{ fighterId: 'P1', air: p1Fixture.air, coordinateScale: 240 / p1Fixture.localCoord[1] }, { fighterId: 'P2', air: p2Fixture.air, coordinateScale: 240 / p2Fixture.localCoord[1] }], ...(this.#fightFx === null ? {} : { fightAir: this.#fightFx.air, fightCoordinateScale: 240 / this.#fightFx.localCoord[1] }), stageBounds: stage.stageBounds, guardDistance: stage.guardDistance, koHoldTicks: 60 });
  }

  #startMatch(): void {
    if (this.#fixtures.size < 2) return;
    this.#audio.reset(); this.#outputs.reset(); void this.#audio.unlock().then(() => this.#audio.startMusic()).catch(() => undefined); this.#createAuthority(); this.#driver.reset(); this.#running = true; this.#paused = false; this.#lastFrameTime = performance.now();
    this.#p1Select.disabled = true; this.#p2Select.disabled = true; this.#p1Control.disabled = true; this.#p2Control.disabled = true; this.#fightFxButton.disabled = true; this.#startButton.disabled = false; this.#startButton.textContent = '重新开始'; this.#pauseButton.disabled = false; this.#pauseButton.textContent = '暂停'; this.#runtimeStatus.textContent = '60 Hz MATCH RUNNING'; document.body.dataset.gameStatus = 'running'; this.#showBanner('READY', 'ROUND 1');
  }

  #frame(time: number): void {
    if (this.#disposed) return;
    const delta = Math.max(0, Math.min(100, time - this.#lastFrameTime)); this.#lastFrameTime = time;
    try {
      if (this.#running && !this.#paused && this.#match && this.#combat) this.#driver.advance(delta, () => this.#facings(), input => this.#step(input));
      if (this.#match) { this.#render(this.#match.snapshot()); this.#syncHud(this.#match.snapshot()); }
    } catch (error) { this.#fail(error); }
    this.#animationFrame = requestAnimationFrame(next => this.#frame(next));
  }

  #step(input: Parameters<MugenHeadlessMatch['beginTick']>[0]): void {
    const match = this.#match!; const combat = this.#combat!; match.beginTick(input);
    const before = match.snapshot();
    if (before.phase === 'ready' && before.phaseTime >= 60) match.startFight();
    else if (before.phase === 'round-over' && before.phaseTime >= 90) { match.startNextRound(); this.#afterImages.clear(); this.#transientAnimations.clear(); }
    const trace = combat.step(match, input, this.#driver.input.history); const outputStats = this.#outputs.consume(trace.script.output); document.body.dataset.outputHash = trace.script.outputHash; document.body.dataset.forceFeedbackPolicy = outputStats.forceFeedbackEvents === 0 ? 'idle' : outputStats.forceFeedbackApplied > 0 ? 'applied' : 'unavailable'; document.body.dataset.clipboardPolicy = outputStats.clipboardDiagnostics === 0 ? 'idle' : 'internal-debug-buffer';
    const result = match.endTick(); this.#captureAfterImages(result.state, trace.script.output); this.#captureTransientAnimations(trace.script.output); const audio = this.#audio.consume(result.events); document.body.dataset.mugenAudioRequested = String(audio.requested); document.body.dataset.mugenAudioPlayed = String(audio.played); document.body.dataset.mugenAudioMissing = String(audio.missing); if (this.#verifyFightSound && result.tick === 90) { const verification = this.#audio.consume([fightSoundVerificationEvent(result.tick)]); document.body.dataset.fightSoundVerification = verification.played === 1 && verification.missing === 0 ? 'played' : 'missing'; } this.#syncPhase(result.state);
    if (result.state.phase === 'match-over') this.#finishMatch();
  }

  #facings(): Readonly<Record<string, 1 | -1>> { const snapshot = this.#match!.snapshot(); return Object.freeze(Object.fromEntries(snapshot.fighters.map(fighter => [fighter.id, fighter.facing])) as Record<string, 1 | -1>); }

  #render(snapshot: MugenMatchSnapshot): void {
    const stage = this.#requireStage(); const viewport = this.#view.resize(); const ratio = viewport.devicePixelRatio; const scale = stage.camera.pixelsPerUnit * ratio; const output = this.#combat?.script.outputs.snapshot(); const originX = viewport.width / 2; const groundY = viewport.height * stage.camera.groundRatio + mugenShakeOffset(output?.cameraShake ?? null) * scale;
    const outputByEntity = new Map(output?.entities.map(entity => [entity.entityId, entity]) ?? []); const fighters = snapshot.fighters.flatMap((fighter, index) => {
      const effect = outputByEntity.get(fighter.id); if (effect?.assertions.includes('invisible')) return [];
      const fixture = this.#requireFixture(index === 0 ? this.#p1Select.value : this.#p2Select.value); const action = fixture.air.actions.find(value => value.number === fighter.actionNumber); if (!action) throw new RangeError(`角色动作 ${fighter.actionNumber} 不存在。`);
      const renderScale = viewport.height / fixture.localCoord[1];
      const air = evaluateMugenAirAction(action, fighter.actionTime, { x: originX + fighter.position[0] * scale, y: groundY + fighter.position[1] * scale, facing: fighter.facing, coordinateScale: renderScale });
      return [Object.freeze({ layer: 'fighters' as const, order: fighter.spritePriority, entityId: fighter.id, actor: Object.freeze({ snapshot: applyMugenOutputTransform(air, effect, renderScale, fighter.facing), paletteId: this.#paletteId(fixture, effect?.paletteRemap ?? null), transparency: effect?.transparency ?? null, colorMatrix: mugenPaletteColorMatrix(effect?.palette ?? output?.allPalette ?? null) }) })];
    });
    const entityActors = this.#combat?.script.entities.snapshot().entities.flatMap(entity => {
      if (entity.kind !== 'helper' && entity.kind !== 'explod' && entity.kind !== 'projectile' || outputByEntity.get(entity.entityId)?.assertions.includes('invisible')) return [];
      const animationOwnerId = entity.kind === 'helper' ? entity.rootId : entity.animationOwnerId; const animationNumber = entity.kind === 'helper' ? entity.actionNumber : entity.animationNumber;
      const fighterIndex = snapshot.fighters.findIndex(fighter => fighter.id === animationOwnerId); const fightFx = animationOwnerId === 'fight' ? this.#fightFx : null;
      if (fightFx === null && fighterIndex < 0) return [];
      const fixture = fightFx === null ? this.#requireFixture(fighterIndex === 0 ? this.#p1Select.value : this.#p2Select.value) : null;
      const action = (fightFx?.air ?? fixture!.air).actions.find(value => value.number === animationNumber); if (!action) return [];
      const root = snapshot.fighters.find(fighter => fighter.id === entity.rootId); if (!root) return [];
      const localCoord = fightFx?.localCoord ?? fixture!.localCoord; const renderScale = viewport.height / localCoord[1]; const layer = entity.kind === 'explod' ? entity.layer : 'fighters'; const order = entity.spritePriority; const actionTime = entity.kind === 'helper' ? entity.actionTime : entity.age; const entityFacing = entity.kind === 'helper' || entity.kind === 'projectile' || entity.kind === 'explod' ? entity.facing : root.facing; const entityOutput = outputByEntity.get(entity.entityId); const rootOutput = outputByEntity.get(root.id); const inheritedRemap = entityOutput?.paletteIsolated ? null : rootOutput?.paletteRemap ?? null; const paletteId = fightFx?.palettes[0]?.id ?? this.#paletteId(fixture!, entityOutput?.paletteRemap ?? inheritedRemap);
      const screenSpace = entity.kind === 'explod' && entity.coordinateSpace === 'screen'; const x = screenSpace ? originX + (entity.position[0] - localCoord[0] / 2) * renderScale : originX + entity.position[0] * scale; const y = screenSpace ? entity.position[1] * renderScale : groundY + entity.position[1] * scale;
      const air = evaluateMugenAirAction(action, actionTime, { x, y, facing: entityFacing, coordinateScale: renderScale }); const inheritedPalette = entityOutput?.paletteIsolated ? null : rootOutput?.palette ?? null;
      return [Object.freeze({ layer, order, entityId: entity.entityId, actor: Object.freeze({ snapshot: applyMugenOutputTransform(air, entityOutput, renderScale, entityFacing, entity.kind === 'explod' ? entity.verticalFacing : 1), paletteId, transparency: entityOutput?.transparency ?? entityOutput?.baseTransparency ?? null, colorMatrix: mugenPaletteColorMatrix(entityOutput?.palette ?? inheritedPalette ?? output?.allPalette ?? null) }) })];
    }) ?? [];
    const afterImageActors = this.#afterImages.visibleTrails().flatMap(trail => this.#renderAfterImageTrail(trail, originX, groundY, scale, viewport.height));
    const transientActors = this.#transientAnimations.visible().flatMap(frame => this.#renderTransientAnimation(frame, originX, groundY, scale, viewport.height));
    const verificationActors = this.#fightFxVerificationActor && this.#fightFx ? this.#fightFx.air.actions.filter(value => value.elements.some(element => element.spriteId !== null)).slice(0, 1).map(action => Object.freeze({ layer: 'above' as const, order: 99, entityId: 'fightfx:verification', actor: Object.freeze({ snapshot: evaluateMugenAirAction(action, 0, { x: originX, y: groundY, facing: 1, coordinateScale: viewport.height / this.#fightFx!.localCoord[1] }), paletteId: this.#fightFx!.palettes[0]?.id ?? null }) })) : [];
    const actors = [...fighters, ...entityActors, ...afterImageActors, ...transientActors, ...verificationActors]; const envColor = output?.environmentColor ?? null; const visibleLayers = envColor !== null && !envColor.under ? new Set(['above']) : new Set(['below', 'fighters', 'above']); const ordered = [...actors.filter(value => visibleLayers.has(value.layer) && value.layer === 'below').sort((left, right) => left.order - right.order || left.entityId.localeCompare(right.entityId, 'en')).map(value => value.actor), ...actors.filter(value => visibleLayers.has(value.layer) && value.layer === 'fighters').sort((left, right) => left.order - right.order || left.entityId.localeCompare(right.entityId, 'en')).map(value => value.actor), ...actors.filter(value => visibleLayers.has(value.layer) && value.layer === 'above').sort((left, right) => left.order - right.order || left.entityId.localeCompare(right.entityId, 'en')).map(value => value.actor)];
    const debug = this.#debugBoxes.checked;
    const noBackground = output?.entities.some(entity => entity.assertions.includes('nobg')) ?? false; document.body.dataset.mugenNoBackground = String(noBackground); document.body.dataset.mugenNoForeground = String(output?.entities.some(entity => entity.assertions.includes('nofg')) ?? false); document.body.dataset.mugenPaletteEffects = String((output?.entities.filter(entity => entity.palette !== null).length ?? 0) + Number(output?.backgroundPalette !== null));
    this.#view.renderActors(ordered, { background: noBackground ? 'dark' : 'checker', ...(envColor === null ? {} : { backgroundColor: [envColor.color[0] / 255, envColor.color[1] / 255, envColor.color[2] / 255, 1] as const }), paletteId: null, originX, originY: groundY, debug: { origin: false, axis: debug, spriteBounds: false, clsn1: debug, clsn2: debug } });
  }

  #captureAfterImages(snapshot: MugenMatchSnapshot, output: MugenOutputAuthoritySnapshot): void {
    const outputByEntity = new Map(output.entities.map(entity => [entity.entityId, entity])); const sources: MugenAfterImageSource<MugenAfterImagePose>[] = [];
    for (const [index, fighter] of snapshot.fighters.entries()) {
      const entityOutput = outputByEntity.get(fighter.id) ?? (this.#verifyAfterImage && fighter.id === 'P1' ? this.#combat?.script.outputs.entity(fighter.id) : undefined);
      const verificationEffect = this.#verifyAfterImage && fighter.id === 'P1' && output.tick < 300 ? AFTER_IMAGE_BROWSER_VERIFICATION_EFFECT : null; const effect = entityOutput?.afterImage ?? verificationEffect;
      if (entityOutput === undefined || effect === null || entityOutput.assertions.includes('invisible')) continue;
      const fixture = this.#requireFixture(index === 0 ? this.#p1Select.value : this.#p2Select.value);
      sources.push(Object.freeze({ entityId: fighter.id, effect, value: Object.freeze({ animationOwnerId: fighter.id, animationNumber: fighter.actionNumber, actionTime: fighter.actionTime, position: fighter.position, facing: fighter.facing, verticalFacing: 1 as const, coordinateSpace: 'stage' as const, localCoordWidth: fixture.localCoord[0], localCoordHeight: fixture.localCoord[1], layer: 'fighters', order: fighter.spritePriority, paletteId: this.#paletteId(fixture, entityOutput.paletteRemap), output: entityOutput }) }));
    }
    for (const entity of this.#combat?.script.entities.snapshot().entities ?? []) {
      if (entity.kind !== 'helper' && entity.kind !== 'explod' && entity.kind !== 'projectile') continue;
      const entityOutput = outputByEntity.get(entity.entityId);
      if (entityOutput === undefined || entityOutput.afterImage === null || entityOutput.assertions.includes('invisible')) continue;
      const effect = entityOutput.afterImage;
      const animationOwnerId = entity.kind === 'helper' ? entity.rootId : entity.animationOwnerId; const animationNumber = entity.kind === 'helper' ? entity.actionNumber : entity.animationNumber; const fighterIndex = snapshot.fighters.findIndex(fighter => fighter.id === animationOwnerId); const fightFx = animationOwnerId === 'fight' ? this.#fightFx : null;
      if (fightFx === null && fighterIndex < 0) continue;
      const fixture = fightFx === null ? this.#requireFixture(fighterIndex === 0 ? this.#p1Select.value : this.#p2Select.value) : null; const rootOutput = outputByEntity.get(entity.rootId); const paletteId = fightFx?.palettes[0]?.id ?? this.#paletteId(fixture!, entityOutput.paletteRemap ?? rootOutput?.paletteRemap ?? null);
      sources.push(Object.freeze({ entityId: entity.entityId, effect, value: Object.freeze({ animationOwnerId, animationNumber, actionTime: entity.kind === 'helper' ? entity.actionTime : entity.age, position: entity.position, facing: entity.kind === 'helper' || entity.kind === 'projectile' || entity.kind === 'explod' ? entity.facing : 1, verticalFacing: entity.kind === 'explod' ? entity.verticalFacing : 1, coordinateSpace: entity.kind === 'explod' ? entity.coordinateSpace : 'stage', localCoordWidth: fightFx?.localCoord[0] ?? fixture!.localCoord[0], localCoordHeight: fightFx?.localCoord[1] ?? fixture!.localCoord[1], layer: entity.kind === 'explod' ? entity.layer : 'fighters', order: entity.spritePriority, paletteId, output: entityOutput }) }));
    }
    const trails = this.#afterImages.advance(output.tick, sources); document.body.dataset.mugenAfterImageTrails = String(trails.length); document.body.dataset.mugenAfterImageEntities = String(this.#afterImages.trackedEntityCount); if (this.#verifyAfterImage && trails.length > 0) document.body.dataset.afterImageVerification = 'rendering';
  }

  #renderAfterImageTrail(trail: MugenAfterImageTrail<MugenAfterImagePose>, originX: number, groundY: number, stageScale: number, viewportHeight: number): readonly Readonly<{ layer: MugenRenderLayer; order: number; entityId: string; actor: MugenViewerActorFrame }>[] {
    const pose = trail.value; const fighterIndex = this.#match?.snapshot().fighters.findIndex(fighter => fighter.id === pose.animationOwnerId) ?? -1; const fightFx = pose.animationOwnerId === 'fight' ? this.#fightFx : null;
    if (fightFx === null && fighterIndex < 0) return [];
    const fixture = fightFx === null ? this.#requireFixture(fighterIndex === 0 ? this.#p1Select.value : this.#p2Select.value) : null; const action = (fightFx?.air ?? fixture!.air).actions.find(value => value.number === pose.animationNumber); if (!action) return [];
    const renderScale = viewportHeight / pose.localCoordHeight; const x = pose.coordinateSpace === 'screen' ? originX + (pose.position[0] - pose.localCoordWidth / 2) * renderScale : originX + pose.position[0] * stageScale; const y = pose.coordinateSpace === 'screen' ? pose.position[1] * renderScale : groundY + pose.position[1] * stageScale; const air = evaluateMugenAirAction(action, pose.actionTime, { x, y, facing: pose.facing, coordinateScale: renderScale }); const transformed = applyMugenOutputTransform(air, pose.output, renderScale, pose.facing, pose.verticalFacing); const afterImageSnapshot = Object.freeze({ ...transformed, clsn1: Object.freeze([]), clsn2: Object.freeze([]) });
    return [Object.freeze({ layer: pose.layer, order: pose.order - 2 - trail.generation, entityId: `${trail.entityId}:after:${String(trail.generation).padStart(2, '0')}`, actor: Object.freeze({ snapshot: afterImageSnapshot, paletteId: pose.paletteId, transparency: afterImageTransparency(trail.effect.transparency), colorMatrix: mugenAfterImageColorMatrix(trail.effect, trail.generation) }) })];
  }

  #captureTransientAnimations(output: MugenOutputAuthoritySnapshot): void {
    const spawns: MugenTransientAnimationSpawn[] = []; let missing = 0;
    for (const [index, event] of output.events.entries()) {
      if (event.kind !== 'hit-spark' && event.kind !== 'legacy-animation') continue;
      const animationOwnerId = event.kind === 'hit-spark' ? event.animationOwnerId : 'fight'; const source = this.#resolveTransientAnimation(animationOwnerId, event.animationNumber); if (source === null) { missing += 1; continue; }
      spawns.push(Object.freeze({ id: `mugen-transient-${String(output.tick).padStart(10, '0')}-${String(index).padStart(3, '0')}`, kind: event.kind, animationOwnerId, animationNumber: event.animationNumber, position: event.position, facing: event.facing, layer: event.layer, lifetimeTicks: Math.min(source.action.totalTicks ?? 600, 600) }));
    }
    if (this.#verifyHitSpark && this.#fightFx !== null && output.tick < 300 && output.tick % 12 === 0) { const source = this.#resolveTransientAnimation('fight', 0); if (source !== null) spawns.push(Object.freeze({ id: `verify-hit-spark-${output.tick}`, kind: 'hit-spark', animationOwnerId: 'fight', animationNumber: 0, position: Object.freeze([0, -48]) as readonly [number, number], facing: 1, layer: 'above', lifetimeTicks: Math.min(source.action.totalTicks ?? 600, 600) })); }
    const visible = this.#transientAnimations.advance(output.tick, spawns); const sparks = visible.filter(value => value.kind === 'hit-spark').length; document.body.dataset.mugenTransientAnimations = String(visible.length); document.body.dataset.mugenHitSparks = String(sparks); document.body.dataset.mugenMissingTransientAnimations = String(missing); if (this.#verifyHitSpark && sparks > 0) document.body.dataset.hitSparkVerification = 'rendering';
  }

  #renderTransientAnimation(frame: MugenTransientAnimationFrame, originX: number, groundY: number, stageScale: number, viewportHeight: number): readonly Readonly<{ layer: MugenRenderLayer; order: number; entityId: string; actor: MugenViewerActorFrame }>[] {
    const source = this.#resolveTransientAnimation(frame.animationOwnerId, frame.animationNumber); if (source === null) return [];
    const renderScale = viewportHeight / source.localCoordHeight; const air = evaluateMugenAirAction(source.action, frame.age, { x: originX + frame.position[0] * stageScale, y: groundY + frame.position[1] * stageScale, facing: frame.facing, coordinateScale: renderScale }); const snapshot = Object.freeze({ ...air, clsn1: Object.freeze([]), clsn2: Object.freeze([]) });
    return [Object.freeze({ layer: frame.layer, order: frame.layer === 'above' ? 1_000 : -1_000, entityId: frame.id, actor: Object.freeze({ snapshot, paletteId: source.paletteId }) })];
  }

  #resolveTransientAnimation(animationOwnerId: string | 'fight', animationNumber: number): Readonly<{ action: MugenBuiltInGameFixture['air']['actions'][number]; localCoordHeight: number; paletteId: string | null }> | null {
    if (animationOwnerId === 'fight') { const fightFx = this.#fightFx; if (fightFx === null) return null; const action = fightFx.air.actions.find(value => value.number === animationNumber); return action === undefined ? null : Object.freeze({ action, localCoordHeight: fightFx.localCoord[1], paletteId: fightFx.palettes[0]?.id ?? null }); }
    const index = this.#match?.snapshot().fighters.findIndex(fighter => fighter.id === animationOwnerId) ?? -1; if (index < 0) return null; const fixture = this.#requireFixture(index === 0 ? this.#p1Select.value : this.#p2Select.value); const action = fixture.air.actions.find(value => value.number === animationNumber); return action === undefined ? null : Object.freeze({ action, localCoordHeight: fixture.localCoord[1], paletteId: this.#paletteId(fixture) });
  }

  #paletteId(fixture: MugenBuiltInGameFixture, remap: Readonly<{ destination: readonly [number, number] }> | null = null): string | null { if (remap !== null) { const palette = fixture.model.palettes.find(value => value.group === remap.destination[0] && value.item === remap.destination[1]); if (palette !== undefined) return palette.id; } return fixture.model.palettes[0]?.id ?? null; }

  #syncHud(snapshot: MugenMatchSnapshot): void {
    const [p1, p2] = snapshot.fighters; setGauge(this.#p1Life, p1.life / p1.maxLife); setGauge(this.#p2Life, p2.life / p2.maxLife); setGauge(this.#p1Power, p1.power / p1.maxPower); setGauge(this.#p2Power, p2.power / p2.maxPower);
    this.#p1Wins.textContent = String(p1.roundsWon); this.#p2Wins.textContent = String(p2.roundsWon); this.#roundNumber.textContent = String(snapshot.roundNumber); this.#roundTime.textContent = snapshot.roundTimeRemainingTicks === null ? '∞' : String(Math.max(0, Math.ceil(snapshot.roundTimeRemainingTicks / 60))).padStart(2, '0');
    document.body.dataset.matchTick = String(snapshot.tick); document.body.dataset.matchPhase = snapshot.phase; document.body.dataset.matchStateHash = snapshot.hash; document.body.dataset.p1X = String(p1.position[0]); document.body.dataset.p2X = String(p2.position[0]); document.body.dataset.p1State = String(p1.stateNumber); document.body.dataset.p2State = String(p2.stateNumber); document.body.dataset.p1Life = String(p1.life); document.body.dataset.p2Life = String(p2.life);
  }

  #syncNames(): void { if (this.#fixtures.size < 2) return; this.#p1Name.textContent = this.#requireFixture(this.#p1Select.value).displayName; this.#p2Name.textContent = this.#requireFixture(this.#p2Select.value).displayName; }

  #syncPhase(snapshot: MugenMatchSnapshot): void {
    if (snapshot.phase === 'ready') this.#showBanner('READY', `ROUND ${snapshot.roundNumber}`);
    else if (snapshot.phase === 'fight' && snapshot.phaseTime < 30) this.#showBanner('FIGHT!', '');
    else if (snapshot.phase === 'fight') this.#phaseBanner.hidden = true;
    else if (snapshot.phase === 'ko') this.#showBanner('K.O.', snapshot.roundWinnerId === null ? 'DOUBLE K.O.' : `${snapshot.roundWinnerId} TAKES THE ROUND`);
    else if (snapshot.phase === 'round-over') this.#showBanner('DRAW', 'NEXT ROUND');
    else if (snapshot.phase === 'match-over') this.#showBanner(snapshot.matchWinnerId === 'P1' ? 'P1 WINS' : snapshot.matchWinnerId === 'P2' ? 'P2 WINS' : 'DRAW', 'MATCH OVER');
  }

  #finishMatch(): void { this.#audio.stopMusic(); this.#running = false; this.#paused = false; this.#p1Select.disabled = false; this.#p2Select.disabled = false; this.#p1Control.disabled = false; this.#p2Control.disabled = false; this.#fightFxButton.disabled = false; this.#startButton.disabled = false; this.#startButton.textContent = '重新对战'; this.#pauseButton.disabled = true; this.#pauseButton.textContent = '暂停'; this.#runtimeStatus.textContent = 'MATCH COMPLETE'; document.body.dataset.gameStatus = 'complete'; }
  async #chooseFightFxDirectory(): Promise<void> {
    if (this.#running || this.#fightFxButton.disabled) return;
    const picker = (window as Window & { showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker;
    if (picker === undefined) { this.#fightFxInput.click(); return; }
    try { const handle = await picker.call(window); await this.#installFightFx(loadMugenFightFxFromDirectoryHandle(handle)); }
    catch (error) { if (!(error instanceof DOMException && error.name === 'AbortError')) this.#reportFightFxError(error); }
  }
  async #installFightFx(pending: Promise<MugenFightFxModel>): Promise<void> {
    if (this.#running || this.#fightFxButton.disabled) return;
    this.#fightFxButton.disabled = true; this.#fightFxStatus.textContent = '正在解析本地 AIR / SFF…'; document.body.dataset.fightFxStatus = 'loading';
    try {
      const model = await pending;
      await this.#view.installModels([...[...this.#fixtures.values()].map(value => value.model), model]);
      await this.#audio.installFightSounds(model.soundBankSha256, model.sounds);
      this.#fightFx = model; this.#createAuthority(); this.#syncHud(this.#match!.snapshot());
      this.#fightFxStatus.textContent = `${model.air.actions.length} 个动作 · ${model.sprites.length} 张精灵 · ${model.sounds.filter(value => value.selectedByKey).length} 个公共音效`;
      this.#fightFxButton.textContent = '重新载入 FightFX'; document.body.dataset.fightFxStatus = 'ready'; document.body.dataset.fightFxSha256 = model.sourceSetSha256;
    } catch (error) { this.#reportFightFxError(error); }
    finally { this.#fightFxButton.disabled = false; }
  }
  #reportFightFxError(error: unknown): void { this.#fightFxStatus.textContent = `载入失败：${error instanceof Error ? error.message : String(error)}`; document.body.dataset.fightFxStatus = 'error'; }
  async #loadVerificationFightFx(): Promise<MugenFightFxModel> {
    const [air, sff, snd] = await Promise.all([fetchLocalBytes('../fixtures/g05-viewer-v1/hero.air'), fetchLocalBytes('../fixtures/g05-viewer-v1/hero.sff'), fetchLocalBytes('../fixtures/g06-generated-snd-v1/vertical.snd')]);
    return loadMugenFightFx(Object.freeze([{ path: 'fightfx.air', bytes: air }, { path: 'fightfx.sff', bytes: sff }, { path: 'fight.snd', bytes: snd }]));
  }
  #spawnFightFxVerificationEntity(): void {
    const fightFx = this.#fightFx; if (!fightFx?.air.actions.some(value => value.elements.some(element => element.spriteId !== null))) throw new Error('FightFX verification resource has no renderable action.');
    this.#fightFxVerificationActor = true; document.body.dataset.fightFxVerificationEntity = 'fightfx:verification';
  }
  async #togglePause(): Promise<void> {
    if (!this.#running) return;
    this.#paused = !this.#paused;
    try { if (this.#paused) await this.#audio.suspend(); else await this.#audio.resume(); } catch { /* Audio suspension never affects simulation authority. */ }
    this.#pauseButton.textContent = this.#paused ? '继续' : '暂停'; this.#runtimeStatus.textContent = this.#paused ? '比赛已暂停' : '60 Hz MATCH RUNNING'; document.body.dataset.gameStatus = this.#paused ? 'paused' : 'running';
  }
  #installCharacterOptions(fixtures: readonly MugenBuiltInGameFixture[]): void {
    const install = (select: HTMLSelectElement, selectedIndex: number) => { select.replaceChildren(...fixtures.map(fixture => new Option(fixture.displayName, fixture.id))); select.selectedIndex = Math.min(selectedIndex, fixtures.length - 1); };
    install(this.#p1Select, 0); install(this.#p2Select, 1);
  }
  #bindingButtons(): HTMLButtonElement[] { return [...this.#keySettingsDialog.querySelectorAll<HTMLButtonElement>('button[data-player][data-action]')]; }
  #beginBindingCapture(button: HTMLButtonElement): void {
    const player = button.dataset.player; const action = button.dataset.action;
    if ((player !== 'P1' && player !== 'P2') || !MUGEN_BINDABLE_ACTIONS.includes(action as MugenBindableAction)) return;
    this.#capturingBinding = Object.freeze({ player, action: action as MugenBindableAction }); this.#keySettingsStatus.textContent = '请按下新的按键；按 Esc 取消。'; this.#syncKeySettingsUi();
  }
  #captureBindingKey(event: KeyboardEvent): void {
    const capture = this.#capturingBinding; if (!capture) return; event.preventDefault(); event.stopImmediatePropagation();
    if (event.code === 'Escape') { this.#capturingBinding = null; this.#keySettingsStatus.textContent = '已取消本次按键录入。'; this.#syncKeySettingsUi(); return; }
    try { this.#draftKeyBindings = assignMugenKey(this.#draftKeyBindings, capture.player, capture.action, event.code); this.#capturingBinding = null; this.#keySettingsStatus.textContent = '新按键已记录，点击“保存并应用”生效。'; this.#syncKeySettingsUi(); }
    catch (error) { this.#keySettingsStatus.textContent = error instanceof Error ? error.message : String(error); }
  }
  async #openKeySettings(): Promise<void> {
    if (this.#keySettingsDialog.open) return; this.#draftKeyBindings = this.#keyBindings; this.#capturingBinding = null; this.#resumeAfterKeySettings = this.#running && !this.#paused;
    if (this.#resumeAfterKeySettings) await this.#togglePause();
    this.#keySettingsStatus.textContent = '点击任一按键项，然后按下新按键。相同玩家的冲突按键会自动交换。'; this.#syncKeySettingsUi(); this.#keySettingsDialog.showModal();
  }
  async #saveKeySettings(): Promise<void> {
    try { this.#keyBindings = saveMugenKeyBindings(this.#draftKeyBindings); }
    catch (error) { this.#keySettingsStatus.textContent = `保存失败：${error instanceof Error ? error.message : String(error)}`; return; }
    const restart = this.#running; const previous = this.#driver; this.#driver = this.#createInputDriver(this.#keyBindings); previous.dispose(); this.#capturingBinding = null; this.#resumeAfterKeySettings = false; this.#syncKeySettingsUi(); this.#keySettingsDialog.close();
    if (restart) this.#startMatch(); else { this.#runtimeStatus.textContent = '按键设置已保存'; document.body.dataset.gameStatus = this.#match ? 'ready' : document.body.dataset.gameStatus; }
  }
  async #closeKeySettings(resume: boolean): Promise<void> {
    this.#capturingBinding = null; if (this.#keySettingsDialog.open) this.#keySettingsDialog.close(); const shouldResume = resume || this.#resumeAfterKeySettings; this.#resumeAfterKeySettings = false; if (shouldResume && this.#running && this.#paused) await this.#togglePause(); this.#draftKeyBindings = this.#keyBindings; this.#syncKeySettingsUi();
  }
  #createInputDriver(bindings: MugenKeyBindings): MugenFixedStepInputDriver {
    const settings = [['P1', this.#p1Control, this.#p1Select], ['P2', this.#p2Control, this.#p2Select]] as const;
    const configs = settings.flatMap(([playerId, control, selection]) => { const aiLevel = Number(control.value); const fixture = this.#fixtures.get(selection.value); return aiLevel > 0 && fixture !== undefined ? [{ playerId, aiLevel, seed: `${this.#requireStage().seed}:${playerId}:${fixture.packageSha256}`, commands: fixture.commands }] : []; });
    const legacyAi = configs.length === 0 ? null : new MugenLegacyAiInput(configs);
    return new MugenFixedStepInputDriver({ players: createMugenBrowserPlayerBindings(bindings), maxSubSteps: 8, maxBacklogTicks: 120, ...(legacyAi === null ? {} : { transformSource: source => legacyAi.apply(source) }) });
  }
  #refreshInputDriver(): void { if (this.#running) return; const previous = this.#driver; this.#driver = this.#createInputDriver(this.#keyBindings); previous.dispose(); this.#syncKeySettingsUi(); }
  #syncKeySettingsUi(): void {
    for (const button of this.#bindingButtons()) { const player = button.dataset.player as MugenBindingPlayer; const action = button.dataset.action as MugenBindableAction; const capture = this.#capturingBinding; button.textContent = capture?.player === player && capture.action === action ? '请按键…' : mugenKeyLabel(this.#draftKeyBindings.players[player][action]); button.classList.toggle('capturing', capture?.player === player && capture.action === action); }
    const summary = (player: MugenBindingPlayer, control: HTMLSelectElement) => { const aiLevel = Number(control.value); if (aiLevel > 0) return `电脑操作 · AI 等级 ${aiLevel} · 优先使用角色包内置 AI`; const value = this.#keyBindings.players[player]; return `${mugenKeyLabel(value.left)} ${mugenKeyLabel(value.right)} 移动 · ${mugenKeyLabel(value.up)} 跳跃 · ${mugenKeyLabel(value.down)} 蹲下 · ${[value.attack1, value.attack2, value.attack3, value.attack4].map(mugenKeyLabel).join(' / ')} 攻击`; };
    this.#p1ControlHint.textContent = summary('P1', this.#p1Control); this.#p2ControlHint.textContent = summary('P2', this.#p2Control); document.body.dataset.p1AiLevel = this.#p1Control.value; document.body.dataset.p2AiLevel = this.#p2Control.value; document.body.dataset.p1KeyBindings = MUGEN_BINDABLE_ACTIONS.map(action => this.#keyBindings.players.P1[action]).join(','); document.body.dataset.p2KeyBindings = MUGEN_BINDABLE_ACTIONS.map(action => this.#keyBindings.players.P2[action]).join(',');
  }
  async #verifyDeviceLoss(): Promise<void> {
    if (this.#deviceLossButton.hidden || this.#deviceLossButton.disabled) return;
    this.#deviceLossButton.disabled = true; document.body.dataset.deviceLossStatus = 'recovering';
    try { const generation = await this.#view.forceDeviceLossForTesting(); document.body.dataset.deviceGeneration = String(generation); document.body.dataset.deviceLossStatus = 'recovered'; }
    catch (error) { document.body.dataset.deviceLossStatus = 'failed'; this.#fail(error); }
    finally { this.#deviceLossButton.disabled = false; }
  }
  #showBanner(title: string, subtitle: string): void { this.#phaseBanner.hidden = false; const strong = this.#phaseBanner.querySelector('strong'); const span = this.#phaseBanner.querySelector('span'); if (strong) strong.textContent = title; if (span) span.textContent = subtitle; }
  #requireFixture(id: string): MugenBuiltInGameFixture { const value = this.#fixtures.get(id); if (!value) throw new Error(`MUGEN 内置角色 ${id} 尚未装载。`); return value; }
  #requireStage(): MugenStageFixture { if (!this.#stageFixture) throw new Error('MUGEN 内置舞台尚未装载。'); return this.#stageFixture; }
  #applyStage(stage: MugenStageFixture): void { document.body.dataset.stageId = stage.id; this.#arena.style.setProperty('--stage-sky', stage.presentation.sky); this.#arena.style.setProperty('--stage-horizon', stage.presentation.horizon); this.#arena.style.setProperty('--stage-floor', stage.presentation.floor); this.#arena.style.setProperty('--stage-line', stage.presentation.line); }

  #fail(error: unknown): void { const message = error instanceof Error ? error.message : String(error); this.#running = false; this.#runtimeStatus.textContent = '启动失败'; this.#loadingError.hidden = false; this.#loadingError.textContent = `MUGEN 游戏启动失败\n\n${message}`; this.#showBanner('ERROR', '请检查浏览器 WebGPU 支持'); document.body.dataset.gameStatus = 'error'; }
}

function setGauge(elementValue: HTMLElement, ratio: number): void { elementValue.style.transform = `scaleX(${Math.max(0, Math.min(1, ratio))})`; }
function afterImageTransparency(mode: 'none' | 'add' | 'add1' | 'sub'): NonNullable<MugenViewerActorFrame['transparency']> { return Object.freeze({ mode, alpha: Object.freeze([256, mode === 'none' ? 0 : 256]) as readonly [number, number] }); }
function fightSoundVerificationEvent(tick: number): MugenMatchEvent { return Object.freeze({ id: `mugen-fight-sound-verification-${tick}`, tick, sequence: 0, kind: 'audio', fighterId: 'P1', resourceOwner: 'fight', operation: 'play', group: 0, item: 0, channel: -1, volume: 255, pan: 0, frequency: 1, loop: false, lowPriority: false }); }
function element<T extends HTMLElement>(id: string): T { const value = document.getElementById(id); if (!value) throw new Error(`Missing MUGEN game element #${id}.`); return value as T; }
async function fetchLocalBytes(relativeUrl: string): Promise<Uint8Array> { const response = await fetch(new URL(relativeUrl, import.meta.url)); if (!response.ok) throw new Error(`无法载入 FightFX 验证资源（HTTP ${response.status}）。`); return new Uint8Array(await response.arrayBuffer()); }

const app = new MugenFightApp();
void app.init();
