# Requirements Document

## Introduction

The audio transport is the layer in `src/audio` between frames as bytes (`src/protocol`) and the device's speaker and microphone. It plays a frame's wire bytes through ggwave in the selected channel profile, captures microphone audio, decodes it with several offset decoders that listen to every family, and hands the decoded bytes to `decodeFrame`. The channel switch (Room, Call, Quiet) chooses only how this phone sends, because a listener cannot know which mode a sender chose. It never reads a frame field. These requirements are derived from the approved `design.md` in this folder.

Out of scope: frame layout and the CRC (`frame-protocol` spec), encryption (`crypto`), dedupe, TTL and the relay decision (`relay`), screens, copy and haptics (`ui-flows`), and the build and service worker configuration (a scaffold task with no spec yet, listed under "Obligations on other specs").

Numbering rule: requirement numbers and clause numbers are stable. `design.md` correctness properties reference clauses as "Validates: Requirements X.Y". Never renumber. A removed clause stays in place marked "(withdrawn)". New clauses are appended at the end of their requirement, and new requirements are appended after the last one.

Evidence rule: a number in these requirements is either a measurement from `docs/FIELD-FINDINGS.md` or the `frame-protocol` design, or it is marked "design parameter". A design parameter may be changed by editing one constant and the test that pins it.

## Glossary

- **Transport**: The `AudioTransport` facade in `transport.ts`. Its methods are `start`, `restartMic`, `stop`, `setProfile`, `send`, `sendSequence`, `airtimeMs` and `subscribe`.
- **Modem**: The interface in `modem.ts` with `txSampleRate`, `rxSampleRate`, `modulate`, `createDecoders(protocols, count)` and `dispose`. It is the only view of ggwave that the rest of `src/audio` has. `txSampleRate` is the `AudioContext`'s rate and `rxSampleRate` is always 48,000 Hz.
- **Ggwave_Modem**: The file `ggwave-modem.ts`, the only implementation of Modem that calls ggwave.
- **Decoder_Setup**: The single synchronous step in Ggwave_Modem that sets the ggwave toggle of every protocol and then creates the decoder instances (or re-initializes one on `reset`), with no `await` between the toggles and the creations. ggwave's `rxToggleProtocol` is global and affects only decoders created after the call.
- **Setup_Mutex**: The module-level promise queue in Ggwave_Modem that runs Decoder_Setups one after another, so that two pipelines never interleave toggles and creations.
- **Fake_Modem**: The deterministic test implementation of Modem in `src/audio/testing/fake-modem.ts`.
- **Wire_Bytes**: The `Uint8Array` of one frame including its CRC trailer, as produced by `encodeFrame` and accepted by `decodeFrame`.
- **Channel_Profile**: One row of the table in `profiles.ts`: id, ggwave family, first speed, retry speed, carrier band (or null, which means no detector) and volume. The three profiles are Room, Call and Quiet. A profile decides how this phone sends, not what it hears.
- **Send_Profile**: The Channel_Profile currently selected by the channel switch, used only for sending.
- **Receive_Set**: The deduplicated set of Protocol_Ids a decoder is created to listen for. With Receive_Scope `all` it is the first and retry Protocol_Ids of every Channel_Profile (AUDIBLE_FASTEST, AUDIBLE_FAST, DT_FASTEST, DT_FAST, ULTRASOUND_FASTEST for the current table).
- **Receive_Scope**: The constant `RX_LISTEN_SCOPE`, either `all` (default) or `active` (the CPU fallback, which listens only to the Send_Profile's family at its first and retry Speed).
- **Family**: AUDIBLE (Room), DT (Call, dual-tone) or ULTRASOUND (Quiet).
- **Speed**: FASTEST or FAST. NORMAL speeds are not representable.
- **Protocol_Id**: A Family and a Speed, for example `DT_FASTEST`.
- **Attempt**: An integer 0 or more. 0 is a first send and 1 or more is a resend.
- **Chunk**: Exactly 1024 samples of channel 0 with the frame number of its first sample (`startFrame`). The worklet posts Chunks on the Context_Frame clock. After the Resampler (if any), Chunks are on the Stream_Frame clock.
- **Stream_Frame**: A sample index on the 48 kHz receive clock, after any resampling.
- **Context_Frame**: A sample index on the capture or playback clock at the `AudioContext`'s rate. `AudioWorkletGlobalScope.currentFrame` and `AudioContext.currentTime` times the context rate count Context_Frames.
- **Resampler**: The pure module `resampler.ts`. A stateful, streaming sample-rate converter that turns capture at the context rate into 48,000 Hz samples.
- **Phase_Decoder**: One ggwave decoder instance fed blocks of 1024 samples whose first frame is congruent to its offset modulo 1024.
- **Decoder_Offsets**: 0, 256, 512 and 768 samples.
- **Rx_Pipeline**: The pure module `rx-pipeline.ts` that holds the gate, the Phase_Decoders, the sibling merge, the carrier detector and the own-echo check.
- **Sibling_Merge**: The module that collapses byte-identical payloads decoded by different Phase_Decoders within the merge window into one event.
- **Gate**: A range of Stream_Frames, from `from` (inclusive) until `until` (exclusive), during which the Rx_Pipeline ignores audio because the device is transmitting or has just finished.
- **Tail_Guard**: The extra gate time after playback ends, 600 ms (design parameter).
- **Own_Echo**: A decoded payload whose bytes equal one of the last 8 sent Wire_Bytes and that arrives within 30 s (design parameters), whatever family or speed it was heard in.
- **Carrier_Detector**: One detector in `carrier.ts` that reports energy in one profile's band without decoding. A carrier bank holds one detector per Channel_Profile whose band is not null and shares one FFT per Chunk.
- **Mic_State**: One of `idle`, `requesting`, `live`, `muted`, `lost`, `denied`, `no_device`, `busy`, `insecure`, `error`.
- **Decode_Worker**: The classic Web Worker that owns the ggwave WASM instances and one Rx_Pipeline.
- **Audio_Port**: The `MessageChannel` port pair that carries Chunks from the AudioWorklet to the Decode_Worker.
- **Control_Port**: The second port pair that carries commands and events between the Transport and the Decode_Worker.
- **Pure_Module**: Every file in `src/audio` except Ggwave_Modem and the browser glue files (`capture-worklet.ts`, `decode-worker.ts`, `mic.ts`, `player.ts`, `transport.ts`).
- **Test_Suite**: The Vitest and fast-check tests of `src/audio`, including the slow files that load `vendor/ggwave.js`.

## Requirements

### Requirement 1: Channel profiles and the speed rule

**User Story:** As a protocol engineer, I want one table that maps each channel mode to a ggwave family and speeds, so that the first-send and resend speeds are a documented decision and not scattered constants.

#### Acceptance Criteria

1. THE Transport SHALL define the Channel_Profiles in one table in `profiles.ts` with Room on the AUDIBLE family, Call on the DT family and Quiet on the ULTRASOUND family.
2. THE Channel_Profile table SHALL set the first Speed and the retry Speed to FASTEST and FAST for Room, FASTEST and FAST for Call, and FASTEST and FASTEST for Quiet.
3. WHEN `speedFor` is called with an Attempt of 0 or less, a non-integer or a non-number, THE Transport SHALL return the profile's first Speed, and WHEN the Attempt is an integer of 1 or more THE Transport SHALL return the profile's retry Speed.
4. THE Transport SHALL NOT select or enable a NORMAL Speed for any Channel_Profile.
5. WHILE the Receive_Scope is `all`, THE Transport SHALL enable for reception exactly the Protocol_Ids of every Channel_Profile's Family at its first Speed and its retry Speed, without duplicates, derived from the Channel_Profile table, and SHALL NOT change that Receive_Set when the Send_Profile changes.
6. THE Channel_Profile table SHALL carry for each profile a carrier band in Hz (or null) and a ggwave encode volume in 0 to 100, with Call at 1,120 to 2,580 Hz, Room at 1,900 to 6,400 Hz, Quiet at 15,000 to 19,400 Hz (measured, see 8.8), and a volume of 25 for every profile as initial values.
7. THE Transport SHALL NOT define a Radio profile until walkie-talkie or radio transmission has been tested on real hardware and `docs/FIELD-FINDINGS.md` records the result.
8. THE design SHALL justify the first-send Speed and retry Speed of each profile in a table that compares airtime against reliability and cites only measurements from `docs/FIELD-FINDINGS.md` and the `frame-protocol` design.
9. THE Transport SHALL define the Receive_Scope as one constant `RX_LISTEN_SCOPE` in `profiles.ts` with the default value `all`.
10. WHERE the Receive_Scope is `active`, THE Transport SHALL enable for reception only the Send_Profile's Family at its first and retry Speed, and WHEN the Send_Profile changes THE Transport SHALL dispose the decoders and create new ones for the new Receive_Set.
11. IF the measurement of requirement 4.7 shows that the Receive_Scope `all` exceeds the CPU budget of a mid-range phone, THEN THE team SHALL set `RX_LISTEN_SCOPE` to `active` and record the device, sample rate, decoder count, protocols, worker busy time per Chunk and the exceeded budget in the design's "Receive scope decision" record.

### Requirement 2: Sending a frame

**User Story:** As a sender, I want to hand over a frame's bytes and hear them played in the active profile, so that any device in earshot or on the call can decode them.

#### Acceptance Criteria

1. IF `send` receives Wire_Bytes of length 0, THEN THE Transport SHALL return the error `EMPTY` without calling the Modem.
2. IF `send` receives Wire_Bytes longer than `GGWAVE_MAX_PAYLOAD` bytes, THEN THE Transport SHALL return the error `TOO_LONG` without calling the Modem, where the limit is imported from `src/protocol` and counts bytes.
3. THE Transport SHALL NOT read, parse or validate any field of the Wire_Bytes, including the CRC trailer, when sending.
4. WHEN `send` receives Wire_Bytes of 1 to `GGWAVE_MAX_PAYLOAD` bytes while the Transport is started and the `AudioContext` is running, THE Transport SHALL modulate them with the Protocol_Id of the active profile and the Speed given by the Attempt, schedule the samples once, and resolve with a report of the Protocol_Id, the airtime, the start frame and the end frame after playback ends.
5. THE Transport SHALL compute the airtime reported to callers from the length of the samples that the Modem produced, and SHALL provide `airtimeMs(byteLength, attempt)` that derives its answer from the real encoder and not from a per-byte constant.
6. WHILE a transmission is in flight, THE Transport SHALL return the error `BUSY` to a second `send` and to `setProfile`.
7. IF the Transport is not started, THEN `send` SHALL return `NOT_STARTED`, and IF the `AudioContext` is not running, THEN `send` SHALL return `NOT_RUNNING`, in both cases without playing anything.
8. THE Transport SHALL request an `AudioContext` with a sample rate of 48,000 Hz, SHALL create the Modem's encoder at the context's actual sample rate, SHALL decode only at 48,000 Hz, and SHALL resample capture to 48,000 Hz WHEN the context's actual rate differs.
9. WHEN `sendSequence` is called, THE Transport SHALL send the frames in order with a gap of 600 ms (design parameter) unless `gapMs` is given, SHALL stop at the first error, and SHALL report how many frames were sent.
10. THE Transport SHALL leave the caller's Wire_Bytes unmodified and attached, by copying them before transferring anything to the Decode_Worker.
11. THE Transport SHALL start audio and the microphone only from a call made in a user tap, and SHALL NOT start either from a timer or a page load.
12. WHEN `setProfile` succeeds, THE Transport SHALL change only the Send_Profile used by later `send` calls, and SHALL leave the Receive_Set unchanged while the Receive_Scope is `all`.

### Requirement 3: Capture path

**User Story:** As a receiver, I want microphone audio to reach the decoders without touching the main thread, so that animations and the scope do not drop audio.

#### Acceptance Criteria

1. THE Transport SHALL capture microphone audio with an `AudioWorkletProcessor` and SHALL NOT use `ScriptProcessorNode`.
2. THE worklet SHALL gather the 128-sample render quanta of channel 0 into Chunks of exactly 1024 samples, each in a newly allocated buffer, and SHALL post each Chunk with its `startFrame` over the Audio_Port with the buffer in the transfer list.
3. IF the frame number of a quantum is not the expected next frame, THEN THE worklet's accumulator SHALL discard its partial Chunk and start a new Chunk at the new frame.
4. THE Transport SHALL connect the worklet to the Decode_Worker with a `MessageChannel` whose port is transferred to both sides, and SHALL NOT use `SharedArrayBuffer`.
5. THE Decode_Worker SHALL be a classic worker that loads `vendor/ggwave.js` with `importScripts` and owns every ggwave WASM instance.
6. WHEN a Chunk does not have exactly 1024 samples or its `startFrame` is not a non-negative integer, THE Rx_Pipeline SHALL count and drop it.
7. IF more than 64 Chunks (design parameter) are waiting for the Decode_Worker, THEN THE Decode_Worker SHALL drop the oldest Chunks, reset its decoders and emit an `overrun` event with the number dropped.
8. THE spectrogram and scope SHALL read an `AnalyserNode` fed from the same microphone source on the main thread, and SHALL NOT depend on the decode path.
9. IF a Chunk's `startFrame` is not the previous Chunk's `startFrame` plus 1024, THEN THE Rx_Pipeline SHALL reset its decoders, chunkers and carrier detector and emit a `discontinuity` event.
10. WHEN the context sample rate is not 48,000 Hz, THE Decode_Worker SHALL resample captured audio to 48,000 Hz with the streaming Resampler before chunk accumulation, and the Resampler SHALL give the same output for any partition of its input.
11. THE Transport SHALL convert gate ranges and `noteSent` frame numbers from Context_Frames to Stream_Frames, rounding gate starts down and gate ends up.
12. IF `createMediaStreamSource` fails on a 48,000 Hz context, THEN THE Transport SHALL recreate the context at the default rate and use the Resampler.

### Requirement 4: Parallel decoders at several alignments

**User Story:** As a receiver, I want several decoders at different sample alignments, so that one unlucky alignment does not lose a frame.

#### Acceptance Criteria

1. THE Rx_Pipeline SHALL run one Phase_Decoder for each of the Decoder_Offsets 0, 256, 512 and 768 samples, and SHALL accept a configuration of three of them for devices where measured CPU requires it.
2. THE Rx_Pipeline SHALL feed each Phase_Decoder blocks of exactly 1024 samples whose first Stream_Frame is congruent to the decoder's offset modulo 1024.
3. FOR ANY partition of the sample stream into input chunks, THE phase chunker SHALL emit the same blocks, equal to the stream from the offset onward and cut to a multiple of 1024 samples.
4. WHEN at least one Phase_Decoder decodes a frame that the others miss, THE Rx_Pipeline SHALL still emit that frame.
5. THE Rx_Pipeline SHALL count, per Phase_Decoder, the payloads it decoded, so that the value of each offset can be judged.
6. THE Phase_Decoders SHALL keep the same alignment after a reset, because the phase is tied to the absolute Stream_Frame and not to the time of the reset.
7. THE team SHALL record the Decode_Worker's busy time per Chunk for 1, 2, 3 and 4 Phase_Decoders, each with every protocol of the Receive_Set enabled and again with the Send_Profile's family only, on a mid-range phone before the decoder count and the Receive_Scope are final (design task 13.2).
8. THE Rx_Pipeline SHALL create all of its Phase_Decoders with one Receive_Set through one `createDecoders` call, so that one pipeline setup is one Decoder_Setup.

### Requirement 5: Delivering received frames

**User Story:** As the relay and UI, I want each decoded byte array turned into either a frame or a rejection, so that I never see corrupted bytes and never see the same reception four times.

#### Acceptance Criteria

1. WHEN a Phase_Decoder returns a payload that is not a sibling duplicate, THE Rx_Pipeline SHALL pass it to `decodeFrame`, and SHALL emit a `frame` event carrying the payload as `wire` and the decoded frame if `decodeFrame` succeeds.
2. WHEN a Phase_Decoder returns a payload that is byte-equal to a payload from a different Phase_Decoder within 2048 Stream_Frames (design parameter) of that payload's first sighting, THE Sibling_Merge SHALL treat it as a sibling duplicate and the Rx_Pipeline SHALL NOT emit a second event for it.
3. THE Sibling_Merge SHALL decide only by byte equality, a decoder index and a frame number. It SHALL NOT read a frame field and SHALL NOT use the Message_ID, and byte-equal payloads from the same decoder or after the window SHALL count as new receptions.
4. IF `decodeFrame` fails, THEN THE Rx_Pipeline SHALL emit a `rejected` event with the `DecodeErrorCode` and the byte length, and SHALL NOT emit a `frame` event.
5. THE Rx_Pipeline SHALL NOT throw for any chunk contents or any payload the Modem returns, including empty and over-length arrays.
6. THE Rx_Pipeline SHALL leave dedupe by `frameKey`, TTL and hop decisions to the `relay` spec.
7. THE Rx_Pipeline SHALL give every `frame` event its own copy of the payload, so that no event aliases WASM memory or another event.
8. THE Rx_Pipeline SHALL never emit a `frame` event whose `wire` differs from the bytes `decodeFrame` accepted.

### Requirement 6: Microphone setup and failure

**User Story:** As a user, I want the app to open the microphone in the way modem tones survive, and to tell me what went wrong when it cannot.

#### Acceptance Criteria

1. THE Transport SHALL request the microphone with `echoCancellation`, `noiseSuppression` and `autoGainControl` all set to `false`, a single channel, and no requested sample rate.
2. THE `classifyMicError` function SHALL map `NotAllowedError` to `DENIED`, `NotFoundError` and `OverconstrainedError` to `NO_DEVICE`, `NotReadableError` to `BUSY`, `SecurityError` to `INSECURE`, and any other name or `undefined` to `UNKNOWN`.
3. THE `micReducer` function SHALL be total over every Mic_State and event, SHALL reach `live` only from `requesting` on `granted` or from `muted` on `track-unmuted`, and SHALL return `idle` on `stop`.
4. WHEN the stream opens, THE Transport SHALL read `track.getSettings()` and report whether all three processing flags are off, and IF any is on THEN THE Transport SHALL emit a warning event and keep listening.
5. IF the user denies the microphone, THEN THE Transport SHALL set the Mic_State to `denied`, emit the state, and keep `send` available.
6. WHEN the microphone track ends, THE Transport SHALL set the Mic_State to `lost`, and WHEN it is muted by the system THE Transport SHALL set it to `muted` and restore `live` on unmute.
7. THE Transport SHALL re-ask for the microphone only from `restartMic()` called in a user tap, and SHALL NOT re-ask by itself after `denied`, `lost` or `busy`, because permission may have reset (iOS).
8. WHEN the page becomes hidden, THE Transport SHALL emit `foreground: false` regardless of whether the browser suspended capture, so that the UI can state that listening works only in the foreground.
9. WHEN the `AudioContext` changes state to `suspended` or `interrupted`, THE Transport SHALL emit a `context` event, and SHALL try `resume()` when the page becomes visible.
10. WHEN microphone setup fails, THE Transport SHALL leave sending usable.

### Requirement 7: Hearing ourselves

**User Story:** As a user in a room, I want my own transmission to be ignored by my own receiver, so that I do not see my own message arrive as new.

#### Acceptance Criteria

1. WHEN the Transport starts a transmission, THE Transport SHALL tell the Decode_Worker to gate the range from the scheduled start frame to the scheduled end frame plus the Tail_Guard, before the first affected Chunk can arrive.
2. WHILE a Chunk lies wholly inside a Gate, THE Rx_Pipeline SHALL discard it, SHALL emit no `frame`, `rejected` or `carrier` event for it, and SHALL count it as gated. WHILE a Chunk partly overlaps a Gate, THE Rx_Pipeline SHALL zero only the samples whose frame lies in the Gate, process the Chunk normally, and count it as partly gated.
3. THE Rx_Pipeline SHALL reset every Phase_Decoder, chunker and the carrier detectors at the first gated Chunk and again at the first Chunk after the Gate, and SHALL receive a frame that starts after the Gate normally, including a frame that starts inside the last partly gated Chunk.
4. WHEN a decoded payload is byte-equal to one of the last 8 sent Wire_Bytes and arrives within 30 s of its send frame, THE Rx_Pipeline SHALL set `ownEcho` to `true` on the `frame` event and SHALL deliver the event, independent of the Family and Speed in which the payload was sent or heard.
5. THE Rx_Pipeline SHALL set `ownEcho` to `false` for any payload that differs from every remembered Wire_Bytes in any byte, or that arrives after the window, and SHALL NOT change `wire`.
6. THE Transport SHALL emit a `tx` event with phase `start` when playback is scheduled and phase `end` when it finishes, so that the UI can show that the device cannot receive while it transmits.
7. THE design SHALL state that the device is deaf from the start of its own transmission until the end of the Tail_Guard.

### Requirement 8: Carrier detection

**User Story:** As a user, I want the CARRIER light to come on when a signal is present in the active band, without waiting for a full decode.

#### Acceptance Criteria

1. WHEN the energy in a profile's carrier band is at least 8 times (design parameter) the tracked noise floor for 2 consecutive Chunks (design parameter), THE Carrier_Detector of that band SHALL report active.
2. WHEN the energy stays below 4 times (design parameter) the noise floor for 6 consecutive Chunks (design parameter), THE Carrier_Detector SHALL report inactive.
3. THE Carrier_Detector SHALL NOT report active for noise alone at a constant level or for a tone outside the profile's band.
4. THE Carrier_Detector SHALL reach the same decisions for a signal scaled by any gain in 0.01 to 1, because it compares a ratio and not an absolute level.
5. THE Carrier_Detector SHALL freeze the noise floor while active, and SHALL re-baseline and report inactive after 20,000 ms (design parameter) of continuous activity.
6. THE Carrier_Detector SHALL return a value only when its state changes, and the Rx_Pipeline SHALL emit one `carrier` event per change.
7. THE Carrier_Detector SHALL NOT decode, and SHALL be documented as "energy in band", with UI copy that does not claim a modem was detected.
8. THE Test_Suite SHALL include a test that encodes sample payloads with the real Modem in each profile and requires at least 90% (design parameter) of the signal energy to fall inside that profile's carrier band, and the Quiet band of 15,000 to 19,400 Hz SHALL be the range holding the central 95% of the energy at 48,000 Hz, rounded outward to 100 Hz.
9. THE Rx_Pipeline SHALL watch every Channel_Profile band whose carrier band is not null at all times, whatever the Send_Profile is, using one Carrier_Detector per band and one FFT per Chunk shared by all detectors.
10. IF a Channel_Profile's carrier band is null, THEN THE Rx_Pipeline SHALL create no Carrier_Detector for it and SHALL emit no `carrier` event for it.
11. THE Rx_Pipeline SHALL name the band (the profile id) in each `carrier` event, and the documentation SHALL state that the bands of Room and Call overlap from 1,900 to 2,580 Hz, so that one transmission can light both and a band event does not identify the sender's mode.

### Requirement 9: One ggwave boundary

**User Story:** As a developer, I want every ggwave call in one small module, so that tests can swap it out and an upgrade touches one file.

#### Acceptance Criteria

1. THE Test_Suite SHALL fail IF any file in `src/audio` other than Ggwave_Modem contains the tokens `ggwave_factory`, `rxToggleProtocol`, `GGWAVE_PROTOCOL` or an import from `vendor/`.
2. THE Modem interface SHALL expose `txSampleRate`, `rxSampleRate`, `modulate`, `createDecoders(protocols, count)` and `dispose`, and each decoder SHALL expose `feed`, `reset`, `dispose` and its read-only `protocols`, with no ggwave type in any signature.
3. THE Ggwave_Modem SHALL return copies of ggwave's encode and decode output made before any other ggwave call, SHALL return `null` and never an empty array from `feed`, and SHALL enable on each decoder only the Protocol_Ids it was created with, fixed for the life of that decoder. THE Ggwave_Modem SHALL raise `NO_INSTANCE` when ggwave returns a negative instance id, and SHALL never encode with, decode with or free a negative id.
4. THE Ggwave_Modem SHALL throw `ModemError("BAD_LENGTH")` from `modulate` for a payload of 0 or more than 140 bytes, as a last-line guard, because ggwave truncates silently.
5. THE Test_Suite SHALL provide the Fake_Modem, which models dependence on alignment and silent corruption, so that all Pure_Modules can be tested without WASM.
6. THE Test_Suite SHALL include slow tests against the real Modem that encode at 44,100 Hz and 48,000 Hz and decode only at 48,000 Hz, resampling 44,100 Hz waves to 48,000 Hz first.
7. THE Ggwave_Modem SHALL create decoders only through a Decoder_Setup that sets the ggwave toggle of every protocol it knows (on for the requested Receive_Set, off for all others, including NORMAL modes) and then creates the instances with no `await` between the two steps, and SHALL NOT rely on ggwave's defaults or on toggles left by an earlier setup.
8. THE Ggwave_Modem SHALL run Decoder_Setups through one module-level Setup_Mutex shared by every Modem built on the same ggwave module, so that two pipelines starting concurrently never interleave toggles and creations.
9. WHEN a decoder's `reset` is called, THE Ggwave_Modem SHALL re-apply that decoder's own protocol set as a Decoder_Setup before it frees and re-initializes the instance.
10. WHEN the enabled protocol set must change, THE Rx_Pipeline SHALL dispose the existing decoders and create new ones through `createDecoders`, and THE Modem SHALL offer no call that changes the set of a live decoder.
11. THE Test_Suite SHALL include a slow test file `ggwave-modem.slow.test.ts` on vendored ggwave 0.4.0 that shows: (a) a decoder created before a protocol is toggled off still decodes that protocol and one created after does not; (b) two `createDecoders` calls started in the same tick with different sets, in either order, yield decoders that decode only their own set; (c) a decoder `reset` after another setup still decodes only its own set; (d) a call log of the toggles and creations is a concatenation of whole setups; (e) `modulate` output for every protocol is unchanged by any toggle state.
12. THE Ggwave_Modem SHALL keep at most 4 live decoders per ggwave module, and a Decoder_Setup that would exceed this SHALL fail with `NO_INSTANCE` before creating any instance.
13. THE Ggwave_Modem SHALL encode on a ggwave module separate from the module that holds the decoders.

### Requirement 10: Layering and testability

**User Story:** As a maintainer, I want the logic to run in Node and the browser parts to be thin, so that most behaviour is covered by fast property tests.

#### Acceptance Criteria

1. THE `src/audio` files SHALL import from `src/protocol` only through `src/protocol/index.ts`, and `src/protocol` SHALL NOT import from `src/audio`.
2. THE Pure_Modules SHALL NOT use `window`, `document`, `navigator`, `AudioContext`, `AudioWorkletNode`, `Worker`, `MediaStream` or `importScripts`, and the Test_Suite SHALL scan for these names.
3. THE browser glue files SHALL contain no logic beyond message forwarding, API calls and the arithmetic of scheduling, and every decision they rely on SHALL come from a Pure_Module.
4. THE Test_Suite SHALL place unit tests in `*.test.ts`, property tests in `*.prop.test.ts` and real-WASM tests in `*.slow.test.ts` next to the code, and print the fast-check seed on failure.
5. THE Test_Suite SHALL run Pure_Module tests with `environment: node` and no DOM.
6. THE Test_Suite SHALL include a Playwright test on Chromium with a fake microphone fed from a WAV file that decodes a known frame end to end, a test that denies the microphone and still sends, and a test that loads the built app, cuts the network and decodes.
7. THE Test_Suite SHALL provide a `wavToChunks` helper so that one WAV file feeds the Node tests and the Playwright fake microphone.

### Requirement 11: Offline and packaging

**User Story:** As a user with no internet, I want the audio path to work with no network after the first load.

#### Acceptance Criteria

1. THE Transport SHALL load the worklet, the Decode_Worker and `vendor/ggwave.js` from the app's own origin and SHALL make no network call at runtime.
2. THE built app SHALL include the worklet script, the Decode_Worker script and `vendor/ggwave.js` in the service worker precache.
3. THE offline behaviour SHALL be verified against the built app served by `npm run preview` and not against `vite dev`.
4. THE Decode_Worker SHALL be built as a classic worker, because `importScripts` is not available in a module worker.

### Requirement 12: Evidence behind the speed decision

**User Story:** As the project owner, I want the speed decision to be backed by data a larger run can confirm or overturn, so that I do not rely on a sweep of 150 payloads.

#### Acceptance Criteria

1. THE Test_Suite SHALL include a slow script that, for each FASTEST and FAST protocol of the three families, sends at least 1,000 random payloads of 1 to 140 bytes through the real Modem with no noise at 48,000 Hz, and logs the counts of equal, wrong and not-decoded results per protocol without asserting equality of raw bytes.
2. THE Test_Suite SHALL replay the three recorded failing payloads of the `frame-protocol` design under the FAST protocol of the same family and log whether each decodes correctly.
3. IF the sweep of requirement 12.1 shows a wrong-bytes rate above 2% for the first Speed of any profile, THEN THE team SHALL change that profile's first Speed in the table and update the decision table in `design.md`.
4. THE design SHALL state in its decision table that the sweep measured payloads of 1 to 60 bytes without noise, and that the rate for 140-byte frames and real channels is unknown.
5. THE design SHALL record that the sweep of 12.1 ran and that the profile table was confirmed, because no first-speed wrong rate exceeded 2%.

## Obligations on other specs

The following duties belong to other specs. They are not requirements on `src/audio` and are not tested by this spec.

- `relay`: ignore `ownEcho: true` frames when deciding to rebroadcast, keep deduping by `frameKey`, and send a relay copy at Attempt 0.
- `ui-flows`: keep the Attempt counter and pass it to `send`. Show the byte meter's airtime from `airtimeMs`. Show "listening stopped" when `foreground.visible` is false or the Mic_State is not `live`. Show the Quiet fallback hint. Give every `tx`, `frame` and `carrier` event a visual and haptic cue.
- `channel-modes` and `ui-flows`: the channel switch (Room, Call, Quiet) selects only the Send_Profile and SHALL NOT be described as the listening mode. `carrier` events name a band, and the UI combines them into one CARRIER light.
- `channel-modes`: add any new profile as a row in `profiles.ts` with a measured carrier band.
- Build scaffold (no spec yet): emit the worklet and the Decode_Worker as classic scripts, give their URLs and the URL of `vendor/ggwave.js` to `transport.ts`, and put all three in the precache.
