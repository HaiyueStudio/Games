export const LAUNCHER_AUDIO = {
  ambient: { seconds: 32, file: 'quiet-orbit.wav' },
  click: { seconds: .6, file: 'glass-click.wav' },
  select: { seconds: .85, file: 'airy-select.wav' },
  launch: { seconds: 1.4, file: 'starlight-launch.wav' },
  back: { seconds: 1, file: 'soft-return.wav' },
  volume: { seconds: .4, file: 'volume-drop.wav' },
} as const;
export type LauncherCue = Exclude<keyof typeof LAUNCHER_AUDIO, 'ambient'>;
const frequency = (note: number) => 440 * 2 ** ((note - 69) / 12);

export function renderLauncherAudio(kind: keyof typeof LAUNCHER_AUDIO, sampleRate = 22050): [Float32Array, Float32Array] {
  const duration = LAUNCHER_AUDIO[kind].seconds, length = Math.round(duration * sampleRate), channels: [Float32Array, Float32Array] = [new Float32Array(length), new Float32Array(length)];
  const add = (note: number, start: number, seconds: number, gain: number, pad = false) => {
    const pitch = frequency(note), frames = Math.round(seconds * sampleRate);
    for (let frame = 0; frame < frames; frame++) {
      const time = frame / sampleRate, attack = Math.min(1, time / (pad ? 1.8 : .008));
      const envelope = pad ? Math.sin(attack * Math.PI / 2) ** 2 * Math.min(1, (seconds - time) / 2) ** 2 : (1 - Math.exp(-time * 450)) * Math.exp(-time * 7);
      const tone = pad ? Math.sin(time * pitch * Math.PI * 2) * .65 + Math.sin(time * pitch * 1.0013 * Math.PI * 2 + .3) * .25 + Math.sin(time * pitch * Math.PI * 4) * .1
        : Math.sin(time * pitch * Math.PI * 2) + Math.sin(time * pitch * 2.003 * Math.PI * 2) * .18 * Math.exp(-time * 9);
      const sample = tone * envelope * gain, index = Math.round(start * sampleRate) + frame;
      for (const [delay, wet] of [[0, 1], [.13, .24], [.29, .14], [.47, .07]]) for (let channel = 0; channel < 2; channel++) {
        const target = index + Math.round((delay! + (delay ? channel * .019 : 0)) * sampleRate);
        if (kind === 'ambient' || target < length) { const samples = channels[channel]!, wrapped = target % length; samples[wrapped] = samples[wrapped]! + sample * wet! * (channel ? .96 : 1); }
      }
    }
  };
  if (kind === 'ambient') {
    [[50, 57, 61, 64, 66], [47, 54, 57, 61, 66], [43, 50, 54, 57, 62], [45, 52, 57, 59, 64]].forEach((chord, index) => chord.forEach(note => add(note, index * 8, 10, .025, true)));
    [74, 78, 76, 69, 71, 73, 69, 66].forEach((note, index) => add(note, index * 4 + 3, 2, .025));
  } else {
    const notes = { click: [84], select: [81, 88], launch: [69, 76, 81], back: [76, 69], volume: [76] }[kind];
    notes.forEach((note, index) => add(note, index * (kind === 'launch' ? .1 : .055), Math.min(duration - index * .055, .8), kind === 'select' ? .26 : .34));
    const fadeFrames = Math.round(.025 * sampleRate);
    for (const samples of channels) for (let frame = 0; frame < fadeFrames; frame++) samples[length - frame - 1]! *= frame / fadeFrames;
  }
  return channels;
}
