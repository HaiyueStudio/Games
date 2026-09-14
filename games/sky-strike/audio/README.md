# Sky Strike synthesized sound effects

Original code-generated effects: no MIDI synthesizer, SoundFont, external recording, or runtime synthesis dependency. `synthesis.ts` deterministically generates mono 44.1 kHz PCM; run `node --experimental-strip-types scripts/generate-sky-audio.mjs` from Games to regenerate the 20 bundled WAVs (671,204 bytes).

The bank contains a two-tone sci-fi GUI click, a distinct descending Back sound, standard/red/blue/enemy shots, small/large/Boss explosions, bomb, armor hit, player laser start/loop/end, and enemy laser loop. Periodic laser waveforms use an integral number of cycles per buffer. Non-loop effects fade at their boundaries. Playback gains favor player feedback over enemy volleys, with 40% master headroom.

`SkyStrikeAudio` owns event throttling, laser channels and preferences. A volley makes one sound regardless of the number of projectiles. Loop priority is above every one-shot so loud explosions cannot retire a laser's owned channel. Mute, zero volume, pause, backgrounding and disposal stop owned sounds; resume never replays queued sounds. Settings default to enabled / 65%, persist separately from career saves under `sky-strike.audio.v1`, and appear in the Engine GUI in Chinese, English and Japanese.

Browser playback uses the public Engine `OwnerSafeAudioMixer`, unlocked in input gestures, with at most 12 concurrent voices. Native playback uses `Native/bridge/audio/pcm-bank.ios.ts`: all buffers are decoded once into float PCM (8,396,648 bytes including music) and reused by 12 preallocated `AVAudioPlayerNode`s. There are no JavaScript audio render or completion callbacks. Native audio respects iPhone silent mode and coexists with other audio. Interruptions and headphone removal pause the game; the player resumes explicitly.

Verification: `games/test/sky-strike-audio.test.mjs`; `SKY_CASE='^(audio|audio-options-narrow|options-zh|options-en|options-ja)$' node scripts/verify-sky-native.mjs`; Native example `npm test`. The browser fixture decodes the shipped files and exercises real gameplay firing, laser ownership, contention, mute, background/resume and disposal. Its Chrome autoplay flag is test-only; production still requires a user gesture.

For an explicit on-device scheduling probe only, launch the Native app with `SKY_AUDIO_PROBE=1`. It plays each bank entry from the menu, including sustained laser channels, then stops and writes `Documents/sky-strike-audio-probe.json`. This is disabled in normal launches and respects saved mute/volume preferences. Human listening remains necessary to judge timbre and loudness balance.

GUI activation queues a short click for the next update after the action has completed, allowing pause/home confirmations to finish without restarting battle sounds. Clicks retry briefly while browser audio unlocks, are coalesced/throttled, and are canceled on backgrounding, mute or disposal. Enabling sound and changing volume preview the new preference; disabling sound stays silent.

Four pickup chimes identify red spread, blue burst, purple laser and bomb replenishment. These play on collection (including existing elite/Boss drops), not when a crate opens or an uncollected item cycles color.

Settings Back and the paused game’s Main Menu action use `ui-back`; other GUI actions use `ui-click`. Both share the same mute, volume, lifecycle and deferred-click behavior.

## Gameplay music — Orbital Drift

An original 40.000-second D-minor space/electronic score: 96 BPM, 16 bars, evolving pads, FM pluck arpeggios, sub bass, restrained drums and an answering lead. Regenerate with `node --experimental-strip-types scripts/generate-sky-music.mjs` from Games. The deterministic arrangement lives in `scripts/sky-music-score.mjs`; the asset metadata records its SHA-256. Note tails and delay taps wrap circularly into the next cycle without silent padding. Mono 44.1 kHz PCM16 is shared unchanged by web and iOS: 3,528,044 bytes on disk, 7,056,000 additional decoded bytes.

The gameplay loop occupies one protected `music` channel at gain 0.42 within the existing 12-voice budget, separate from laser channels. It starts only in playing state, retries asynchronous browser unlock, and stops on pause, home, game over, backgrounding or disposal. Resuming starts the track at its beginning. The existing Sound switch and volume apply to both music and effects; muted startup stays muted. Synthesis runs offline, never in a frame update or audio callback.

`sky-strike-music.test.mjs` verifies the shipped score, duration, amplitude, continuous wrap and manifests. The registered browser `audio` case covers music together with dense effects, pause/home/new sortie and game over. Launch Native with `SKY_MUSIC_PROBE=1` to run a quiet test sortie using memory-only career data and capture 42 seconds of channel state across a complete loop, then pause and write `Documents/sky-music-probe.json`. Normal launches do not run the probe.


Boss arrival warning uses `boss-warning.wav`, an original one-second pair of tapered low/high scanner tones (88,244 bytes). A centered priority-50 voice loops only during the existing three-second visual pre-arrival window. The actual spawn stops it; pause, background, mute and disposal also cancel it. Resuming within the remaining window restarts a single voice. Music and laser channel ownership stay independent. Bosses present immediately at level start have no pre-arrival window and do not sound a delayed warning. Browser case `boss-warning-audio` exercises the actual compiled boss spawn timeline and pause/mute/arrival transitions.
