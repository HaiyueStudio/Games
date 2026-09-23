import { Entity, World, type HaiyueEngine } from '@haiyue/engine';
import {
  GuiRoot,
  GuiElement,
  GuiLabel,
  GuiButton,
  GuiSwitch,
  GuiSelect,
  GuiImage,
  GuiModal,
  GuiHelpDialog,
  GuiScrollView,
  GuiSystem,
  type GuiFontOptions,
  type GuiPointerEvent,
} from '@haiyue/engine/gui';
import { RenderIntegration } from '@haiyue/engine/experimental';
import { SudokuController } from './gui-controller';
import { sudokuLayout, wrapGuiText, type Rect } from './gui-layout';
import { paintBoard, boardCellAt } from './board-painter';
import { CompletionSweep } from './completion-sweep';
import { drawDigit } from './led-display';
import { DEFAULT_OPTIONS, SEGMENTS, type Options } from './rules';
import {
  RULE_KEYS,
  LANGUAGES,
  LANGUAGE_NAMES,
  ruleCopy,
  activeRuleDetails,
  type TextKey,
  type Language,
} from './i18n';
import { selectRule, type RuleKey } from './extra-rules';
import { THEMES, THEME_IDS, type ThemeId } from './theme';
import { autoCandidateFiltering, noteDisplayMasks, noteCrossedMasks } from './preferences';
import { boardWidth } from './topology';
import { completionCounts } from './statistics';
import { exportPuzzleImage, paintExportIcon } from './export-image';
import { GUI_FONT_CHARS } from './gui-font-chars';
export interface GuiTextures {
  createCanvas2D(width: number, height: number): HTMLCanvasElement;
  textureFromCanvas(canvas: HTMLCanvasElement, key: string): GPUTexture;
  readAtlasPixels?: GuiFontOptions['readAtlasPixels'];
  icon(name: string): Promise<GPUTexture>;
  saveImage(canvas: HTMLCanvasElement, filename: string): Promise<'photos' | 'download'>;
  dispose(): void;
}
function at(node: GuiElement, r: Rect) {
  if (Object.keys(r).some((k) => node.rect[k as keyof Rect] !== r[k as keyof Rect])) {
    node.rect = { ...r };
    node.markDirty();
  }
  node.layout = () => {};
}
class Paragraph extends GuiElement {
  private lines: GuiLabel[] = [];
  measure?: (text: string, size: number) => number;
  show(text: string, rect: Rect, size: number, color: string, offset = 0) {
    at(this, rect);
    const content = wrapGuiText(text, rect.width - 4, size, this.measure),
      count = Math.max(1, Math.floor(rect.height / (size * 1.45)));
    while (this.lines.length < count) this.lines.push(this.add(new GuiLabel({ fontSize: size })));
    this.lines.forEach((line, i) => {
      line.setVisible(i < count);
      line.setText(content[offset + i] ?? '');
      line.setFontSize(size);
      line.setStyle({ color });
      at(line, { x: rect.x, y: rect.y + i * size * 1.45, width: rect.width, height: size * 1.45 });
    });
    return { total: content.length, count };
  }
}
/** All game UI pixels and hit targets belong to Haiyue GuiSystem. */
export class SudokuGui {
  readonly root = new GuiRoot({ theme: { fontFamily: 'sans-serif', fontSize: 14, radius: 10 } });
  readonly world = new World('Sudoku Engine GUI');
  readonly system: GuiSystem;
  readonly hud = this.root.add(new GuiElement({ id: 'hud' }));
  readonly newPage = this.root.add(new GuiElement({ id: 'new-page', visible: false }));
  readonly settings = this.root.add(new GuiElement({ id: 'settings-page', visible: false }));
  readonly rulesPage = this.root.add(new GuiElement({ id: 'rules-page', visible: false }));
  readonly statsPage = this.root.add(new GuiElement({ id: 'statistics-page', visible: false }));
  readonly statsTitle = this.statsPage.add(new GuiLabel({ fontSize: 24 }));
  readonly statsList = this.statsPage.add(new GuiScrollView({ inertia: true, inertiaStrength: 1, id: 'statistics-list', width: '100%', height: '100%' }));
  private statsLabels: GuiLabel[] = [];
  readonly statsBack: GuiButton;
  readonly statsButton: GuiButton;
  private exporting = false;
  readonly board = this.hud.add(new GuiImage({ id: 'board' }));
  readonly title = this.hud.add(new GuiLabel({ fontSize: 23 }));
  readonly mode = this.hud.add(new GuiLabel({ fontSize: 12 }));
  readonly progress = this.hud.add(new GuiLabel({ fontSize: 12, textAlign: 'right' }));
  readonly clock = this.hud.add(new GuiImage({ disabled: true }));
  readonly cell = this.hud.add(new GuiLabel({ fontSize: 13 }));
  readonly status = this.hud.add(new Paragraph());
  readonly tools = new Map<string, GuiButton>();
  readonly keys: GuiButton[] = [];
  private digits: GuiImage[] = [];
  private keyLabels: GuiLabel[] = [];
  private keyStrikes: GuiLabel[] = [];
  private iconNodes: GuiImage[] = [];
  readonly newButton: GuiButton;
  readonly rulesButton: GuiButton;
  readonly answer: GuiButton;
  readonly lesson = this.hud.add(new GuiElement({ id: 'lesson', visible: false }));
  readonly lessonTitle = this.lesson.add(new GuiLabel({ fontSize: 16 }));
  readonly lessonBody = this.lesson.add(
    new GuiScrollView({ inertia: true, inertiaStrength: 1, id: 'lesson-body', width: '100%', height: '100%' }),
  );
  private lessonLines: GuiLabel[] = [];
  private measureText?: (text: string, size: number) => number;
  readonly lessonPrev: GuiButton;
  readonly lessonNext: GuiButton;
  readonly lessonClose: GuiButton;
  readonly newTitle = this.newPage.add(new GuiLabel({ fontSize: 24 }));
  readonly newBack: GuiButton;
  readonly difficulty: GuiButton[] = [];
  readonly instruction = this.newPage.add(new GuiLabel({ fontSize: 12 }));
  readonly notice = this.newPage.add(new Paragraph());
  readonly start: GuiButton;
  readonly ruleList = this.newPage.add(
    new GuiScrollView({ inertia: true, inertiaStrength: 1, id: 'rule-list', width: '100%', height: '100%' }),
  );
  readonly ruleRows = new Map<
    RuleKey,
    { row: GuiElement; label: GuiLabel; toggle: GuiSwitch; help: GuiButton }
  >();
  readonly prefTitle = this.settings.add(new GuiLabel({ fontSize: 24 }));
  readonly prefBack: GuiButton;
  readonly langLabel = this.settings.add(new GuiLabel({ fontSize: 13 }));
  readonly themeLabel = this.settings.add(new GuiLabel({ fontSize: 13 }));
  readonly language: GuiSelect<Language>;
  readonly theme: GuiSelect<ThemeId>;
  readonly prefRows: {
    key: 'manualCandidates' | 'filterCandidates' | 'showCandidates';
    label: Paragraph;
    detail: Paragraph;
    toggle: GuiSwitch;
  }[] = [];
  readonly help = new GuiHelpDialog({ id: 'rule-help', width: '94%', height: 390 });
  private answerText = new Paragraph();
  private busyText = new Paragraph();
  readonly confirmation = new GuiModal({
    id: 'answer-confirm',
    width: '94%',
    height: 290,
    onConfirm: () => {
      this.controller.session.answer();
      this.controller.commit();
    },
  });
  readonly busy = new GuiModal({
    id: 'busy',
    width: '92%',
    height: 200,
    showConfirmButton: false,
    showCancelButton: false,
    showCloseButton: false,
  });
  private infoTitle: GuiLabel;
  private infoBody: Paragraph;
  private infoBack: GuiButton;
  private infoPrev: GuiButton;
  private infoNext: GuiButton;
  private infoOffset = 0;
  private draft: Options = { ...DEFAULT_OPTIONS };
  private ruleNotice = '';
  private lastLesson = -1;
  private surfaces: HTMLCanvasElement[];
  private boardSurface: HTMLCanvasElement;
  private clockSurface: HTMLCanvasElement;
  private sweep = new CompletionSweep();
  private lastPaint = 0;
  private lastClock = '';
  private themeApplied: ThemeId | null = null;
  private width = 0;
  private height = 0;
  private disposed = false;
  constructor(
    readonly engine: HaiyueEngine,
    readonly controller: SudokuController,
    readonly textures: GuiTextures,
    readonly wake: () => void,
    readonly viewport?: () => { width: number; height: number },
  ) {
    this.help.body.inertia = true;
    this.help.body.inertiaStrength = 1;
    this.system = new GuiSystem(engine, {
      loadOp: 'clear',
      font: {
        canvasFactory: textures.createCanvas2D,
        ...(textures.readAtlasPixels ? { readAtlasPixels: textures.readAtlasPixels } : {}),
        chars: GUI_FONT_CHARS,
        fontSize: 32,
        atlasSize: 4096,
        fontFamily: 'sans-serif',
      },
    });
    this.world.addEntity(new Entity('Sudoku GUI').addComponent(this.root));
    this.world.addSystem(this.system);
    const integration = new RenderIntegration(engine, { label: 'Sudoku GUI' });
    this.world.addRuntimeIntegration(integration);
    integration.registerAll(this.world, () => ({ pass: 'shared' }));
    this.boardSurface = textures.createCanvas2D(1260, 1260);
    this.clockSurface = textures.createCanvas2D(400, 110);
    this.surfaces = Array.from({ length: 9 }, () => textures.createCanvas2D(90, 100));
    this.board.on('click', (event) => {
      const e = event.detail as GuiPointerEvent;
      if (this.controller.loading || this.controller.lesson >= 0) return;
      const r = this.board.rect,
        p = this.controller.session.state?.puzzle;
      if (p) {
        const i = boardCellAt(p, (e.x - r.x) / r.width, (e.y - r.y) / r.height);
        if (i >= 0) {
          controller.session.select(i);
          controller.status = '';
          controller.changed();
        }
      }
    });
    const actions = [
      () => {
        controller.session.pencil = !controller.session.pencil;
        controller.changed();
      },
      () => controller.undo(),
      () => controller.input(0),
      () => controller.hint(true),
      () => void this.exportImage(),
      () => this.open('settings'),
    ] as const;
    ['notes', 'undo', 'erase', 'explain', 'export', 'settings'].forEach((name, i) =>
      this.tools.set(name, this.button(this.hud, '', name, actions[i]!)),
    );
    for (let i = 0; i < 9; i++) {
      const b = this.button(this.hud, String(i + 1), `digit-${i + 1}`, () =>
        controller.input(i + 1),
      );
      this.keys.push(b);
      this.digits.push(b.add(new GuiImage({ disabled: true })));
      this.keyLabels.push(b.add(new GuiLabel({ fontSize: 30, textAlign: 'center' })));
      // A separate GUI text layer draws the strike over either the label or LED image.
      this.keyStrikes.push(b.add(new GuiLabel({
        id: `key-strike-${i + 1}`, text: '—', fontSize: 30, textAlign: 'center', visible: false,
      })));
    }
    this.newButton = this.button(this.hud, '', 'new', () => this.open('new'));
    this.rulesButton = this.button(this.hud, '', 'rules', () => this.open('rules'));
    this.answer = this.button(this.hud, '', 'answer', () => {
      this.confirmation.show();
      this.wake();
    });
    this.lessonClose = this.button(this.lesson, '×', 'lesson-close', () =>
      controller.closeLesson(),
    );
    this.lessonPrev = this.button(this.lesson, '', 'lesson-previous', () =>
      controller.moveLesson(-1),
    );
    this.lessonNext = this.button(this.lesson, '', 'lesson-next', () => controller.moveLesson(1));
    this.newBack = this.button(this.newPage, '←', 'rules-cancel', () => this.open('game'));
    (['easy', 'normal', 'hard'] as const).forEach((d) =>
      this.difficulty.push(
        this.button(this.newPage, '', `difficulty-${d}`, () => {
          this.draft.difficulty = d;
          this.update(false);
        }),
      ),
    );
    for (const key of RULE_KEYS) {
      const row = this.ruleList.add(new GuiElement({ id: `row-${key}` })),
        label = row.add(new GuiLabel({ fontSize: 15 })),
        toggle = row.add(
          new GuiSwitch({
            thumbTransitionMs: 200, colorTransitionMs: 200,
            id: `rule-${key}`,
            onChange: (value) => {
              const result = selectRule(this.draft, key, value);
              this.draft = result.options;
              this.ruleNotice = result.notice ?? '';
              this.update(false);
            },
          }),
        );
      const help = this.button(row, '?', `help-${key}`, () => this.showHelp(key));
      help.variant = 'outline';
      this.ruleRows.set(key, { row, label, toggle, help });
    }
    this.start = this.button(
      this.newPage,
      '',
      'rules-start',
      () => void controller.newGame({ ...this.draft }),
    );
    this.statsButton = this.button(this.settings, '', 'statistics', () => this.open('statistics'));
    this.statsBack = this.button(this.statsPage, '←', 'statistics-back', () => this.open('settings'));
    this.prefBack = this.button(this.settings, '←', 'preferences-done', () => this.open('game'));
    this.language = this.settings.add(
      new GuiSelect<Language>({
        id: 'language-dropdown',
        options: LANGUAGES.map((value, i) => ({ value, label: LANGUAGE_NAMES[i]! })),
        optionHeight: 44,
        onChange: (language) => controller.setPreferences({ ...controller.preferences, language }),
      }),
    );
    this.theme = this.settings.add(
      new GuiSelect<ThemeId>({
        id: 'skin-dropdown',
        options: [],
        optionHeight: 44,
        onChange: (theme) => controller.setPreferences({ ...controller.preferences, theme }),
      }),
    );
    for (const key of ['manualCandidates', 'filterCandidates', 'showCandidates'] as const) {
      const label = this.settings.add(new Paragraph()),
        detail = this.settings.add(new Paragraph()),
        toggle = this.settings.add(
          new GuiSwitch({
            thumbTransitionMs: 200, colorTransitionMs: 200,
            id: key,
            onChange: (value) =>
              controller.setPreferences({ ...controller.preferences, [key]: value }),
          }),
        );
      this.prefRows.push({ key, label, detail, toggle });
    }
    this.infoTitle = this.rulesPage.add(new GuiLabel({ fontSize: 23 }));
    this.infoBody = this.rulesPage.add(new Paragraph());
    this.infoBack = this.button(this.rulesPage, '←', 'info-back', () => this.open('game'));
    this.infoPrev = this.button(this.rulesPage, '↑', 'info-up', () => {
      this.infoOffset = Math.max(0, this.infoOffset - 5);
      this.update(false);
    });
    this.infoNext = this.button(this.rulesPage, '↓', 'info-down', () => {
      this.infoOffset += 5;
      this.update(false);
    });
    this.root.add(this.help);
    this.root.add(this.confirmation);
    this.confirmation.add(this.answerText);
    this.root.add(this.busy);
    this.busy.add(this.busyText);
    const metrics = textures.createCanvas2D(1, 1).getContext('2d')!;
    metrics.font = '32px sans-serif';
    const advances = new Map<string, number>();
    // BitmapFontBuilder rounds individual 32px glyph advances and adds one pixel.
    const measure = (text: string, size: number) =>
      Array.from(text).reduce((sum, ch) => {
        let width = advances.get(ch);
        if (width === undefined) {
          width = Math.ceil(metrics.measureText(ch).width) + 1;
          advances.set(ch, width);
        }
        return sum + (width * size) / 32;
      }, 0);
    const configure = (node: GuiElement) => {
      if (node instanceof Paragraph) node.measure = measure;
      node.children.forEach(configure);
    };
    configure(this.root.root);
    this.measureText = measure;
    // Keep modal placement in the safe content area while the renderer fills the surface.
    for (const modal of [this.help, this.confirmation, this.busy]) {
      const layout = modal.layout.bind(modal);
      modal.layout = () => {
        layout({ x: 0, y: 0, width: this.width, height: this.height });
        modal.titleLabel.setFontSize(18);
        if (modal !== this.help) {
          modal.messageLabel.setVisible(false);
          const body = modal === this.confirmation ? this.answerText : this.busyText;
          body.show(
            modal === this.confirmation ? this.tr('answerBody') : this.controller.status,
            modal.messageLabel.rect,
            15,
            THEMES[this.controller.preferences.theme].text,
          );
        }
      };
    }
    engine.on('update', this.frame);
  }
  private button(parent: GuiElement, text: string, id: string, action: () => void) {
    return parent.add(
      new GuiButton({
        id,
        text,
        onClick: () => {
          action();
          this.wake();
        },
      }),
    );
  }
  async load() {
    for (const [name, b] of this.tools) {
      let source: GPUTexture;
      if (name === 'export') {
        const canvas = this.textures.createCanvas2D(96, 96);
        paintExportIcon(canvas);
        source = this.textures.textureFromCanvas(canvas, 'icon-export');
      } else source = await this.textures.icon(name === 'explain' ? 'hint' : name);
      const image = b.add(new GuiImage({ disabled: true, source }));
      this.iconNodes.push(image);
    }
    this.update();
  }
  private async exportImage() {
    const state = this.controller.session.state;
    if (!state || this.exporting || this.controller.loading) return;
    this.exporting = true;
    this.controller.status = this.tr('exportBusy');
    this.controller.changed();
    try {
      const image = exportPuzzleImage(state, this.controller.preferences, this.textures.createCanvas2D);
      const destination = await this.textures.saveImage(image, `led-sudoku-${state.puzzle.seed}-${Date.now()}.png`);
      this.controller.status = this.tr(destination === 'photos' ? 'exportSaved' : 'exportDownloaded');
    } catch {
      this.controller.status = this.tr('exportError');
    } finally {
      this.exporting = false;
      if (!this.disposed) this.controller.changed();
    }
  }
  open(page: SudokuController['page']) {
    if (this.controller.loading) return;
    this.system.stopAnimations();
    this.hideHelp();
    this.language.setOpen(false);
    this.theme.setOpen(false);
    this.controller.lesson = -1;
    this.controller.page = page;
    if (page === 'new') {
      this.draft = { ...DEFAULT_OPTIONS, ...this.controller.session.state?.puzzle.options };
      this.ruleList.scrollTo(0);
      this.ruleNotice = '';
    }
    this.infoOffset = 0;
    this.controller.changed();
  }
  private tr(key: TextKey, values?: Record<string, string | number>) {
    return this.controller.text(key, values);
  }
  private say(zh: string, en: string, ja: string) {
    return [zh, en, ja][LANGUAGES.indexOf(this.controller.preferences.language)]!;
  }
  private frame = (event: { detail: { time: number; delta: number } }) => {
    if (this.disposed) return;
    const { width: w, height: h } = this.size();
    if (w !== this.width || h !== this.height) {
      this.width = w;
      this.height = h;
      this.update(false);
    }
    if (this.sweep.active && Date.now() - this.lastPaint >= 32) this.paint();
    this.world.update(event.detail.time, event.detail.delta);
  };
  private size() {
    return (
      this.viewport?.() ?? {
        width: this.engine.canvas?.clientWidth || this.engine.width,
        height: this.engine.canvas?.clientHeight || this.engine.height,
      }
    );
  }
  get animating() {
    return this.sweep.active || this.system.animating;
  }
  cancel() {
    this.system.stopAnimations();
    this.hideHelp();
    this.sweep.cancel();
    this.language.setOpen(false);
    this.theme.setOpen(false);
  }
  private showHelp(key: RuleKey) {
    const [title, body] = ruleCopy(this.controller.preferences.language, key);
    this.help.setTitle(title);
    this.help.setMessage(body);
    this.help.show();
    this.help.layout({ x: 0, y: 0, width: this.width, height: this.height });
    this.wake();
  }
  private hideHelp() {
    this.help.hide();
    this.wake();
  }
  update(repaint = true) {
    if (this.disposed) return;
    const c = this.controller,
      s = c.session,
      prefs = c.preferences,
      colors = THEMES[prefs.theme],
      state = s.state;
    const size = this.size();
    this.width = size.width;
    this.height = size.height;
    const l = sudokuLayout(this.width, this.height),
      full = { x: 0, y: 0, width: this.width, height: this.height };
    this.root.root.rect = full;
    this.root.root.setStyle({ backgroundColor: colors.background, radius: 0 });
    for (const page of [this.hud, this.newPage, this.settings, this.rulesPage, this.statsPage]) at(page, full);
    if (this.themeApplied !== prefs.theme) {
      this.themeApplied = prefs.theme;
      this.root.theme.colors = {
        text: colors.text,
        textMuted: colors.muted,
        primary: colors.accent,
        danger: colors.wrong,
        background: colors.background,
        surface: colors.panel,
        border: colors.border,
        hover: colors.active,
        active: colors.active,
        disabled: colors.muted,
      };
      const visit = (node: GuiElement) => {
        if (node instanceof GuiButton)
          node.setStyle({
            backgroundColor: colors.panel,
            hoverBackgroundColor: colors.active,
            borderColor: colors.border,
            color: colors.text,
            hoverColor: colors.text,
            radius: 9,
          });
        node.children.forEach(visit);
      };
      visit(this.root.root);
      this.iconNodes.forEach((n) => n.setTint(colors.text));
      for (const modal of [this.help, this.confirmation, this.busy]) {
        modal.setStyle({
          backgroundColor: colors.panel,
          borderColor: colors.line,
          color: colors.text,
        });
        modal.titleLabel.setStyle({ color: colors.text });
        modal.messageLabel.setStyle({ color: colors.text });
      }
      repaint = true;
      this.lastClock = '';
    }
    this.hud.setVisible(c.page === 'game');
    this.newPage.setVisible(c.page === 'new');
    this.settings.setVisible(c.page === 'settings');
    this.rulesPage.setVisible(c.page === 'rules');
    this.statsPage.setVisible(c.page === 'statistics');
    this.title.setText(this.tr('title'));
    at(this.title, { x: l.board.x, y: 12, width: Math.max(150, l.board.width - 150), height: 30 });
    at(this.clock, { x: l.board.x + l.board.width - 138, y: 10, width: 138, height: 38 });
    at(this.mode, { x: l.board.x, y: 47, width: l.board.width - 70, height: 20 });
    at(this.progress, { x: l.board.x + l.board.width - 80, y: 47, width: 80, height: 20 });
    at(this.board, l.board);
    this.mode.setText(
      state
        ? `${state.puzzle.options.staircase ? ruleCopy(prefs.language, 'staircase')[0] : state.puzzle.options.led === false ? this.tr('classic') : 'LED'} · ${this.tr(state.puzzle.options.difficulty)}`
        : '',
    );
    this.progress.setText(
      state
        ? `${state.board.filter(Boolean).length}/${state.puzzle.blocked.filter((b) => !b).length}`
        : '',
    );
    [...this.tools].forEach(([name, b], i) => {
      const x = l.panel.x + (i * (l.panel.width - l.tools)) / 5;
      at(b, { x, y: l.panel.y, width: l.tools, height: l.tools });
      const icon = b.children[0];
      if (icon)
        at(icon, {
          x: x + l.tools * 0.24,
          y: l.panel.y + l.tools * 0.24,
          width: l.tools * 0.52,
          height: l.tools * 0.52,
        });
      b.setDisabled(
        c.loading ||
          !state ||
          (name === 'undo' && !s.history.length) ||
          (name === 'explain' && s.done) || (name === 'export' && this.exporting),
      );
      if (icon instanceof GuiImage) icon.setTint(b.disabled ? colors.border : colors.text);
      b.setStyle({
        opacity: b.disabled ? 0.3 : 1,
        backgroundColor: name === 'notes' && s.pencil ? colors.active : colors.panel,
      });
    });
    at(this.cell, { x: l.panel.x, y: l.panel.y + l.tools + 6, width: l.panel.width, height: 22 });
    this.cell.setText(
      state && s.selected >= 0
        ? this.tr('cell', {
            r: Math.floor(s.selected / boardWidth(state.puzzle)) + 1,
            c: (s.selected % boardWidth(state.puzzle)) + 1,
          })
        : this.tr('selectCell'),
    );
    const choices = s.choices,
      crosses = state ? noteCrossedMasks(state, autoCandidateFiltering(prefs)) : [];
    this.keys.forEach((b, i) => {
      const r = {
        x: l.panel.x + ((i % 3) * (l.panel.width + 8)) / 3,
        y: l.keyTop + Math.floor(i / 3) * l.keyHeight,
        width: (l.panel.width - 16) / 3,
        height: l.keyHeight - 6,
      };
      at(b, r);
      b.setDisabled(c.loading || !choices.includes(i + 1));
      b.setStyle({
        color: b.disabled ? colors.muted : colors.text,
        borderColor: b.disabled ? colors.panel : colors.border,
      });
      this.digits[i]!.setTint('#ffffff');
      const led = state?.puzzle.options.led !== false;
      b.setText('');
      const label = this.keyLabels[i]!;
      label.setVisible(!led);
      label.setText(String(i + 1));
      label.setStyle({ color: b.disabled ? colors.border : colors.text, opacity: 1 });
      at(label, r);
      const strike = this.keyStrikes[i]!;
      strike.setVisible(s.pencil && !!(crosses[s.selected]! & (1 << i)));
      strike.setStyle({ color: colors.strike, opacity: 1 });
      at(strike, r);
      this.digits[i]!.setVisible(led);
      at(this.digits[i]!, {
        x: r.x + r.width / 2 - 18,
        y: r.y + 4,
        width: 36,
        height: r.height - 8,
      });
    });
    const bottom = [this.newButton, this.rulesButton, this.answer];
    bottom.forEach((b, i) => {
      at(b, {
        x: l.panel.x + (i === 0 ? 0 : i === 1 ? l.panel.width * 0.47 : l.panel.width * 0.72),
        y: l.bottom,
        width: l.panel.width * (i === 0 ? 0.45 : i === 1 ? 0.23 : 0.28),
        height: 44,
      });
      b.setDisabled(c.loading || (b === this.answer && (!state || s.done)));
    });
    this.newButton.setText('＋ ' + this.tr('newGame'));
    this.rulesButton.setText(this.tr('rules'));
    this.answer.setText(this.tr('answer'));
    this.newButton.setStyle({ backgroundColor: colors.accent, color: colors.accentText });
    this.status.show(
      c.status,
      {
        x: l.panel.x,
        y: l.bottom + 48,
        width: l.panel.width,
        height: Math.max(0, this.height - l.bottom - 48),
      },
      11,
      colors.muted,
    );
    this.lesson.setVisible(c.lesson >= 0);
    const lesson = c.lesson >= 0 ? s.hint?.steps[c.lesson] : undefined;
    for (const node of [...this.tools.values(), ...this.keys, this.cell, ...bottom, this.status])
      node.setVisible(!lesson);
    if (lesson) {
      if (this.lastLesson !== c.lesson) {
        this.lessonBody.scrollTo(0);
        this.lastLesson = c.lesson;
      }
      at(this.lesson, l.panel);
      at(this.lessonTitle, { x: l.panel.x, y: l.panel.y, width: l.panel.width - 42, height: 25 });
      this.lessonTitle.setText(`${c.lesson + 1}/${s.hint!.steps.length} ${lesson.title}`);
      at(this.lessonClose, {
        x: l.panel.x + l.panel.width - 36,
        y: l.panel.y,
        width: 36,
        height: 32,
      });
      const body = {
        x: l.panel.x,
        y: l.panel.y + 36,
        width: l.panel.width,
        height: l.panel.height - 94,
      };
      const lines = wrapGuiText(lesson.text, body.width - 12, 14, this.measureText);
      while (this.lessonLines.length < lines.length)
        this.lessonLines.push(this.lessonBody.add(new GuiLabel({
          fontSize: 14, y: this.lessonLines.length * 21, width: '100%', height: 21,
        })));
      this.lessonLines.forEach((label, i) => {
        label.setVisible(i < lines.length);
        label.setText(lines[i] ?? '');
        label.setStyle({ color: colors.text });
      });
      this.lessonBody.setContentHeight(lines.length * 21);
      this.lessonBody.layout(body);
      at(this.lessonPrev, {
        x: l.panel.x,
        y: l.panel.y + l.panel.height - 48,
        width: l.panel.width * 0.36,
        height: 44,
      });
      at(this.lessonNext, {
        x: l.panel.x + l.panel.width * 0.39,
        y: l.panel.y + l.panel.height - 48,
        width: l.panel.width * 0.61,
        height: 44,
      });
      this.lessonPrev.setText(this.say('上一步', 'Previous', '戻る'));
      this.lessonPrev.setDisabled(!c.lesson);
      this.lessonNext.setText(
        c.lesson === s.hint!.steps.length - 1
          ? s.hint!.kind === 'elimination'
            ? this.say('应用到笔记', 'Apply to notes', 'メモに反映')
            : this.tr('back')
          : this.say('下一步', 'Next', '次へ'),
      );
    } else this.lastLesson = -1;
    this.layoutNew(full);
    this.layoutSettings(full);
    this.layoutInfo(full);
    if (c.page === 'statistics') this.layoutStatistics(full);
    this.confirmation.setTitle(this.tr('answerTitle'));
    this.confirmation.setMessage(this.tr('answerBody'));
    this.confirmation.setConfirmText(this.tr('answer'));
    this.confirmation.setCancelText(this.tr('cancel'));
    this.busy.setTitle(this.tr('loading'));
    this.busy.setMessage(c.status);
    this.busy.setVisible(c.loading);
    if (c.loading) this.busy.layout(full);
    if (repaint && state) this.paint();
    this.updateClock();
    this.root.root.markDirty();
    this.wake();
  }
  private layoutNew(r: Rect) {
    const colors = THEMES[this.controller.preferences.theme],
      w = Math.min(540, r.width - 24),
      x = (r.width - w) / 2;
    at(this.newTitle, { x, y: 18, width: w - 48, height: 32 });
    this.newTitle.setText(this.tr('newGame'));
    at(this.newBack, { x: x + w - 40, y: 12, width: 40, height: 40 });
    this.difficulty.forEach((b, i) => {
      at(b, { x: x + (i * (w + 8)) / 3, y: 64, width: (w - 16) / 3, height: 44 });
      const d = (['easy', 'normal', 'hard'] as const)[i]!;
      b.setText(this.tr(d));
      b.setStyle({ backgroundColor: this.draft.difficulty === d ? colors.active : colors.panel });
    });
    this.instruction.setText(this.tr('holdHelp'));
    at(this.instruction, { x, y: 120, width: w, height: 24 });
    const listRect = { x, y: 153, width: w, height: Math.max(96, r.height - 260) };
    RULE_KEYS.forEach((key, i) => {
      const entry = this.ruleRows.get(key)!;
      entry.row.layout = (parent) => {
        const y = parent.y + i * 48,
          x = parent.x;
        entry.row.rect = { x, y, width: w, height: 48 };
        at(entry.label, { x: x + 4, y: y + 12, width: w - 124, height: 23 });
        at(entry.help, { x: x + w - 109, y: y + 10, width: 24, height: 24 });
        at(entry.toggle, { x: x + w - 63, y: y + 8, width: 50, height: 30 });
      };
      entry.row.setVisible(true);
      entry.label.setText(ruleCopy(this.controller.preferences.language, key)[0]);
      entry.help.setStyle({
        radius: 12,
        borderColor: colors.muted,
        color: colors.text,
        backgroundColor: 'transparent',
        hoverBackgroundColor: 'transparent',
      });
      entry.toggle.setChecked(!!this.draft[key]);
    });
    this.ruleList.setContentHeight(RULE_KEYS.length * 48);
    this.ruleList.layout(listRect);
    this.notice.show(
      this.ruleNotice || this.tr('unique'),
      { x, y: r.height - 97, width: w, height: 42 },
      10,
      colors.muted,
    );
    this.start.setText(this.tr('start'));
    at(this.start, { x, y: r.height - 48, width: w, height: 40 });
    this.start.setStyle({ backgroundColor: colors.accent, color: colors.accentText });
  }
  private layoutSettings(r: Rect) {
    const p = this.controller.preferences,
      colors = THEMES[p.theme],
      w = Math.min(540, r.width - 32),
      x = (r.width - w) / 2;
    this.prefTitle.setText(this.tr('settings'));
    at(this.prefTitle, { x, y: 18, width: w - 44, height: 32 });
    at(this.prefBack, { x: x + w - 40, y: 12, width: 40, height: 40 });
    this.langLabel.setText(this.tr('language'));
    at(this.langLabel, { x, y: 75, width: w, height: 22 });
    at(this.language, { x, y: 99, width: w, height: 44 });
    this.language.setValue(p.language);
    this.themeLabel.setText(this.tr('skin'));
    at(this.themeLabel, { x, y: 157, width: w, height: 22 });
    at(this.theme, { x, y: 181, width: w, height: 44 });
    this.theme.options = THEME_IDS.map((value) => ({
      value,
      label: this.tr(value === 'dark' ? 'darkSkin' : 'lightBlueSkin'),
    }));
    this.theme.setValue(p.theme);
    this.theme.markDirty();
    this.statsButton.setText(this.tr('statistics'));
    at(this.statsButton, { x, y: r.height - 52, width: w, height: 40 });
    this.prefRows.forEach((row, i) => {
      const y = 244 + i * Math.min(150, (r.height - 312) / 3),
        title = (['manualCandidates', 'filter', 'boardCandidates'] as const)[i]!,
        detail = (['manualCandidatesDetail', 'filterDetail', 'boardCandidatesDetail'] as const)[i]!;
      row.label.show(this.tr(title), { x, y, width: w - 70, height: 45 }, 15, colors.text);
      at(row.toggle, { x: x + w - 54, y: y + 7, width: 50, height: 30 });
      row.toggle.setChecked(p[row.key]);
      row.toggle.setDisabled(
        (i === 1 && p.manualCandidates) || (i === 2 && !autoCandidateFiltering(p)),
      );
      row.detail.show(
        this.tr(
          i > 0 && p.manualCandidates
            ? 'manualCandidatesActive'
            : i === 2 && !p.filterCandidates
              ? 'requiresFilter'
              : detail,
        ),
        { x, y: y + 48, width: w, height: Math.min(98, (r.height - 312) / 3 - 48) },
        12,
        colors.muted,
      );
    });
  }
  private layoutStatistics(r: Rect) {
    const colors = THEMES[this.controller.preferences.theme], w = Math.min(540, r.width - 32), x = (r.width - w) / 2;
    this.statsTitle.setText(this.tr('statistics'));
    at(this.statsTitle, { x, y: 18, width: w - 44, height: 32 });
    at(this.statsBack, { x: x + w - 40, y: 12, width: 40, height: 40 });
    const counts = completionCounts(this.controller.statistics);
    const lines = [this.tr('statsTotal', { n: counts.total }), '', this.tr('statsDifficulty'),
      ...(['easy', 'normal', 'hard'] as const).map(d => `${this.tr(d)}    ${counts.difficulty[d]}`),
      '', this.tr('statsRules'), ...RULE_KEYS.map(key => `${ruleCopy(this.controller.preferences.language, key)[0]}    ${counts.rules[key]}`), '',
      ...wrapGuiText(this.tr('statsNote'), w - 12, 15, this.measureText)];
    while (this.statsLabels.length < lines.length) this.statsLabels.push(this.statsList.add(new GuiLabel({ fontSize: 15 })));
    this.statsLabels.forEach((label, i) => {
      label.setVisible(i < lines.length); label.setText(lines[i] ?? ''); label.setStyle({ color: colors.text });
      label.layout = parent => { label.rect = { x: parent.x + 4, y: parent.y + i * 32, width: w - 12, height: 30 }; };
    });
    this.statsList.setContentHeight(lines.length * 32);
    this.statsList.layout({ x, y: 70, width: w, height: r.height - 82 });
  }
  private layoutInfo(r: Rect) {
    const colors = THEMES[this.controller.preferences.theme],
      w = Math.min(580, r.width - 36),
      x = (r.width - w) / 2;
    this.infoTitle.setText(this.tr('rules'));
    at(this.infoTitle, { x, y: 18, width: w - 44, height: 32 });
    at(this.infoBack, { x: x + w - 40, y: 12, width: 40, height: 40 });
    const text = [
      this.tr('basic'),
      ...(this.controller.session.state
        ? activeRuleDetails(
            this.controller.session.state.puzzle,
            this.controller.preferences.language,
          )
        : []),
    ].join('\n\n');
    const rect = { x, y: 74, width: w, height: r.height - 144 };
    let lines = this.infoBody.show(text, rect, 15, colors.text, this.infoOffset);
    this.infoOffset = Math.min(this.infoOffset, Math.max(0, lines.total - lines.count));
    this.infoBody.show(text, rect, 15, colors.text, this.infoOffset);
    [this.infoPrev, this.infoNext].forEach((b, i) =>
      at(b, { x: x + i * (w - 56), y: r.height - 56, width: 56, height: 44 }),
    );
    this.infoPrev.setDisabled(!this.infoOffset);
    this.infoNext.setDisabled(this.infoOffset + lines.count >= lines.total);
  }
  private paint() {
    const c = this.controller,
      s = c.session,
      state = s.state;
    if (!state) return;
    this.lastPaint = Date.now();
    this.sweep.observe(state.puzzle, s.done && !c.loading, this.lastPaint);
    const filter = autoCandidateFiltering(c.preferences);
    paintBoard(this.boardSurface.getContext('2d')!, {
      ...state,
      theme: c.preferences.theme,
      selected: s.selected,
      hint: s.hint?.cell ?? -1,
      crossed: noteCrossedMasks(state, filter),
      candidateMasks: noteDisplayMasks(
        state,
        s.selected,
        s.pencil,
        filter,
        c.preferences.showCandidates,
      ),
      language: c.preferences.language,
      ...(c.lesson >= 0 && s.hint ? { lesson: s.hint.steps[c.lesson]! } : {}),
      completed: s.done,
      completionProgress: this.sweep.progress(this.lastPaint),
    });
    if (s.done) {
      const ctx = this.boardSurface.getContext('2d')!;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.strokeStyle = THEMES[c.preferences.theme].accent;
      ctx.globalAlpha = this.sweep.active
        ? 0.3 + 0.35 * (1 + Math.sin(this.lastPaint / 110))
        : 0.65;
      ctx.lineWidth = 5;
      ctx.strokeRect(3, 3, 1254, 1254);
      ctx.restore();
    }
    this.board.setSource(this.textures.textureFromCanvas(this.boardSurface, 'board'));
    this.board.markDirty();
    const colors = THEMES[c.preferences.theme];
    this.surfaces.forEach((canvas, i) => {
      const ctx = canvas.getContext('2d')!;
      ctx.clearRect(0, 0, 90, 100);
      drawDigit(
        ctx,
        SEGMENTS[i + 1]!,
        12,
        6,
        80,
        this.keys[i]!.disabled ? colors.tube : colors.accent,
        colors.tube,
      );
      this.digits[i]!.setSource(this.textures.textureFromCanvas(canvas, `key-${i}`));
      this.digits[i]!.markDirty();
    });
  }
  updateClock() {
    const seconds = Math.floor(this.controller.session.state?.elapsed ?? 0),
      text = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    if (this.lastClock === text) return;
    this.lastClock = text;
    const c = this.clockSurface.getContext('2d')!,
      colors = THEMES[this.controller.preferences.theme];
    c.clearRect(0, 0, 400, 110);
    let x = 4;
    for (const d of text) {
      if (d === ':') {
        c.fillStyle = colors.user;
        c.fillRect(x + 4, 32, 6, 6);
        c.fillRect(x + 4, 68, 6, 6);
        x += 22;
      } else {
        drawDigit(c, d === '0' ? 63 : SEGMENTS[Number(d)]!, x, 5, 90, colors.user, colors.tube);
        x += 76;
      }
    }
    this.clock.setSource(this.textures.textureFromCanvas(this.clockSurface, 'clock'));
    this.clock.markDirty();
    this.wake();
  }
  snapshot() {
    return {
      gui: 'Haiyue GuiSystem',
      page: this.controller.page,
      loading: this.controller.loading,
      board: this.board.rect,
      undo: this.controller.session.history.length,
      lesson: this.controller.lesson,
      language: this.controller.preferences.language,
      theme: this.controller.preferences.theme,
      ruleScroll: this.ruleList.scrollY,
    };
  }
  dispose() {
    this.disposed = true;
    this.engine.off('update', this.frame);
    this.sweep.cancel();
    this.world.destroy();
    this.textures.dispose();
  }
}
