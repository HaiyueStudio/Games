export class GameAudio {
  private level = 1;
  private disposed = false;
  private readonly outputs = new Map<AudioContext, GainNode>();
  private readonly lifetime = new AbortController();
  attach(context: AudioContext, destination: AudioDestinationNode): GainNode {
    if (this.disposed) throw new DOMException('Game audio has been disposed.', 'AbortError');
    const output = context.createGain(); output.gain.value = this.level; output.connect(destination); this.outputs.set(context, output);
    context.addEventListener('statechange', () => { if (context.state === 'closed') { output.disconnect(); this.outputs.delete(context); } }, { signal: this.lifetime.signal });
    return output;
  }
  setVolume(level: number): void {
    if (this.disposed) return;
    if (!Number.isFinite(level)) throw new RangeError('Game volume must be finite.');
    const next = Math.max(0, Math.min(1, level)); if (this.level === next) return; this.level = next;
    for (const [context, output] of this.outputs) {
      if (context.state === 'closed') continue;
      output.gain.cancelScheduledValues(context.currentTime);
      output.gain.setValueAtTime(output.gain.value, context.currentTime);
      output.gain.linearRampToValueAtTime(this.level, context.currentTime + .025);
    }
  }
  snapshot() { return { level: this.level, contexts: this.outputs.size, gains: [...this.outputs.values()].map(output => output.gain.value) }; }
  destroy(): void { if (this.disposed) return; this.disposed = true; this.lifetime.abort(); for (const output of this.outputs.values()) output.disconnect(); this.outputs.clear(); }
}
