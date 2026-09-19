# Calendar puzzle sound effects

Regenerate the original audio with:

```sh
node --experimental-strip-types scripts/generate-calendar-audio.mjs
```

Eight short pentatonic wooden-mallet / soft-bell cues cover date selection, piece release, rotation, flipping, shuffling, victory, settings and back navigation. Each score is saved as MIDI and parsed back before procedural synthesis. No external recordings or SoundFonts are used. Mono 44.1 kHz, 16-bit PCM WAVs and their hashes live in `../assets/audio/generation.json`. Peak headroom and endpoint tapers avoid harsh clipping/clicks.

`CalendarAudio` handles gesture-unlock retries (maximum 250 ms), 65 ms per-cue debounce, playback diagnostics and cancellation on suspension/disposal. It never modifies puzzle state. The Web backend uses the public experimental `@haiyue/engine/experimental/audio` mixer with a six-voice budget. iPhone uses the existing `NativePcmAudioBank` / AVAudioEngine bridge and cached buffers, respects the silent switch, and stops on backgrounding or audio interruption.

Cues are emitted by accepted actions: a drag release after movement, accepted rotate/flip/shuffle, actual date selection, settings/back navigation and a newly completed board. Loading a completed save or restoring the app does not replay victory. Startup and date changes do not play shuffle. Existing saved progress is unaffected.
