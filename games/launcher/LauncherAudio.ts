import { OwnerSafeAudioMixer } from '@haiyue/engine/experimental/audio';
import { LAUNCHER_AUDIO, type LauncherCue } from './audio/soundscape';

export class LauncherAudio {
  private readonly mixer = new OwnerSafeAudioMixer({ maxVoicesTotal: 6, maxVoicesPerOwner: 6 });
  private readonly lifetime = new AbortController();
  private readonly buffers = new Set<string>();
  private readonly played = { click: 0, select: 0, launch: 0, back: 0, volume: 0 };
  private readonly recent = new Map<string, number>();
  private storage: Storage | null = null;
  private effectsEnabled = true;
  private musicEnabled = true;
  private get muted(): boolean { return !this.effectsEnabled && !this.musicEnabled; }
  private unlocked = false;
  private active = true;
  private hidden = document.hidden;
  private disposed = false;
  private level = 1;
  private music = false;
  private musicGain = 0;
  private frame = 0;
  private generation = 0;
  private loading: Promise<void> | null = null;
  private unlocking: Promise<void> | null = null;
  private pending: { cue: LauncherCue; time: number } | null = null;
  private unsubscribe: (() => void) | null = null;
  constructor() {
    try {
      this.storage = localStorage; const legacyMuted = this.storage.getItem('haiyue.game-os.audio-muted') === 'true';
      this.effectsEnabled = this.storage.getItem('haiyue.game-os.audio-effects') === null ? !legacyMuted : this.storage.getItem('haiyue.game-os.audio-effects') !== 'false';
      this.musicEnabled = this.storage.getItem('haiyue.game-os.audio-music') === null ? !legacyMuted : this.storage.getItem('haiyue.game-os.audio-music') !== 'false';
    } catch { this.storage = null; }
    this.mixer.setBusVolume('music', 0); this.mixer.setBusVolume('ui', this.effectsEnabled ? .5 : 0); this.mixer.setMasterVolume(this.muted ? 0 : .8);
  }
  unlock(): void {
    if (this.disposed || this.muted || this.hidden || this.unlocking || this.unlocked && this.mixer.stats.state === 'running') return;
    const generation = this.generation;
    this.unlocking = this.mixer.unlock().then(() => {
      if (this.disposed || generation !== this.generation) return;
      this.unlocked = true;
      this.loading ??= this.load();
      this.syncMusic();
      if (this.pending && this.buffers.has(this.pending.cue)) { const pending = this.pending; this.pending = null; if (performance.now() - pending.time < 1000) this.play(pending.cue); }
      if (this.hidden) void this.mixer.suspend().catch(() => {});
    }).catch(() => { this.unlocked = false; }).finally(() => { this.unlocking = null; });
  }
  private async load(): Promise<void> {
    await Promise.all(Object.entries(LAUNCHER_AUDIO).map(async ([kind, settings]) => {
      try {
        const response = await fetch(new URL(settings.file, this.baseUrl), { signal: this.lifetime.signal });
        if (!response.ok) throw new Error('Launcher audio HTTP ' + response.status);
        const bytes = await response.arrayBuffer(); if (this.disposed) return;
        await this.mixer.decodeAndInstall(kind, bytes); if (this.disposed) return;
        this.buffers.add(kind);
        if (kind === 'ambient') this.syncMusic();
        if (this.pending?.cue === kind) { const pending = this.pending; this.pending = null; if (performance.now() - pending.time < 1000) this.play(pending.cue); }
      } catch (error) { if (!this.disposed) console.warn('Game OS audio unavailable', kind, error); }
    }));
  }
  private baseUrl = new URL('./audio/', new URL('../../site/app.js', import.meta.url));
  setAssetBase(url: string): void { if (!this.loading) this.baseUrl = new URL('./audio/', url); }
  cue(cue: LauncherCue, key: string = cue): void {
    if (this.disposed || !this.effectsEnabled || this.hidden || !this.level || !this.unlocked && !this.unlocking) return;
    const now = performance.now(), previous = this.recent.get(cue) ?? -Infinity;
    if (now - previous < (cue === 'select' ? 90 : 45) || cue === 'select' && key === this.lastSelection && now - previous < 220) return;
    this.recent.set(cue, now); if (cue === 'select') this.lastSelection = key;
    if (!this.unlocked || !this.buffers.has(cue)) { this.pending = { cue, time: now }; return; }
    this.play(cue);
  }
  private lastSelection = '';
  get isMuted(): boolean { return this.muted; }
  get preferences() { return { effects: this.effectsEnabled, music: this.musicEnabled }; }
  private play(cue: LauncherCue): void {
    if (this.disposed || !this.effectsEnabled || this.hidden || this.mixer.stats.state !== 'running') return;
    const voice = this.mixer.play({ eventId: `page-${cue}-${++this.sequence}`, bufferId: cue, owner: 'game-os', channel: cue === 'launch' || cue === 'back' ? 'transition' : cue, bus: 'ui', volume: cue === 'select' ? .48 : .7, startTick: 0 });
    if (voice) this.played[cue]++;
  }
  private sequence = 0;
  setActive(active: boolean): void { if (this.active === active || this.disposed) return; this.active = active; this.syncMusic(); }
  setHidden(hidden: boolean): void {
    if (this.disposed || this.hidden === hidden) return; this.hidden = hidden; this.pending = null;
    if (hidden) { cancelAnimationFrame(this.frame); this.frame = 0; if (this.unlocked) void this.mixer.suspend().catch(() => {}); }
    else if (this.unlocked && !this.muted) { this.unlocked = false; this.unlock(); this.syncMusic(); }
  }
  bindVolume(source: { readonly level: number; subscribe(listener: (level: number) => void): () => void } | null): void {
    if (this.disposed) return;
    this.unsubscribe?.(); this.unsubscribe = null;
    const change = (level: number) => { this.level = level; this.mixer.setMasterVolume(this.muted ? 0 : level * .8); };
    change(source?.level ?? 1); if (source) this.unsubscribe = source.subscribe(change);
  }
  toggle(): boolean {
    const enabled = this.muted; this.effectsEnabled = enabled; this.musicEnabled = enabled;
    this.applyPreferences(); return this.muted;
  }
  setEffects(enabled: boolean): void { if (this.disposed || this.effectsEnabled === enabled) return; this.effectsEnabled = enabled; this.applyPreferences(); }
  setMusic(enabled: boolean): void { if (this.disposed || this.musicEnabled === enabled) return; this.musicEnabled = enabled; this.applyPreferences(); }
  private applyPreferences(): void {
    this.mixer.setMasterVolume(this.muted ? 0 : this.level * .8); this.mixer.setBusVolume('ui', this.effectsEnabled ? .5 : 0);
    if (!this.effectsEnabled) for (const channel of ['click', 'select', 'transition', 'volume']) this.mixer.stop('game-os', channel);
    try {
      this.storage?.setItem('haiyue.game-os.audio-muted', String(this.muted));
      this.storage?.setItem('haiyue.game-os.audio-effects', String(this.effectsEnabled)); this.storage?.setItem('haiyue.game-os.audio-music', String(this.musicEnabled));
    } catch { this.storage = null; }
    this.pending = null; this.syncMusic(); if (!this.muted) { this.unlock(); this.cue('click'); }
  }
  private syncMusic(): void {
    if (this.disposed || !this.unlocked || !this.buffers.has('ambient') || this.hidden) return;
    const target = this.active && this.musicEnabled ? .28 : 0;
    if (target && !this.music) this.music = !!this.mixer.play({ eventId: `page-music-${++this.sequence}`, bufferId: 'ambient', owner: 'game-os', channel: 'background', bus: 'music', volume: 1, loop: true, startTick: 0 });
    cancelAnimationFrame(this.frame); const start = performance.now(), initial = this.musicGain;
    const update = (time: number) => {
      if (this.disposed || this.hidden) return;
      const progress = Math.max(0, Math.min(1, (time - start) / (target ? 900 : 450))), eased = progress * progress * (3 - 2 * progress);
      this.musicGain = initial + (target - initial) * eased; this.mixer.setBusVolume('music', this.musicGain);
      if (progress < 1) this.frame = requestAnimationFrame(update);
      else { this.frame = 0; if (!target) { this.mixer.stop('game-os', 'background'); this.music = false; } }
    };
    this.frame = requestAnimationFrame(update);
  }
  snapshot() { return { muted: this.muted, preferences: this.preferences, unlocked: this.unlocked, active: this.active, hidden: this.hidden, level: this.level, music: this.music, musicGain: this.musicGain, loaded: [...this.buffers], played: { ...this.played }, ...this.mixer.stats }; }
  destroy(): void { if (this.disposed) return; this.disposed = true; this.generation++; this.unsubscribe?.(); this.unsubscribe = null; this.lifetime.abort(); cancelAnimationFrame(this.frame); this.pending = null; this.mixer.dispose(); }
}
