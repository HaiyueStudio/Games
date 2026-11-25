import { OwnerSafeAudioMixer } from '@haiyue/engine/experimental/audio';
import { gameSession } from '../../session/SessionPause';
import { RetryAudioAsset } from './retry-asset';

const owner = 'dafeiyu';
const music = 'coral-bay-music';
// Start and duration in seconds in the authored stereo effects bank.
const slices = {
  click: [0, .095], move: [.195, .16], victory: [.455, 1.188],
  failure: [1.743, .73], enter: [2.573, .598], exit: [3.271, .598],
} as const;
type Cue = keyof typeof slices | 'defeat';
const options = {
  click: { channel: 'ui', volume: .46, priority: 1 },
  move: { channel: 'move', volume: .42, priority: 1 },
  defeat: { channel: 'move', volume: .68, priority: 2 },
  enter: { channel: 'transition', volume: .67, priority: 2 },
  exit: { channel: 'transition', volume: .57, priority: 2 },
  victory: { channel: 'result', volume: .81, priority: 3 },
  failure: { channel: 'result', volume: .69, priority: 3 },
} as const;

function defeatPop(context: AudioContext): AudioBuffer {
  const { sampleRate } = context;
  const clip = context.createBuffer(1, Math.round(.24 * sampleRate), sampleRate);
  const samples = clip.getChannelData(0);
  let phase = 0;
  // A rounded bubble pop with a fast descending pitch and a short hollow tail.
  for (let i = 0; i < samples.length; i++) {
    const t = i / sampleRate;
    phase += 2 * Math.PI * (155 + 690 * Math.exp(-38 * t)) / sampleRate;
    const envelope = Math.min(1, t / .003) * Math.exp(-21 * t) * (1 - i / samples.length);
    samples[i] = (.53 * Math.sin(phase) + .19 * Math.sin(phase * 1.7) * Math.exp(-24 * t)) * envelope;
  }
  return clip;
}

export class LagoonAudio {
  private readonly mixer = new OwnerSafeAudioMixer({ contextFactory: () => {
    return this.context = new AudioContext({ latencyHint: 'interactive' });
  }, maxVoicesTotal: 5, maxVoicesPerOwner: 5 });
  private readonly unregister: () => void;
  private readonly assetsLifetime = new AbortController();
  private readonly effectsAsset = new RetryAudioAsset(() => this.loadEffects(), error => this.assetError('effects', error));
  private readonly musicAsset = new RetryAudioAsset(() => this.loadMusic(), error => this.assetError('coral-bay', error));
  private readonly pending = new Map<Cue, number>();
  private readonly played: Partial<Record<Cue, number>> = {};
  private context: AudioContext | undefined;
  private job: Promise<void> | undefined;
  private requested = false;
  private hidden = false;
  private loaded = false;
  private musicReady = false;
  private musicStarts = 0;
  private disposed = false;
  private unavailable = false;

  constructor(private readonly signal: AbortSignal) {
    this.mixer.setMasterVolume(.78);
    this.mixer.setBusVolume('music', .47);
    this.unregister = gameSession.register({ pause: () => this.sync(), resume: () => this.sync() });
  }

  get active(): boolean {
    return this.requested && !this.hidden && !this.disposed && !this.unavailable && !gameSession.paused;
  }

  unlock(trusted: boolean): void {
    if (this.disposed || this.unavailable) return;
    this.requested = true;
    // A real gesture can release an earlier controller request still waiting on autoplay permission.
    if (trusted && this.active && this.job && this.context?.state === 'suspended') {
      void this.context.resume().catch(() => {});
    }
    this.sync();
  }

  visibility(hidden: boolean): void {
    this.hidden = hidden;
    this.sync();
  }

  private sync(): void {
    if (!this.active) this.pending.clear();
    if (this.disposed || this.unavailable || this.job) return;
    const active = this.active;
    const running = this.mixer.stats.state === 'running';
    if (active === running) {
      if (running) this.prepare();
      return;
    }
    this.job = (active ? this.mixer.unlock() : this.mixer.suspend()).then(() => {
      if (this.active && this.mixer.stats.state === 'running') this.prepare();
    }).catch(error => this.disable(error)).finally(() => {
      this.job = undefined;
      if (active !== this.active) this.sync();
    });
  }

  private async read(name: string): Promise<ArrayBuffer> {
    const response = await fetch(`./assets/audio/${name}.ogg`, {
      signal: AbortSignal.any([this.signal, this.assetsLifetime.signal]),
    });
    if (!response.ok) throw Error(`HTTP ${response.status}`);
    return response.arrayBuffer();
  }

  private prepare(): void {
    if (this.disposed || this.unavailable || this.signal.aborted) return;
    void this.effectsAsset.prepare();
    void this.musicAsset.prepare();
    this.flush();
  }

  private async loadEffects(): Promise<void> {
    const data = await this.read('effects');
    if (this.disposed || this.unavailable || this.signal.aborted || !this.context) return;
    const bank = await this.context.decodeAudioData(data);
    if (this.disposed || this.unavailable || this.signal.aborted) return;
    const { sampleRate, numberOfChannels } = bank;
    for (const [cue, [start, duration]] of Object.entries(slices)) {
      const offset = Math.round(start * sampleRate);
      const length = Math.round(duration * sampleRate);
      if (offset + length > bank.length) throw Error('Sound effect bank is truncated');
      const clip = this.context.createBuffer(numberOfChannels, length, sampleRate);
      for (let channel = 0; channel < numberOfChannels; channel++) {
        clip.getChannelData(channel).set(bank.getChannelData(channel).subarray(offset, offset + length));
      }
      this.mixer.installBuffer(cue, clip);
    }
    this.mixer.installBuffer('defeat', defeatPop(this.context));
    this.loaded = true;
    this.flush();
  }

  private async loadMusic(): Promise<void> {
    const data = await this.read('coral-bay');
    if (this.disposed || this.unavailable || this.signal.aborted) return;
    await this.mixer.decodeAndInstall(music, data);
    if (this.disposed || this.unavailable || this.signal.aborted) return;
    this.musicReady = true;
    this.flush();
  }

  private flush(): void {
    if (!this.active || this.mixer.stats.state !== 'running') return;
    if (this.loaded) {
      const now = performance.now();
      for (const [cue, expires] of this.pending) if (expires >= now) this.play(cue);
      this.pending.clear();
    }
    if (!this.musicReady || this.musicStarts) return;
    try {
      const voice = this.mixer.play({ eventId: music, bufferId: music, owner, channel: 'music', bus: 'music',
        loop: true, priority: 10, startTick: 0 });
      if (voice) this.musicStarts++;
    } catch (error) { this.disable(error); }
  }

  private assetError(name: string, error: unknown): void {
    if (!this.disposed && !this.signal.aborted) console.warn(`大肥鱼音频 ${name} 读取失败`, error);
  }

  play(cue: Cue): void {
    if (!this.active) return;
    if (!this.loaded || this.mixer.stats.state !== 'running') {
      this.pending.set(cue, performance.now() + 450);
      return;
    }
    try {
      const voice = this.mixer.play({ eventId: cue, bufferId: cue, owner, ...options[cue],
        bus: cue === 'click' ? 'ui' : 'sfx', frequency: cue === 'move' ? 1 + ((this.played.move ?? 0) % 3 - 1) * .035 : 1,
        replaceChannel: true, startTick: 0 });
      if (voice) this.played[cue] = (this.played[cue] ?? 0) + 1;
    } catch (error) { this.disable(error); }
  }

  private disable(error: unknown): void {
    if (this.disposed || this.unavailable) return;
    this.unavailable = true;
    this.pending.clear();
    this.mixer.dispose();
    console.warn('大肥鱼音频不可用', error);
  }

  snapshot() { return { ...this.mixer.stats, musicStarts: this.musicStarts, played: { ...this.played },
    assets: { effects: this.effectsAsset.snapshot(), music: this.musicAsset.snapshot() } }; }

  dispose(): void {
    this.disposed = true;
    this.effectsAsset.dispose();
    this.musicAsset.dispose();
    this.assetsLifetime.abort();
    this.unregister();
    this.pending.clear();
    this.mixer.dispose();
  }
}
