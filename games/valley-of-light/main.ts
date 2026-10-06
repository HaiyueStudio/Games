import { HaiyueEngine } from '@haiyue/engine';
import { SingleSlotGameSave } from '../save/SingleSlotGameSave';
import { ValleyHud } from './hud';
import { ValleyScene } from './scene';
import { guardDeferredPointerCapture } from './canvasInput';
import { TEXT } from './story';
import { canManipulate, clampOffset, distance, initialState, isPuzzleState, joins, midpoint, paths, project, route, snapAngle, snapOffset, type PathId, type PuzzleState, type Vec3 } from './rules';

interface Drag { id: number; kind: 'turn' | 'slide' | null; x: number; y: number; angle: number; offset: number; moved: boolean; target: PathId | null }
class ValleyGame {
  private readonly canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
  private readonly abort = new AbortController();
  private engine!: HaiyueEngine;
  private view!: ValleyScene;
  private hud!: ValleyHud;
  private state = initialState();
  private drag: Drag | null = null;
  private waypoints: Vec3[] = [];
  private destination: PathId = 'home';
  private position: Vec3 = [-5.75,0,0];
  private saved = '已保存';
  private saveStatus = 'idle';
  private width = 0;
  private height = 0;
  private ready = false;
  private disposed = false;
  private elapsed = 0;
  private readonly errors: string[] = [];
  private readonly verify = new URLSearchParams(location.search).has('verify');
  private readonly transient = new URLSearchParams(location.search).get('verify') === '1';
  private readonly saves = new SingleSlotGameSave<PuzzleState>({ gameId: 'valley-of-light', name: '谷外之光 自动存档', validateData: isPuzzleState,
    onStatus: status => { this.saveStatus = status; this.saved = status === 'error' ? '保存失败' : status === 'saving' ? '保存中' : '已保存'; this.refreshHud(); } });
  async init(): Promise<void> {
    guardDeferredPointerCapture(this.canvas,this.abort.signal);
    this.engine = new HaiyueEngine({ canvas: this.canvas, clearColor: { r: .914, g: .933, b: .906, a: 1 }, msaaSamples: 4, devicePixelRatio: () => Math.min(window.devicePixelRatio || 1, 2) });
    await this.engine.init();
    this.engine.device.addEventListener('uncapturederror', e => { this.errors.push(e.error.message); this.publish(); }, { signal: this.abort.signal });
    this.view = new ValleyScene(this.engine);
    this.hud = new ValleyHud(this.view.scene, { walk: () => this.state.completed ? this.reset() : this.walk('gate'), reset: () => this.reset(), hint: () => this.hint() });
    if (!this.transient) this.state = await this.saves.load() ?? initialState();
    this.position = midpoint(paths(this.state).find(p => p.id === this.state.at)!);
    this.view.pose(this.position,-Math.PI/2); this.view.sync(this.state); this.resize(); this.refreshHud();
    this.hud.setMessage(this.state.completed ? TEXT.ending : TEXT.objective);
    this.bind();
    if (this.verify) Object.defineProperty(window, '__valley', { configurable: true, value: { snapshot: () => this.snapshot() } });
    this.engine.on('update', ({ detail: { delta } }) => this.tick(Math.min(delta / 1000, .05)));
    this.engine.switchScene(this.view.scene); this.engine.run();
  }
  private refreshHud(): void { this.hud?.update(this.state, this.waypoints.length > 0, this.saved); }
  private save(): void { if (!this.transient) this.saves.save({ ...this.state }); this.refreshHud(); }
  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    if (this.width === rect.width && this.height === rect.height) return;
    this.cancelDrag(); this.width = rect.width; this.height = rect.height;
    this.view.resize(this.width,this.height); this.hud.resize(this.width,this.height); this.tags();
  }
  private tags(): void { this.hud.tags(this.view.screen(this.view.handle('turn',this.state)),this.view.screen(this.view.handle('slide',this.state))); }
  private messageAfterEdit(): void { this.hud.setMessage(route(this.state,'gate') ? TEXT.ready : TEXT.objective); }
  private reset(): void {
    this.cancelDrag(); this.waypoints = []; this.state = initialState(); this.position = midpoint(paths(this.state)[0]!);
    this.view.pose(this.position,-Math.PI/2); this.view.sync(this.state); this.tags(); this.hud.toggleJournal(false); this.hud.setMessage(TEXT.objective); this.save();
  }
  private hint(): void { this.hud.setMessage(this.width < 700 ? '金桥横向，青桥移到轨道正中。' : TEXT.hint); }
  private walk(target: PathId): void {
    if (!this.ready || this.waypoints.length || this.drag || this.hud.journalOpen || this.state.completed) return;
    const next = route(this.state,target);
    if (!next) { this.hud.setMessage(this.width < 700 ? '道路尚未相连。试试转动与平移。' : TEXT.blocked); return; }
    if (target === this.state.at) return;
    this.destination = target; this.waypoints = next; this.hud.setMessage(TEXT.walking); this.refreshHud();
  }
  private edit(kind: 'turn' | 'slide', value: number): void {
    if (!this.ready || !canManipulate(this.state,kind,this.waypoints.length > 0) || this.hud.journalOpen) return;
    if (kind === 'turn') this.state.angle = snapAngle(value); else this.state.offset = snapOffset(value);
    this.state.moves++; this.view.sync(this.state); this.tags(); this.messageAfterEdit(); this.save();
  }
  private bind(): void {
    const options = { signal: this.abort.signal };
    const local = (e: PointerEvent): [number,number] => { const rect = this.canvas.getBoundingClientRect(); return [e.clientX-rect.left,e.clientY-rect.top]; };
    this.canvas.addEventListener('pointerdown', e => {
      if (e.button !== 0 || this.drag || !this.ready) return;
      const [x,y] = local(e); if (this.hud.hits(x,y,this.height,this.width)) return;
      this.canvas.focus({ preventScroll: true });
      const target = this.pick(x,y);
      let kind: 'turn' | 'slide' | null = target === 'turn' || target === 'slide' ? target : null;
      for (const k of ['turn','slide'] as const) { const p = this.view.screen(this.view.handle(k,this.state)); if (Math.hypot(x-p[0],y-p[1]) < 28) kind = k; }
      if (kind && !canManipulate(this.state,kind,this.waypoints.length > 0)) { this.hud.setMessage(TEXT.occupied); return; }
      if (this.waypoints.length) return;
      this.drag = { id: e.pointerId, kind, x,y, angle: this.state.angle, offset: this.state.offset, moved: false, target: kind ?? target };
      this.canvas.setPointerCapture(e.pointerId); e.preventDefault();
    },options);
    this.canvas.addEventListener('pointermove', e => {
      const [x,y] = local(e), d = this.drag;
      if (!d || d.id !== e.pointerId) { this.canvas.style.cursor = this.pick(x,y) ? 'grab' : 'default'; return; }
      const dx = x-d.x, dy = y-d.y;
      if (Math.hypot(dx,dy) > 5) d.moved = true;
      if (!d.moved || !d.kind) return;
      this.canvas.style.cursor = 'grabbing';
      if (d.kind === 'turn') this.state.angle = d.angle + (dx-dy)*.012;
      else this.state.offset = clampOffset(d.offset+this.view.slideDelta(dx,dy));
      this.view.sync(this.state); this.tags(); this.refreshHud();
    },options);
    this.canvas.addEventListener('pointerup', e => {
      const d = this.drag; if (!d || d.id !== e.pointerId) return;
      this.drag = null; if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
      this.canvas.style.cursor = 'grab';
      if (d.moved && d.kind) {
        this.state.angle = snapAngle(this.state.angle); this.state.offset = snapOffset(this.state.offset);
        if (d.angle !== this.state.angle || d.offset !== this.state.offset) this.state.moves++;
        this.view.sync(this.state); this.tags(); this.messageAfterEdit(); this.save();
      } else if (!d.moved && d.target) this.walk(d.target);
    },options);
    this.canvas.addEventListener('pointercancel', () => this.cancelDrag(),options);
    this.canvas.addEventListener('lostpointercapture', () => this.cancelDrag(),options);
    window.addEventListener('blur', () => this.cancelDrag(),options);
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.cancelDrag(); },options);
    window.addEventListener('keydown', e => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      if (!['KeyQ','KeyE','KeyA','KeyD','Space','KeyR','KeyJ','KeyH','Escape'].includes(e.code)) return;
      e.preventDefault();
      if (e.code === 'Escape') { this.cancelDrag(); this.hud.toggleJournal(false); }
      else if (e.code === 'KeyJ') { this.cancelDrag(); this.hud.toggleJournal(); }
      else if (e.code === 'KeyR') this.reset();
      else if (e.code === 'KeyH') this.hint();
      else if (e.code === 'Space') this.state.completed ? this.reset() : this.walk('gate');
      else if (!this.drag && !this.hud.journalOpen) {
        if (e.code === 'KeyQ' || e.code === 'KeyE') this.edit('turn',this.state.angle + (e.code === 'KeyQ' ? -1 : 1)*Math.PI/2);
        if (e.code === 'KeyA' || e.code === 'KeyD') this.edit('slide',this.state.offset + (e.code === 'KeyA' ? -.5 : .5));
      }
    },options);
    window.addEventListener('pagehide', e => {
      this.cancelDrag(); this.save();
      if (!e.persisted) this.dispose();
    },options);
  }
  private cancelDrag(): void {
    if (!this.drag) return;
    const d = this.drag; this.drag = null;
    this.state.angle = d.angle; this.state.offset = d.offset;
    if (this.canvas.hasPointerCapture(d.id)) this.canvas.releasePointerCapture(d.id);
    this.view.sync(this.state); this.tags(); this.refreshHud();
  }
  private pick(x: number, y: number): PathId | null {
    let closest = 26, selected: PathId | null = null;
    // Reverse iteration favors the near, elevated bridge in overlapping projections.
    for (const path of paths(this.state).reverse()) {
      const a = this.view.screen(path.a), b = this.view.screen(path.b), dx=b[0]-a[0], dy=b[1]-a[1];
      const t = Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy)));
      const d = Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy);
      if (d < closest) { closest=d; selected=path.id; }
    }
    const gate = this.view.screen([8.35,5.8,2]);
    if (Math.hypot(x-gate[0],y-gate[1]) < 40) return 'gate';
    return selected;
  }
  private tick(dt: number): void {
    this.resize(); this.elapsed+=dt;
    if (this.view.model.status === 'error') { this.errors.push(this.view.model.error || 'Traveler glTF load failed'); this.publish(); this.dispose(); return; }
    if (!this.ready && this.view.model.status === 'loaded') {
      this.ready = true; document.getElementById('boot')!.hidden = true;
      this.publish();
    }
    const walking = this.waypoints.length > 0;
    if (!this.hud.journalOpen && !document.hidden) {
      let remaining = dt * 1.9;
      while (this.waypoints.length && remaining > 0) {
        const target = this.waypoints[0]!, a = project(this.position), b = project(target);
        const length = distance(this.position,target);
        if (Math.hypot(a[0]-b[0],a[1]-b[1]) < .0001 || length < .0001) {
          // A view-aligned seam changes depth instantaneously, with zero screen displacement.
          this.position = [...target]; this.waypoints.shift(); continue;
        }
        const travel = Math.min(remaining,length), factor=travel/length;
        const heading = Math.atan2(-(target[0]-this.position[0]),-(target[2]-this.position[2]));
        this.position = this.position.map((v,i) => v+(target[i]!-v)*factor) as Vec3;
        this.view.pose(this.position,heading); remaining-=travel;
        if (travel===length) this.waypoints.shift();
      }
      this.view.pose(this.position);
      this.view.tick(dt,this.waypoints.length>0,this.elapsed);
    }
    if (walking && !this.waypoints.length) {
      this.state.at = this.destination; this.state.completed = this.destination === 'gate';
      this.hud.setMessage(this.state.completed ? TEXT.ending : TEXT.objective); this.save();
    }
  }
  private snapshot(): unknown {
    return { ready: this.ready, state: { ...this.state }, saveStatus: this.saveStatus, position: [...this.position], walking: this.waypoints.length>0, animation: this.view.animationName, clips: this.view.model.runtimeAnimations.map(c=>c.name), modelStatus: this.view.model.status, joins: joins(this.state), journalOpen: this.hud.journalOpen, errors: [...this.errors], handles: { turn: this.view.screen(this.view.handle('turn',this.state)), slide: this.view.screen(this.view.handle('slide',this.state)) }, targets: Object.fromEntries(paths(this.state).map(p=>[p.id,this.view.screen(midpoint(p))])), slideUnit: this.view.screen([1,0,0]).map((v,i)=>v-this.view.screen([0,0,0])[i]!), viewport: [this.width,this.height] };
  }
  private publish(): void {
    const result = document.getElementById('result')!, status=this.errors.length ? 'failed' : 'passed';
    result.dataset.status=status; result.textContent=JSON.stringify({ status, suite: 'valley-of-light', errors: this.errors, snapshot: this.snapshot() }); document.body.dataset.renderStatus=status;
    if (this.errors.length) { const boot = document.getElementById('boot')!; boot.hidden=false; boot.textContent=`山谷未能点亮：${this.errors.join('；')}`; }
  }
  dispose(): void { if (this.disposed) return; this.disposed=true; this.abort.abort(); this.engine?.destroy(); }
}
const game = new ValleyGame();
void game.init().catch(error => {
  console.error(error); game.dispose(); const boot=document.getElementById('boot')!; boot.hidden=false;
  boot.textContent=`山谷未能点亮：${String(error)}。请使用支持 WebGPU 的浏览器。`;
  const result=document.getElementById('result')!; result.dataset.status='failed'; result.textContent=JSON.stringify({ status:'failed', errors:[String(error)] }); document.body.dataset.renderStatus='failed';
});
