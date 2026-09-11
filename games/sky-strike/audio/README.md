# Sky Strike synthesized sound effects

Original code-generated effects: no MIDI synthesizer, SoundFont, external recording, or runtime synthesis dependency. `synthesis.ts` deterministically generates mono 44.1 kHz PCM; run `node --experimental-strip-types scripts/generate-sky-audio.mjs` from Games to regenerate the 18 bundled WAVs (570,568 bytes).

The bank contains a two-tone sci-fi GUI click, standard/red/blue/enemy shots, small/large/Boss explosions, bomb, armor hit, player laser start/loop/end, and enemy laser loop. Periodic laser waveforms use an integral number of cycles per buffer. Non-loop effects fade at their boundaries. Playback gains favor player feedback over enemy volleys, with 40% master headroom.

`SkyStrikeAudio` owns event throttling, laser channels and preferences. A volley makes one sound regardless of the number of projectiles. Loop priority is above every one-shot so loud explosions cannot retire a laser's owned channel. Mute, zero volume, pause, backgrounding and disposal stop owned sounds; resume never replays queued sounds. Settings default to enabled / 65%, persist separately from career saves under `sky-strike.audio.v1`, and appear in the Engine GUI in Chinese, English and Japanese.

Browser playback uses the public Engine `OwnerSafeAudioMixer`, unlocked in input gestures, with at most 12 concurrent voices. Native playback uses `Native/bridge/audio/pcm-bank.ios.ts`: all buffers are decoded once into float PCM (1,139,552 bytes) and reused by 12 preallocated `AVAudioPlayerNode`s. There are no JavaScript audio render or completion callbacks. Native audio respects iPhone silent mode and coexists with other audio. Interruptions and headphone removal pause the game; the player resumes explicitly.

Verification: `games/test/sky-strike-audio.test.mjs`; `SKY_CASE='^(audio|audio-options-narrow|options-zh|options-en|options-ja)$' node scripts/verify-sky-native.mjs`; Native example `npm test`. The browser fixture decodes the shipped files and exercises real gameplay firing, laser ownership, contention, mute, background/resume and disposal. Its Chrome autoplay flag is test-only; production still requires a user gesture.

For an explicit on-device scheduling probe only, launch the Native app with `SKY_AUDIO_PROBE=1`. It plays each bank entry from the menu, including sustained laser channels, then stops and writes `Documents/sky-strike-audio-probe.json`. This is disabled in normal launches and respects saved mute/volume preferences. Human listening remains necessary to judge timbre and loudness balance.

GUI activation queues a short click for the next update after the action has completed, allowing pause/home confirmations to finish without restarting battle sounds. Clicks retry briefly while browser audio unlocks, are coalesced/throttled, and are canceled on backgrounding, mute or disposal. Enabling sound and changing volume preview the new preference; disabling sound stays silent.

Four pickup chimes identify red spread, blue burst, purple laser and bomb replenishment. These play on collection (including existing elite/Boss drops), not when a crate opens or an uncollected item cycles color.
