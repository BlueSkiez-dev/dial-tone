# Implementation Plan: audio-transport

## Overview

Implement the audio transport in `src/audio/`, following `requirements.md` and `design.md` in this folder (do not modify them while executing tasks). The design uses TypeScript, so all tasks use TypeScript. Tasks 1 to 10 are pure logic that runs in Node and can be finished now. Tasks 11 to 13 need a browser, Vite and Playwright, which the project does not have yet. If `vite` is not in `package.json` when you reach task 11, mark tasks 11 to 13 blocked, report that the app scaffold is missing, and do not scaffold the app inside this spec.

Order of work: the profile table and interfaces first, then the real modem (with serialized decoder setup) and the speed evidence (which may change the table), then the band measurement, the fake modem, the pure modules from small to large, the pipeline, the slow tests, and finally the browser glue.

Key design points the tasks rely on:
- The receiver listens to every family (`RX_LISTEN_SCOPE = "all"`), whatever channel is selected. The channel switch chooses only how this phone sends. `"active"` is a CPU fallback decided by task 13.2.
- ggwave's `rxToggleProtocol` is global and affects only decoders created after the call. A decoder's protocol set is fixed at creation. Toggle-all plus create runs as one synchronous step behind a module-level mutex. `reset()` re-applies the decoder's own set first.

Ground rules for every task:
- Do not commit anything. Never run `git add` or `git commit`. The user makes one commit when the whole spec is done.
- Use `npm.cmd` and `npx.cmd`. PowerShell blocks `npm.ps1` on this machine. Do not change the execution policy.
- Pin every new dependency to an exact version (no `^` or `~`). Get each version from `npm.cmd view <pkg> version`. Never guess a version. This spec adds no runtime dependency.
- Every task and every test sub-task is required. Property tests are the point of this spec.
- Unit tests are `*.test.ts`, property tests are `*.prop.test.ts`, real-WASM tests are `*.slow.test.ts`, all next to the code. Property tests use fast-check and print the seed on failure (for example `{ verbose: true }` and a logged `seed` and `path`).
- `src/audio` imports from `src/protocol` only through `src/protocol/index.ts`. `src/protocol` must not change in this spec.
- Never edit `vendor/ggwave.js`.
- Do not invent measurements. A number is either taken from `docs/FIELD-FINDINGS.md` or the `frame-protocol` design, measured by a task here, or marked "design parameter" in `design.md`.
- Pure modules use no browser global (see requirement 10.2). Every function that can fail on data returns `Result` and never throws on data.

## Tasks

- [x] 1. Create the shared types, the profile table and the Modem interface
  - [x] 1.1 Create `src/audio/result.ts` and `src/audio/modem.ts`
    - `result.ts`: `ok` and `err` helpers returning `{ ok: true, value }` and `{ ok: false, error: { code } }`, reusing the `Result` type from `../protocol`.
    - `modem.ts`: the `Modem` and `ModemDecoder` interfaces from `design.md`. `Modem` has `sampleRate`, `modulate(payload, protocol, volume)`, `createDecoders(protocols, count): Promise<ModemDecoder[]>` and `dispose()`. `ModemDecoder` has `feed`, `reset`, `dispose` and a read-only `protocols`. There is no call that changes the protocol set of a live decoder. Add a `ModemError` class with a `code` field. No import of ggwave or `vendor/`.
    - Export `CHUNK_SAMPLES` (1024) from one place (`phase-chunker.ts` will re-use it, so define it in a small `constants.ts` and import it from there).
    - _Requirements: 9.2, 9.10, 10.1_

  - [x] 1.2 Create `src/audio/profiles.ts`
    - Define `ProfileId`, `Family`, `Speed`, `ProtocolId` (template literal type of family and FASTEST or FAST only), `ChannelProfile` and the `PROFILES` table with the values in `design.md` (Room AUDIBLE FASTEST/FAST band 1,900 to 6,400 Hz; Call DT FASTEST/FAST band 1,120 to 2,580 Hz; Quiet ULTRASOUND FASTEST/FASTEST; volume 25 each).
    - `carrierBandHz` is nullable (`readonly [number, number] | null`). Quiet is `null` until task 3.1 measures it, with a `PENDING_MEASUREMENT` comment so task 3.1 cannot be skipped silently. No detector exists for a null band.
    - Implement `speedFor` (attempt 0 or less, non-integer or non-number gives the first speed), `protocolFor`, `rxProtocols(profile)` (first and retry protocol of one profile, deduplicated), `allRxProtocols()` (deduplicated first and retry protocols of every profile in `PROFILES`, derived from the table), `rxSet(scope, profile)` (returns `allRxProtocols()` for `"all"`, else `rxProtocols(profile)`), and the constant `RX_LISTEN_SCOPE: "all" | "active"` set to `"all"`.
    - With the current table `allRxProtocols()` is AUDIBLE_FASTEST, AUDIBLE_FAST, DT_FASTEST, DT_FAST, ULTRASOUND_FASTEST. Do not hardcode that list.
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.9, 1.10_

  - [x] 1.3 Write unit and property tests for `profiles.ts`
    - Create `src/audio/profiles.test.ts` and `src/audio/profiles.prop.test.ts`.
    - Unit: the table values, `rxProtocols` for each profile (Room and Call two entries, Quiet one entry), `allRxProtocols()` equals the 5 protocols above, `RX_LISTEN_SCOPE` is `"all"`, `rxSet("all", p)` ignores `p`, `rxSet("active", p)` equals `rxProtocols(p)`, Quiet `carrierBandHz` is null until task 3.1 (after 3.1 the test requires it non-null), no profile id named radio.
    - Property 9: for every profile and every integer `attempt` (use `fc.integer()` and `fc.double()` including NaN and negatives), `speedFor` gives the first speed for values at or below 0 or non-integers and the retry speed for integers at or above 1, never a NORMAL mode. Each profile's family matches its mode (Room AUDIBLE, Call DT, Quiet ULTRASOUND). `allRxProtocols()` contains `protocolFor(p, a)` for every profile `p` and attempt `a`, has no duplicates, has no NORMAL mode and contains nothing that no profile can send. `rxProtocols(p)` is a subset of `allRxProtocols()`.
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.7, 1.9, 1.10_

- [x] 2. Implement the real modem wrapper and gather speed evidence
  - [x] 2.1 Create `src/audio/ggwave-modem.ts`
    - Implement `createGgwaveModem(factory, { txSampleRate })` returning a `Modem`, and export `RX_SAMPLE_RATE = 48000`. Use only the calls that `src/protocol/ggwave.slow.test.ts` already uses (`getDefaultParameters`, `init`, `encode`, `decode`, `free`, `rxToggleProtocol`, `disableLog`, `ProtocolId.GGWAVE_PROTOCOL_<id>`).
    - Encoder instances use `txSampleRate` and decoder instances use 48,000 (`RX_SAMPLE_RATE`). `Modem` exposes `txSampleRate` and `rxSampleRate`, replacing `sampleRate`. Update the Fake_Modem (4.1) and `airtime.ts` (4.3) to match: airtime uses `txSampleRate`.
    - `modulate`: throw `ModemError("BAD_LENGTH")` for 0 or over 140 bytes (import `GGWAVE_MAX_PAYLOAD` from `../protocol`), encode, copy the result out of WASM memory into a new `Float32Array` before any other call, free the encoder instance.
    - Call the factory twice: one decode module that holds the decoders (up to 4) and one encode module that holds no long-lived instance. `modulate` runs init, encode, copy and free on the encode module.
    - Add `MAX_INSTANCES_PER_MODULE = 4` and the new `ModemError` code `NO_INSTANCE`. `setupDecoders` checks `live + count > MAX_INSTANCES_PER_MODULE` before any toggle or `init` and throws `NO_INSTANCE` with nothing created. If an `init` returns a negative id, free the instances already created (never the negative id) and throw. `modulate` throws `NO_INSTANCE` on a negative id.
    - Dead decoder: if `reset()` re-inits to a negative id, mark the decoder dead and throw `NO_INSTANCE`. `feed` on a dead decoder returns `null`, and `dispose` on a dead decoder frees nothing. A negative id is never encoded with, decoded with or freed.
    - Key the Setup_Mutex per decode module.
    - Keep the full list of ggwave protocols, including the NORMAL modes and unused families and speeds, as `ALL_GGWAVE_PROTOCOLS` inside this file only.
    - Implement one synchronous `setupDecoders(protocols, count)`: set the toggle of every protocol in `ALL_GGWAVE_PROTOCOLS` explicitly (on for the requested set, off for all others, never relying on ggwave defaults or on what an earlier setup left), then create `count` ggwave instances, with no `await` between the toggles and the creations.
    - `createDecoders(protocols, count)` appends `setupDecoders` to a module-level promise queue (the Setup_Mutex), shared by every Modem built on the same ggwave module, so concurrent setups run one after another and never interleave. Each returned decoder exposes its fixed `protocols`.
    - `ModemDecoder.reset()` re-applies that decoder's own protocol set through the same toggle-all step, then frees and re-inits its instance, so it does not pick up a set left by another pipeline.
    - `feed` converts the block to the view the API expects, copies the result out and returns `null` for empty or null results. `dispose` frees instances. Call `disableLog()` once.
    - This is the only file in `src/audio` that may contain `ggwave_factory`, `rxToggleProtocol`, `GGWAVE_PROTOCOL`, or the load of `vendor/ggwave.js`.
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.7, 9.8, 9.9, 9.10, 9.12, 9.13, 2.8, 4.8_

  - [x] 2.2 Write a slow round-trip test for the real modem wrapper
    - Create `src/audio/ggwave-modem.roundtrip.slow.test.ts` (not `ggwave-modem.slow.test.ts`, which task 2.4 owns), loading the vendored build the same way `ggwave.slow.test.ts` does (`createRequire`), run at 44,100 Hz and 48,000 Hz. The 44,100 Hz cases modulate at 44.1 kHz, resample to 48 kHz with `resampler.ts`, and decode on a 48 kHz modem. Remove decoding at 44.1 kHz.
    - Check: `createDecoders` then modulate then `feed` (in 1024-sample blocks, with 0.6 s of silence on each side) returns the payload for a few fixed payloads in each family at FASTEST and FAST; `feed` never returns an empty array; modulate rejects 0 and 141 bytes with `BAD_LENGTH`; returned arrays do not share a buffer with WASM memory (modify the result, call modulate again, check the first result is unchanged).
    - Use few runs. Do not assert exact bytes for payloads known to be corrupted in FASTEST modes.
    - _Requirements: 9.3, 9.4, 9.6_

  - [x] 2.3 Write the speed sweep script and the replay test
    - Create `src/audio/speed-sweep.slow.test.ts` (or `scripts/speed-sweep.mjs` run by a slow test), using the real modem at 48,000 Hz.
    - Sweep: for each of the six protocols AUDIBLE, DT and ULTRASOUND at FASTEST and FAST, at least 1,000 random payloads of 1 to 140 bytes, no noise, 0.6 s silence each side. Create each decoder set with only the protocol under test enabled. Log per protocol the counts of equal, wrong and not decoded, and the wrong rate by payload length bucket (1 to 60, 61 to 140). Do not assert equality of raw bytes.
    - Replay: send the three recorded failing payloads from `src/protocol/ggwave.slow.test.ts` under the FAST protocol of the same family and log whether each decodes correctly.
    - Also log whether ULTRASOUND_FASTEST produces false or wrong decodes from silence and low-level noise only (design open question 6).
    - Print the results as a table to the test output. Add the numbers to `design.md` only by a human or by a separate task, because this spec's documents are fixed during execution. Report the numbers in the task result.
    - If the wrong rate of the first speed of any profile is above 2%, say so clearly in the task result so the profile table can be changed (requirement 12.3).
    - _Requirements: 12.1, 12.2, 12.3, 12.4_

  - [x] 2.4 Write the slow toggle-isolation and serialization test
    - Create `src/audio/ggwave-modem.slow.test.ts` on vendored ggwave 0.4.0 for Property 15, using few runs and printing the seed on failure.
    - (a) Raw ggwave: a decoder created before the whole AUDIBLE family (FASTEST, FAST and NORMAL) is toggled off still decodes an AUDIBLE_FAST frame, and one created after that toggle decodes nothing. Switching off only AUDIBLE_FAST is not enough, because AUDIBLE_NORMAL decodes short AUDIBLE_FAST frames. This documents the behaviour the design depends on and fails loudly if a ggwave upgrade changes it.
    - (b) Two `createDecoders` calls started in the same tick with different sets A and B (for example A AUDIBLE only, B DT only), in both orders: every decoder of A decodes only A's protocols and none of B's, and the reverse. Each set uses 2 decoders, and they are freed before the next setup, so two concurrent setups hold at most 4 live decoders. The earlier misses came from the instance budget (12 decoders held), not from alignment. Keep the strict "decodes all of its own set" assertion.
    - (c) After both setups, `reset()` on a decoder of A then feeding it frames still decodes only A's protocols, although B was set up last. Same budget rule: 2 decoders per set, freed before the next setup.
    - Diagnostic step for (b) and (c): on any miss, feed the same stream to fresh decoders of the same set at the other three Decoder_Offsets and log the result. If the four offsets recover every miss, (b) and (c) assert "decoded by at least one of the 4 offsets". Otherwise report the miss as an isolation bug and do not weaken the assertion.
    - (d) A wrapper test double around the toggle and create calls shows that for any number of concurrent setups the call log is a concatenation of whole setups (all toggles of setup 1, its creations, then setup 2), never a mix.
    - (e) `modulate` output for every protocol is unchanged by any toggle state.
    - (f) Budget: a 5th live decoder on one module rejects with `NO_INSTANCE`, and no negative id is ever freed (a logging test double checks the `free` calls). With 4 live decoders, `modulate` succeeds and all 4 decoders still decode afterwards. The two modules have separate heaps (different `HEAP8.buffer`), and their sizes are logged.
    - _Requirements: 9.7, 9.8, 9.9, 9.10, 9.11, 9.12, 9.13, 9.6_

- [x] 3. Measure the carrier bands and set the Quiet band
  - [x] 3.1 Write the band measurement test and set the profile bands
    - Create `src/audio/profile-band.slow.test.ts`. For each profile, encode at least 20 random payloads of 1 to 140 bytes at 48,000 Hz with the real modem at the profile's first speed, take the power spectrum of the transmission (ignore the silence padding), and compute the share of total energy that falls inside the profile's `carrierBandHz`.
    - Require at least 90% of the energy inside the band (design parameter) for each profile. For Quiet, first compute and log the frequency range holding the central 95% of the energy, then change the Quiet `carrierBandHz` in `profiles.ts` from `null` to that range rounded outward to the nearest 100 Hz, and remove the `PENDING_MEASUREMENT` marker.
    - If Room or Call fail the 90% check, log the measured range and adjust the band row. Record the old and new values in the task result.
    - Check that every band lies below the Nyquist frequency of 44,100 Hz (22,050 Hz).
    - Result: the Quiet band is `[15000, 19400]` from the measurement (central 95% of energy at 48 kHz, rounded outward to 100 Hz). The `profiles.test.ts` Quiet check now requires a non-null band.
    - _Requirements: 8.8, 1.6_

- [x] 4. Implement the Fake_Modem and `airtime.ts`
  - [x] 4.1 Create `src/audio/testing/fake-modem.ts`
    - Implement `createFakeModem(opts)` as in `design.md`, with `createDecoders(protocols, count)` (async) returning decoders that each remember their own `protocols`.
    - `modulate` returns a sample array with a recognizable marker, the packet's `ProtocolId`, a length and the payload as sample values. A fake decoder decodes a packet only when the packet's protocol is in the set the decoder was created with, finds a packet anywhere in the stream it has been fed, fails when `blockedPhases(phase)` is true for the packet's start phase against the decoder's block grid, applies `corrupt` to the result when given, and reports `modulate`, `feed` and `reset` through `onCall`.
    - `reset` clears the decoder's partial state and keeps its protocol set. Results are copies.
    - Add the option `maxDecoders` (default 4). `createDecoders` rejects with `ModemError("NO_INSTANCE")` when the live decoder count would exceed it.
    - Keep it small and deterministic. It models alignment dependence, per-decoder protocol sets, the decoder limit and silent corruption, nothing else.
    - _Requirements: 9.5, 9.2, 9.12_

  - [x] 4.2 Write unit tests for the Fake_Modem
    - Create `src/audio/testing/fake-modem.test.ts`: round trip with no options, blocked phase misses, `corrupt` changes the output, `reset` drops a half-fed packet and keeps the protocol set, `onCall` counts, a decoder created for AUDIBLE only does not decode a DT packet, two decoder sets created from the same fake modem do not affect each other.
    - _Requirements: 9.5_

  - [x] 4.3 Create `src/audio/airtime.ts` and test it with the Fake_Modem
    - Implement `airtimeMs(modem, profile, attempt, byteLength)` as in `design.md`: modulate a zero-filled payload, return `samples.length / sampleRate * 1000`, cache by `(protocol, byteLength)` per modem instance.
    - Create `src/audio/airtime.test.ts`: uses the Fake_Modem's `onCall` to check the cache avoids a second modulate call, and that a longer payload never gives less airtime.
    - _Requirements: 2.5_

- [x] 5. Implement the chunking modules
  - [x] 5.1 Create `src/audio/phase-chunker.ts`
    - Export `CHUNK_SAMPLES`, `DECODER_OFFSET_STEP`, `DECODER_OFFSETS` and `createPhaseChunker(offset)` as in `design.md`. Keep the phase tied to the absolute stream frame. `reset()` clears the buffer only.
    - Handle a start frame that is not contiguous with the buffer by resetting first.
    - _Requirements: 4.1, 4.2, 4.3, 4.6_

  - [x] 5.2 Write the property test for the phase chunker
    - Create `src/audio/phase-chunker.prop.test.ts` for Property 1: for every stream (random length 0 to 8,192 samples), every partition into input chunks of random sizes starting at frame 0, and every offset in the four Decoder_Offsets, the concatenated output equals `stream.slice(offset)` cut to a multiple of 1024, and every block starts at a frame congruent to the offset. Also: after `reset()` at a random frame, the next block starts at a frame congruent to the offset.
    - Create `src/audio/phase-chunker.test.ts` with fixed cases: stream shorter than the offset gives no block, exactly one block, a gap resets.
    - _Requirements: 4.2, 4.3, 4.6_

  - [x] 5.3 Create `src/audio/chunk-accumulator.ts` and test it
    - Implement `createChunkAccumulator(chunkSamples)` as in `design.md`: each returned chunk owns a fresh buffer, a gap in frame numbers discards the partial chunk.
    - Create `src/audio/chunk-accumulator.prop.test.ts` for Property 2: random sequences of 128-sample quanta with contiguous frames give chunks whose concatenation equals the input prefix of whole chunks, with contiguous `startFrame` values and distinct buffers; a sequence with a gap never yields a chunk that spans it.
    - Create `src/audio/chunk-accumulator.test.ts` for the first chunk start frame, a start frame that is not a multiple of 128, and 8 quanta giving exactly one chunk.
    - _Requirements: 3.2, 3.3_

  - [x] 5.4 Create `src/audio/resampler.ts`
    - Implement `createResampler(fromRate, toRate): Resampler` with `process(samples: Float32Array): Float32Array` and `reset(): void`. Pure module, no browser globals. Stateful and streaming.
    - The total output frame count after n input frames is exact and does not depend on how the input is split.
    - 44,100 to 48,000 is the ratio 160/147, done with a polyphase windowed-sinc filter. The tap count (for example 16 to 32 taps per phase) and the window (for example Kaiser) are named constants and design parameters. Do not use linear interpolation, because of the Quiet band (15 to 19.4 kHz against a 22.05 kHz Nyquist).
    - When `fromRate === toRate`, return a copy of the samples unchanged.
    - _Requirements: 3.10_

  - [x] 5.5 Write tests for the resampler
    - Create `src/audio/resampler.test.ts`: identity at equal rates, exact output length for fixed input lengths, `reset` clears the history and the phase.
    - Create `src/audio/resampler.prop.test.ts` for Property 17: for every partition of the input the concatenated output is identical and has the exact length, and a sine from 100 Hz to 19,400 Hz keeps its amplitude within the tolerance after 44.1 to 48 kHz, measured away from the start-up transient. Use few runs and `{ verbose: true }` with a logged seed.
    - **Property 17: Resampler**
    - **Validates: Requirements 3.10**

- [x] 6. Implement the sibling merge and own-echo modules
  - [x] 6.1 Create `src/audio/sibling-merge.ts` and test it
    - Implement `createSiblingMerge(windowFrames)` and `SIBLING_MERGE_FRAMES` (2048) as in `design.md`. Store copies of payloads. Drop entries older than the window.
    - Create `src/audio/sibling-merge.prop.test.ts` for Property 4: payloads offered by `n` distinct decoders in the window give exactly one `true`; the same payload after the window gives `true` again; different payloads always give `true`; the same decoder twice gives `true` twice.
    - Create `src/audio/sibling-merge.test.ts` with fixed cases, including the case where the first sibling has a corrupted byte.
    - _Requirements: 5.2, 5.3_

  - [x] 6.2 Create `src/audio/own-echo.ts` and test it
    - Implement `createOwnEcho(sampleRate)` with `OWN_ECHO_RING` (8) and `OWN_ECHO_WINDOW_MS` (30,000) as in `design.md`. Store copies. Compare by byte equality only. The API takes no family or speed, so a frame sent in one mode and heard through another path is still flagged.
    - Create `src/audio/own-echo.prop.test.ts` for Property 7: for every sent wire, an equal payload inside the window is an echo; a payload with any one byte changed (for example a relay copy with a patched hop), or one outside the window, is not; with more than 8 wires sent, only the last 8 are remembered; `isEcho` does not modify its argument.
    - _Requirements: 7.4, 7.5_

- [x] 7. Implement carrier detection
  - [x] 7.1 Create `src/audio/carrier.ts`
    - Export `powerSpectrum(samples)` (Hann window plus radix-2 FFT for 1024 samples, computed once per chunk), `bandPower(spectrum, sampleRate, band)`, `createCarrierDetector({ sampleRate, band })` with `update(spectrum, atFrame)` and `reset()`, and `createCarrierBank(sampleRate, profiles)` with `update(samples, atFrame)` returning `{ profile, active }[]` for changes only, and `reset()`.
    - The detector uses the constants and algorithm in `design.md` (ratio against a floor that is the minimum of the last 96 chunks, hysteresis, floor frozen while active, re-baseline after 20,000 ms). Use only the stream frame for time. Guard the floor with a very small epsilon.
    - The bank computes one spectrum per chunk, shared by all detectors, and creates one detector per profile whose `carrierBandHz` is not null. A profile with a null band has no detector and emits nothing.
    - _Requirements: 8.1, 8.2, 8.5, 8.6, 8.7, 8.9, 8.10, 8.11_

  - [x] 7.2 Write tests for carrier detection
    - Create `src/audio/carrier.test.ts`: `bandPower` of a pure tone in band is much higher than out of band; a burst turns the detector on after 2 chunks and off after 6 quiet chunks; a 25-second constant tone re-baselines and reports inactive at 20,000 ms; a bank with a null Quiet band creates no Quiet detector; a burst in the Room and Call overlap (1,900 to 2,580 Hz) can change both detectors, and each change names its band.
    - Create `src/audio/carrier.prop.test.ts` for Property 10 with synthetic tone bursts and seeded noise: a tone inside any profile's measured band at least 12 dB above the noise turns that band's detector on within 2 chunks and off within 7 chunks after it ends, whichever profile is selected for sending; noise alone and a tone outside every band never turn a detector on; multiplying every sample by any gain in 0.01 to 1 gives the same sequence of decisions; decisions are the same from a shared spectrum or from samples alone. Use a small number of runs because of the FFT cost.
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.9, 8.10, 8.11_

- [x] 8. Implement the receive pipeline
  - [x] 8.1 Create `src/audio/rx-pipeline.ts`
    - Implement `createRxPipeline(opts): Promise<RxPipeline>` (async) with `push`, `gate`, `noteSent`, `setProfile` (async), `stats` and `dispose` as in `design.md`. Options: `modem`, `profile`, `rxScope` (default `RX_LISTEN_SCOPE`), `decoderOffsets` (default `DECODER_OFFSETS`), `tailGuardMs`.
    - Create all decoders through one `modem.createDecoders(rxSet(rxScope, profile), decoderOffsets.length)` call, so one pipeline setup is one Decoder_Setup.
    - The pipeline, the carrier bank and own-echo use `modem.rxSampleRate` (48,000 Hz). Gating: a chunk wholly inside a gate range is skipped, and a chunk that partly overlaps is copied with only the samples whose frame is in `[from, until)` zeroed before normal processing. Count `partlyGatedChunks` in `stats`. (Already implemented.)
    - Follow the pseudocode for `push`: validate the chunk, detect discontinuities, apply the gate, run the carrier bank (one FFT, one detector per non-null band, `carrier` events carry the band's `profile` id), run one chunker and decoder per offset, merge siblings, call `decodeFrame` (imported from `../protocol`), mark `ownEcho`, emit events with their own copies of the bytes.
    - Keep one list of gate ranges and drop ranges that ended before the current frame.
    - `setProfile` is async and fallback-only: with `rxScope` `"all"` it is a no-op. With `"active"` it disposes the decoders, calls `createDecoders` for `rxProtocols(profile)`, resets chunkers and the carrier bank, and drops any partly received frame.
    - The pipeline never reads a frame field: it uses only the `ok` flag and `error.code` of the `decodeFrame` result and copies `frame` and `wire` into the event. Events carry no family or protocol, because decoders do not report one.
    - Count `stats`: chunks, gated chunks, discontinuities, frames, rejected by code, decoder hits per offset, sibling duplicates.
    - _Requirements: 1.5, 1.10, 3.6, 3.9, 4.1, 4.2, 4.4, 4.5, 4.8, 5.1, 5.2, 5.4, 5.5, 5.6, 5.7, 5.8, 7.1, 7.2, 7.3, 7.4, 7.5, 8.9, 8.10, 8.11, 9.10_

  - [x] 8.2 Write the property tests for the pipeline using the Fake_Modem
    - Create `src/audio/rx-pipeline.prop.test.ts`, using `createFakeModem` and the real `encodeFrame` and `makeFrames` from `../protocol` to build valid frames. Await `createRxPipeline`.
    - Property 3 (alignment coverage): with `blockedPhases` blocking a quarter of start phases per decoder, a four-decoder pipeline emits the frame exactly once for every start frame of the packet in the stream; a one-decoder pipeline misses it for some start frames.
    - Property 5 (frames are what `decodeFrame` accepts): for random payloads returned by the fake (valid frames, frames with one byte flipped via `corrupt`, empty arrays, arrays of 141 and more bytes), a `frame` event appears if and only if `decodeFrame(payload).ok`, with `wire` equal to the payload, otherwise a `rejected` event with the same code; the pipeline never throws.
    - Property 6 (gate): for random gate ranges and packets placed inside, across and after the range, no `frame` or `rejected` event and no carrier change comes from chunks wholly inside the range, a packet that overlaps the range does not produce a frame, and a packet that starts at any frame after `untilFrame`, including inside the last partly gated chunk, is received exactly once.
    - Also: sibling merge in the pipeline (four decoders decode one packet, one `frame` event, `stats.siblingDuplicates` is 3), `noteSent` then the same wire arriving gives `ownEcho` true whichever protocol it arrives in, a `patchRouting` copy gives false, `stats.decoderHits` counts per offset.
    - _Requirements: 4.4, 5.1, 5.2, 5.4, 5.5, 5.8, 7.2, 7.3, 7.4, 7.5_

  - [x] 8.3 Write unit tests for the pipeline
    - Create `src/audio/rx-pipeline.test.ts`: a chunk of the wrong length is counted and dropped, a jump in `startFrame` emits `discontinuity` and resets the decoders (use `onCall` to see the reset), `dispose` disposes every decoder, two transmissions of the same frame far apart in time give two `frame` events, the pipeline calls `createDecoders` exactly once at creation with `rxSet(rxScope, profile)` and the offset count, a `carrier` event names the band's profile id and none is emitted for a null band.
    - _Requirements: 3.6, 3.9, 4.8, 5.2, 8.10, 8.11_

  - [x] 8.4 Write the property test for receiving every family
    - Create `src/audio/rx-pipeline-scope.prop.test.ts` for Property 14 (fast, Fake_Modem, no WASM). Await `createRxPipeline`.
    - With the default scope (`"all"`), for every profile `p` and every attempt `a`, a packet modulated at `protocolFor(p, a)` is delivered whichever profile was passed in `RxPipelineOptions.profile`. A packet in a NORMAL mode, or in any protocol not in `allRxProtocols()`, is not delivered.
    - With `rxScope: "active"`, a packet is delivered if and only if its protocol is in `rxProtocols(profile)`, and after `await setProfile(q)` it is delivered if and only if its protocol is in `rxProtocols(q)`. With `"all"`, `setProfile(q)` changes nothing and does not call `createDecoders` again.
    - _Requirements: 1.5, 1.9, 1.10, 2.12, 5.2_

- [x] 9. Implement the microphone helpers
  - [x] 9.1 Create `src/audio/mic-state.ts`
    - Export `MIC_CONSTRAINTS`, `MicErrorCode`, `classifyMicError`, `processingDisabled`, `MicState`, `MicEvent` and `micReducer` as in `design.md`. No browser global is used (the constraints type is declared locally, not taken from the DOM lib, because the project has no DOM lib).
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [x] 9.2 Write tests for the microphone helpers
    - Create `src/audio/mic-state.test.ts`: `MIC_CONSTRAINTS` has the three flags `false` and no `sampleRate`; the mapping table of `classifyMicError`; `processingDisabled` is true only when all three are exactly `false` (and false for `undefined` fields).
    - Create `src/audio/mic-state.prop.test.ts` for Property 11: `classifyMicError` is total over any string and `undefined` and returns a code in the closed set; `micReducer` is total over every state and event, reaches `live` only from `requesting` on `granted` or from `muted` on `track-unmuted`, and `stop` always gives `idle`; a random event sequence never leaves the state set.
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [x] 10. Layering test, public index and the real-modem slow properties
  - [x] 10.1 Create `src/audio/layering.test.ts`
    - Follow `src/protocol/layering.test.ts`. Scan the non-test source files of `src/audio`, including `testing/`.
    - Property 12: no file other than `ggwave-modem.ts` contains `ggwave_factory`, `rxToggleProtocol`, `GGWAVE_PROTOCOL`, `ALL_GGWAVE_PROTOCOLS` or an import from `vendor/` (test files are excluded from the scan, and the slow tests that load the vendored build are the only tests allowed to import it); the Pure_Modules contain none of `window`, `document`, `navigator`, `AudioContext`, `AudioWorkletNode`, `Worker`, `MediaStream`, `importScripts`; every import from outside `src/audio` goes to `../protocol` and nothing else; no file mentions `SharedArrayBuffer` or `ScriptProcessor` outside comments; no `Modem` or `ModemDecoder` signature mentions a ggwave type, and neither interface has a method that changes the protocol set of a live decoder.
    - The scan treats the browser glue files as exempt from the browser-global rule only (`capture-worklet.ts`, `decode-worker.ts`, `mic.ts`, `player.ts`, `transport.ts`) and requires them to stay under 200 lines each (a size guard for "thin").
    - _Requirements: 9.1, 9.2, 9.10, 10.1, 10.2, 10.3_

  - [x] 10.2 Create `src/audio/index.ts`
    - Export the public API: `PROFILES`, `RX_LISTEN_SCOPE`, `speedFor`, `protocolFor`, `allRxProtocols`, `rxProtocols`, the types from `profiles.ts`, `createAudioTransport`, the `AudioTransport` types and events, `airtimeMs`. `MIC_CONSTRAINTS` is not exported. Export no ggwave type.
    - If the browser glue files do not exist yet, export only what exists and leave a list in the task result of what task 11 must add.
    - _Requirements: 10.1_

  - [x] 10.3 Write the slow pipeline properties with the real modem
    - Create `src/audio/rx-pipeline.slow.test.ts`.
    - Property 13 (as in `design.md`): per protocol and per rate, use fixed deterministic payloads, 3 valid frames from `encodeFrame` and 2 raw payloads. At 44,100 Hz modulate at 44.1 kHz, resample to 48 kHz with `resampler.ts`, then decode. At 48,000 Hz decode directly. Feed each case through a four-decoder pipeline with the default receive set (the sending profile is not told to it), in 1024-sample chunks, with a leading silence of 0 to 1023 samples.
    - Assert: no `frame` event has a `wire` different from the payload sent. All 3 of 3 valid frames are delivered for FAST protocols, and at least 2 of 3 for FASTEST protocols, and every FASTEST miss is logged. Raw payloads never give a `frame` event. Whatever any single-offset pipeline delivers, the four-decoder pipeline delivers.
    - Log per rate: valid-frame cases, valid frames delivered, raw cases and raw rejected, and how often each offset decoded.
    - Property 16: for each protocol and each length from 1 to 140, `airtimeMs` is equal for two payloads of the same length with different contents, and is non-decreasing in length.
    - Use few runs. Print the seed on failure.
    - _Requirements: 2.8, 3.10, 4.1, 5.1, 5.8, 2.5, 9.6_

  - [x] 10.4 Write the `wavToChunks` helper and a fixture builder
    - Create `src/audio/testing/wav.ts` with `wavToChunks(wav: Uint8Array): { sampleRate: number; chunks: { startFrame: number; samples: Float32Array }[] }` for 16-bit PCM and 32-bit float mono WAV, and `encodeWav(samples, sampleRate)`.
    - Create `src/audio/testing/wav.test.ts` with a round trip.
    - `src/audio/testing/known-frame.ts` holds the known frame, built with the real `encodeFrame`.
    - `src/audio/fixture-build.slow.test.ts` writes `tests/fixtures/call-known-frame.wav` and its `.json` sidecar (the frame bytes) when `WRITE_FIXTURE=1`, and otherwise checks that the files match.
    - `src/audio/fixture.slow.test.ts` feeds the fixture through `wavToChunks` and a pipeline created with `createRxPipeline` with a profile other than Call, and asserts the known frame arrives (this shows receiving does not depend on the selected channel).
    - _Requirements: 10.7, 10.4, 1.5_

- [ ] 11. Browser glue (blocked until the app scaffold exists)
  - [ ] 11.1 Confirm the scaffold and add the glue files
    - Check `package.json` for `vite` and a Vite config. If missing, mark tasks 11 to 13 blocked and stop. Do not scaffold the app here.
    - Create `src/audio/capture-worklet.ts` (an `AudioWorkletProcessor` named `capture` that uses `createChunkAccumulator(1024)` and posts chunks over the port it received, transferring the buffer), `src/audio/decode-worker.ts` (classic worker: `importScripts` the URL it receives, build `createGgwaveModem` with the given rate, await `createRxPipeline` with the `rxScope` from the `init` message, apply the 64-chunk backpressure rule, answer `modulate`, forward events, handle `setProfile` only when `rxScope` is `"active"`), `src/audio/mic.ts`, `src/audio/player.ts` and `src/audio/transport.ts` as in `design.md`.
    - `transport.ts` implements `send` as in the pseudocode, including the length guard before the worker is asked to modulate, the `BUSY` rule, the gate and `noteSent` messages, `sendSequence`, `airtimeMs`, `subscribe`, and the `foreground` and `context` events. `setProfile` changes only the send profile while the scope is `"all"`.
    - Request `new AudioContext({ sampleRate: 48000 })`. If `createMediaStreamSource` throws on it (some Firefox versions), recreate the context at the default rate and use the resampler. In the decode worker, run `createResampler` and a chunk accumulator in front of the pipeline when the context rate is not 48,000 Hz, and convert gate ranges and `noteSent` frames from the context clock to the 48 kHz clock with `frame48 = round(frame × 48000 / contextRate)`, rounding gate starts down and gate ends up. The modem is created with `txSampleRate` set to the context's rate.
    - Connect the worklet node through a `GainNode` with gain 0 to the destination. Feed an `AnalyserNode` from the same source for the UI.
    - The transport maps `NO_INSTANCE` as follows: when `createRxPipeline` rejects with it at start, `start` returns `StartError("MODEM_LOAD_FAILED")` with the code in the message. When `modulate` throws it during `send`, `send` returns `MODEM_FAILED`.
    - Keep every glue file under 200 lines. Logic goes to Pure_Modules.
    - Build the worklet and the worker as classic scripts (Vite `worker.format: 'iife'` for the worker and a separate classic build for the worklet) and give their URLs and the URL of `vendor/ggwave.js` to the transport through `?url` imports. Do not add network calls.
    - _Requirements: 2.3, 2.4, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 2.12, 3.1, 3.2, 3.4, 3.5, 3.7, 3.8, 3.10, 3.11, 3.12, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10, 7.1, 7.6, 9.3, 10.3, 11.1, 11.4_

  - [ ] 11.2 Write a transport test with a fake worker and fake context
    - Create `src/audio/transport.test.ts` (Node, no DOM) using small hand-written fakes for the `AudioContext`, the worker and the mic that the transport takes as injected factories.
    - Property 8: for lengths 0, 1 to 140 and 141 and more (including arrays whose bytes are multi-byte UTF-8), `send` gives `EMPTY`, a report, or `TOO_LONG`, and for `EMPTY` and `TOO_LONG` the fake worker records zero `modulate` messages.
    - Check: `NOT_STARTED`, `NOT_RUNNING`, `BUSY` for a second send and for `setProfile` during a send, the gate message goes out before playback with `endFrame + tail`, the caller's array is not detached, `attempt` 1 picks the retry protocol, `setProfile` changes the protocol of later sends but sends no receive-set change to the worker while the scope is `"all"`, a denied mic leaves `send` working, `restartMic` is the only path out of `denied`.
    - If injection of the `AudioContext` makes `transport.ts` too large, move the injection into a small `transport-deps.ts`.
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.6, 2.7, 2.10, 2.12, 6.5, 6.7, 7.1_

- [ ] 12. Playwright end-to-end tests (blocked until the app scaffold exists)
  - [ ] 12.1 Add Playwright and its config
    - Install `@playwright/test` as an exact-pinned devDependency (version from `npm.cmd view @playwright/test version`). Add the `test:e2e` script from `tech.md`. Configure Chromium with `--use-fake-device-for-media-stream`, `--use-fake-ui-for-media-stream` and `--use-file-for-fake-audio-capture` pointing at `tests/fixtures/call-known-frame.wav`.
    - Add a minimal test page (or use the app shell if it exists) that starts the transport from a button tap and exposes received events to the test.
    - _Requirements: 10.6_

  - [ ] 12.2 Write the fake-microphone decode test
    - Create `e2e/fake-mic.spec.ts`: start the transport from a tap with a send profile other than Call (Room), wait for the known Call frame, and assert its `wire` equals the bytes printed by the fixture builder. Also assert that a `carrier` event with `active: true` happened first, which shows the worklet is pulled by the graph and the port reached the worker.
    - If the `MessagePort` transfer into the worklet fails on Chromium, switch to the fallback in `design.md` (main thread forwards chunks) and note it in the task result.
    - _Requirements: 3.2, 3.4, 3.5, 10.6, 1.5_

  - [ ] 12.3 Write the denied-microphone test
    - Create `e2e/mic-denied.spec.ts`: run without the fake-UI flag so the permission is not granted (or deny it through the context), start the transport, assert the `denied` mic state, then assert that `send` still resolves with a report and a `tx end` event.
    - _Requirements: 6.5, 6.10, 10.6_

- [ ] 13. Offline test and CPU measurement (blocked until the app scaffold exists)
  - [ ] 13.1 Write the offline decode test
    - Create `e2e/offline.spec.ts`: build the app, serve it with `npm.cmd run preview`, load it once, switch the browser context offline, reload, start the transport, and decode the fixture frame. This shows the worklet, the worker and `vendor/ggwave.js` are in the precache.
    - If the precache misses a file, report it as a defect for the scaffold task and do not paper over it in this spec.
    - _Requirements: 11.1, 11.2, 11.3, 10.6_

  - [ ] 13.2 Measure decoder CPU and decide the receive scope
    - Add a small instrumented run (a debug flag in the worker that records the busy time per Chunk). On a mid-range phone, with the fixture playing from a second device, measure 1, 2, 3 and 4 Phase_Decoders each with all 5 enabled protocols (`RX_LISTEN_SCOPE` `"all"`, the default), and the same counts with the active family only (`"active"`). The main case is 4 decoders x 5 protocols.
    - Write the results into `docs/audio-transport-cpu.md`: device, sample rate, decoder count, protocols, median and 95th percentile busy time per chunk, the chunk period (1024 samples), the budget used, and `decoderHits` per offset.
    - If `"all"` is too slow (busy time per chunk exceeds the budget, or `overrun` events appear), set `RX_LISTEN_SCOPE` to `"active"` in `profiles.ts` and record in `docs/audio-transport-cpu.md` why: the device, sample rate, decoders, protocols, worker busy time per chunk and the budget that was exceeded (the content that design.md's "Receive scope decision" record asks for). Then choose the decoder count and set `DECODER_OFFSETS` accordingly.
    - Include the resampler's CPU cost on a 44.1 kHz device in the measurement (resampler plus decoders, against the decoders alone at 48 kHz).
    - Record the heap size per module (decode and encode) and the startup time with two modules on the real phone. Check the worker footprint of about 120 MB against the Node baseline in `design.md` (decode module 88.3 MB with 4 decoders, encode module 31.1 MB idle). More than 4 decoder offsets cannot be chosen without a third module.
    - Note in the document that the measurement must be repeated with 6 protocols if the Quiet retry speed changes to FAST (design open question 2), because that adds ULTRASOUND_FAST to the receive set.
    - If no mid-range phone is available, report that the measurement is pending and leave the scope at `"all"` and the count at 4.
    - _Requirements: 1.9, 1.10, 1.11, 4.1, 4.5, 4.7_

- [ ] 14. Final checkpoint
  - [ ] 14.1 Run everything and report
    - Run `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd test`, `npm.cmd run test:props`, `npm.cmd run test:slow`, and (if tasks 11 to 13 ran) `npm.cmd run test:e2e`. Fix every failure in `src/audio`. Do not change `src/protocol`.
    - Report: the speed sweep table (task 2.3), the measured bands (task 3.1), the toggle-isolation results (task 2.4), the receive scope, decoder count and CPU result (task 13.2), which tasks were blocked, and every design parameter that a test or sweep contradicted.
    - Do not commit.

## Notes

- Every task is required. There are no optional markers.
- Each task references specific requirement clauses for traceability. Property tests: P1 (5.2), P2 (5.3), P3 (8.2), P4 (6.1), P5 (8.2), P6 (8.2), P7 (6.2), P8 (11.2), P9 (1.3), P10 (7.2), P11 (9.2), P12 (10.1), P13 (10.3), P14 (8.4), P15 (2.4), P16 (10.3), P17 (5.5).
- Task 2.3 may show that a profile's first speed should change, and task 3.1 changes the Quiet band from `null` and may change another band. Both edit `profiles.ts` and are the reason these tasks run before the pipeline tests and the slow tests of task 10.
- Task 2.2's file is `ggwave-modem.roundtrip.slow.test.ts` so that `ggwave-modem.slow.test.ts` (requirement 9.11) belongs to task 2.4 alone.
- `design.md` and `requirements.md` are fixed while tasks run. Findings from tasks 2.3, 2.4, 3.1 and 13.2 go in the task result and, if they contradict a design parameter, are listed in task 14.1 for a human to fold back into the documents.
- Tasks 11 to 13 depend on an app scaffold (Vite, a service worker, Playwright) that no spec covers yet. If it is missing, those tasks are reported blocked and tasks 1 to 10 still count as complete for this spec's pure logic.
- Task 10.1 includes a size guard of 200 lines for each browser glue file. It passes trivially until task 11.1 creates them.
- Never commit. The user commits once when the spec is done.
- Use `npm.cmd` and `npx.cmd` only.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "5.1", "6.1", "6.2", "9.1"] },
    { "id": 2, "tasks": ["1.3", "2.1", "4.1", "5.2", "5.3", "5.4", "7.1", "9.2"] },
    { "id": 3, "tasks": ["2.2", "2.3", "2.4", "3.1", "4.2", "4.3", "5.5", "7.2", "8.1"] },
    { "id": 4, "tasks": ["8.2", "8.3", "8.4"] },
    { "id": 5, "tasks": ["10.1", "10.2", "10.3", "10.4"] },
    { "id": 6, "tasks": ["11.1"] },
    { "id": 7, "tasks": ["11.2", "12.1"] },
    { "id": 8, "tasks": ["12.2", "12.3"] },
    { "id": 9, "tasks": ["13.1", "13.2"] },
    { "id": 10, "tasks": ["14.1"] }
  ]
}
```
