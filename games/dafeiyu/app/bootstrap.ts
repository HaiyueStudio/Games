import { Entity, World } from '@haiyue/engine';
import { RenderIntegration } from '@haiyue/engine/experimental';
import { gamepadFrame, installGamepad } from '../../gamepad/runtime';
import { GameEngine } from '../../session/GameEngine';
import { gameSession } from '../../session/SessionPause';
import { SingleSlotGameSave } from '../../save/SingleSlotGameSave';
import { LagoonAudio } from '../audio/LagoonAudio';
import { builtinPack, localPacks, officialPacks, type LevelPack } from '../levels/pack';
import { isWorldDraft, levelFromDraft, newDraft, packFromDraft, palettes, sameCell, WorldEditor, type Cell, type WorldDraft } from '../levels/editor';
import type { Direction } from '../levels/baba-format';
import type { GateType } from '../levels/gates';
import { LagoonScene } from '../rendering/scene';
import { LagoonPortal, type PortalFocus } from '../rendering/portal';
import { Campaign } from '../rules/campaign';
import { isMap, Puzzle, type Move } from '../rules/game';
import { player, vectors, type RuleContext } from '../rules/properties';
import { isOfficialProgress, isProgress, isSlotProgress, type OfficialProgress, type SlotProgress } from '../rules/progress';
import { copy, LagoonHud, pauseActions, rowsPerPage, type HudAction } from '../ui/hud';
import { editorMapTools, palettePageSize, screenCopy, ScreenHud, type EditorCommand, type HomeView, type PaletteTab } from '../ui/screens';
import { LatestAutosave } from './autosave';

const moves = new Map<string, Move>([
  ['ArrowRight', 0], ['KeyD', 0], ['ArrowUp', 1], ['KeyW', 1],
  ['ArrowLeft', 2], ['KeyA', 2], ['ArrowDown', 3], ['KeyS', 3], ['Space', 'wait'],
]);
const actions = new Map<string, HudAction>([
  ['KeyZ', 'undo'], ['Backspace', 'undo'], ['KeyY', 'redo'], ['KeyR', 'restart'], ['KeyL', 'library'],
  ['Escape', 'pause'], ['KeyM', 'pause'], ['Enter', 'next'], ['KeyI', 'files'], ['KeyF', 'folder'],
]);
type Room = { index: number; puzzle: Puzzle; entrance?: string | undefined };
type OpenOptions = { keepLibrary?: boolean; parents?: Room[]; conversion?: { child: string; targets: string[] };
  intro?: boolean; returning?: { child: string; petal: boolean }; entering?: PortalFocus | undefined };

class LagoonGame {
  private readonly lifetime = new AbortController();
  private readonly world = new World('大肥鱼');
  private readonly audio = new LagoonAudio(this.lifetime.signal);
  private readonly engine: GameEngine;
  private readonly canvas: HTMLCanvasElement;
  private readonly picker: HTMLInputElement;
  private readonly folder: HTMLInputElement;
  private readonly projectPicker: HTMLInputElement;
  private readonly resize: ResizeObserver;
  private readonly packs = [builtinPack(this.lifetime.signal)];
  private readonly saves = [1, 2, 3].map(index => new SingleSlotGameSave<SlotProgress>({ gameId: 'dafeiyu-slot-' + index,
    name: `${screenCopy.slot} ${index}`, validateData: isSlotProgress }));
  private readonly autosaves = this.saves.map(store => new LatestAutosave<SlotProgress>(data => store.saveNow(data)));
  private readonly draftSave = new SingleSlotGameSave<WorldDraft>({ gameId: 'dafeiyu-workshop', name: screenCopy.editor, validateData: isWorldDraft,
    onStatus: status => { if (status === 'error' && this.mode === 'editor' && !this.lifetime.signal.aborted) {
      this.message = screenCopy.storageError; this.refresh();
    } } });
  private readonly draftAutosave = new LatestAutosave<WorldDraft>(data => this.draftSave.saveNow(data));
  private readonly packKeys = new Map<LevelPack, string>([[this.packs[0]!, 'coral']]);
  private campaigns = new WeakMap<LevelPack, Campaign>();
  private parked = new WeakMap<LevelPack, { room: Room; parents: Room[] }>();
  private readonly parents: Room[] = [];
  private overworld: Puzzle | undefined;
  private hud: LagoonHud | undefined;
  private screens: ScreenHud | undefined;
  private scene: LagoonScene | undefined;
  private portal: LagoonPortal | undefined;
  private running = false;
  private puzzle: Puzzle | null = null;
  private earnedPetal: Puzzle | undefined;
  private pack = this.packs[0]!;
  private index = 0;
  private selected = 0;
  private library = false;
  private paused = false;
  private pauseIndex = 0;
  private busy = false;
  private usingPad = false;
  private message = '';
  private pending: Move | undefined;
  private mode: 'home' | 'play' | 'editor' | 'test' = 'home';
  private homePage: HomeView['page'] = 'main';
  private homeIndex = 0;
  private overwrite = 0;
  private slots: (SlotProgress | null)[] = [null, null, null];
  private slot = -1;
  private profile: SlotProgress | undefined;
  private preferred = this.packs[0]!;
  private editor: WorldEditor | undefined;
  private tab: PaletteTab = 'objects';
  private brushPage = 0;
  private lastPaint: Cell | undefined;
  private naming = false;

  constructor(canvas: HTMLCanvasElement, picker: HTMLInputElement, folder: HTMLInputElement, projectPicker: HTMLInputElement) {
    this.canvas = canvas;
    this.picker = picker;
    this.folder = folder;
    this.projectPicker = projectPicker;
    this.engine = new GameEngine({ canvas, msaaSamples: 4, clearColor: { r: .015, g: .063, b: .1, a: 1 },
      devicePixelRatio: () => Math.min(devicePixelRatio || 1, 2) });
    this.resize = new ResizeObserver(() => this.fit());
  }
  async init(): Promise<void> {
    const params = new URLSearchParams(location.search);
    const [, official, saved] = await Promise.all([this.engine.init(), officialPacks(this.lifetime.signal),
      Promise.all(this.saves.map(store => store.load()))]);
    this.lifetime.signal.throwIfAborted();
    this.slots = saved;
    for (const pack of official) {
      this.packs.push(pack);
      this.packKeys.set(pack, pack.id);
    }
    this.preferred = params.get('start') === 'coral' ? this.packs[0]! : official[0] ?? this.packs[0]!;
    if (!this.slots[0]) await this.migrate();
    this.lifetime.signal.throwIfAborted();
    const scene = this.scene = new LagoonScene(this.engine);
    this.world.addSystem(this.scene);
    const portal = this.portal = new LagoonPortal(this.engine);
    this.world.addSystem(portal);
    this.hud = new LagoonHud(this.engine, this.world, action => this.act(action), row => {
      const target = Math.floor(this.selected / rowsPerPage) * rowsPerPage + row;
      if (!this.busy && !this.portal?.phase && this.canOpen(target)) { this.audio.play('click'); this.openListedRoom(target); }
    });
    this.screens = new ScreenHud(index => this.homeAction(index), command => this.editorAction(command), index => this.pickBrush(index),
      value => this.finishName(value), (name, facing) => scene.editorPreview(name, facing));
    this.world.addEntity(new Entity('大肥鱼菜单').addComponent(this.screens.root));
    const integration = new RenderIntegration(this.engine, { label: '大肥鱼 2D + GUI' });
    this.world.addRuntimeIntegration(integration);
    integration.registerAll(this.world, system => {
      if (system === scene) return { pass: 'isolated', loadOp: 'clear', depth: false, sort: 10 };
      if (system === portal) return { pass: 'isolated', loadOp: 'load', depth: false, sort: 1100 };
      return { pass: 'shared', loadOp: 'load', sort: 1000 };
    });
    this.bind();
    this.fit();
    if (params.has('verify') && params.get('autoplay') === '1') await this.beginSlot(0, !this.slots[0]);
    else await scene.prepare(true);
    this.lifetime.signal.throwIfAborted();
    this.refresh();
    this.engine.on('update', event => {
      if (!this.paused && !gameSession.paused && this.pending !== undefined) {
        const move = this.pending;
        this.pending = undefined;
        this.move(move);
      }
      const nowPad = !!gamepadFrame();
      if (this.usingPad !== nowPad) { this.usingPad = nowPad; this.refresh(); }
      const transitioning = !!portal.phase;
      if (!gameSession.paused) portal.tick(event.detail.delta);
      if (!transitioning && !this.paused && !gameSession.paused && !this.library && !this.busy) {
        if (this.scene?.tick(event.detail.delta) && this.puzzle?.state.won && !isMap(this.puzzle.level) &&
            (this.mode === 'play' || this.mode === 'test')) this.returnToMap();
        if (this.mode === 'play' || this.mode === 'test') this.hud?.tick(event.detail.delta);
      }
      this.world.update(event.detail.time, event.detail.delta);
    });
    if (params.has('verify')) {
      Object.defineProperty(window, '__dafeiyu', { configurable: true, get: () => this.snapshot() });
    }
    document.body.dataset.renderStatus = 'ready';
    this.running = true;
    this.engine.run();
  }
  private fit(): void {
    if (!this.hud || this.lifetime.signal.aborted) return;
    this.engine.resizeToDisplaySize();
    this.hud.resize(this.engine.displayWidth, this.engine.displayHeight);
    this.refresh();
  }
  private refresh(): void {
    if (!this.hud || !this.screens) return;
    const { displayWidth: width, displayHeight: height } = this.engine;
    const playing = this.mode === 'play' || this.mode === 'test';
    this.hud.root.root.setVisible(playing);
    if (this.mode === 'home') {
      this.screens.home(width, height, { page: this.homePage, selected: this.homeIndex, busy: this.busy, message: this.message,
        slots: this.slots.map(save => save ? this.packForKey(save.active)?.title ?? screenCopy.continue : null) });
      return;
    }
    if (this.mode === 'editor' && this.editor) {
      this.screens.editor(width, height, { editor: this.editor, tab: this.tab, page: this.brushPage, choices: this.choices(), message: this.message,
        naming: this.naming });
      return;
    }
    this.screens.hide();
    const parentMap = this.parentMapIndex();
    this.hud.update({ puzzle: this.puzzle, pack: this.pack, active: this.selected,
      library: this.library, paused: this.paused, pauseIndex: this.pauseIndex, busy: this.busy, message: this.message,
      canGoBack: this.parents.length > 0 || parentMap >= 0,
      returnMap: this.paused ? this.pack.entries[parentMap]?.title : undefined,
      selectedLink: this.puzzle?.selectedLink(),
      completed: this.campaigns.get(this.pack)?.completed ?? new Set(),
      locked: this.library ? new Set(this.pack.entries.filter((_, index) => !this.canOpen(index)).map(entry => entry.id)) : new Set(),
      playtest: this.mode === 'test' });
  }
  private save(checkpoint = true): void {
    const puzzle = this.puzzle;
    const campaign = this.campaigns.get(this.pack);
    if (!puzzle || !campaign) return;
    if (puzzle.state.won && !campaign.completed.has(puzzle.level.id)) {
      campaign.completed.add(puzzle.level.id);
      if (!isMap(puzzle.level)) this.earnedPetal = puzzle;
    }
    if (puzzle.state.bonus) {
      campaign.bonuses.set(puzzle.level.id, Math.max(puzzle.state.bonus, campaign.bonuses.get(puzzle.level.id) ?? 0));
    }
    checkpoint ||= puzzle.state.won || !!puzzle.state.conversion;
    if (this.pack === this.packs[0] && puzzle.state.won) this.overworld?.refreshMap();
    const key = this.packKeys.get(this.pack);
    if (this.mode !== 'play' || !key || !this.profile || this.slot < 0) return;
    const rooms = [...this.parents.slice(-31), { index: this.index, puzzle }];
    const progress = { campaign: campaign.progress(), rooms: rooms.map(({ puzzle, entrance }) => ({
      id: puzzle.level.id, state: puzzle.state, ...(entrance === undefined ? {} : { entrance }),
    })) };
    this.profile = { active: key, packs: { ...this.profile.packs, [key]: progress } };
    this.slots[this.slot] = this.profile;
    const autosave = this.autosaves[this.slot]!;
    if (checkpoint) autosave.checkpoint(this.profile);
    else autosave.schedule(this.profile);
  }
  private flushAutosaves(): void {
    for (const store of this.autosaves) void store.flush();
    void this.draftAutosave.flush();
  }
  private canOpen(index: number): boolean {
    const entry = this.pack.entries[index];
    if (!entry) return false;
    // Imported packs keep their room browser for direct testing. Saved campaigns unlock rooms from their maps.
    if (!this.packKeys.has(this.pack) || index === this.index) return true;
    if (this.pack === this.packs[0]) return index === this.pack.initial ||
      !!this.overworld?.state.units.some(unit => unit.marker && unit.link === entry.id && (unit.state ?? 0) >= 2);
    if (this.campaigns.get(this.pack)?.completed.has(entry.id)) return true;
    return [this.puzzle, ...this.parents.map(room => room.puzzle)].some(puzzle => puzzle && isMap(puzzle.level) &&
      (puzzle.level.id === entry.id || puzzle.state.units.some(unit => unit.marker && unit.link === entry.id &&
        (unit.state ?? 0) >= 2 && !puzzle.context.has(unit, 'hide'))));
  }
  private openListedRoom(index: number): void {
    if (this.revisitMap(index)) return;
    const id = this.pack.entries[index]!.id;
    const stack = this.puzzle ? [...this.parents, { index: this.index, puzzle: this.puzzle }] : [...this.parents];
    const ancestor = stack.findLastIndex(room => room.index !== index && isMap(room.puzzle.level) &&
      room.puzzle.level.links.some(link => link.id === id));
    if (ancestor < 0) { void this.open(this.pack, index); return; }
    const room = stack[ancestor]!;
    const puzzle = this.atMapLink(room.puzzle, id, this.campaigns.get(this.pack));
    if (this.overworld === room.puzzle) this.overworld = puzzle;
    void this.open(this.pack, index, { parents: [...stack.slice(0, ancestor),
      { index: room.index, puzzle, entrance: puzzle.selectedEntrance()?.entrance }] });
  }
  private builtinParent(id: string): Room {
    this.overworld = this.atMapLink(this.overworld!, id, this.campaigns.get(this.packs[0]!));
    return { index: this.packs[0]!.initial, puzzle: this.overworld, entrance: this.overworld.selectedEntrance()?.entrance };
  }
  private atMapLink(map: Puzzle, id: string, campaign: Campaign | undefined): Puzzle {
    const selected = map.selectedEntrance();
    const node = selected?.link === id ? selected : map.state.units.find(unit => unit.marker && unit.link === id &&
      (unit.state ?? 0) >= 2 && !map.context.has(unit, 'hide'));
    const cursor = map.state.units.find(unit => map.context.has(unit, 'select'));
    if (node && cursor && (node.x !== cursor.x || node.y !== cursor.y)) {
      const units = map.state.units.map(unit => unit === cursor ? { ...unit, x: node.x, y: node.y } : unit);
      return new Puzzle(map.level, { ...map.state, units }, campaign);
    }
    return map;
  }
  private packForKey(key: string): LevelPack | undefined {
    return this.packs.find(pack => this.packKeys.get(pack) === key);
  }
  private async migrate(): Promise<void> {
    const coral = this.packs[0]!;
    const legacy = new SingleSlotGameSave({ gameId: 'dafeiyu', name: copy.title, validateData: isProgress });
    const packs: Record<string, OfficialProgress> = {};
    const [old, ...official] = await Promise.all([legacy.load(), ...this.packs.slice(1).map(async pack => ({
      key: this.packKeys.get(pack)!, progress: await new SingleSlotGameSave({ gameId: 'dafeiyu-official-' + this.packKeys.get(pack),
        name: pack.title, validateData: isOfficialProgress }).load(),
    }))]);
    if (old) packs.coral = { campaign: { completed: old.completed, bonuses: [], conversions: [] },
      rooms: [{ id: coral.entries[old.stage]!.id, state: old.state }] };
    for (const { key, progress } of official) if (progress) packs[key] = progress;
    const preferred = this.packKeys.get(this.preferred)!;
    const active = packs[preferred] ? preferred : Object.keys(packs)[0];
    if (active && !this.lifetime.signal.aborted) {
      this.slots[0] = { active, packs };
      this.saves[0]!.save(this.slots[0]);
    }
  }
  private homeScreen(): void {
    this.flushAutosaves();
    this.earnedPetal = undefined;
    if (this.mode === 'play' && this.puzzle) this.audio.play('exit');
    this.mode = 'home';
    this.homePage = 'main';
    this.homeIndex = 0;
    this.slot = -1;
    this.pending = undefined;
    this.library = false;
    this.paused = false;
    this.message = '';
    this.scene?.setEditorCursor();
    this.scene?.setHome(true);
    this.refresh();
  }
  private homeBack(): void {
    if (this.homePage === 'overwrite') { this.homePage = 'new'; this.homeIndex = this.overwrite; }
    else { this.homePage = 'main'; this.homeIndex = 0; }
    this.message = '';
    this.refresh();
  }
  private homeAction(index: number): void {
    if (this.busy || this.mode !== 'home' || gameSession.paused) return;
    this.audio.play('click');
    this.message = '';
    if (this.homePage === 'main') {
      if (index === 2) { void this.startEditor(); return; }
      if (index === 0 || index === 1 && this.slots.some(Boolean)) {
        this.homePage = index === 0 ? 'new' : 'continue';
        this.homeIndex = index === 0 ? Math.max(0, this.slots.indexOf(null)) : this.slots.findIndex(Boolean);
      }
    } else if (this.homePage === 'overwrite') {
      if (index === 0) { void this.beginSlot(this.overwrite, true); return; }
      this.homeBack();
    } else if (index === 3) this.homeBack();
    else if (index >= 0 && index < this.slots.length) {
      if (this.homePage === 'continue') { if (this.slots[index]) void this.beginSlot(index, false); }
      else if (this.slots[index]) { this.overwrite = index; this.homePage = 'overwrite'; this.homeIndex = 1; }
      else void this.beginSlot(index, true);
    }
    this.refresh();
  }
  private async beginSlot(slot: number, fresh: boolean): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.refresh();
    try {
      await this.autosaves[slot]!.flush();
      const draft = fresh ? undefined : this.slots[slot];
      const pack = (draft && this.packForKey(draft.active)) || this.preferred;
      this.slot = slot;
      this.profile = draft ?? { active: this.packKeys.get(pack)!, packs: {} };
      this.parked = new WeakMap();
      this.campaigns = new WeakMap();
      this.parents.length = 0;
      this.puzzle = null;
      const coral = this.packs[0]!;
      const saved = this.profile.packs.coral;
      const [map] = await Promise.all([coral.entries[coral.initial]!.read(), this.scene?.prepare(false)]);
      this.lifetime.signal.throwIfAborted();
      const campaign = new Campaign(coral, saved?.campaign);
      this.campaigns.set(coral, campaign);
      this.overworld = new Puzzle(map, saved?.rooms.find(room => room.id === map.id)?.state, campaign);
      this.mode = 'play';
      this.library = false;
      this.scene?.setHome(false);
      await this.openStart(pack);
      if (!this.puzzle) throw Error('The starting room could not be loaded');
    } catch (error) {
      if (this.lifetime.signal.aborted) return;
      this.homeScreen();
      this.message = copy.failed;
      console.warn('大肥鱼存档启动失败', error);
    } finally {
      this.busy = false;
      if (!this.lifetime.signal.aborted) this.refresh();
    }
  }

  private async startEditor(): Promise<void> {
    this.busy = true;
    this.refresh();
    try {
      await this.draftAutosave.flush();
      const [draft] = await Promise.all([this.editor ? undefined : this.draftSave.load(), this.scene?.prepare(false)]);
      this.lifetime.signal.throwIfAborted();
      this.editor ??= new WorldEditor(draft ?? newDraft());
      this.editScreen();
    } catch (error) {
      if (!this.lifetime.signal.aborted) { this.message = copy.failed; console.warn('大肥鱼草稿读取失败', error); }
    } finally {
      this.busy = false;
      if (!this.lifetime.signal.aborted) this.refresh();
    }
  }
  private editScreen(): void {
    this.earnedPetal = undefined;
    if (this.mode === 'test' && this.puzzle) this.audio.play('exit');
    this.mode = 'editor';
    this.naming = false;
    this.puzzle = null;
    this.parents.length = 0;
    this.library = false;
    this.paused = false;
    this.pending = undefined;
    this.message = '';
    this.scene?.setHome(false);
    this.redrawEditor();
  }
  private choices(): readonly string[] { return this.tab === 'map' ? editorMapTools : palettes[this.tab]; }
  private chooseTab(tab: PaletteTab): void {
    this.tab = tab;
    this.brushPage = 0;
  }
  private pickBrush(index: number): void {
    const brush = this.choices()[this.brushPage * palettePageSize + index];
    if (this.mode !== 'editor' || this.naming || !this.editor || !brush) return;
    this.audio.play('click');
    this.editor.brush = brush;
    this.message = '';
    this.refresh();
  }
  private redrawEditor(persist = false): void {
    const editor = this.editor;
    if (!editor) return;
    if (!editor.room.map && this.tab === 'map') this.chooseTab('objects');
    this.scene?.setEditorCursor(editor.cursor);
    this.scene?.setPuzzle(new Puzzle(levelFromDraft(editor.room)));
    if (persist) this.draftAutosave.schedule(editor.project);
    this.refresh();
  }
  private paint(at: Cell, erase = false, stack?: boolean): void {
    const editor = this.editor;
    if (!editor || this.mode !== 'editor' || gameSession.paused) return;
    if (editor.paint(at, erase ? '@erase' : editor.brush, stack)) { this.message = ''; this.redrawEditor(true); }
    else {
      this.scene?.setEditorCursor(editor.cursor);
      if (editor.brush === '@select') this.refresh();
    }
  }
  private editorAction(action: EditorCommand): void {
    const editor = this.editor;
    if (!editor || this.mode !== 'editor' || this.busy || this.naming || gameSession.paused) return;
    this.audio.play('click');
    this.message = '';
    if (action === 'home') { this.homeScreen(); return; }
    if (action === 'run') { void this.playtest(); return; }
    if (action === 'undo') { if (editor.undo()) this.redrawEditor(true); return; }
    if (action === 'export') { this.exportDraft(editor.project); return; }
    if (action === 'import') { this.projectPicker.click(); return; }
    if (action === 'rename') { this.renameEditor(); return; }
    if (action === 'flower-down' || action === 'flower-up') {
      if (editor.setClearCount((editor.room.clearCount ?? 0) + (action === 'flower-up' ? 1 : -1))) this.redrawEditor(true);
      return;
    }
    if (action === 'gate-type' || action === 'gate-down' || action === 'gate-up') {
      const current = editor.selectedPath?.condition;
      const gate = action === 'gate-type' ? ((current?.gate ?? 0) + 1) % 5 as GateType | 0 : current?.gate;
      const count = (current?.requirement ?? 1) + (action === 'gate-up' ? 1 : action === 'gate-down' ? -1 : 0);
      if (gate !== undefined && editor.setPathGate(gate, count)) this.redrawEditor(true);
      return;
    }
    if (action === 'add' || action === 'map') {
      if (editor.addRoom(action === 'map')) {
        if (editor.brush === '@locked') this.chooseTab('map');
        this.message = editor.brush === '@locked' ? screenCopy.added : screenCopy.roomAdded;
        this.redrawEditor(true);
      }
      return;
    }
    if (action === 'room-prev' || action === 'room-next' || action === 'world') {
      editor.select(action === 'world' ? 0 : editor.index + (action === 'room-prev' ? -1 : 1));
      this.redrawEditor();
      return;
    }
    if (action.startsWith('width-') || action.startsWith('height-')) {
      const change = action.endsWith('-up') ? 1 : -1;
      const alongWidth = action.startsWith('width-');
      if (editor.resize(editor.room.width + (alongWidth ? change : 0), editor.room.height + (alongWidth ? 0 : change))) {
        this.redrawEditor(true); return;
      }
      this.message = screenCopy.noEdit;
    }
    if (action === 'objects' || action === 'text' || action === 'map-tools') this.chooseTab(action === 'map-tools' ? 'map' : action);
    if (action === 'select') editor.brush = '@select';
    if (action === 'erase') editor.brush = '@erase';
    if (action === 'stack') editor.stacking = !editor.stacking;
    if (action === 'rotate') editor.facing = ((editor.facing + 1) % 4) as Direction;
    if (action === 'target-prev' || action === 'target-next') editor.selectTarget(action === 'target-prev' ? -1 : 1);
    if (action === 'palette-prev' || action === 'palette-next') this.brushPage = Math.max(0,
      Math.min(Math.ceil(this.choices().length / palettePageSize) - 1, this.brushPage + (action === 'palette-prev' ? -1 : 1)));
    this.refresh();
  }
  private renameEditor(): void {
    const input = this.screens?.nameInput;
    if (!input || !this.editor) return;
    this.naming = true;
    input.setValue(this.editor.room.title);
    // Select the previous name before opening the native text session.
    input.selectAll();
    this.refresh();
    // The field needs a GUI layout pass before the focus manager admits it.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!this.naming || this.lifetime.signal.aborted) return;
      this.hud?.system.focus.focus(input);
    }));
  }
  private finishName(value: string | undefined): void {
    if (!this.naming) return;
    this.audio.play('click');
    this.naming = false;
    this.hud?.system.focus.blur();
    if (value && this.editor?.rename(value)) this.redrawEditor(true);
    else this.refresh();
  }
  private exportDraft(project: WorldDraft): void {
    const url = URL.createObjectURL(new Blob([JSON.stringify(project, null, 2) + '\n'], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'dafeiyu-world.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  private async importDraft(file: File): Promise<void> {
    if (this.mode !== 'editor' || this.busy) return;
    this.busy = true;
    try {
      if (file.size > 8 * 1024 * 1024) throw Error('Draft is too large');
      const draft: unknown = JSON.parse(await file.text());
      if (!isWorldDraft(draft)) throw Error('Invalid world draft');
      if (this.lifetime.signal.aborted || this.mode !== 'editor') return;
      this.editor = new WorldEditor(draft);
      this.editor.select(0);
      this.chooseTab('objects');
      this.message = '';
      this.redrawEditor(true);
    } catch {
      this.message = screenCopy.badImport;
    } finally {
      this.busy = false;
      if (!this.lifetime.signal.aborted) this.refresh();
    }
  }
  private async playtest(): Promise<void> {
    if (!this.editor || this.busy) return;
    void this.draftAutosave.flush();
    const pack = packFromDraft(this.editor.project);
    this.campaigns.set(pack, new Campaign(pack));
    this.mode = 'test';
    this.scene?.setEditorCursor();
    await this.open(pack, this.editor.index);
    if (!this.lifetime.signal.aborted && !this.puzzle) this.editScreen();
  }

  private editPointer(event: PointerEvent): void {
    if (this.mode !== 'editor' || this.busy || this.naming || !this.scene?.bounds.cell) return;
    const { x, y, cell } = this.scene.bounds;
    const rect = this.canvas.getBoundingClientRect();
    const col = Math.floor(((event.clientX - rect.left) * this.engine.displayWidth / rect.width - x) / cell);
    const row = Math.floor(((event.clientY - rect.top) * this.engine.displayHeight / rect.height - y) / cell);
    const room = this.editor!.room;
    if (col < 1 || row < 1 || col >= room.width - 1 || row >= room.height - 1) return;
    const at = { x: col, y: row };
    if (event.buttons & 3) {
      if (event.type === 'pointerdown' || !this.lastPaint || !sameCell(this.lastPaint, at)) {
        this.lastPaint = at;
        this.paint(at, !!(event.buttons & 2), event.shiftKey || this.editor!.stacking);
      }
    } else if (this.editor!.brush !== '@select' && !sameCell(this.editor!.cursor, at)) {
      this.lastPaint = undefined;
      this.editor!.cursor = at;
      this.scene.setEditorCursor(at);
    }
  }
  private bind(): void {
    const options = { signal: this.lifetime.signal };
    const unlock = (event: Event) => {
      if (event.isTrusted || document.body.dataset.gamepadActive === 'true') this.audio.unlock(event.isTrusted);
    };
    for (const type of ['pointerdown', 'pointerup', 'keydown'] as const) {
      window.addEventListener(type, unlock, { ...options, capture: true });
    }
    this.audio.visibility(document.hidden);
    window.addEventListener('keydown', event => {
      if (event.altKey || gameSession.paused) return;
      const modified = event.ctrlKey || event.metaKey;
      const playing = this.mode === 'play' || this.mode === 'test';
      const history = modified && playing && (event.code === 'KeyY' || event.code === 'KeyZ');
      if (modified && !history) return;
      const action = history ? event.code === 'KeyY' || event.shiftKey ? 'redo' : 'undo' : actions.get(event.code);
      const move = moves.get(event.code);
      if (this.mode === 'home') {
        if (this.busy || !action && move === undefined) return;
        event.preventDefault();
        if (event.code === 'Escape' || action === 'undo') { if (!event.repeat) { this.audio.play('click'); this.homeBack(); } }
        else if (action === 'next' || move === 'wait') { if (!event.repeat) this.homeAction(this.homeIndex); }
        else if (move !== undefined) {
          const length = this.homePage === 'main' ? 3 : this.homePage === 'overwrite' ? 2 : 4;
          const delta = move === 1 || move === 2 ? -1 : 1;
          do { this.homeIndex = (this.homeIndex + length + delta) % length; }
          while (this.homePage === 'continue' && this.homeIndex < 3 && !this.slots[this.homeIndex] ||
            this.homePage === 'main' && this.homeIndex === 1 && !this.slots.some(Boolean));
          this.refresh();
        }
        return;
      }
      if (this.mode === 'editor' && this.editor) {
        if (this.naming) {
          if (event.code === 'Escape' && !event.isComposing) { event.preventDefault(); this.finishName(undefined); }
          return;
        }
        if (this.busy || !action && move === undefined && !['KeyQ', 'KeyE', 'Delete', 'Tab'].includes(event.code)) return;
        event.preventDefault();
        if (action === 'pause') { if (!event.repeat) this.editorAction('home'); }
        else if (action === 'restart') { if (!event.repeat) this.editorAction('run'); }
        else if (action === 'undo') { if (!event.repeat) this.editorAction('undo'); }
        else if (action === 'library' || event.code === 'Tab') this.editorAction(this.tab === 'objects' ? 'text' : this.tab === 'text' && this.editor.room.map ? 'map-tools' : 'objects');
        else if (event.code === 'KeyQ' || event.code === 'KeyE') this.editorAction(event.code === 'KeyQ' ? 'palette-prev' : 'palette-next');
        else if (event.code === 'Delete') this.paint(this.editor.cursor, true);
        else if (move === 'wait' || action === 'next') { if (!event.repeat) this.paint(this.editor.cursor, false, event.shiftKey || this.editor.stacking); }
        else if (move !== undefined) {
          const [dx, dy] = vectors[move];
          this.editor.moveCursor(dx, dy);
          this.scene?.setEditorCursor(this.editor.cursor);
          if (this.editor.brush === '@select') this.refresh();
        }
        return;
      }
      if (!action && move === undefined) return;
      if (this.portal?.phase) { event.preventDefault(); return; }
      if (this.paused) {
        event.preventDefault();
        if (action === 'pause' || action === 'undo') { if (!event.repeat) this.act('resume'); }
        else if (action === 'next' || move === 'wait') { if (!event.repeat) this.act(pauseActions[this.pauseIndex]!); }
        else if (move !== undefined) {
          const delta = move === 1 || move === 2 ? -1 : 1;
          do { this.pauseIndex = (this.pauseIndex + pauseActions.length + delta) % pauseActions.length; }
          while (pauseActions[this.pauseIndex] === 'world' && this.parentMapIndex() < 0);
          this.refresh();
        }
        return;
      }
      event.preventDefault();
      if (action) { if (!event.repeat) this.act(action === 'pause' && this.library ? 'library' : action); return; }
      if (move !== undefined) {
        if (move === 'wait' && event.repeat) return;
        if (this.library && move === 'wait') this.act('next');
        else if (!this.library && move === 'wait' && (this.puzzle?.state.won || this.puzzle?.selectedLink())) this.act('next');
        else this.pending = move;
      }
    }, options);
    window.addEventListener('blur', () => { this.pending = undefined; }, options);
    document.addEventListener('visibilitychange', () => {
      this.audio.visibility(document.hidden);
      if (document.hidden) { this.pending = undefined; this.flushAutosaves(); }
    }, options);
    for (const input of [this.picker, this.folder]) input.addEventListener('change', () => {
      const files = Array.from(input.files ?? []);
      input.value = '';
      if (files.length) void this.import(files);
    }, options);
    this.projectPicker.addEventListener('change', () => {
      const file = this.projectPicker.files?.[0];
      this.projectPicker.value = '';
      if (file) void this.importDraft(file);
    }, options);
    for (const type of ['pointerdown', 'pointermove'] as const) this.canvas.addEventListener(type, event => this.editPointer(event), options);
    for (const type of ['pointerup', 'pointercancel'] as const) this.canvas.addEventListener(type, () => { this.lastPaint = undefined; }, options);
    this.canvas.addEventListener('contextmenu', event => { if (this.mode === 'editor') event.preventDefault(); }, options);
    this.resize.observe(this.canvas);
  }
  private move(move: Move): void {
    if (this.busy || this.paused || this.portal?.phase) return;
    if (this.library) {
      if (move === 1 || move === 3) this.select(this.selected + (move === 1 ? -1 : 1));
      else if (move === 0 || move === 2) this.select(this.selected + (move === 2 ? -rowsPerPage : rowsPerPage));
      return;
    }
    if (!this.puzzle || this.puzzle.state.won) return;
    const before = this.puzzle.state;
    const context = this.puzzle.context;
    this.puzzle.move(move);
    if (this.puzzle.state !== before) this.turnSound(context, this.puzzle, move !== 'wait');
    this.scene?.setPuzzle(this.puzzle, before);
    this.message = '';
    this.save(false);
    this.refresh();
    if (this.puzzle.state.conversion) void this.convertRoom(this.puzzle, this.puzzle.state.conversion);
  }
  private turnSound(before: RuleContext, puzzle: Puzzle, directional: boolean): void {
    if (!this.audio.active) return;
    const defeated = puzzle.defeated.length > 0;
    if (defeated) this.audio.play('defeat');
    if (puzzle.state.won) { this.audio.play('victory'); return; }
    if (puzzle.state.conversion) return;
    if (!isMap(puzzle.level) && !puzzle.context.units.some(unit => player(puzzle.context, unit)) &&
        before.units.some(unit => player(before, unit))) {
      this.audio.play('failure');
      return;
    }
    if (defeated || !directional) return;
    const controlled = new Map(before.units.filter(unit => unit.id >= 0 && (player(before, unit) || before.has(unit, 'select')))
      .map(unit => [unit.id, unit]));
    if (puzzle.state.units.some(unit => {
      const old = controlled.get(unit.id);
      return old && (old.x !== unit.x || old.y !== unit.y);
    })) this.audio.play('move');
  }
  private select(index: number): void {
    this.selected = Math.max(0, Math.min(this.pack.entries.length - 1, index));
    this.refresh();
  }
  private act(action: HudAction): void {
    if (this.busy || this.portal?.phase || gameSession.paused) return;
    const puzzle = this.puzzle;
    if (action === 'pause') {
      if (!puzzle || this.library) return;
      this.audio.play('click');
      this.paused = true;
      this.pauseIndex = 0;
      this.pending = undefined;
      this.refresh();
      return;
    }
    if (this.paused && action !== 'resume' && action !== 'world' && action !== 'home') return;
    this.audio.play('click');
    if (action === 'resume') {
      this.paused = false;
      this.refresh();
      return;
    }
    this.message = '';
    if (action === 'world') {
      this.returnToMap();
      return;
    } else if (action === 'home' || this.mode === 'test' && action === 'library') {
      if (this.mode === 'test') this.editScreen();
      else this.homeScreen();
      return;
    } else if (action === 'library') {
      this.library = !this.library;
      this.selected = this.index;
      this.pending = undefined;
    } else if (action === 'files' || action === 'folder') {
      if (this.mode === 'play') (action === 'files' ? this.picker : this.folder).click();
    } else if (this.library) {
      if (action === 'older' || action === 'newer') this.select(this.selected + (action === 'older' ? -rowsPerPage : rowsPerPage));
      if (action === 'pack') {
        const current = this.packs.indexOf(this.pack);
        const pack = this.packs[(current + 1) % this.packs.length]!;
        void this.openStart(pack, true);
      }
      if (action === 'next') {
        if (this.canOpen(this.selected)) this.openListedRoom(this.selected);
        else this.message = copy.locked;
      }
    } else if (puzzle) {
      if (action === 'undo' || action === 'redo' || action === 'restart') {
        if (action === 'restart') {
          this.earnedPetal = undefined;
          puzzle.reset();
          this.scene?.setPuzzle(puzzle);
        } else {
          const previous = puzzle.state;
          const context = puzzle.context;
          if (action === 'undo') puzzle.undo();
          else puzzle.redo();
          if (puzzle.state !== previous) {
            if (action === 'redo') this.turnSound(context, puzzle, false);
            this.scene?.setPuzzle(puzzle, previous);
          }
        }
        this.save(action === 'restart');
      } else if (action === 'next') {
        if (puzzle.state.won && this.parentMapIndex() >= 0) {
          this.returnToMap();
        } else if (puzzle.selectedEntrance()?.link) {
          const entrance = puzzle.selectedEntrance()!;
          const id = entrance.link!.toLowerCase();
          const target = this.pack.entries.findIndex(entry => entry.id === id);
          if (target === -1) this.message = copy.missingLink;
          else if (target !== this.index && !this.revisitMap(target)) {
            void this.open(this.pack, target, {
              parents: [...this.parents, { index: this.index, puzzle, entrance: entrance.entrance }],
              entering: this.mapFocus(puzzle, entrance),
            });
          }
        } else if (this.parents.length) this.returnToParent();
      }
    }
    this.refresh();
  }
  private parentMapIndex(): number {
    const parent = this.parents.findLast(room => isMap(room.puzzle.level));
    if (parent) return parent.index;
    if (!this.puzzle || this.index === this.pack.initial && isMap(this.puzzle.level)) return -1;
    const index = this.campaigns.get(this.pack)?.parentOf(this.puzzle.level.id) ?? -1;
    return index === this.index ? -1 : index;
  }
  private revisitMap(index: number): boolean {
    const ancestor = this.parents.findLastIndex(room => room.index === index && isMap(room.puzzle.level));
    if (ancestor < 0) return false;
    void this.restoreMap(ancestor);
    return true;
  }
  private returnToMap(): void {
    const current = this.puzzle;
    const index = this.parentMapIndex();
    if (!current || index < 0) return;
    const child = current.level.id;
    const petal = current.state.won && this.earnedPetal === current;
    const ancestor = this.parents.findLastIndex(room => isMap(room.puzzle.level));
    if (ancestor < 0) { void this.open(this.pack, index, { returning: { child, petal } }); return; }
    void this.restoreMap(ancestor, petal ? child : undefined);
  }
  private mapFocus(puzzle: Puzzle | null, cell?: Cell): PortalFocus | undefined {
    if (!puzzle || !isMap(puzzle.level)) return;
    const at = cell ?? puzzle.selectedEntrance() ?? puzzle.state.units.find(unit => puzzle.context.has(unit, 'select'));
    if (at) return { x: at.x, y: at.y, cols: puzzle.level.width, rows: puzzle.level.height };
  }
  private cover(focus?: PortalFocus): Promise<void> | undefined {
    if (!this.running) return;
    this.pending = undefined;
    return this.portal?.cover(focus);
  }
  private async restoreMap(ancestor: number, petal?: string): Promise<void> {
    const map = this.parents[ancestor]!;
    const cover = this.cover(this.mapFocus(this.puzzle));
    if (cover) await cover;
    if (this.lifetime.signal.aborted) return;
    map.puzzle.refreshMap();
    this.show(this.pack, map, this.parents.slice(0, ancestor), false);
    this.save();
    this.refresh();
    if (petal) this.collectPetal(map.puzzle, petal, map.entrance);
    if (cover) this.portal?.reveal(this.mapFocus(map.puzzle));
  }
  private collectPetal(map: Puzzle, child: string, entrance?: string): void {
    const link = map.state.units.find(unit => unit.link === child && (entrance === undefined || unit.entrance === entrance) &&
      !map.context.has(unit, 'hide'));
    const from = link ?? map.state.units.find(unit => map.context.has(unit, 'select'));
    const flower = map.flower;
    if (from && flower) this.hud?.collectPetal(from, { local: !!link,
      bloom: !!link && flower.required > 0 && flower.petals === flower.required });
  }
  private returnToParent(): void {
    const parent = this.parents.at(-1);
    if (!parent) return;
    if (isMap(parent.puzzle.level)) { void this.restoreMap(this.parents.length - 1); return; }
    this.parents.pop();
    this.earnedPetal = undefined;
    this.pending = undefined;
    parent.puzzle.refreshMap();
    this.puzzle = parent.puzzle;
    this.index = this.selected = parent.index;
    this.scene?.setPuzzle(parent.puzzle);
    this.audio.play('exit');
    this.save();
    this.refresh();
  }
  private async convertRoom(puzzle: Puzzle, targets: string[]): Promise<void> {
    const campaign = this.campaigns.get(this.pack);
    if (!campaign) return;
    const id = puzzle.level.id;
    const parent = this.parents.at(-1);
    if (parent) {
      campaign.replace(parent.puzzle.level.id, id, targets, parent.entrance);
      this.returnToParent();
    } else {
      const index = campaign.parentOf(id);
      if (index < 0) { this.message = copy.missingLink; this.refresh(); return; }
      await this.open(this.pack, index, { conversion: { child: id, targets } });
    }
  }
  private async openStart(pack: LevelPack, keepLibrary = false): Promise<void> {
    const parked = this.parked.get(pack);
    if (parked) { this.show(pack, parked.room, parked.parents, keepLibrary); this.save(); this.refresh(); return; }
    const key = this.packKeys.get(pack);
    const saved = key ? this.profile?.packs[key] : undefined;
    const campaign = this.campaigns.get(pack) ?? new Campaign(pack, saved?.campaign);
    this.campaigns.set(pack, campaign);
    if (saved) {
      this.busy = true;
      this.pending = undefined;
      this.refresh();
      try {
        const indices = saved.rooms.map(room => pack.entries.findIndex(entry => entry.id === room.id));
        if (indices.every(index => index >= 0)) {
          const builtin = pack === this.packs[0];
          const rooms: Room[] = await Promise.all(indices.map(async (index, slot) => ({ index, entrance: saved.rooms[slot]!.entrance,
            puzzle: builtin && index === pack.initial && this.overworld ? this.overworld :
              new Puzzle(await pack.entries[index]!.read(), saved.rooms[slot]!.state, campaign) })));
          if (this.lifetime.signal.aborted) return;
          const active = rooms.pop()!;
          if (builtin && active.index !== pack.initial && !rooms.length) rooms.push(this.builtinParent(active.puzzle.level.id));
          this.show(pack, active, rooms, keepLibrary);
          if (active.puzzle.state.conversion) await this.convertRoom(active.puzzle, active.puzzle.state.conversion);
          this.save();
          return;
        }
      } catch (error) {
        if (this.lifetime.signal.aborted) return;
        console.warn('大肥鱼存档读取失败', error);
      } finally {
        this.busy = false;
        if (!this.lifetime.signal.aborted) this.refresh();
      }
    }
    const first = pack.first;
    const intro = first !== undefined && first !== pack.initial &&
      !this.campaigns.get(pack)?.completed.has(pack.entries[first]!.id);
    return this.open(pack, intro ? first : pack.initial, { keepLibrary, intro });
  }
  private show(pack: LevelPack, { index, puzzle }: Room, parents: Room[], keepLibrary: boolean): void {
    const leaving = this.puzzle && pack === this.pack && (parents.length < this.parents.length ||
      (!isMap(this.puzzle.level) && isMap(puzzle.level)));
    if (pack !== this.pack && this.puzzle) this.parked.set(this.pack, { room: { index: this.index, puzzle: this.puzzle }, parents: [...this.parents] });
    this.parked.delete(pack);
    this.pending = undefined;
    this.paused = false;
    this.earnedPetal = undefined;
    this.scene?.setPuzzle(puzzle);
    this.index = this.selected = index;
    this.pack = pack;
    this.puzzle = puzzle;
    this.library = keepLibrary;
    this.parents.splice(0, this.parents.length, ...parents);
    this.audio.play(leaving ? 'exit' : 'enter');
  }
  private async open(pack: LevelPack, index: number,
    { keepLibrary = false, parents = [], conversion, intro, returning: destination, entering }: OpenOptions = {}): Promise<void> {
    this.busy = true;
    this.pending = undefined;
    this.refresh();
    const cover = entering || destination || conversion && pack.entries[index]?.map ? this.cover(entering) : undefined;
    try {
      const builtin = pack === this.packs[0];
      const returning = builtin && index === pack.initial ? this.overworld : undefined;
      const [level, start] = await Promise.all([returning?.level ?? pack.entries[index]!.read(),
        intro ? pack.entries[pack.initial]!.read() : undefined, cover]);
      if (this.lifetime.signal.aborted) return;
      const campaign = this.campaigns.get(pack);
      if (conversion) campaign?.replace(level.id, conversion.child, conversion.targets);
      let puzzle = returning ?? new Puzzle(level, undefined, campaign);
      if (!parents.length && builtin && index !== pack.initial) parents.push(this.builtinParent(level.id));
      if (!parents.length && start) parents.push({ index: pack.initial, puzzle: new Puzzle(start, undefined, campaign) });
      if (destination) puzzle = this.atMapLink(puzzle, destination.child, campaign);
      this.show(pack, { index, puzzle }, parents, keepLibrary);
      this.save();
      if (destination?.petal) {
        this.refresh();
        this.collectPetal(puzzle, destination.child);
      }
    } catch (error) {
      if (cover) await cover;
      if (!this.lifetime.signal.aborted) {
        this.message = copy.failed;
        console.warn('大肥鱼关卡读取失败', error);
      }
    } finally {
      this.busy = false;
      if (!this.lifetime.signal.aborted) {
        if (cover) this.portal?.reveal(this.mapFocus(this.puzzle));
        this.refresh();
      }
    }
  }
  private async import(files: File[]): Promise<void> {
    if (this.busy || this.portal?.phase) return;
    this.library = true;
    this.busy = true;
    this.message = copy.load;
    this.refresh();
    try {
      const packs = await localPacks(files);
      if (this.lifetime.signal.aborted) return;
      const first = packs[0];
      if (!first) { this.message = copy.noPair; return; }
      this.message = '';
      for (const pack of packs) this.campaigns.set(pack, new Campaign(pack));
      await this.openStart(first);
      if (this.pack === first) {
        // Release replaced file handles when the same named pack is imported again.
        for (const pack of packs) {
          const previous = this.packs.findIndex(entry => !this.packKeys.has(entry) && entry.title === pack.title);
          if (previous === -1) this.packs.push(pack);
          else this.packs[previous] = pack;
        }
      }
    } catch (error) {
      this.message = copy.failed;
      console.warn('大肥鱼关卡包读取失败', error);
    } finally {
      this.busy = false;
      if (!this.lifetime.signal.aborted) this.refresh();
    }
  }
  snapshot() {
    const nodes = (this.mode === 'home' || this.mode === 'editor' ? this.screens : this.hud)?.root.root.children;
    return { mode: this.mode, slot: this.slot + 1, slots: this.slots.map(Boolean), editor: this.mode === 'editor' ? this.editor?.project : undefined,
      editing: this.mode === 'editor' ? this.editor?.room.id : undefined, brush: this.mode === 'editor' ? this.editor?.brush : undefined,
      editorPalette: this.mode === 'editor' ? this.choices().slice(this.brushPage * palettePageSize, (this.brushPage + 1) * palettePageSize) : undefined,
      current: this.puzzle?.level.id, title: this.puzzle?.level.title, state: this.puzzle?.state,
      parents: this.parents.map(({ puzzle, entrance }) => ({ id: puzzle.level.id, entrance })),
      transition: this.portal?.phase,
      rules: this.puzzle?.context.rules.map(rule => rule.label), library: this.library, paused: this.paused, active: this.selected,
      pack: this.pack.title, gamepad: this.usingPad, bounds: this.scene?.bounds, message: this.message,
      animation: this.scene?.animationSnapshot(), flower: this.puzzle?.flower, collectingPetal: this.hud?.collecting,
      audio: this.audio.snapshot(),
      openPaths: this.puzzle?.openPaths.map(({ x, y }) => [x, y]), selectedLink: this.puzzle?.selectedLink(),
      hud: nodes?.map(node => ({ id: node.id, text: 'text' in node ? node.text : '', value: 'value' in node ? node.value : undefined,
        visible: node.visible, disabled: node.disabled, icon: !!node.style.icon, rect: {...node.rect} })) };
  }
  dispose(): void {
    if (this.lifetime.signal.aborted) return;
    this.flushAutosaves();
    this.lifetime.abort();
    this.audio.dispose();
    this.resize.disconnect();
    this.engine.stop();
    this.world.destroy();
    this.engine.destroy();
  }
}

const stopGamepad = installGamepad('dafeiyu');
const game = new LagoonGame(document.getElementById('lagoon') as HTMLCanvasElement, document.getElementById('level-pair') as HTMLInputElement,
  document.getElementById('level-pack') as HTMLInputElement, document.getElementById('world-draft') as HTMLInputElement);
window.addEventListener('pagehide', event => {
  if (!event.persisted) { stopGamepad(); game.dispose(); }
});
void game.init().catch(error => {
  game.dispose();
  stopGamepad();
  if (error instanceof DOMException && error.name === 'AbortError') return;
  document.body.dataset.renderStatus = 'failed';
  throw error;
});
