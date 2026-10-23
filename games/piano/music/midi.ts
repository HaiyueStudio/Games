export interface MidiNoteEvent {
  midi: number;
  velocity: number;
  startMs: number;
  durationMs: number;
}

export interface ParsedMidi {
  durationMs: number;
  notes: MidiNoteEvent[];
}

interface RawNoteEvent {
  channel: number;
  midi: number;
  order: number;
  tick: number;
  type: 'on' | 'off';
  velocity: number;
}

interface TempoChange {
  microsPerBeat: number;
  order: number;
  tick: number;
}

interface TempoSegment {
  elapsedMs: number;
  microsPerBeat: number;
  tick: number;
}

class MidiReader {
  private readonly bytes: Uint8Array;
  private readonly end: number;
  private position: number;

  constructor(bytes: Uint8Array, offset = 0, end = bytes.length) {
    this.bytes = bytes;
    this.end = end;
    this.position = offset;
  }

  get offset(): number {
    return this.position;
  }

  get remaining(): number {
    return this.end - this.position;
  }

  readAscii(length: number): string {
    return String.fromCharCode(...this.readBytes(length));
  }

  readBytes(length: number): Uint8Array {
    this.ensure(length);
    const value = this.bytes.subarray(this.position, this.position + length);
    this.position += length;
    return value;
  }

  readUint8(): number {
    this.ensure(1);
    const value = this.bytes[this.position];
    this.position += 1;
    if (value === undefined) throw new Error('Unexpected end of MIDI data.');
    return value;
  }

  readUint16(): number {
    return (this.readUint8() << 8) | this.readUint8();
  }

  readUint32(): number {
    return ((this.readUint8() << 24) >>> 0)
      + (this.readUint8() << 16)
      + (this.readUint8() << 8)
      + this.readUint8();
  }

  readVariableLength(): number {
    let value = 0;
    for (let index = 0; index < 4; index++) {
      const byte = this.readUint8();
      value = (value << 7) | (byte & 0x7f);
      if ((byte & 0x80) === 0) return value;
    }
    throw new Error('MIDI variable-length value exceeds four bytes.');
  }

  skip(length: number): void {
    this.ensure(length);
    this.position += length;
  }

  subReader(length: number): MidiReader {
    this.ensure(length);
    const reader = new MidiReader(this.bytes, this.position, this.position + length);
    this.position += length;
    return reader;
  }

  private ensure(length: number): void {
    if (!Number.isInteger(length) || length < 0 || this.position + length > this.end) {
      throw new Error('Unexpected end of MIDI data.');
    }
  }
}

export function parseMidi(buffer: ArrayBuffer): ParsedMidi {
  const reader = new MidiReader(new Uint8Array(buffer));
  if (reader.readAscii(4) !== 'MThd') throw new Error('MIDI header chunk is missing.');
  const headerLength = reader.readUint32();
  if (headerLength < 6) throw new Error('MIDI header chunk is incomplete.');
  const format = reader.readUint16();
  const trackCount = reader.readUint16();
  const division = reader.readUint16();
  reader.skip(headerLength - 6);

  if (format > 1) throw new Error(`MIDI format ${format} is not supported.`);
  if (trackCount === 0) throw new Error('MIDI file contains no tracks.');
  if ((division & 0x8000) !== 0 || division === 0) {
    throw new Error('SMPTE-timed MIDI files are not supported.');
  }

  const notes: RawNoteEvent[] = [];
  const tempos: TempoChange[] = [];
  let eventOrder = 0;
  let finalTick = 0;

  for (let trackIndex = 0; trackIndex < trackCount; trackIndex++) {
    if (reader.readAscii(4) !== 'MTrk') throw new Error(`MIDI track ${trackIndex + 1} is missing its chunk header.`);
    const track = reader.subReader(reader.readUint32());
    let runningStatus = 0;
    let tick = 0;

    while (track.remaining > 0) {
      tick += track.readVariableLength();
      finalTick = Math.max(finalTick, tick);
      let status = track.readUint8();
      let firstData: number | null = null;
      if (status < 0x80) {
        if (runningStatus === 0) throw new Error('MIDI running status appears before a channel event.');
        firstData = status;
        status = runningStatus;
      } else if (status < 0xf0) {
        runningStatus = status;
      }

      if (status === 0xff) {
        const type = track.readUint8();
        const data = track.readBytes(track.readVariableLength());
        if (type === 0x51 && data.length === 3) {
          const first = data[0] ?? 0;
          const second = data[1] ?? 0;
          const third = data[2] ?? 0;
          tempos.push({
            microsPerBeat: (first << 16) | (second << 8) | third,
            order: eventOrder,
            tick,
          });
        }
        eventOrder += 1;
        continue;
      }

      if (status === 0xf0 || status === 0xf7) {
        track.skip(track.readVariableLength());
        eventOrder += 1;
        continue;
      }

      const eventType = status & 0xf0;
      const channel = status & 0x0f;
      const dataLength = eventType === 0xc0 || eventType === 0xd0 ? 1 : 2;
      const data1 = firstData ?? track.readUint8();
      const data2 = dataLength === 2 ? track.readUint8() : 0;
      if (eventType === 0x90 && data2 > 0) {
        notes.push({ channel, midi: data1, order: eventOrder, tick, type: 'on', velocity: data2 });
      } else if (eventType === 0x80 || (eventType === 0x90 && data2 === 0)) {
        notes.push({ channel, midi: data1, order: eventOrder, tick, type: 'off', velocity: 0 });
      }
      eventOrder += 1;
    }
  }

  const tempoSegments = buildTempoSegments(tempos, division);
  const toMilliseconds = (tick: number): number => tickToMilliseconds(tick, tempoSegments, division);
  const activeNotes = new Map<string, RawNoteEvent[]>();
  const parsedNotes: MidiNoteEvent[] = [];
  notes.sort((left, right) => left.tick - right.tick || left.order - right.order);

  for (const event of notes) {
    const key = `${event.channel}:${event.midi}`;
    if (event.type === 'on') {
      const active = activeNotes.get(key) ?? [];
      active.push(event);
      activeNotes.set(key, active);
      continue;
    }

    const active = activeNotes.get(key);
    const started = active?.shift();
    if (!started) continue;
    if (active?.length === 0) activeNotes.delete(key);
    parsedNotes.push(createNote(started, event.tick, toMilliseconds));
  }

  for (const active of activeNotes.values()) {
    for (const started of active) parsedNotes.push(createNote(started, finalTick, toMilliseconds));
  }

  parsedNotes.sort((left, right) => left.startMs - right.startMs || left.midi - right.midi);
  const lastNoteEnd = parsedNotes.reduce(
    (maximum, note) => Math.max(maximum, note.startMs + note.durationMs),
    0,
  );
  return {
    durationMs: Math.max(toMilliseconds(finalTick), lastNoteEnd),
    notes: parsedNotes,
  };
}

function buildTempoSegments(changes: TempoChange[], division: number): TempoSegment[] {
  const sorted = [
    { microsPerBeat: 500_000, order: -1, tick: 0 },
    ...changes,
  ].sort((left, right) => left.tick - right.tick || left.order - right.order);
  const collapsed: TempoChange[] = [];
  for (const change of sorted) {
    const previous = collapsed.at(-1);
    if (previous?.tick === change.tick) collapsed[collapsed.length - 1] = change;
    else collapsed.push(change);
  }

  const segments: TempoSegment[] = [];
  let elapsedMs = 0;
  for (let index = 0; index < collapsed.length; index++) {
    const change = collapsed[index];
    if (!change) continue;
    const previous = collapsed[index - 1];
    if (previous) elapsedMs += ((change.tick - previous.tick) * previous.microsPerBeat) / division / 1000;
    segments.push({ elapsedMs, microsPerBeat: change.microsPerBeat, tick: change.tick });
  }
  return segments;
}

function tickToMilliseconds(tick: number, segments: TempoSegment[], division: number): number {
  let segment = segments[0];
  if (!segment) throw new Error('MIDI tempo map is empty.');
  for (const candidate of segments) {
    if (candidate.tick > tick) break;
    segment = candidate;
  }
  return segment.elapsedMs + ((tick - segment.tick) * segment.microsPerBeat) / division / 1000;
}

function createNote(
  started: RawNoteEvent,
  endTick: number,
  toMilliseconds: (tick: number) => number,
): MidiNoteEvent {
  const startMs = toMilliseconds(started.tick);
  return {
    durationMs: Math.max(0, toMilliseconds(Math.max(started.tick, endTick)) - startMs),
    midi: started.midi,
    startMs,
    velocity: started.velocity,
  };
}
