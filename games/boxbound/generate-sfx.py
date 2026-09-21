"""Original Boxbound MIDI cues. Render our type-0 MIDI files into short PCM assets.
Run from any directory: python3 Games/games/boxbound/generate-sfx.py
No external soundfont, runtime synthesizer or downloaded audio is required.
"""
from pathlib import Path
import math
import struct
import wave

OUT = Path(__file__).parent / 'assets' / 'audio'
RATE = 22050
# General MIDI program, then (start seconds, note, duration seconds, velocity).
SCORES = {
    'complete': (14, [(0, 72, .15, 72), (.13, 76, .15, 76), (.26, 79, .18, 78), (.43, 84, .3, 82), (.43, 76, .3, 45)]),
    'enter': (80, [(0, 79, .09, 60), (.075, 72, .1, 62), (.15, 64, .12, 64), (.24, 60, .16, 52)]),
    'exit': (80, [(0, 60, .09, 52), (.075, 64, .1, 62), (.15, 72, .12, 64), (.24, 79, .16, 60)]),
    'step': (12, [(0, 67, .07, 62), (.035, 79, .035, 30)]),
    'jump': (80, [(0, 60, .08, 58), (.055, 67, .08, 64), (.11, 76, .12, 66)]),
    'push': (32, [(0, 43, .13, 80), (.09, 46, .1, 62)]),
    'gate-up': (10, [(0, 43, .1, 65), (.07, 50, .11, 70), (.14, 57, .14, 74), (.23, 69, .08, 48)]),
    'gate-down': (10, [(0, 69, .1, 56), (.07, 57, .11, 66), (.14, 50, .14, 68), (.23, 43, .09, 70)]),
    'button': (14, [(0, 76, .11, 70), (.045, 88, .16, 45)]),
    'land': (32, [(0, 36, .17, 90), (.045, 48, .14, 60), (.1, 55, .12, 38)]),
    'recoil': (80, [(0, 79, .08, 66), (.065, 67, .1, 72), (.13, 55, .14, 65)]),
}


def vlq(value):
    out = [value & 127]
    while value >> 7:
        value >>= 7
        out.insert(0, (value & 127) | 128)
    return bytes(out)


def write_midi(path, program, notes):
    events = []
    for start, note, duration, velocity in notes:
        events += [(round(start * 960), bytes([0x90, note, velocity])),
                   (round((start + duration) * 960), bytes([0x80, note, 0]))]
    track = bytearray(b'\x00\xff\x51\x03\x07\xa1\x20' + bytes([0, 0xc0, program]))
    previous = 0
    for tick, event in sorted(events, key=lambda e: (e[0], e[1][0])):
        track += vlq(tick - previous) + event
        previous = tick
    track += b'\x00\xff\x2f\x00'
    path.write_bytes(b'MThd' + struct.pack('>IHHH', 6, 0, 1, 480) + b'MTrk' + struct.pack('>I', len(track)) + track)


def read_midi(path):
    data = path.read_bytes()
    assert data[:4] == b'MThd' and data[14:18] == b'MTrk'
    cursor, tick, program, active, notes = 22, 0, 0, {}, []
    def number():
        nonlocal cursor
        value = 0
        while True:
            byte = data[cursor]
            cursor += 1
            value = value * 128 + (byte & 127)
            if byte < 128:
                return value
    while cursor < len(data):
        tick += number()
        event = data[cursor]
        cursor += 1
        if event == 0xff:
            cursor += 1
            length = number()
            cursor += length
        elif event == 0xc0:
            program = data[cursor]
            cursor += 1
        elif event in (0x90, 0x80):
            note, velocity = data[cursor:cursor + 2]
            cursor += 2
            if event == 0x90 and velocity:
                active[note] = (tick, velocity)
            else:
                start, strength = active.pop(note)
                notes.append((start / 960, note, (tick - start) / 960, strength))
        else:
            raise ValueError(f'Unexpected event {event}')
    assert not active
    return program, notes


def render_midi(source, target):
    program, notes = read_midi(source)
    samples = [0.] * math.ceil((max(t + d for t, _, d, _ in notes) + .08) * RATE)
    for start, note, duration, velocity in notes:
        frequency = 440 * 2 ** ((note - 69) / 12)
        for i in range(round((duration + .065) * RATE)):
            t = i / RATE
            attack = min(1, t / .006)
            release = max(0, min(1, (duration + .065 - t) / .065))
            envelope = attack * release * math.exp(-t * (12 if program in (12, 14) else 5))
            phase = 2 * math.pi * frequency * t
            value = math.sin(phase)
            if program == 10:  # Soft metallic partials.
                value += .35 * math.sin(phase * 2.76) + .15 * math.sin(phase * 5.4)
            elif program == 80:
                value += .2 * math.sin(phase * 3) + .07 * math.sin(phase * 5)
            elif program == 32:
                value += .28 * math.sin(phase * .5)
            else:
                value += .22 * math.sin(phase * 2)
            offset = round(start * RATE) + i
            if offset < len(samples):
                samples[offset] += value * envelope * velocity / 127 * .23
    assert max(abs(v) for v in samples) < .95
    with wave.open(str(target), 'wb') as stream:
        stream.setparams((1, 2, RATE, len(samples), 'NONE', 'not compressed'))
        stream.writeframes(b''.join(struct.pack('<h', round(v * 32767)) for v in samples))


if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    for name, (program, notes) in SCORES.items():
        midi = OUT / f'{name}.mid'
        write_midi(midi, program, notes)
        render_midi(midi, OUT / f'{name}.wav')
    print(f'Generated {len(SCORES)} MIDI files and PCM cues in {OUT}')
