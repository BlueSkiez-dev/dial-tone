# Requirements Document

## Introduction

The ui-shell is the installable app shell and the main device screen of Dial Tone. It scaffolds the project (Vite, TypeScript, Preact, `vite-plugin-pwa`), builds the device from the Figma file `VDyiOLNBAavxsBHP15j1Sj` (States page `191:2`, Components page `191:3`, New screens page `219:2`), and connects it to `src/protocol` and `src/audio`. It covers plain, unencrypted text messages only. SOS, quick keys and the group key bar are left out, but their space is kept. Crypto and relay come in later specs. This spec also completes audio-transport tasks 11 to 13 (browser glue, Playwright tests, offline test, CPU measurement). These requirements are derived from the approved `design.md` in this folder.

Evidence rule: a number in these requirements is taken from Figma, from `src/protocol`, from `docs/FIELD-FINDINGS.md`, or is marked "design parameter". A design parameter may be changed by editing one constant and the test that pins it.

## Glossary

- **Device_Screen**: The main screen, 370 px wide device with a 340 px faceplate, built from the States page.
- **UiState**: The single state object of the Device_Screen, held by the Reducer.
- **Reducer**: The pure function `reduce(state, event)` in `src/ui/model/reducer.ts`.
- **Model**: The pure modules in `src/ui/model/`, which import no DOM global and no Preact.
- **Controller**: `src/ui/controller.ts`, the only stateful glue between components, Model and transport.
- **UiTransport**: The subset of `AudioTransport` that the UI uses (`start`, `restartMic`, `stop`, `setProfile`, `send`, `airtimeMs`, `setListening`, `subscribe`, `analyser`, `profile`).
- **FakeTransport**: A deterministic `UiTransport` for `vite dev` and tests. It uses no microphone, worklet or WASM.
- **Real_Transport**: `createAudioTransport` from `src/audio`.
- **Well_Limit**: `plaintextCapacity({ encrypted: false, multi: false })` from `src/protocol`, 128 at the time of writing.
- **Byte_Meter**: The 24-segment meter in the message well.
- **Lit_Count**: The number of lit Byte_Meter segments, `min(24, ceil(bytes * 24 / limit))`, 0 at 0 bytes.
- **Status_Window**: The smoked-glass window with six LEDs (MR, AA, CD, OH, RD, SD), the result-code readout and a hint.
- **Readout**: The result code in the Status_Window: `— — —`, `ATZ`, `OK`, `ATDT`, `CARRIER`, `CONNECT`, `NO CARRIER`, `ERROR`.
- **Scope**: The CRT canvas that draws the live spectrogram.
- **Tape**: The thermal-printer list of Slips under the controls.
- **Slip**: One printed entry on the Tape.
- **Sheet**: The screwed sub-panel that slides over a 45% scrim.
- **Gallery**: The `?state=<name>` mechanism that renders a fixture state of the Device_Screen or a Sheet screen.
- **Token**: A CSS custom property from `src/ui/styles/tokens.css` whose name matches a Figma variable.
- **Source_Map**: `docs/figma-source-map.md`, the list of Figma components and states with node ids.
- **Persistence_Flag**: The constant `PERSIST_ENABLED` in `src/ui/model/persist.ts`.
- **Amendments**: The four additions to `src/audio` listed in requirement 17.
- **Pages_URL**: `https://blueskiez-dev.github.io/dial-tone/`.

## Requirements

### Requirement 1: Scaffold and tooling

**User Story:** As a developer, I want a reproducible Vite, TypeScript and Preact project with pinned dependencies, so that anyone can build and test the app from a clean checkout.

#### Acceptance Criteria

1. THE project SHALL use Vite, TypeScript with `strict` and `noUncheckedIndexedAccess`, Preact and `vite-plugin-pwa`.
2. THE project SHALL pin every new dependency to an exact version taken from `npm view <pkg> version` at install time, with no `^` or `~`.
3. BEFORE installing Vite, THE team SHALL read the Vite major versions that the chosen `vite-plugin-pwa` version lists in its peer dependencies, and SHALL install a Vite major that it supports.
4. THE `package.json` SHALL provide the scripts `dev`, `build`, `preview`, `typecheck`, `lint`, `format`, `test`, `test:props`, `test:slow`, `test:watch` and `test:e2e`, where `build` runs `tsc --noEmit` and then `vite build`.
5. THE TypeScript configuration SHALL give `src/ui` and the browser glue in `src/audio` the DOM library, and SHALL keep the pure modules free of DOM globals.
6. THE project SHALL keep `package-lock.json` committed, SHALL install with `npm ci`, and SHALL pin Node through `.nvmrc`.
7. THE README SHALL name ggwave 0.4.0 (MIT) and the three bundled font families (OFL) as pre-existing code and assets, with their licenses.
8. THE Vite build SHALL emit the decode worker as a classic worker and the capture worklet as a script that `audioWorklet.addModule` can load.

### Requirement 2: Offline, install and update

**User Story:** As a user with no internet, I want the app to install and to work fully offline after the first load, and to update only when I say so.

#### Acceptance Criteria

1. THE service worker precache SHALL include the app shell, all CSS and JavaScript, the bundled fonts, the Figma-derived assets in `public/art`, the decode worker, the capture worklet and `vendor/ggwave.js`.
2. THE PWA plugin SHALL use `registerType: 'prompt'`, and THE app SHALL NOT reload or restart itself when a new service worker is waiting.
3. THE web manifest SHALL set `name` and `short_name` to "Dial Tone", `display` to `standalone`, and `theme_color` and `background_color` to the value of the `--bg` Token, and SHALL list 192 px, 512 px and maskable 512 px icons made from the App icon, with a 180 px apple-touch-icon in the page head.
4. THE Vite `base`, the manifest `scope` and `start_url` SHALL be `/dial-tone/` for `vite build`, and the development server SHALL serve from `/`.
5. WHEN the app has loaded once over HTTPS, THE app SHALL load, power on, send and decode with the network switched off, which the offline test verifies on the built app served by `npm run preview`.
6. WHEN the browser offers an install prompt and the app is not running standalone, THE Device_Screen SHALL show the Install notice plate, and a tap on its key SHALL open the Install sheet, whose primary button calls the saved prompt where one exists and otherwise shows the iPhone and Android steps.
7. WHEN a new version is waiting, THE Tape SHALL print an Update ready slip with the buttons "Later" and "Restart now", AND "Restart now" SHALL activate the update only when `canRestartNow` is true, which is false while a transmission is in flight, a connect hold is running or a carrier is active.
8. THE only network activity at runtime SHALL be the service worker's own update check, and THE `src/ui` code SHALL contain no `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource` or `sendBeacon` call and no remote URL.

### Requirement 3: Tokens, fonts, assets and Figma fidelity

**User Story:** As the art director, I want the built screen to match the Figma file using its variables, so that the app looks like the approved "Ghost in the Line" design.

#### Acceptance Criteria

1. THE file `src/ui/styles/tokens.css` SHALL define every Token listed in `design-system.md` with the Figma name, in Ghost values by default and Beige 96 values under a theme attribute.
2. THE `src/ui` files other than `tokens.css` SHALL contain no hex colour, `rgb(`, `rgba(` or `hsl(` literal except `#040504` (the LED bezel ring), and shadow and unlit-segment colours SHALL be Tokens or Token aliases.
3. THE red Tokens `--sos`, `--sos-hi`, `--sos-lo`, `--sos-edge`, `--print-sos` and `--ink-on-sos` SHALL be referenced only by the SOS button, the SOS ring and the SOS slip, and warnings, errors and "Too long" SHALL use `--amber` or `--meter-warn`.
4. THE Token `--phosphor` SHALL be referenced only inside glass: the Status_Window readout, the Scope, the group key display and the check-word chips.
5. THE app SHALL bundle Barlow Condensed 600 and 700, IBM Plex Sans 400, 500 and 600, and IBM Plex Mono 400, 500, 600 and 700 as local Latin-subset woff2 files with their license files, and SHALL contain no remote font URL.
6. THE assets that Figma keeps as images or SVG and the code needs (signal line, vias, icons, app icon, grain textures) SHALL be downloaded into `public/art` or `src/ui/fonts`, and no file SHALL reference a Figma asset URL.
7. THE Source_Map SHALL list every Figma component, variant and state used here with its node id, and SHALL mark the deferred items.
8. THE `src/ui/components` folder SHALL hold one component per Figma component, named after it, and THE `Slip` component SHALL implement all ten Figma types.
9. THE Beige 96 case (State 16) SHALL be produced by changing the Token values only, with no layout change.
10. THE `design-system.md` steering file SHALL no longer contain the number 134 as a meter limit and SHALL state 128, matching the note on Figma State 11.

### Requirement 4: Byte meter and message limit

**User Story:** As a sender, I want the meter to show how much of the message I have used and when it is too long, so that I never send a message the protocol rejects.

#### Acceptance Criteria

1. THE Device_Screen SHALL take the limit from `plaintextCapacity({ encrypted: false, multi: false })` and SHALL NOT contain a fixed limit number.
2. THE Device_Screen SHALL count UTF-8 bytes with `utf8ByteLength`, not characters.
3. THE Byte_Meter SHALL light `min(24, ceil(bytes * 24 / limit))` segments, SHALL light 0 segments at 0 bytes, SHALL never light more than 24, and SHALL never light fewer segments as `bytes` grows with the limit fixed, so that 41 bytes of a 128 byte limit light 8 segments (State 03).
4. WHILE the byte count is not over the limit, THE Byte_Meter SHALL colour lit segments 1 to 19 with `--meter-ok` and lit segments 20 to 24 with `--meter-warn`, and SHALL draw unlit segments in the unlit Token colour.
5. WHEN the byte count is greater than the limit, THE Byte_Meter SHALL draw all 24 segments with `--amber` and a 4 px glow, SHALL show the label "Too long" and the byte count in bold `--ink`, and SHALL never use a red Token.
6. THE Byte_Meter SHALL have 24 segments of 6 px height and radius 1.
7. THE message well SHALL show the byte count and the limit in the form "41 / 128 B", with the limit from criterion 1.

### Requirement 5: Message well

**User Story:** As a sender, I want to type a message and see its size and airtime, so that I can decide before I transmit.

#### Acceptance Criteria

1. THE message well SHALL be a recessed text field that accepts any text, including text over the limit.
2. THE message well SHALL show the airtime as "~2.2 s on air" using the value from the transport's airtime event for the frame length `bytes + frameOverhead(1)`, and SHALL show a dash while the value is unknown.
3. WHEN the byte count is over the limit, THE Device_Screen SHALL disable the Transmit key and SHALL keep the draft text unchanged.
4. THE message well SHALL be disabled while the power is off.
5. WHEN the draft changes in a way that changes the frame length, THE Controller SHALL request the airtime once for that length.
6. WHEN the Controller sees a distinct frame length for the first time on the current channel, THE Controller SHALL issue one airtime request for that length and SHALL cache the result.
7. WHEN the draft returns to a frame length whose airtime is already cached for the current channel, THE Controller SHALL reuse the cached result and SHALL issue no further airtime request.

### Requirement 6: Sending

**User Story:** As a sender, I want one tap to turn my text into sound, so that nearby phones or a phone call can receive it.

#### Acceptance Criteria

1. THE Transmit key SHALL be enabled only when the power is on, there is no fault, the draft has at least 1 byte and at most the Well_Limit, and no transmission is in flight.
2. WHEN the user taps Transmit, THE Controller SHALL build the wire bytes with `splitPayload`, `newMessageId`, `makeFrames` and `encodeFrame` from `src/protocol`, and SHALL pass them to `UiTransport.send`.
3. IF the draft is empty or over the Well_Limit, THEN THE send path SHALL return an error before it calls `splitPayload`, `newMessageId`, `makeFrames`, `encodeFrame` or `send`.
4. WHILE a transmission is in flight, THE Transmit key SHALL show the Sending state with its light strip filling over the airtime, THE Status_Window SHALL light SD and show `ATDT` with the airtime, AND THE signal line SHALL pulse up.
5. WHEN `send` returns ok, THE Tape SHALL print a Sent slip with the text, the byte count, the channel and the airtime, and THE draft SHALL be cleared.
6. IF `send` returns an error other than `BUSY`, THEN THE Status_Window SHALL show `ERROR` for 3 seconds (design parameter), THE Tape SHALL print a System notice slip with a plain reason, and THE draft SHALL be kept.
7. THE send path SHALL build frames of type TEXT, unencrypted, hop 0 and a TTL constant `SEND_TTL` (design parameter), with attempt 0, and every wire SHALL be at most 140 bytes.
8. WHEN `send` returns `BUSY`, THE Transmit key SHALL flash briefly (design parameter 600 ms), and THE Status_Window SHALL NOT show the `ERROR` readout, so that the cue differs from the 3-second `ERROR` display of criterion 6.
9. WHEN `send` returns `BUSY`, THE Controller SHALL keep the draft unchanged so that the user can retry.

### Requirement 7: Receiving and the Tape

**User Story:** As a receiver, I want each message that reaches me to print once as a slip, so that I can read it and see where it came from.

#### Acceptance Criteria

1. WHEN the transport emits a `frame` event with `ownEcho` false for an unencrypted TEXT frame of one frame, THE Tape SHALL print one Heard slip with the text, the byte count and the hop.
2. WHEN a `frame` event has `ownEcho` true, THE Tape SHALL print nothing.
3. WHEN a `frame` event has a `frameKey` already seen in this session, THE Tape SHALL print nothing.
4. THE Heard slip SHALL show the direction, hop, time and the text, and SHALL NOT show a mode, because the decoders do not report one.
5. WHEN a `frame` event carries a type other than TEXT, or an encrypted frame, THE Tape SHALL print one System notice slip saying that this version cannot show it.
6. WHEN frames of one multi-frame TEXT message arrive in any order, THE Tape SHALL print one Heard slip after the last missing frame arrives, using `reassemble`, and SHALL print nothing before.
7. WHEN a Heard slip prints, THE decoded text SHALL resolve out of static on the slip for a short time (design parameter 900 ms) and the Scope SHALL keep drawing.
8. WHEN a frame is received, THE Status_Window SHALL light RD and show `CONNECT` for a hold time (design parameter 3 seconds), AND THE signal line SHALL pulse down.
9. THE `rejected` events SHALL NOT print a slip.
10. THE Tape SHALL show "No paper yet. Messages you send and hear print here, and anything you hear can be passed on to the next phone." (Figma) when empty, SHALL show the latest 3 slips with a "See more" button when there are more than 3, and SHALL show all slips with a "Show less" button when expanded.
11. THE Tape SHALL hold at most 50 slips (design parameter), drop the oldest first, and show the newest first.
12. THE slips SHALL print line by line, SHALL render text as text and never as HTML, and SHALL strip control characters and cap each text at 1,024 characters.
13. THE Tape SHALL print no Heard slip for a multi-frame TEXT message while any frame of that message is still missing.

### Requirement 8: Power, self-test and the Status_Window

**User Story:** As a user, I want the device to behave like a modem: power it on, watch it self-test, read its lights.

#### Acceptance Criteria

1. WHEN the user taps the rocker while the power is off, THE Controller SHALL call `UiTransport.start()` inside that tap handler, and SHALL move to the self-test.
2. THE self-test SHALL light all six LEDs and show `ATZ` for 600 ms (from the Figma note), and SHALL then move to the on state when `start()` succeeded.
3. THE Status_Window SHALL light the LEDs and show the Readout by this table, first match wins: power off, no LED and `— — —`; self-test, all six and `ATZ`; fault, MR and `ERROR`; sending, MR and SD and `ATDT`; connect hold, MR and RD and `CONNECT`; carrier shown, MR and CD (amber) and `CARRIER`; otherwise MR and `OK` when listening or when the microphone is unavailable (denied, lost and so on, because sending still works), and MR and `NO CARRIER` when the latch is released or the page is hidden. AA SHALL be lit in every powered-on row while listening is active (latch pressed, microphone live, page visible), including the sending, carrier and connect rows. While the draft is over the Well_Limit, the `OK` row SHALL show the hint "Message is too long to send. Shorten it.". With no microphone, the `OK` row SHALL show the hint "Ready to send. Microphone is off, so you can’t hear messages.". OH (amber) SHALL be lit in every powered-on row while the channel is Call.
4. WHEN the user taps the LEDs, THE Device_Screen SHALL toggle the light legend (State 15).
5. IF `start()` returns an error, THEN THE Device_Screen SHALL set a fault, show `ERROR`, disable Transmit, and print a System notice slip with the reason.
6. WHILE the power is off, THE Transmit key, the Listen latch and the SOS slot SHALL be disabled, and THE Scope SHALL show faint static.
7. WHEN the user taps the rocker while the power is on, THE Controller SHALL call `UiTransport.stop()` and return to the off state.
8. THE Status_Window hint SHALL say that listening works only while the app is open and the screen is on.
9. WHILE the power is off, THE Status_Window SHALL light no LED, including OH, whatever the selected channel is, including Call.

### Requirement 9: Scope

**User Story:** As a user, I want to see the sound, so that I know the device hears or sends something.

#### Acceptance Criteria

1. THE Scope SHALL draw a live spectrogram on a canvas from `UiTransport.analyser`, one new column per animation frame.
2. THE Scope SHALL mark the active channel's band, taken from `PROFILES[channel].carrierBandHz`, with `--scope-band` lines and its axis in `--scope-axis`.
3. THE Scope window SHALL be 0 to 8 kHz for Room, the Figma range for Call, and 12 to 20 kHz for Quiet, and `binRange` SHALL return bin indexes inside `0` to `fftSize / 2 - 1` for every sample rate.
4. WHILE the power is off, THE Scope SHALL show faint static, AND DURING the self-test it SHALL warm up from one bright line.
5. THE Scope SHALL read its colours from Tokens at mount and SHALL contain no colour literal.
6. WHEN the document is hidden, THE Scope SHALL stop drawing.
7. UNDER reduced motion, THE Scope SHALL skip the warm-up and SHALL keep drawing live data.
8. THE Scope SHALL NOT depend on the decode path, and a missing analyser SHALL show the static state.
9. IF the self-test warm-up would run while the power is off, THEN THE Scope SHALL show faint static and SHALL suppress the warm-up.

### Requirement 10: Channel switch

**User Story:** As a sender, I want to choose how my phone sends, so that I can use the room, a phone call or ultrasound.

#### Acceptance Criteria

1. THE channel switch SHALL have three positions, Room, Call and Quiet, with the captions from Figma.
2. WHEN the user changes the position, THE Controller SHALL call `UiTransport.setProfile` with the matching profile.
3. THE channel switch SHALL be a radio group, SHALL move with the arrow keys, and SHALL spring the thumb unless reduced motion is on.
4. WHILE a transmission is in flight, THE channel switch SHALL ignore changes.
5. WHILE the channel is Quiet, THE Device_Screen SHALL show the amber notice about older phones that cannot hear it (State 10).
6. THE copy SHALL describe the switch as how this phone sends and SHALL NOT claim that it selects what the phone listens to, AND THE app SHALL NOT offer a Radio mode.
7. THE selected channel SHALL be saved and restored.
8. WHILE a transmission is in flight, THE channel switch SHALL set `aria-disabled="true"` and SHALL show the dimmed style.
9. WHILE a transmission is in flight, THE channel switch SHALL remain in the keyboard focus order, without the `disabled` attribute and without `tabindex="-1"`.
10. WHILE a transmission is in flight, THE channel switch SHALL ignore changes from pointer input and keyboard input.
11. WHILE a transmission is in flight, THE channel switch SHALL expose an accessible name or description that a screen reader announces as "Channel switch, <current channel name>, unavailable while sending", for example "Channel switch, Room, unavailable while sending".

### Requirement 11: Listen latch and microphone

**User Story:** As a receiver, I want to choose whether the phone listens, and to see when the microphone is not available.

#### Acceptance Criteria

1. THE Listen latch SHALL have the states Listening, Off, No mic and Disabled, AND a tap SHALL toggle listening only when the power is on and the microphone is `live`.
2. WHEN the user toggles the latch, THE Controller SHALL call `UiTransport.setListening` with the new value.
3. WHILE the microphone is `denied`, `no_device`, `busy`, `insecure`, `error` or `lost`, THE Listen latch SHALL show "No mic", AA SHALL be dark, AND sending SHALL still work.
4. WHEN the page becomes hidden, THE Status_Window SHALL darken AA and the hint SHALL say that listening has stopped, AND WHEN the page is visible again the state SHALL follow the transport.
5. WHEN the transport reports that microphone processing could not be disabled, THE hint SHALL say so and listening SHALL continue.
6. WHEN the microphone becomes `live`, THE app SHALL remember that the permission was granted.
7. WHEN the page becomes hidden while the microphone is `live`, THE Listen latch SHALL keep showing Listening, AND only AA and the hint SHALL change.

### Requirement 12: Onboarding and sheets

**User Story:** As a first-time user, I want to be told what the app does with sound and the microphone before the browser asks, and to get help if the microphone fails.

#### Acceptance Criteria

1. WHEN the app starts for the first time, THE Device_Screen SHALL open Onboarding 1 (Sound), then 2 (Listens while open) and 3 (Install) as Sheets, with "Skip" and "Next".
2. THE microphone explanation (Onboarding 2) SHALL appear before the first power-on tap that triggers the browser's microphone prompt.
3. WHEN the user taps "Got it" on Onboarding 3 or skips, THE Sheet SHALL close, THE onboarding SHALL not show again, AND THE rocker SHALL pulse amber until the first tap.
4. WHEN the first power-on completes, THE Tape SHALL print one System notice slip "Listening while open" (Screen 04), once per install.
5. WHEN the microphone is `denied` and was never granted before, THE Controller SHALL open the Microphone sheet in its denied form (Screen 05), AND WHEN it is `denied` after an earlier grant, in its reset form (Screen 06).
6. WHEN the microphone is `busy`, `no_device`, `insecure`, `error` or `lost`, THE Controller SHALL open the same Microphone sheet layout with a different first line for each.
7. THE Microphone sheet SHALL list the iPhone and Android steps, SHALL say that sending still works, and its primary button SHALL call `UiTransport.restartMic()` from the tap.
8. THE Microphone sheet SHALL open at most once per power-on.
9. EVERY Sheet SHALL slide up over a 45% scrim with a 3 px blur, trap focus, close on Escape and the secondary button, and SHALL not slide under reduced motion.
10. IF a further microphone failure occurs in the same power-on after the Microphone sheet has already opened, THEN THE Controller SHALL NOT reopen the sheet.
11. IF a further microphone failure occurs in the same power-on after the Microphone sheet has already opened, THEN THE Tape SHALL print one System notice slip about the microphone.

### Requirement 13: Transport seam

**User Story:** As a developer, I want the UI to work against a fake transport, so that I can build and test it without a microphone.

#### Acceptance Criteria

1. THE UI SHALL talk to audio only through the `UiTransport` type, which the real `AudioTransport` satisfies.
2. THE `vite dev` server SHALL use the FakeTransport unless the URL has `?transport=real`, AND the production build SHALL use the Real_Transport.
3. THE team SHALL verify real audio on `npm run build` and `npm run preview`, not on `vite dev`.
4. THE FakeTransport SHALL validate wire length like the real one (`EMPTY`, `TOO_LONG`), emit `tx`, `airtime`, `mic` and `frame` events, provide a synthetic analyser, and provide the controls `injectFrame`, `injectCarrier`, `setMic`, `failStart` and `holdSend`.
5. A shared conformance test SHALL run against the FakeTransport and against the Real_Transport with the fake modem.
6. THE `src/ui/model` modules SHALL NOT import the runtime of `src/audio`.

### Requirement 14: State gallery

**User Story:** As a designer and tester, I want to open any Figma state by URL, so that I can compare it with the design.

#### Acceptance Criteria

1. THE app SHALL render the fixture for `?state=<name>` for every name in the Source_Map.
2. THE Gallery SHALL provide a name for every state on the Figma States page (01 to 16), and for the Sheet and device screens in scope from the New screens page: onboarding 1 to 3, first power-on, microphone denied, microphone reset, install sheet, install notice and update ready.
3. THE SOS states 07 and 08 SHALL be reachable only through `?state=sos-held` and `?state=sos-received`, AND the live app SHALL keep empty slots for SOS, the group key bar and the quick keys.
4. WHEN the live controls drive the FakeTransport, THE app SHALL reach States 01 to 06 and 09 to 16 with the same visible result as their Gallery fixtures.
5. WHEN the `state` value is unknown, THE app SHALL ignore it and load normally.
6. THE Gallery SHALL NOT read or write storage, and SHALL NOT start audio.
7. THE Gallery SHALL be available in the production build.

### Requirement 15: Reserved slots

**User Story:** As a maintainer, I want the layout to keep room for later features, so that adding SOS, quick keys and the group key bar moves nothing.

#### Acceptance Criteria

1. THE Device_Screen SHALL render empty containers for the group key bar, the quick keys and the SOS button with the heights of their Figma frames.
2. THE heights SHALL be recorded in the Source_Map.
3. THE `SosButton`, `QuickKeys` and `GroupKeyBar` components SHALL exist for the Gallery and SHALL NOT be mounted by the live app.
4. THE live app SHALL NOT print Relayed, SOS, Locked, Location or I'm safe slips, and a Heard slip SHALL omit the "Pass it on" button until the relay spec exists.

### Requirement 16: Persistence

**User Story:** As a user, I want my tape and draft to survive a reload, and I want a switch to turn that off.

#### Acceptance Criteria

1. THE Persistence_Flag `PERSIST_ENABLED` SHALL turn the storing of the tape and the draft on or off, AND the onboarding, microphone and first power-on flags SHALL persist either way.
2. THE app SHALL store the tape, the draft, the channel and the flags under the prefix `dialtone.v1.` in localStorage, debounced to one write per 300 ms.
3. WHEN loading, THE app SHALL validate every field, drop invalid slips, cap text and the tape length, and SHALL NOT throw for any stored string.
4. IF a storage call throws, THEN THE app SHALL continue without persistence for the session.
5. THE app SHALL NOT store binary data, keys or audio.

### Requirement 17: Audio-transport amendments and completion

**User Story:** As the owner of the audio-transport spec, I want the UI's needs folded into it, and I want its browser tasks finished and ticked.

#### Acceptance Criteria

1. THE `AudioTransport` SHALL expose `analyser: SpectrumSource | null`, where `SpectrumSource` has `fftSize`, `frequencyBinCount`, `sampleRate` and `getByteFrequencyData`, and SHALL be `null` before `start()` and after `stop()`.
2. THE `AudioTransport` SHALL emit `{ kind: "airtime"; profile; byteLength; attempt; ms }` in answer to `airtimeMs(byteLength, attempt?)`, which SHALL return the cached value or `null` and ask the worker on a miss.
3. THE `AudioTransport` SHALL provide `setListening(on)` that stops and resumes the delivery of `frame`, `rejected` and `carrier` events without closing the microphone stream and without affecting sending.
4. THE `start()` method SHALL return `ok({ sampleRate, mic })` when sending works, including when only the microphone failed.
5. THE `src/audio/index.ts` SHALL export `createAudioTransport` and the types the UI needs.
6. A task SHALL fold the four amendments into the audio-transport requirements, design and tasks without renumbering any item.
7. WHEN the matching ui-shell task passes, THE team SHALL tick audio-transport tasks 11.1, 11.2, 12.1, 12.2, 12.3, 13.1 and 14.1 in `.kiro/specs/audio-transport/tasks.md`.
8. THE audio-transport task 13.2 (CPU measurement on a real phone) SHALL stay unticked until the user performs it.
9. IF sending does not work for any cause, including `MODEM_LOAD_FAILED`, `NO_AUDIO_CONTEXT`, a worker crash or a codec initialisation failure, THEN THE `start()` method SHALL return an error.

### Requirement 18: GitHub Pages deploy

**User Story:** As a tester, I want a public HTTPS URL, so that two phones can open the app.

#### Acceptance Criteria

1. THE repository SHALL contain a GitHub Actions workflow that builds the app and deploys it to GitHub Pages on push to `main` and on manual dispatch.
2. THE workflow SHALL run `npm ci`, `typecheck`, `lint` and `test` before it builds, AND SHALL use minimal permissions and pinned action versions.
3. THE deployed app SHALL be served at the Pages_URL with Vite `base` `/dial-tone/`.
4. THE final task SHALL list the manual steps: set the Pages source to GitHub Actions, make the repository public, open the Pages_URL on two phones, and run the CPU measurement on a real phone.

### Requirement 19: Accessibility, motion and haptics

**User Story:** As a user under stress, I want large targets, readable state and non-sound cues.

#### Acceptance Criteria

1. UNDER `prefers-reduced-motion: reduce`, THE app SHALL drop the LED sweep, the CRT warm-up, the switch spring, line-by-line printing, the signal-line pulse, the ghost-text resolve and the sheet slide, and SHALL keep functional progress (the Transmit strip) without easing.
2. EVERY sound event (`tx` start and end, a received frame, a carrier) SHALL have a visual cue and, where `navigator.vibrate` exists, a haptic cue.
3. EVERY interactive control SHALL have a tap target of at least 44 by 44 px, an accessible name, and keyboard operation.
4. THE Readout and hint SHALL be in an `aria-live` region that does not announce the CONNECT hold repeatedly.

### Requirement 20: Layering and tests

**User Story:** As a maintainer, I want the logic testable in Node and the layers kept apart.

#### Acceptance Criteria

1. THE `src/ui` code SHALL import `src/protocol` and `src/audio` only through their `index.ts` files, AND neither of them SHALL import from `src/ui`.
2. THE `src/ui/model` modules SHALL contain no DOM global and no Preact import.
3. THE tests SHALL live next to the code, with `*.test.ts` for unit tests and `*.prop.test.ts` for property tests, AND property tests SHALL print the fast-check seed on failure.
4. THE Playwright tests SHALL run on Chromium with the fake microphone, the gallery and the FakeTransport.
5. A source-scan test SHALL enforce requirements 2.8, 3.2, 3.3, 3.4 and 20.1 to 20.2.
6. A Design QA task SHALL compare every gallery state with its Figma screenshot, and SHALL re-check that State 03 shows 8 lit segments and State 11 shows all 24 segments amber with the glow.
