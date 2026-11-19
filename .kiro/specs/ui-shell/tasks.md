# Implementation Plan: ui-shell

## Overview

Implement the app shell and the main device screen in `src/ui/`, following `requirements.md` and `design.md` in this folder (do not modify them while executing tasks). The language is TypeScript with Preact. The order is: scaffold and assets, the pure model (Node-testable), the transport seam with the audio-transport amendments, the components, the wiring, the end-to-end tests, then Design QA, the CPU measurement tooling, the Pages deploy and a final checkpoint.

This spec also finishes audio-transport tasks 11 to 13. Six tasks here tick the matching boxes in `.kiro/specs/audio-transport/tasks.md` when they pass: 3.2 (11.1), 3.3 (11.2), 6.1 (12.1), 6.3 (12.2), 6.4 (12.3), 6.5 (13.1) and 8.1 (14.1). Audio-transport task 13.2 (CPU measurement on a real phone) stays unticked until the user does it.

Key design points the tasks rely on:
- The byte meter lit count is `min(24, ceil(bytes * 24 / limit))`, 0 at 0 bytes, and State 03 (41 of 128 bytes) shows 8 lit segments. Colour is positional: lit segments 1 to 19 `--meter-ok`, 20 to 24 `--meter-warn`, and over the limit all 24 `--amber` with the glow. Never red. The limit is always `plaintextCapacity`, never a literal.
- The UI talks to audio only through the `AudioTransport` seam. `vite dev` uses a `FakeTransport`. Real audio is verified on `npm run build` plus `npm run preview`, because the decode worker must be a classic worker.
- The pure model lives in `src/ui/model` and imports no DOM global and no Preact.
- Tokens only. No hard-coded colours except `#040504`.

Ground rules for every task:
- Do not commit. Never run `git add` or `git commit`. The user makes one commit when the whole spec is done.
- Use `npm.cmd` and `npx.cmd`. PowerShell blocks `npm.ps1` on this machine. Do not change the execution policy.
- Pin every new dependency to an exact version (no `^` or `~`). Get each version from `npm.cmd view <pkg> version` at install time. Never guess a version. Before installing Vite, check which Vite major the chosen `vite-plugin-pwa` supports in its peer dependencies.
- Every task is required. There are no optional tasks.
- Unit tests are `*.test.ts`, property tests are `*.prop.test.ts`, real-WASM tests are `*.slow.test.ts`, all next to the code. Property tests use fast-check and print the seed on failure.
- Do not edit `src/protocol` or `vendor/ggwave.js`. Edit `src/audio` only where a task says so.
- `src/ui` imports `src/protocol` and `src/audio` only through their `index.ts` files. `src/ui/model` imports no DOM global and no Preact.
- Never hard-code a colour in `src/ui` (except `#040504`), never hard-code the meter limit, never use red outside the SOS button, SOS ring and SOS slip, and never hotlink a Figma asset URL.
- Read Figma through the Figma MCP (file key `VDyiOLNBAavxsBHP15j1Sj`, pages `191:2`, `191:3`, `219:2`) when building each component, and copy strings that Figma shows verbatim into `src/ui/copy.ts`. List every string you had to write yourself in the task result.
- Do not invent measurements. A number is taken from Figma, `src/protocol`, `docs/FIELD-FINDINGS.md`, a task here, or is marked "design parameter" in `design.md`.

## Tasks

- [x] 1. Scaffold, tokens, fonts and assets
  - [x] 1.1 Choose versions and install dependencies
    - Run `npm.cmd view vite-plugin-pwa version` and read its `peerDependencies` (`npm.cmd view vite-plugin-pwa peerDependencies`). Choose a Vite major it supports. Record the choice and the reason in the task result.
    - Install with exact pins (`--save-exact`, and `.npmrc` already sets `save-exact=true`): `preact` (runtime), and as devDependencies `vite`, `@preact/preset-vite`, `vite-plugin-pwa`, `workbox-window` (only if the plugin's docs require it for `virtual:pwa-register`), `preact-render-to-string`, `@fontsource/barlow-condensed`, `@fontsource/ibm-plex-sans`, `@fontsource/ibm-plex-mono`. Check that each `@preact/preset-vite` and `preact` version works with the chosen Vite major.
    - Do not install Playwright here (task 6.1 does).
    - Confirm `package-lock.json` is updated and `npm.cmd ci` succeeds.
    - _Requirements: 1.2, 1.3, 1.6_

  - [x] 1.2 Add the build configuration and project files
    - Create `index.html` (root), `src/ui/main.tsx` (a placeholder that renders "Dial Tone" so the build runs), and `vite.config.ts` with: `base` `/dial-tone/` when the command is `build` and `/` otherwise; the Preact preset; `worker: { format: 'iife' }` so the decode worker is a classic worker; `vite-plugin-pwa` with `registerType: 'prompt'`, a manifest (name and short_name "Dial Tone", `display: 'standalone'`, `scope` and `start_url` equal to `base`, 192, 512 and maskable 512 icons, `theme_color` and `background_color` equal to one constant that holds the `--bg` value `#ededeb`, with a comment naming the token), and `workbox.globPatterns` covering html, js, css, woff2, png, svg and webmanifest, plus the worker, the worklet and `vendor/ggwave.js`.
    - Update `tsconfig.json`: add `DOM` and `DOM.Iterable` to `lib` for `src/ui` and the browser glue, and add `jsx: "react-jsx"` with `jsxImportSource: "preact"`, and `vite/client` to `types`. Keep `strict` and `noUncheckedIndexedAccess`. Include `vite.config.ts` and `e2e` in `include`.
    - Update `package.json` scripts: `dev` (`vite`), `build` (`tsc --noEmit && vite build`), `preview` (`vite preview`), and add `test:e2e` (`playwright test`, the script is added now, Playwright arrives in 6.1). Keep the existing scripts.
    - Update `vitest.config.ts` so `src/ui/**/*.test.ts` run in `environment: node`.
    - Update `biome.json` to exclude `dist`, `vendor` and `public`. Add `dist`, `dev-dist` and `test-results` to `.gitignore` and check that `.kiro` is not ignored.
    - Add the README section (create `README.md` if missing) that names ggwave 0.4.0 (MIT) and the three bundled font families (OFL) as pre-existing code, with the license files.
    - Run `npm.cmd run typecheck`, `npm.cmd run lint` and `npm.cmd run build`. The build must produce a service worker and a manifest under `dist`.
    - _Requirements: 1.1, 1.4, 1.5, 1.7, 1.8, 2.2, 2.3, 2.4_

  - [x] 1.3 Add the fonts and the token stylesheet
    - Create `scripts/copy-fonts.mjs` that copies only the Latin-subset woff2 files for Barlow Condensed 600 and 700, IBM Plex Sans 400, 500 and 600, and IBM Plex Mono 400, 500, 600 and 700 from the `@fontsource` packages into `src/ui/fonts/`, together with each package's OFL license file. Run it once and commit the output. No remote font URL anywhere.
    - Create `src/ui/styles/fonts.css` with the `@font-face` rules (relative URLs, `font-display: swap`).
    - Create `src/ui/styles/tokens.css` with every Token from `design-system.md` (Ghost values as default, Beige 96 values under `[data-theme="beige"]`, the same-in-both-modes group, radii, shadow recipes as custom properties, the unlit meter segment colour as a Token, the type styles as custom properties). Token names must match the Figma variable names exactly. Do not add a Token that Figma does not have, except the documented aliases for `rgba` values used in shadows.
    - Create `src/ui/styles/base.css` with the page background (`--bg-hi`, `--bg`, `--bg-lo`), box sizing and the `prefers-reduced-motion` base rules.
    - _Requirements: 3.1, 3.2, 3.5, 3.9_

  - [x] 1.4 Write the Figma source map and download the assets
    - Using the Figma MCP, create `docs/figma-source-map.md` from the "Figma source map" tables in `design.md` (States, Components, New screens, with node ids and gallery names). Add, for each component, the exact size, and record the heights of the three reserved slots (group key bar, quick keys, SOS) from the State 03 faceplate.
    - Download the assets that are images or SVG in Figma and that the code needs, into `public/art/`: the raised signal line SVG, the vias, the icons, the app icon (also as 192, 512, maskable 512 and apple-touch 180 PNG files for the manifest), and the paper and faceplate grain textures. Use `download_assets` or the asset URLs from `get_design_context` once, save the files, and never reference a Figma URL in code.
    - Mark the deferred items (Sheets Key open to Key offer, Group key bar, Quick keys, Check words, Group code card, New screens 07 to 14) as deferred in the map.
    - Update the manifest icons in `vite.config.ts` to the downloaded PNG files.
    - _Requirements: 3.6, 3.7, 15.2, 2.3_

  - [x] 1.5 Replace the stale limit in `design-system.md`
    - In `.kiro/steering/design-system.md`, change the State 11 row text "Note says over 134 bytes" to say 128, and rewrite the "Meter limit" item under "Open issues" to say that Figma State 11 now says 128, that the limit comes from `plaintextCapacity({ encrypted: false, multi: false })`, and that 134 must not appear anywhere. Update the Message well row so it states the lit rule `ceil(bytes * 24 / limit)` and the positional colours (segments 1 to 19 `--meter-ok`, 20 to 24 `--meter-warn`, over the limit all 24 `--amber`). Change nothing else.
    - Search the repository (outside `node_modules`) for "134" used as a byte limit and report any other hit without editing it.
    - _Requirements: 3.10, 4.1_

- [x] 2. Pure model in `src/ui/model`
  - [x] 2.1 Create `meter.ts` and test it
    - Implement `METER_SEGMENTS` (24), `METER_OK_SEGMENTS` (19), `MeterColor`, `MeterView`, `meterView(bytes, limit)` and `wellLimit()` exactly as in `design.md`. `lit = bytes === 0 ? 0 : min(24, ceil(bytes * 24 / limit))`. Use `ceil`, never `floor`. Segment colour is positional, and over the limit every segment is `over`. There is no red value.
    - Create `src/ui/model/meter.test.ts`: State 03 (41 of 128) gives `lit` 8 and segments 1 to 8 `ok`; 0 bytes gives 0; 1 byte gives 1; 128 of 128 gives 24 with segments 1 to 19 `ok`, 20 to 24 `warn` and `over` false; 129 gives all 24 `over`; a state of 20 lit has segment 20 `warn`; `wellLimit()` equals `plaintextCapacity({ encrypted: false, multi: false })`.
    - Create `src/ui/model/meter.prop.test.ts` for Property 1: for `bytes` 0 to 4 times the limit and `limit` 1 to 256, `lit` equals the ceil formula and is at most 24, is 0 at 0 bytes, is non-decreasing in `bytes`; for `bytes <= limit` the colours are positional (1 to 19 `ok`, 20 to 24 `warn`, rest `off`) and count of non-`off` equals `lit`; for `bytes > limit` all 24 are `over`; the set of colour values is exactly `off`, `ok`, `warn`, `over`.
    - **Property 1: Byte meter**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6**
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [x] 2.2 Create `draft.ts` and test it
    - Implement `DraftView` and `draftView(text)` as in `design.md`: bytes by `utf8ByteLength`, limit by `wellLimit()`, `status` (`empty`, `ok`, `too-long`), `wireLength` as `bytes + frameOverhead(1)` only for `ok`.
    - Create `src/ui/model/draft.prop.test.ts` for Property 2: for random strings including multi-byte characters and emoji, `bytes` equals `utf8ByteLength(text)`, `limit` equals the protocol value (spy on `plaintextCapacity` and check the call arguments `{ encrypted: false, multi: false }`), `status` is `too-long` exactly when `bytes > limit`, and `bytes > text.length` for any text with a multi-byte character. Add `draft.test.ts` for 70 `é` characters (140 bytes, too long) and exactly 128 ASCII bytes (ok).
    - **Property 2: Draft limit follows the protocol**
    - **Validates: Requirements 4.1, 4.2, 5.3**
    - _Requirements: 4.1, 4.2, 5.3, 5.2_

  - [x] 2.3 Create `send.ts` and test it
    - Implement `SEND_TTL` (3, design parameter) and `buildWire(text, rng?)` as in `design.md`, calling `splitPayload`, `newMessageId`, `makeFrames` and `encodeFrame` through `src/protocol`. Reject empty and over-limit text before any of those calls.
    - Create `src/ui/model/send.prop.test.ts` for Property 3: for texts of 1 to 128 UTF-8 bytes (random strings including multi-byte characters), `buildWire` is ok, the wire is at most 140 bytes, and `decodeFrame(wire)` gives type 0, unencrypted, hop 0, ttl `SEND_TTL` and a body equal to the UTF-8 of the text; for texts over 128 bytes it returns `TOO_LONG` and spies on `splitPayload`, `newMessageId`, `makeFrames` and `encodeFrame` are not called; the empty string returns `EMPTY`. Add `send.test.ts` for the three fixed cases.
    - **Property 3: Send path**
    - **Validates: Requirements 6.2, 6.3, 6.7**
    - _Requirements: 6.2, 6.3, 6.7_

  - [x] 2.4 Create `tape.ts` and `receive.ts` and test them
    - `tape.ts`: the `Slip` type (live kinds `sent`, `heard`, `system`, `update-ready`, plus the gallery-only kinds), `TAPE_COLLAPSED` (3), `TAPE_MAX` (50), `pushSlip` (oldest dropped), `visibleSlips(tape, expanded)` (newest first, `hidden` count), and `sanitizeText` (strips control characters, caps at 1,024 characters).
    - `receive.ts`: `ReceiveState`, `SEEN_MAX` (256), `PARTIAL_MAX` (8) and `receiveFrame` as in `design.md`, using `frameKey`, `reassemble` and a lenient UTF-8 decode. Non-TEXT and encrypted frames give a `system` slip with `noticeKey: "unsupported"`.
    - Create `src/ui/model/receive.prop.test.ts` for Property 6: `ownEcho` never yields a slip and never changes `seen`; a repeated `frameKey` never yields a second slip; a TEXT single frame yields one `heard` slip with the decoded text and the frame's hop; non-TEXT or encrypted yields a `system` slip; multi-frame TEXT messages (2 to 6 frames, shuffled arrival order, with duplicates) yield exactly one slip after the last frame and none before; separately, for every proper subset of the frames of a multi-frame message, no slip is yielded (a standalone check, not conditional on the last frame arriving); `seen` and `partial` stay within their caps; never throws. Build frames with `makeFrames` and `splitPayload` from `src/protocol`.
    - Create `src/ui/model/tape.prop.test.ts` for Property 7: at most `TAPE_MAX` slips with the newest kept, `visibleSlips(false)` returns the latest 3 and `hidden = max(0, n - 3)`, `visibleSlips(true)` returns all, newest first. Add `tape.test.ts` for control-character stripping and the 1,024 cap.
    - **Property 6: Receive path**
    - **Property 7: Tape**
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.5, 7.6, 7.10, 7.11, 7.12, 7.13**
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.9, 7.10, 7.11, 7.12, 7.13_

  - [x] 2.5 Create `reducer.ts` and `status.ts` and test them
    - `reducer.ts`: `UiState`, `UiEvent`, `SheetId`, `initialState(saved)` and `reduce` as in `design.md`, total and pure. Timing values come in with the events. Include the constants `SELF_TEST_MS` (600, Figma note), `CONNECT_HOLD_MS` (3,000, design parameter), `CARRIER_HOLD_MS` (1,500, design parameter), `QUIET_REARM_MS` (2,500, Figma note) and `ERROR_HOLD_MS` (3,000, design parameter). The carrier rule: a `carrier active` event shows CD only when `lastOffAt` is null or at least `QUIET_REARM_MS` before `now`.
    - `status.ts`: `statusView`, `transmitState`, `listenState`, `signalDirection` and the hint keys, following the table in `design.md` and requirement 8.3. Hint keys are resolved in `copy.ts` later.
    - Create `src/ui/model/reducer.prop.test.ts` for Property 4: random event sequences from `initialState` never throw and never mutate the input (freeze states in the test); `power = on` is reached only from `selftest` by `self-test-done`; `tx.phase = sending` implies `power = on`; `latch-tap` changes nothing unless `power = on` and `mic = live`; `channel` events do not change the channel while sending.
    - Create `src/ui/model/status.prop.test.ts` for Property 5: for random `UiState` and `now`, the LEDs and code match the table row by row (none and `— — —` when off, six and `ATZ` in self-test, SD only when sending, RD only in a connect hold, CD only in the carrier hold, AA only when the latch is pressed, the mic is `live` and the page is visible, OH if and only if the channel is `call` when on, and no LED at all, OH included, when off, on every channel); `transmitState` is `disabled` when off, empty, too long or faulted and `sending` while sending; `listenState` is `disabled` when off and `no-mic` when the mic is denied, and stays `listening` for a hidden page with a live mic and a pressed latch. Add a `send-busy` event and the `busyUntil` field (`BUSY_FLASH_MS` 600, design parameter) to the reducer, and a `SEND_UNAVAILABLE` start-failed code with the matching `send-unavailable` fault.
    - Add `reducer.test.ts` for the fixed paths: power on to ready, send, receive, State 12 (denied) and State 13 (latch released).
    - **Property 4: Reducer invariants**
    - **Property 5: Status window**
    - **Validates: Requirements 8.1, 8.2, 8.3, 8.5, 8.9, 10.4, 11.1, 11.3, 11.7, 6.1**
    - _Requirements: 6.1, 6.4, 6.5, 6.6, 6.8, 6.9, 7.8, 8.1, 8.2, 8.3, 8.5, 8.6, 8.7, 8.8, 8.9, 10.4, 11.1, 11.3, 11.4, 11.7_

  - [x] 2.6 Create `scope-map.ts` and test it
    - Implement `ScopeWindow`, `scopeWindow(channel)`, `binRange(sampleRate, fftSize, loHz, hiHz)` and `formatKHz(hz)`. Room is 0 to 8 kHz, Quiet is 12 to 20 kHz, Call is the range read from Figma State 09 (record it in the Source_Map and in the task result). The band comes from `PROFILES[channel].carrierBandHz`.
    - Create `src/ui/model/scope-map.prop.test.ts` for Property 9: for every profile, sample rates 8,000 to 96,000 and `fftSize` in 256, 512, 1024, 2048 and 4096, `0 <= lo <= hi < fftSize / 2`, and the band lies inside its window. Add `scope-map.test.ts` for `formatKHz` (1,120 gives "1.1", 2,580 gives "2.6") and the Quiet range.
    - **Property 9: Scope mapping**
    - **Validates: Requirements 9.2, 9.3**
    - _Requirements: 9.2, 9.3_

  - [x] 2.7 Create `persist.ts` and test it
    - Implement `PERSIST_ENABLED`, `STORAGE_PREFIX`, `SavedState`, `serialize`, `parseSaved` and a small `createStore(storage)` that debounces writes (the debounce takes an injected timer, so tests need no real clock) and swallows storage exceptions. With `PERSIST_ENABLED` false, tape and draft are neither read nor written, and the flags still persist. `parseSaved` validates every field as in `design.md`.
    - Create `src/ui/model/persist.prop.test.ts` for Property 8: `parseSaved(serialize(s))` equals `s` for valid states; for arbitrary strings `parseSaved` never throws and returns `null` or a state within the caps; with the constant false the writer is not called for tape or draft; a throwing storage never throws out of the store. Add `persist.test.ts` for a bad slip being dropped while the others load.
    - **Property 8: Persistence**
    - **Validates: Requirements 16.1, 16.2, 16.3**
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5_

  - [x] 2.8 Create `update-guard.ts` and test it
    - Implement `canRestartNow(s, now)` as in `design.md`. Create `src/ui/model/update-guard.prop.test.ts` for Property 13: false whenever a transmission is in flight, a connect hold is running or a carrier is active, true otherwise.
    - **Property 13: Update guard**
    - **Validates: Requirements 2.7**
    - _Requirements: 2.7_

  - [x] 2.9 Create `gallery.ts` and test it
    - Implement `GalleryName`, `isGalleryName`, `galleryFixture`, `GalleryExtras` and `SOS_GALLERY_ONLY` as in `design.md`, with one fixture per name in the Source_Map: States 01 to 16 and the New screens in scope (onboarding 1 to 3, first-power, mic-denied, mic-reset, install-sheet, install-notice, update-ready). Fixtures use `UiState` and component-only extras (SOS ring progress, `passOn`, the three slot flags, demo slips including the gallery-only slip kinds). State 06's fixture sets `passOn`. The `beige` fixture sets the theme.
    - Create `src/ui/model/gallery.test.ts`: every name resolves; every gallery name appears in the Source_Map file (read `docs/figma-source-map.md`); each of the 16 States page frames has a name; `sos-held` and `sos-received` are the only names with an SOS extra; State 03's fixture has MR and AA lit, `OK` and an empty tape; State 11's fixture has a draft over the limit and Transmit disabled; the fixtures call no storage.
    - _Requirements: 14.1, 14.2, 14.3, 14.6_

- [x] 3. Transport seam and audio-transport completion
  - [x] 3.1 Fold the four amendments into the audio-transport spec
    - In `.kiro/specs/audio-transport/` append the amendments without renumbering any requirement or task: in `requirements.md` add a short "Amendments from ui-shell" section after the last requirement (analyser, airtime event, `setListening`, `start()` result); in `design.md` add the same four items to "Components and Interfaces" under `transport.ts` (the `AudioTransport` interface block gets `analyser`, `setListening`, the airtime event in `TransportEvent`, and `start()` returning `{ sampleRate, mic }`) and a line in "Obligations on other specs"; in `tasks.md` add sub-bullets under tasks 10.2, 11.1 and 11.2 that name the amendments (do not add a new numbered task and do not change any checkbox here).
    - State in the amendment text that `start()` returns an error whenever sending does not work, whatever the cause (`MODEM_LOAD_FAILED`, `NO_AUDIO_CONTEXT`, a worker crash or a codec initialisation failure, the last two as a new `SEND_UNAVAILABLE` code), and returns ok only when sending works, including when only the microphone failed.
    - Run `validate_spec_format` on each edited file and fix any error.
    - _Requirements: 17.6_

  - [x] 3.2 Implement the browser glue and the amendments
    - Check that `vite` is now in `package.json` (task 1.1 ran). Then implement audio-transport task 11.1 as written in `.kiro/specs/audio-transport/tasks.md`: `src/audio/capture-worklet.ts`, `decode-worker.ts`, `mic.ts`, `player.ts`, `transport.ts` (each under 200 lines, logic stays in the pure modules), with the 48 kHz context request, the resampler fallback, the gain-0 connection, the `AnalyserNode` and the classic worker and worklet URLs (`?worker&url`-style imports built through the Vite config of task 1.2, with `vendor/ggwave.js` imported as `?url`).
    - Implement the four amendments: `analyser` (a `SpectrumSource` wrapping the `AnalyserNode`, `null` before start and after stop), the `airtime` event (the worker answers `airtimeMs` requests, cached per profile and byte length), `setListening(on)` (the worker stops feeding the pipeline and forwarding `frame`, `rejected` and `carrier` events, the microphone stream stays open, a `listening` event is emitted), and `start()` returning `ok({ sampleRate, mic })` whenever sending works (including when only the microphone failed) and an error for any cause that stops sending (including a worker crash or codec initialisation failure, as `SEND_UNAVAILABLE`).
    - Update `src/audio/index.ts` to export `createAudioTransport` and the types `AudioTransport`, `TransportEvent`, `SendReport`, `SpectrumSource`, `MicState`, `StartError` and `SendErrorCode`. Do not export `MIC_CONSTRAINTS` or any ggwave type.
    - Keep `src/audio/layering.test.ts` passing (the glue files stay under 200 lines each and the pure modules stay free of browser globals).
    - Run `npm.cmd run build` and `npm.cmd run typecheck`. When they pass, tick audio-transport task 11.1 in `.kiro/specs/audio-transport/tasks.md` (change only that checkbox).
    - _Requirements: 1.8, 17.1, 17.2, 17.3, 17.4, 17.5, 17.7_

  - [x] 3.3 Write the transport test with a fake worker and fake context
    - Implement audio-transport task 11.2 as written in its `tasks.md` (`src/audio/transport.test.ts` with injected fakes; Property 8 of that spec; the listed checks), and add checks for the amendments: `start()` returns ok with `mic` not `live` when the fake microphone is denied, and returns an error for each fake cause that stops sending (modem load failure, no audio context, worker crash, codec initialisation failure); `analyser` is `null` before `start()` and after `stop()`; `airtimeMs` returns `null` on a miss and the worker's answer arrives as an `airtime` event, then the cached value; after `setListening(false)` the fake worker's `frame` and `carrier` events are not forwarded and sending still works; `setListening` before `start()` returns `NOT_STARTED`.
    - When the tests pass, tick audio-transport task 11.2 in `.kiro/specs/audio-transport/tasks.md` (change only that checkbox).
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.7, 13.5_

  - [x] 3.4 Create the seam type, the FakeTransport and the conformance test
    - Create `src/ui/transport-seam.ts` with the `UiTransport` type (`Pick<AudioTransport, ...>` as in `design.md`) and the only runtime import of `createAudioTransport` in `src/ui`.
    - Create `src/ui/fake-transport.ts` with `createFakeTransport(opts)` and `FakeControls` (`injectFrame`, `injectCarrier`, `setMic`, `failStart`, `holdSend`) as in `design.md`: `start()` with a short delay and no `getUserMedia`; `send` validating length (`EMPTY` and `TOO_LONG` first, then `BUSY`), emitting `tx` start and end, then looping the frame back as `ownEcho: true`; a synthetic analyser; `airtimeMs` answered from a clearly named linear stand-in model through an `airtime` event; `setListening` that suppresses `frame` and `carrier` events.
    - Create `src/ui/transport-conformance.ts` (a shared test body) and `src/ui/fake-transport.prop.test.ts` for Property 12 against the FakeTransport: every wire length 0, 1 to 140 and over 140 gives `EMPTY`, a report and `TOO_LONG`; `airtimeMs` returns `null` or a positive number; a second `send` in flight returns `BUSY`; after `setListening(false)` no `frame` or `carrier` event; `start()` returns ok with a non-live `mic` when only the microphone failed, and returns an error for every injected cause that stops sending (`failStart` accepts `MODEM_LOAD_FAILED`, `NO_AUDIO_CONTEXT` and `SEND_UNAVAILABLE`). Run the same body against the real transport with the fake modem inside `transport.test.ts` of task 3.3 (add one call there).
    - **Property 12: Transport conformance**
    - **Validates: Requirements 13.1, 13.4, 13.5, 17.1, 17.2, 17.3, 17.4**
    - _Requirements: 13.1, 13.2, 13.4, 13.5, 13.6_

- [x] 4. Components, one per Figma component
  - [x] 4.1 Build the device frame, circuit board and reserved slots
    - Create `Device.tsx`, `CircuitBoard.tsx` (SVG drawn in code under the frosted shell, vias from `public/art`) and `App.tsx` (page, device, sheet host). Layout: page 390 wide, device 370 with a 10 px side margin and 16 px top, faceplate 340 inset 15 px sides and 17 px top. Frosted shell as CSS blur over the board.
    - Render three empty reserved containers with the Figma heights from the Source_Map: group key bar slot, quick keys slot, SOS slot. They hold no content in the live app.
    - Create `src/ui/copy.ts` with the device title, tagline and the strings read from Figma. Add `src/ui/styles/device.css` using Tokens only.
    - Use the Figma MCP (`get_design_context` on State 03, node `273:2`) as the layout reference, and note differences.
    - _Requirements: 3.8, 15.1, 15.2, 20.2_

  - [x] 4.2 Build Rocker, Led and StatusWindow
    - `Rocker.tsx` (On and Off, the "I" glows green, `pulseAmber` prop, Space and Enter work), `Led.tsx` (four variants, label lights with the lens, `#040504` bezel as the only literal colour), `StatusWindow.tsx` (six LEDs MR, AA, CD, OH, RD, SD, the Readout in `--phosphor` inside the glass, the hint, tapping the LEDs calls `onLedTap`). Add the light legend (State 15) as a panel in the Status_Window area.
    - Each has a CSS file with Tokens only. Motion (LED sweep) is dropped under reduced motion.
    - Check against Figma components `213:13`, `213:40` and `213:195`.
    - _Requirements: 8.3, 8.4, 8.6, 8.8, 3.4, 19.1, 19.3, 19.4_

  - [x] 4.3 Build the Scope
    - `Scope.tsx` with the canvas drawing loop from `design.md` ("Scope drawing"): off static, warm-up from one bright line, live spectrogram from `UiTransport.analyser`, axis labels, band overlay from `scopeWindow`. Read colours from Tokens once at mount through `getComputedStyle`. Pause when `document.hidden`. Skip the warm-up under reduced motion. Check `power = off` first, so faint static shows and the warm-up is suppressed whenever the power is off.
    - Put the pure column and ramp mapping into `scope-map.ts` if it grows, so it is testable. Do not read the analyser when it is `null`.
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9_

  - [x] 4.4 Build the ChannelSwitch and the Quiet notice
    - `ChannelSwitch.tsx` as a radio group with arrow keys, the springing thumb (not under reduced motion), the captions from Figma, `aria-disabled="true"` with the dimmed style while sending (still focusable: no `disabled` attribute, no `tabindex="-1"`; pointer and keyboard input ignored; accessible name or description "Channel switch, Room, unavailable while sending", with the current channel name in place of Room). Add the amber Quiet notice about older phones (State 10) with an amber LED, no red.
    - Create `src/ui/components/ChannelSwitch.test.ts` using `preact-render-to-string`: while sending, the switch element has `aria-disabled="true"`, has no `disabled` attribute and no `tabindex="-1"`, and its accessible name or description includes "unavailable while sending" with the current channel name (check Room, Call and Quiet). When not sending, there is no `aria-disabled="true"`. Add to the reachability spec of task 6.2 a check that, while a send is held (`holdSend`), Tab reaches the switch and arrow keys and clicks leave the channel unchanged.
    - Copy must describe how this phone sends and must not claim it selects what the phone hears. No Radio position.
    - _Requirements: 10.1, 10.3, 10.4, 10.5, 10.6, 10.8, 10.9, 10.10, 10.11, 19.3_

  - [x] 4.5 Build the MessageWell and the ByteMeter
    - `ByteMeter.tsx`: 24 segments of 6 px height and radius 1, each with a `data-color` from `MeterView.segments`, mapped in CSS to `--meter-ok`, `--meter-warn`, `--amber` (over, with the 4 px glow) and the unlit Token. The label shows "41 / 128 B" with the limit from `MeterView`, and "Too long" with the count in bold `--ink` when over.
    - `MessageWell.tsx`: the recessed textarea, the meter, and the airtime line "~2.2 s on air" (a dash while unknown). It never limits typing.
    - Create `src/ui/components/ByteMeter.test.ts` using `preact-render-to-string`: for 41 of 128 exactly 8 segments are not `off`; for 128 of 128 segments 1 to 19 are `ok` and 20 to 24 are `warn`; for 129 all 24 are `over`; the markup contains no red Token name.
    - Check against Figma components `213:286` (Normal) and `213:318` (Over).
    - _Requirements: 4.3, 4.4, 4.5, 4.6, 4.7, 5.1, 5.2, 5.4_

  - [x] 4.6 Build the TransmitKey and the ListenLatch
    - `TransmitKey.tsx`: Default, Sending and Disabled, the "ATDT · 2.2 s" sub-label, the light strip that fills over the airtime in the Sending state (a progress value 0 to 1 passed in), the label stays lit. A `flash` prop (from `busyUntil`) gives the brief BUSY flash, separate from the Sending and Disabled looks.
    - `ListenLatch.tsx`: Listening, Off, No mic and Disabled with the indicator light. A tap is ignored when disabled or no mic. The latch keeps showing Listening while the page is hidden and the microphone is live.
    - Check against Figma components `213:343` and `213:413`.
    - _Requirements: 6.1, 6.4, 11.1, 11.3, 19.3_

  - [x] 4.7 Build the Tape and the Slip
    - `Slip.tsx` implements all ten Figma types (Sent, Heard, Relayed, SOS, System notice, Update ready, Locked, Locked no key, Location, I'm safe), with the meta line, paper texture from `public/art`, the torn bottom edge (CSS mask, 10 px teeth, 5 px deep), line-by-line printing and the ghost-text resolve (a small `GhostText` helper, 900 ms, design parameter) for new Heard slips. Text is rendered as text only. The SOS band and red Tokens live only in the SOS slip file. "Pass it on → hop N" renders only when a `passOn` prop is given.
    - `Tape.tsx`: "No paper yet" when empty, the latest 3 slips newest first with a "See more" button, and all slips with "Show less" when expanded (`visibleSlips`). Update ready slip has "Later" and "Restart now" buttons.
    - Create `src/ui/components/Slip.test.ts` with `preact-render-to-string`: slip text containing `<script>` and `&` is escaped; no `innerHTML` use (also covered by the scan test of 5.4).
    - Check against Figma components `213:481` and the State 14 frame.
    - _Requirements: 7.7, 7.10, 7.12, 3.3, 3.8, 15.4, 19.1_

  - [x] 4.8 Build the Sheet, the Notice and the AppIcon
    - `Sheet.tsx`: grip, two screws, kicker, title, body, two-button row (light secondary, dark primary), slide-up over the scrim (`--scrim` at 45% with 3 px blur), focus trap, Escape and the secondary button close it, no slide under reduced motion. Content components for Onboarding 1, 2, 3, Microphone (denied, reset and error first lines, iPhone and Android steps, "sending still works") and Install (iPhone and Android steps, native prompt button when available). The Install-sheet and Install-notice copy comes from Figma.
    - `Notice.tsx` (the Install plate with an amber LED and an optional mini key) and `AppIcon.tsx` (92 px, radius 24).
    - Check against Figma components `270:345` (types Onboarding 1 to 3, Microphone, Install), `270:401` and `270:433`.
    - _Requirements: 2.6, 12.1, 12.2, 12.5, 12.6, 12.7, 12.9, 3.8_

  - [x] 4.9 Build the gallery-only components
    - `SosButton.tsx` (Default, Holding with the 2 s red ring, Disabled), `QuickKeys.tsx`, `GroupKeyBar.tsx` (Open and Locked, a static padlock asset, no key logic) from the Figma components `213:377`, `270:389` and `270:376`. They accept data props only, hold no logic, and the live `App` does not import them. The gallery imports them for `sos-held` and `sos-received`.
    - Red Tokens appear only in the SOS files.
    - _Requirements: 15.3, 14.3, 3.3, 3.8_

- [x] 5. Wiring, PWA and enforcement tests
  - [x] 5.1 Create the controller
    - `src/ui/controller.ts` as in `design.md`: the store, the effects (`power-tap` calls `transport.start()` inside the tap handler, then the 600 ms self-test timer, `stop()` on power off, `setListening`, `setProfile`, `buildWire` then `send`, one airtime request per distinct `wireLength` per channel, only the first time, with the result cached in `airtimeByWire` and reused for repeat lengths, a `send-busy` event (Transmit flash, no ERROR, draft kept) when `send` returns `BUSY`, the 250 ms tick while a hold is active), the mapping from transport events to reducer events (`mic`, `tx`, `airtime`, `carrier`, `frame` through `receiveFrame`, `foreground`), the microphone sheet rules (denied versus reset by `micWasGranted`, error first lines, once per power-on), onboarding steps and the first power-on System notice slip (once), the vibration cue where `navigator.vibrate` exists, and the debounced persistence through `persist.ts`.
    - The Controller holds no decision logic that the Model could hold. When a decision is needed, add it to the Model with a test.
    - Create `src/ui/controller.test.ts` (Node, with the FakeTransport and an injected clock and storage): first power-on prints the notice slip once; a denied microphone opens the denied sheet and a granted-then-denied one opens the reset sheet; a send builds the wire and clears the draft on ok and keeps it on error; `ownEcho` frames print nothing; persistence round trip after reload; a repeated draft length issues no second airtime request; a `BUSY` send flashes Transmit, shows no ERROR and keeps the draft; a second microphone failure in the same power-on does not reopen the Microphone sheet and prints one System notice slip (`noticeKey: "mic-again"`).
    - _Requirements: 6.2, 6.4, 6.5, 6.6, 7.1, 7.8, 8.1, 8.2, 8.5, 8.7, 11.2, 12.4, 12.5, 12.6, 12.8, 16.2, 19.2_

  - [x] 5.2 Create `main.tsx`, the transport choice and the gallery route
    - `src/ui/main.tsx`: choose the transport (FakeTransport when `import.meta.env.DEV` and no `?transport=real`, otherwise the real one through `transport-seam.ts`), read `?state=`, and mount `App`. For a known gallery name render the fixture through the same components with a frozen clock, touching no storage and not starting audio. For an unknown value load the live app normally. Add a small dev-only panel (fake controls: inject a frame, toggle carrier, set the microphone state, fail start) shown only on `vite dev`.
    - Gallery names `sos-held` and `sos-received` use the gallery-only components. The live app mounts the three reserved containers empty.
    - _Requirements: 13.2, 14.1, 14.3, 14.5, 14.6, 14.7, 15.3_

  - [x] 5.3 Add the PWA runtime: registration, install prompt and update slip
    - `src/ui/pwa.ts`: register the service worker with `virtual:pwa-register` (`prompt` mode), turn `onNeedRefresh` into the `update-ready` event, capture `beforeinstallprompt` into `install-available` and detect standalone mode. The Install notice shows when installable and not standalone, its key opens the Install sheet, and the sheet's primary button calls the saved prompt or shows the manual steps.
    - "Restart now" calls the plugin's update function only through `canRestartNow` and a user tap. "Later" dismisses the slip.
    - Add the `virtual:pwa-register` type reference. Make sure nothing in the dev server registers a service worker.
    - _Requirements: 2.2, 2.6, 2.7, 2.8_

  - [x] 5.4 Write the source-scan enforcement tests
    - Create `src/ui/scan.test.ts` (Node, reads files under `src/ui`, follow `src/audio/layering.test.ts`) for Property 10 and the layering rules:
      - no hex colour, `rgb(`, `rgba(` or `hsl(` literal in any `src/ui` file except `tokens.css` and the one allowed `#040504`, and a pinned list of allowed Token aliases;
      - the red Tokens appear only in the SOS button, SOS ring and SOS slip files;
      - `--phosphor` appears only in the Status_Window, Scope, GroupKeyBar and check-word files;
      - no remote URL, `@import url(http`, `fetch(`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`, `innerHTML` or `dangerouslySetInnerHTML` in `src/ui`;
      - `src/ui/model` has no DOM global (`window`, `document`, `navigator`, `localStorage`, `HTMLElement`) and no `preact` import;
      - `src/ui` imports `src/protocol` and `src/audio` only through `../protocol` or `../audio` (the index), and the runtime import of `createAudioTransport` appears only in `transport-seam.ts`;
      - `src/protocol` and `src/audio` contain no import from `src/ui`;
      - no file contains the number 134 as a limit, and no file under `src/ui` contains a numeric limit equal to 128 or 140 outside tests and `design`-named constants (the limit comes from `plaintextCapacity`);
      - the manifest colour constant in `vite.config.ts` equals the `--bg` value in `tokens.css`;
      - every `.woff2` and license file listed for the fonts exists and no CSS names a remote font.
    - **Property 10: Tokens and red**
    - **Validates: Requirements 3.2, 3.3, 3.4, 2.3, 2.8, 20.1, 20.2, 20.5**
    - _Requirements: 2.3, 2.8, 3.2, 3.3, 3.4, 3.5, 20.1, 20.2, 20.5_

  - [x] 5.5 Checkpoint: run the fast checks
    - Run `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd test` and `npm.cmd run build`. Fix every failure in `src/ui`. Report what failed and what was fixed.
    - _Requirements: 1.4, 20.3_

- [x] 6. Playwright end-to-end tests
  - [x] 6.1 Add Playwright and its config
    - Run `npm.cmd view @playwright/test version`, install it as an exact-pinned devDependency, and run `npx.cmd playwright install chromium`. Create `playwright.config.ts`: Chromium with `--use-fake-device-for-media-stream`, `--use-fake-ui-for-media-stream` and `--use-file-for-fake-audio-capture` pointing at `tests/fixtures/call-known-frame.wav`; two projects, one against `vite dev` (FakeTransport, gallery and reachability) and one against `npm run build` then `npm run preview` (real audio, offline), with `baseURL` that includes `/dial-tone/` for the preview project.
    - Add a tiny test hook in the app (a `window.__dialtone` object, only when `?e2e=1` is in the URL) that exposes the state and the transport events to Playwright. It must not exist without the flag.
    - Check that the fixture `tests/fixtures/call-known-frame.wav` and its `.json` sidecar exist (audio-transport task 10.4 created them) and rebuild them with `WRITE_FIXTURE=1` if not.
    - When `npx.cmd playwright test --list` works, tick audio-transport task 12.1 in `.kiro/specs/audio-transport/tasks.md` (change only that checkbox).
    - _Requirements: 20.4, 17.7_

  - [x] 6.2 Write the gallery and reachability tests
    - Create `e2e/gallery.spec.ts`: for every name in `GalleryName`, load `?state=<name>` and assert the Readout, the lit LEDs, the sheet (if any), the meter state and the Tape heading against the fixture (State 03 shows 8 lit segments for the 41-byte demo draft only if the fixture has one; assert the empty tape text "No paper yet" and `OK`). Assert `sos-held` and `sos-received` render the SOS parts and that the live app (no `state`) renders none.
    - Create `e2e/reachability.spec.ts` on the FakeTransport: through the real controls reach States 01 (off), 02 (self-test, check within 600 ms), 03, 04 (type and transmit), 05 (inject a carrier after 2.5 s of quiet), 06 (inject a frame), 09 and 10 (switch), 11 (type 129 bytes), 12 (set the microphone to denied), 13 (release the latch), 14 (See more) and 15 (tap the LEDs), and assert each equals the gallery fixture's Readout and LEDs. State 16 is reached with `?state=beige` and checks the Token values change without layout change (compare element boxes).
    - While a send is held (`holdSend`), assert the channel switch has `aria-disabled="true"` and no `disabled` attribute, Tab reaches it, and arrow keys and clicks leave the channel unchanged.
    - **Property 11: Gallery and reachability (DOM level)**
    - **Validates: Requirements 14.1, 14.2, 14.3, 14.4**
    - _Requirements: 10.8, 10.9, 10.10, 10.11, 14.1, 14.2, 14.3, 14.4, 14.5_

  - [x] 6.3 Write the fake-microphone decode test
    - Implement audio-transport task 12.2 as written, on the built app (`preview` project): start from a tap with the channel on Room, wait for the known Call frame, assert the Heard slip text and the frame bytes equal the sidecar, and assert a CARRIER event happened first. If the `MessagePort` transfer into the worklet fails on Chromium, switch to the fallback in the audio-transport design and note it in the task result.
    - When the test passes, tick audio-transport task 12.2 (change only that checkbox).
    - _Requirements: 7.1, 17.7, 20.4_

  - [x] 6.4 Write the denied-microphone test
    - Implement audio-transport task 12.3 as written, on the built app: no microphone permission, power on, assert the Listen latch reads "No mic", the Microphone sheet (denied form) is open, then close it, type text and transmit, and assert a Sent slip prints and `tx` end fires. Also assert "Try again" calls `restartMic` (via the test hook) from the tap.
    - When the test passes, tick audio-transport task 12.3 (change only that checkbox).
    - _Requirements: 11.3, 12.5, 12.7, 17.7_

  - [x] 6.5 Write the offline test
    - Implement audio-transport task 13.1 as written, on `npm run preview`: load once, switch the context offline, reload, power on, transmit and decode the fixture. If the precache misses a file (worker, worklet, `vendor/ggwave.js`, a font or an `art` file), fix the precache configuration in `vite.config.ts` and say so in the task result.
    - When the test passes, tick audio-transport task 13.1 (change only that checkbox).
    - _Requirements: 2.1, 2.5, 17.7_

- [x] 7. Design QA, measurement tooling and deploy
  - [x] 7.1 Compare every gallery state with Figma
    - With the Figma MCP `get_screenshot`, capture each States page frame (`271:2` to `286:2`) and each in-scope New screen (`242:2` to `248:2`, `257:2`, `258:2`, `246:2`, `259:2`), and with Playwright screenshot the matching `?state=` page at 390 px width. Compare them and write `docs/ui-design-qa.md`: one row per state with the result (match or the differences) and the fix applied or the reason it was left.
    - Re-check State 03 and State 11 explicitly: State 03 (`273:2`, 41 of 128 B) must show 8 lit segments (not 7) in `--meter-ok`; State 11 (`281:2`) must show all 24 segments in `--amber` with the 4 px glow, the label "Too long", the count in bold `--ink`, Transmit disabled, and no red. Also check the meter limit label reads 128 and the Figma note says 128. Record the measured segment counts in the document.
    - Fix every layout, token or copy difference in `src/ui`. List all the strings that were written by the implementer (not from Figma) for the user's review.
    - _Requirements: 3.8, 4.3, 4.4, 4.5, 20.6_

  - [x] 7.2 Add the CPU measurement tooling and the measurement document
    - Implement what audio-transport task 13.2 needs in code: a debug flag (`?cpu=1`) that makes the decode worker record busy time per chunk and report median and 95th percentile, `decoderHits` per offset, the heap size per module and the startup time, shown in a small overlay and in the console. It must not exist without the flag and must not change decoding.
    - Create `docs/audio-transport-cpu.md` with the measurement plan from audio-transport task 13.2 (4 decoders by 5 protocols as the main case, 1 to 4 decoders, the active-family fallback, the resampler cost on a 44.1 kHz device, the 120 MB footprint check, the note about 6 protocols if the Quiet retry speed changes) and an empty results table.
    - Do NOT tick audio-transport task 13.2 and do not fill in numbers. It stays unticked until the user runs it on a real phone. Say so at the top of the document.
    - _Requirements: 17.8_

  - [x] 7.3 Add the GitHub Pages workflow
    - Create `.github/workflows/pages.yml`: trigger on push to `main` and `workflow_dispatch`; permissions `contents: read`, `pages: write`, `id-token: write`; steps `actions/checkout`, `actions/setup-node` (using `.nvmrc`, with the npm cache), `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `actions/configure-pages`, `actions/upload-pages-artifact` (path `dist`) and `actions/deploy-pages`. Look up the current release tags of each action and pin them (by tag, or by commit SHA with the tag in a comment). Use a `concurrency` group so deploys do not overlap.
    - Check that the built `dist/index.html`, the manifest and the service worker all use the `/dial-tone/` base (open the files, or `npm.cmd run preview` and fetch them).
    - Do not run or push the workflow.
    - _Requirements: 18.1, 18.2, 18.3, 2.4_

- [x] 9. Visual fidelity to Figma_Main (requirement 21)
  - Added after the first pass. These tasks sit above task 8 in the file so the final checkpoint stays last, but they keep number 9 so no existing task is renumbered. Task 8.1 stays ticked and is not edited. Its report is stale once task 9 runs, and the user decides whether to re-run it.
  - Read Figma_Main (node `0:1`, file `VDyiOLNBAavxsBHP15j1Sj`) through the Figma MCP for every measurement. The Prototype_Reference (`c:\Users\TEA\Desktop\Hackathons\Kiroween\dial-tone\prototype\index.html`) may be read for CSS values only. Never copy its code, and record each value taken from it. Do not invent measurements.
  - Do not edit `requirements.md` or `design.md`. Do not commit.

  - [x] 9.1 Collapse the empty Reserved_Slots and let Transmit fill the row
    - In `Device.tsx` and `device.css`, make the group key bar, quick keys and SOS slots render with computed width 0 px, height 0 px and no margin, padding or gap while they are empty and not mounted, so that each collapsed slot contributes 0 px of size and 0 px of spacing. The visible neighbouring elements keep the Figma_Main spacing to each other (requirement 21.24, fixed in task 9.7). Do not use `display: none` on a container that a later spec needs to mount into. Use a state or modifier class that sets the size to zero, and one that restores the Source_Map size when content is mounted.
    - While the SOS slot is collapsed, the Transmit key fills 100% of its row width (tolerance 1 px). Remove any fixed Transmit width that assumed the SOS slot.
    - When a slot is mounted (the gallery states `sos-held` and `sos-received` mount all three), each slot returns to the width and height of its Figma frame recorded in `docs/figma-source-map.md`, and Transmit returns to its Figma frame width, each within 1 px. If the Source_Map lacks any of these sizes, read them from Figma_Main and add them to the Source_Map first.
    - Add a Playwright spec `e2e/slots.spec.ts` with computed-size checks through `getBoundingClientRect`: on the live app the three slots measure 0 x 0 and Transmit width equals its row width within 1 px; on `?state=sos-held` and `?state=sos-received` each slot and Transmit match the Source_Map sizes within 1 px. Update any existing e2e or gallery assertion that relied on the old slot heights, without loosening its intent.
    - Keep `scan.test.ts` and `gallery.test.ts` passing.
    - _Requirements: 21.1, 21.2, 21.3, 15.1, 15.2, 15.3_

  - [x] 9.2 Add the chassis details from Figma_Main
    - Using the Figma MCP (`get_design_context` and `get_metadata` on node `0:1`), find the node id, position and size of each Chassis_Detail and add them to `docs/figma-source-map.md` under a new "Chassis details (Figma_Main)" heading: the four corner screws, the POWER label, the faceplate title deboss, the channel key grille ticks (count, spacing, position), the side rail with its dimple and slot, the bottom grille (slot count, spacing, position), and the Sheet screws.
    - Build them as code (CSS, inline SVG or a small component), one file or one clearly named block per detail, with every colour read from a Token. No hex literal except `#040504`, no new Token that Figma does not have except documented aliases, and no Figma asset URL. If a detail needs an image asset, download it into `public/art` and add it to the precache globs if needed.
    - Implement: (a) four chassis corner screws, one per corner at the Figma position and size (1 px tolerance); (b) the text "POWER" under the rocker in the Figma position and type style; (c) the faceplate title with the Prototype_Reference's two-line debossed text-shadow (read the CSS values from the prototype only, map every colour to Tokens, requirement 21.6); (d) grille ticks drawn on the selected channel key only, with the Figma tick count, spacing and position, and none on the two unselected keys; (e) the side rail with its dimple and slot (1 px tolerance); (f) the bottom grille with the Figma slot count, spacing and position; (g) Sheet screws at a diameter of 13 px, rotated and slotted, on every Sheet (replace the current 10 px screws in `Sheet.css`).
    - Add `src/ui/components/Chassis.test.ts` (`preact-render-to-string`) checking: four corner screws render; the POWER label renders under the rocker; ticks render for exactly the selected key and change with the selection for Room, Call and Quiet; the bottom grille renders the Source_Map slot count; the Sheet screw has diameter 13 px. Add Playwright checks to `e2e/slots.spec.ts` or a new `e2e/chassis.spec.ts` for positions and sizes of the screws, side rail and bottom grille within 1 px of the Source_Map.
    - Keep `scan.test.ts` passing (no colour literals, no red outside SOS). Respect reduced motion (these parts are static).
    - _Requirements: 21.4, 21.5, 21.6, 21.7, 21.8, 21.9, 21.10, 21.11, 3.2, 3.4, 3.8, 19.1_

  - [x] 9.3 Fix the Scope band colour and the self-test warm-up
    - Set the `--scope-band` Token value to the amber that Figma_Main uses for the band lines (read it from the Figma Scope node and use an existing amber Token value if it matches, otherwise record the value and its source in the task result). The Scope draws the active channel's band lines through `--scope-band`.
    - Make the warm-up a pure function in `src/ui/model/scope-map.ts` (for example `warmUpFrame(progress, height)` returning the bright line's centre row and half-height). Progress 0 gives a line one pixel or one row high, widening monotonically to the full Scope height at progress 1. The canvas code in `Scope.tsx` only paints what that function returns. Remove any code path that fills solid green stripes during the warm-up.
    - Add tests in `scope-map.test.ts` and `scope-map.prop.test.ts`: for random progress in 0..1 and heights 1..400, the line stays inside `0..height-1`, its height is non-decreasing in progress, it is at most one row at progress 0 and equals the full height at progress 1, and the result never describes more than one region (so no stripes). Add a Playwright check in `e2e/chassis.spec.ts` or `e2e/slots.spec.ts` that samples the Scope canvas at three moments of the self-test and finds no two separate bright bands (a single contiguous bright region per frame).
    - _Requirements: 21.12, 21.13, 9.4, 9.5, 19.1_

  - [x] 9.4 Remove the System_Slip stripe and meet 4.5:1 ink contrast
    - Remove the CSS stripe layer from the System_Slip paper in `Slip.css` (and any stripe Token or alias it added). The paper is the `--paper-system` base colour plus the paper grain texture only.
    - Darken the System_Slip ink (the ink Token or Token alias the system slip text and meta line use) until the Contrast_Ratio against `--paper-system` is at least 4.5:1, in Ghost values and in Beige 96 values. Choose the nearest passing value and note the old and new values. Do not hard-code a colour in the component.
    - Create `src/ui/styles/contrast.test.ts` (Node, `environment: node`): parse `tokens.css` for the Ghost and Beige values of `--paper-system` and the System_Slip ink Token, compute the WCAG 2.x relative luminance and Contrast_Ratio, and fail when either ratio is below 4.5. Handle only the colour formats that those Tokens use, and fail with a clear message when a Token is missing or in an unsupported format. Add a second check that the markup for a `system` and an `update-ready` slip (`preact-render-to-string`) contains no stripe class.
    - Update gallery or e2e assertions that mention the stripe. Keep `scan.test.ts` passing.
    - _Requirements: 21.14, 21.15, 3.2, 7.12_

  - [x] 9.5 Design QA of the main screen against Figma_Main
    - With the Figma MCP `get_screenshot` on Figma_Main (`0:1`, or the matching main-screen frames recorded in the Source_Map), capture three states: off, on, and on with a draft. Capture the app with Playwright from the dev server at 390 x 844 px in the same three states (power off; powered on after the self-test; powered on with the draft typed). Save the screenshots under `test-results` or `docs/qa-shots`, and do not commit them.
    - Compare each pair. In `docs/ui-design-qa.md` add a section "Main screen against Figma_Main" with one row per state: the compared Figma node id, each difference found, and either the fix applied or the reason it was left. Fix every difference that falls under requirement 21 in `src/ui`.
    - In the same section, state that the Prototype_Reference was used only to read CSS values, and list each value taken from it with the Token or rule that received it.
    - List every Chassis_Detail that is still missing or still differs from Figma_Main as an open item, with its Figma node id and a description of the difference.
    - Update Decision 7 in `docs/ui-design-qa.md` (and the System slip rows that cite it: New 04 `246:2` and New 17 `259:2`): the stripe added by Decision 7 is removed, the system paper is `--paper-system` plus grain, and the ink contrast now meets 4.5:1. Record the measured ratios. Also update the ui-design-qa note about the 10 px Sheet screws, which are now 13 px.
    - Run `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd test` and `npm.cmd run test:e2e`, and fix failures in `src/ui`. Do not change `src/protocol`.
    - Report any string you wrote yourself.
    - _Requirements: 21.16, 21.17, 21.18, 21.19, 20.6_

  - [x] 9.6 Apply the visual decisions on title, grille ticks, Scope band and message well
    - Title (21.6): the faceplate title uses the Prototype_Reference's two-line debossed text-shadow, with every colour from Tokens (add documented Token aliases if needed, no new colour literal). Update the Chassis test that pins "no title shadow" so it now asserts the two-line shadow is present and uses Tokens.
    - Grille ticks (21.7): keep the ticks on the selected channel key only. Keep their test and make sure it still passes.
    - Scope band while off (21.20): the Scope draws the active channel's band lines in `--scope-band` while the power is off, as Figma_Main does. Faint static stays. Update the Scope tests and the off-state assertions that expected no band lines.
    - Message well (21.21): place the byte count and draw the divider line at the positions and sizes of their Figma_Main nodes. Read the node ids and boxes through the Figma MCP, record them in `docs/figma-source-map.md`, and match them within 1 px. Add a Playwright check in `e2e/chassis.spec.ts` comparing `getBoundingClientRect` of the byte count and the divider with the Source_Map.
    - Circuit board crop and Scope left gutter (21.23): leave unchanged. Do not report them as open items or failures.
    - Add or update tests: Chassis unit test (title shadow, ticks), Scope unit test (band lines drawn when off), and Playwright checks (band lines visible on the Scope in the off state by sampling the canvas for `--scope-band` pixels, byte count and divider positions).
    - Update `docs/ui-design-qa.md` (21.22, 21.23): record that the Prototype_Reference was the source of the title deboss and the grille ticks as approved exceptions to Figma_Main, and list the circuit board crop and the darker left gutter of the Scope as known differences intentionally left unchanged. Also revise the 9.5 section so the title, ticks, off-state band lines and message well rows reflect these decisions.
    - Run `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd test` and `npm.cmd run test:e2e`, and fix failures in `src/ui`. Do not change `src/protocol`. Keep `scan.test.ts` passing.
    - _Requirements: 21.6, 21.7, 21.11, 21.20, 21.21, 21.22, 21.23, 3.2_

  - [x] 9.7 Restore the Figma spacing around Transmit after the slot collapse
    - Bug: after task 9.1 collapsed the empty Reserved_Slots, the Transmit key touches the message well. The collapsed slots must contribute 0 px of size and 0 px of spacing (requirement 21.1), but the visible neighbours must keep the Figma_Main spacing to each other (requirement 21.24). The slot collapse must not remove the gap that Figma places between the well and Transmit.
    - Read Figma_Main through the Figma MCP (`get_metadata` and `get_design_context` on node `0:1` and the main-screen frames in the Source_Map) and take the y positions and heights of the message well, the Transmit key and the Tape. Compute the well-to-Transmit gap and the Transmit-to-Tape gap in the Figma frame, with the three Reserved_Slots collapsed (their space removed, and the gap that Figma keeps between the visible neighbours). Record both gaps and their node ids in `docs/figma-source-map.md` under a new "Main screen spacing (Figma_Main)" heading. If Figma only shows the slots present, derive the collapsed-layout gap from the nearest Figma gap between visible neighbours and write down how it was derived.
    - Fix the layout in `Device.tsx` and `device.css`: put the spacing on the visible neighbours (for example a margin or a layout gap on the well-to-Transmit and Transmit-to-Tape boundaries, expressed with a Token or a documented constant taken from the Source_Map), not on the Reserved_Slot containers, so that a collapsed slot still measures 0 x 0 with no margin, padding or gap, and a mounted slot (gallery states `sos-held` and `sos-received`) still returns to its Figma size from task 9.1. Make sure the gap does not double up or vanish when a slot is mounted: the mounted layouts keep the Figma sizes recorded in the Source_Map within 1 px.
    - Update `e2e/slots.spec.ts`: remove or fix the existing assertion that expects the well to end where Transmit starts (a 0 px gap). Add a check on the live app (all slots collapsed) using `getBoundingClientRect` that the gap between the bottom of the message well and the top of Transmit is greater than 0 px and equals the Source_Map well-to-Transmit gap within 1 px, and that the gap between the bottom of Transmit and the top of the Tape equals the Source_Map Transmit-to-Tape gap within 1 px. Keep the existing checks that each collapsed slot measures 0 x 0 and that Transmit fills its row within 1 px. Keep the mounted-slot checks passing.
    - Update the Device unit test (`src/ui/components/Device.test.ts`, or the existing test that covers the slot containers) if it pins the old adjacency or the slot spacing. It must still assert that collapsed slots carry the collapsed modifier and no spacing.
    - Update the notes in `docs/ui-design-qa.md`: record the bug, the measured gaps before and after, the Figma node ids, and change any note that says the well and Transmit touch after the collapse so it reads that the slots contribute 0 px while the neighbours keep the Figma gap. Update the 9.5 section rows that mention spacing.
    - Do not edit `requirements.md` or `design.md`. Do not change `src/protocol`. Keep `scan.test.ts` passing.
    - Run `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd test` and `npm.cmd run test:e2e`, and fix failures in `src/ui`.
    - _Requirements: 21.1, 21.24_

  - [x] 9.8 Fix the caption-to-well gap, make Playwright start its own servers, and remove e2e timing flakes
    - (a) Caption gap (21.25): in State 03 (node `273:2`) the message well (node `273:155`) has its top at 30 px, and in the app it is at 22 px, so the gap between the MESSAGE caption row and the well is 8 px short. Read the caption row and the well boxes through the Figma MCP, record the caption-to-well gap and the node ids in `docs/figma-source-map.md` under "Main screen spacing (Figma_Main)", and fix the spacing in `Device.tsx`, `MessageWell.tsx` or their CSS (put the gap on the visible neighbours, with a Token or a documented constant from the Source_Map, not on a Reserved_Slot). Add to `e2e/slots.spec.ts` or `e2e/chassis.spec.ts` a `getBoundingClientRect` assertion that the caption-to-well gap equals the Source_Map gap within 1 px. Keep the task 9.7 checks (well-to-Transmit and Transmit-to-Tape gaps within 1 px, collapsed slots 0 x 0, Transmit fills its row) passing, and check that moving the well does not break them. Update any other assertion or fixture that pinned the old well position.
    - (b) Playwright servers: in `playwright.config.ts` make each `webServer` command use `npm.cmd` when `process.platform === 'win32'` and `npm` otherwise (one small helper constant), so `npm.cmd run test:e2e` starts both the dev and preview servers itself and needs no manually started server. Keep `reuseExistingServer` as it is, and keep the ports and `baseURL` values. Do not change the execution policy.
    - (c) Flakes (21.26): run `e2e/reachability.spec.ts` (States 01 to 15, including the 600 ms self-test check) and `e2e/fake-mic.spec.ts` repeatedly (for example `--repeat-each=5`), find the cause of each intermittent failure and record the causes in the task result. Replace every fixed timer (`waitForTimeout`, `setTimeout`, sleeps) and every timing threshold (such as "within 600 ms") with a wait for an observable state: a DOM attribute, text or event, for example the Readout text, a `data-power` or `data-phase` attribute, or an event exposed by the `?e2e=1` test hook (add a small attribute or hook value in `src/ui` when none exists, active only under the flag or as a harmless data attribute). For the carrier quiet period (2.5 s) and the self-test, use the injected clock or the FakeTransport controls where possible, or wait for the state to appear. Do not loosen any assertion, do not raise a tolerance, do not add retries to hide a failure and do not skip a test. Each assertion must still check the same state it checked before.
    - (d) Verify and document: run `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd test` and `npm.cmd run test:e2e` twice in a row with no server started by hand, and confirm both runs pass. Update `docs/ui-design-qa.md`: the caption-to-well gap before and after with the Figma node ids, the cause of each flake and the fix, the two-run result, and the 9.5 section rows that mention the well position. Do not edit `requirements.md` or `design.md`. Do not change `src/protocol`. Keep `scan.test.ts` passing. Do not commit.
    - _Requirements: 21.24, 21.25, 21.26_

- [x] 8. Final checkpoint
  - [x] 8.1 Run everything and report
    - Run `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd test`, `npm.cmd run test:props`, `npm.cmd run test:slow` and `npm.cmd run test:e2e`. Fix every failure in `src/ui` and in the audio glue. Do not change `src/protocol`.
    - Re-check that nothing in `src/ui` or `design-system.md` still says 134 as a limit, that State 03 is 8 lit in the gallery e2e, and that the scan test passes.
    - When everything passes, tick audio-transport task 14.1 in `.kiro/specs/audio-transport/tasks.md` (change only that checkbox). Leave 13.2 unticked.
    - Report: the dependency versions chosen and the Vite major reasoning, the Design QA result, the strings written by the implementer, which audio-transport boxes were ticked, any design parameter a test contradicted, and the open questions in `design.md` that the work touched.
    - End the report with the manual steps for the user: (1) in the GitHub repository settings set Pages source to "GitHub Actions"; (2) make the repository public; (3) push to `main` and wait for the workflow, then open https://blueskiez-dev.github.io/dial-tone/ over HTTPS on two phones, install it, and try Room and Call; (4) run the CPU measurement on a real phone with `?cpu=1` and fill in `docs/audio-transport-cpu.md`, then tick audio-transport task 13.2; (5) make one commit when satisfied.
    - Do not commit.
    - _Requirements: 17.7, 17.8, 18.4, 20.3, 20.6_

## Notes

- Every task is required. There are no optional markers.
- Property tests: P1 (2.1), P2 (2.2), P3 (2.3), P4 and P5 (2.5), P6 and P7 (2.4), P8 (2.7), P9 (2.6), P10 (5.4), P11 (6.2), P12 (3.4), P13 (2.8).
- Audio-transport boxes ticked by this spec: 11.1 (task 3.2), 11.2 (3.3), 12.1 (6.1), 12.2 (6.3), 12.3 (6.4), 13.1 (6.5), 14.1 (8.1). Box 13.2 is left for the user.
- `design.md` and `requirements.md` are fixed while tasks run, except that task 3.1 appends amendments to the audio-transport documents.
- Task 9 (visual fidelity, requirement 21) was added later. It is numbered 9 to avoid renumbering, and listed before task 8 so the final checkpoint stays last. Its tests are required like the rest.
- Never commit. The user commits once when the spec is done.
- Use `npm.cmd` and `npx.cmd` only.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.5", "2.1"] },
    { "id": 2, "tasks": ["1.3", "1.4", "2.2", "2.3", "2.4", "2.6", "2.7", "2.8"] },
    { "id": 3, "tasks": ["2.5", "3.1"] },
    { "id": 4, "tasks": ["2.9", "3.2"] },
    { "id": 5, "tasks": ["3.3", "3.4", "4.1"] },
    { "id": 6, "tasks": ["4.2", "4.3", "4.4", "4.5", "4.6", "4.7", "4.8", "4.9"] },
    { "id": 7, "tasks": ["5.1"] },
    { "id": 8, "tasks": ["5.2", "5.3"] },
    { "id": 9, "tasks": ["5.4", "5.5"] },
    { "id": 10, "tasks": ["6.1"] },
    { "id": 11, "tasks": ["6.2", "6.3", "6.4", "6.5"] },
    { "id": 12, "tasks": ["7.1", "7.2", "7.3"] },
    { "id": 13, "tasks": ["9.1", "9.3", "9.4"] },
    { "id": 14, "tasks": ["9.2"] },
    { "id": 15, "tasks": ["9.5"] },
    { "id": 16, "tasks": ["9.6"] },
    { "id": 17, "tasks": ["9.7"] },
    { "id": 18, "tasks": ["9.8"] },
    { "id": 19, "tasks": ["8.1"] }
  ]
}
```
