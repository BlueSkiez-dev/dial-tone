# Kiro journal


## 2026-11-18 - ui-shell 1.1
Installed exact-pinned deps: preact 11.2.0, vite 8.3.8, @preact/preset-vite 2.10.6, vite-plugin-pwa 2.0.0 (peer allows Vite 3-8), workbox-window 7.4.1, preact-render-to-string 6.8.3, fontsource packages 5.3.0. npm ci succeeded. No tests run. npm audit reports 4 moderate issues, left unfixed.

## 2026-11-18 - ui-shell 1.5
design-system.md: State 11 note now says 128, Meter limit open issue rewritten (limit from plaintextCapacity), message well row states lit rule ceil(bytes*24/limit) with positional colours. No tests run. No remaining 134 byte-limit references outside the spec files that mention it.

## 2026-11-18 - ui-shell 1.2
Added index.html, vite.config.ts (base /dial-tone/ on build, PWA prompt mode), tsconfig/biome/package scripts, README credits. typecheck and build pass; sw.js and manifest emitted. Lint failed on meter test formatting from 2.1. Icon files are placeholders until 1.4; worker/worklet/ggwave precache to verify later.

## 2026-11-18 - ui-shell 2.1
Added src/ui/model/meter.ts with meter.test.ts (6 tests) and meter.prop.test.ts (4 properties). 10 tests pass. Uses integer ceil for the 24-segment meter; limit from plaintextCapacity. Lint formatting on the two test files still to fix.

## 2026-11-18 - ui-shell 1.3
Fonts copied (9 Latin woff2 + 3 OFL licenses) via scripts/copy-fonts.mjs; added fonts.css, tokens.css (Ghost default, Beige override), base.css. Biome clean, 6 warnings (!important in reduced-motion). Radii/shadow/type token names are our choice, not Figma's.

## 2026-11-18 - ui-shell 1.4
Wrote docs/figma-source-map.md and exported assets to public/art (SVGs, grain tiles, 4 app icons). Reserved slot heights from Figma: key bar 76, quick keys 40, SOS 95. No tests run. paper-grain.png as Slip tile is a guess to verify.

## 2026-11-18 - ui-shell 2.2
Added draft.ts with 5 tests (unit + Property 2); all pass, Biome clean. The plaintextCapacity spy check may not fire under ESM, so that assertion is weak.

## 2026-11-18 - ui-shell 2.3
Added send.ts (buildWire, SEND_TTL=3) with 7 tests (Property 3); pass, Biome clean. vi.spyOn fails on re-exported ESM bindings, so tests use vi.mock wrappers. Over-128-byte text rejected before any protocol call.

## 2026-11-18 - ui-shell 2.4
Added tape.ts and receive.ts with 14 tests (Properties 6 and 7); pass, Biome clean. Caps: tape 50, slip text 1024, seen 256, partials 8.

## 2026-11-18 - ui-shell 2.6
Added scope-map.ts with 8 tests (Property 9); pass, Biome clean. Call window 0-4 kHz is unconfirmed against Figma State 09.

## 2026-11-18 - ui-shell 2.7
Added persist.ts with 10 tests (Property 8); pass. parseSaved never throws, drops bad slips; PERSIST_ENABLED=false keeps tape and draft off disk.

## 2026-11-18 - ui-shell 2.8
Added update-guard.ts canRestartNow with 5 tests (Property 13); pass. Type import of UiState resolves once reducer.ts exists.

## 2026-11-18 - ui-shell 3.1
Folded four ui-shell amendments (analyser, airtime event, setListening, start() result with SEND_UNAVAILABLE) into audio-transport requirements, design and tasks. Spec format validation clean. No code tests.

## 2026-11-18 - ui-shell 2.5
Added reducer.ts and status.ts; 86 tests in src/ui/model plus layering test pass, tsc clean. Added errorUntil to UiState and exported MicState from audio index. Gap: no hint state for requirement 11.5 (mic processing not disabled).

## 2026-11-18 - ui-shell 3.2
Implemented browser glue in src/audio (worklet, decode worker, mic, player, transport) plus four amendments. Build, typecheck, Biome pass; vitest 407/408. Failure: src/offline.test.ts flags URLs in font OFL license .txt files. Vendor ggwave URL via new URL(import.meta.url) to satisfy layering test.

## 2026-11-18 - ui-shell 2.9
Added gallery.ts with 25 fixtures and 9 tests; pass, Biome clean. State 11 draft is wellLimit()+12 bytes; State 03 draft 41 bytes (8 segments).

## 2026-11-18 - ui-shell 3.3
Added src/audio/transport.test.ts (fake worker, context, mic; Property 8, amendments) and fixed src/offline.test.ts to skip license .txt files. 26 tests pass. Fixed the failure 3.2 found.

## 2026-11-18 - ui-shell 4.1
Built Device, CircuitBoard, App, device.css, copy.ts and three empty reserved slots (76, 40, 95 px). 444 tests, tsc and build pass. Visual match to Figma not checked. Group key bar placed after Channel per Figma, not under status window as design.md says.

## 2026-11-18 - ui-shell 3.4
Added UiTransport seam, FakeTransport, shared conformance checks (Property 12). Fake runs 7 tests; real-transport run lives in src/ui because the audio layering test forbids src/ui imports. Fakes moved to src/audio/testing/transport-fakes.ts. 454 tests, tsc, Biome pass.

## 2026-11-18 - ui-shell 4.2-4.6 batch
Built Rocker/Led/StatusWindow, Scope (17 tests), ChannelSwitch+QuietNotice (10), MessageWell+ByteMeter (8), TransmitKey+ListenLatch (11). Each passes its own tests. Not yet wired into Device; Call window 0-4 kHz and Quiet band label 15-19.4 kHz (Figma says 19.5) noted. ListenLatch carries its own Tape caption, avoid duplicating.

## 2026-11-18 - ui-shell 4.7
Built Slip (10 types), GhostText, SosSlip, Tape; 188 tests in src/ui pass, tsc clean. Slip text escaped, no innerHTML. Only compared against Figma component 213:481; Relayed and I'm safe meta layouts approximate.

## 2026-11-18 - ui-shell 4.9
Built SosButton, QuickKeys, GroupKeyBar with tests; tsc and Biome pass. Figma MCP was not consulted, so sizes come from the source map. Added icon-padlock-closed.svg.

## 2026-11-18 - ui-shell 4.8
Built Sheet, SheetContent (onboarding 1-3, microphone, install), Notice, AppIcon. 196 UI tests pass, tsc clean. Renamed wrapper class sheet-host to sheet-layer to avoid collision with App. Layout not re-checked against Figma 270:345, 270:401, 270:433.

## 2026-11-19 - ui-shell 5.1
Added controller.ts and tests (manual clock, FakeTransport). Model gained micProcessingWarn (11.5), micSheet rules, listening-open notice key. tsc clean. One timeout in segment-roundtrip.prop.test under full-suite load; passes on rerun.

## 2026-11-19 - ui-shell 5.2
Added main.tsx transport choice (fake in dev, real on ?transport=real), ?state= gallery route, Screen, LiveApp, dev panel. 554 tests passed before Screen.test.ts added; build and tsc pass. Gallery non-interactive; not opened in a browser yet. Dev panel absent from dist.

## 2026-11-19 - ui-shell 5.3
Added pwa.ts (prompt-mode registration, install capture, restart gated by canRestartNow); 561 tests, tsc, build pass. Precache includes decode-worker, capture-worklet, ggwave (37 entries), not tested offline yet. Gaps: no blocked-restart line, Install Not now not persisted, no iOS install trigger, stale update slip persists across reload.

## 2026-11-19 - ui-shell 5.4
Added src/ui/scan.test.ts (16 tests): colours, red/phosphor scoping, no network, layering, no 134/128/140 literals. Caught a real violation: transmit-key.css used --phosphor outside glass; changed to --green. Suite 577 pass. About 37 rgba() literals remain, pinned per file rather than tokenised.

## 2026-11-19 - ui-shell 5.5
Checkpoint: typecheck, lint (0 errors, 7 !important warnings in base.css), test (83 files, 577 pass), build (37 precache entries, 1059 KiB) all pass. No changes.

## 2026-11-19 - ui-shell 6.1
Added @playwright/test 1.65.1, Chromium, playwright.config.ts (dev and preview projects, fake mic flags), e2e-hook.ts (window.__dialtone only with ?e2e=1). 580 unit tests pass; hook spec passes in dev. Preview project and real fake-mic audio untried.

## 2026-11-19 - ui-shell 6.2
Added e2e/gallery.spec.ts (25 states) and reachability.spec.ts (States 01-06, 09-15, 16), helpers, and a Hold sends input in the dev panel. Reachability passes (3 tests); gallery passed earlier but not rerun after final edits. e2e files not yet linted.

## 2026-11-19 - ui-shell 6.3
Added e2e/fake-mic.spec.ts: fake mic WAV decodes to Heard slip with matching wire bytes on Chromium. Caught a real bug: vite preview used base / not /dial-tone/, so built app rendered empty; fixed in vite.config.ts. Worklet-to-worker MessagePort path works.

## 2026-11-19 - ui-shell 6.4
Added e2e/mic-denied.spec.ts (2 tests pass on preview): denied mic shows No mic and Microphone sheet, sending still works, Try again re-asks. Denial is simulated via getUserMedia NotAllowedError; real Chromium and iOS denial not verified. Playwright reused a preview server on 4173 that may have been stale.

## 2026-11-19 - ui-shell 6.5
Added e2e/offline.spec.ts: offline reload, power on, fake-mic fixture decodes, send works, no failed requests. Passes on a fresh preview server (29 s). dist/sw.js precaches decode worker, worklet, ggwave, 9 fonts. Chromium only; iOS offline unverified.

## 2026-11-19 - ui-shell 7.2
Added ?cpu=1 probe (cpu-probe.ts, worker report on BroadcastChannel, overlay) and docs/audio-transport-cpu.md with empty results tables. 587 tests, tsc, build pass. No measurements taken; audio-transport 13.2 stays open.

## 2026-11-19 - ui-shell 7.3
Added .github/workflows/pages.yml with SHA-pinned actions, Node from .nvmrc, typecheck/lint/test/build then Pages deploy. Not run. Built dist uses /dial-tone/ base in html and manifest; precache URL prefixes not traced.

## 2026-11-19 - ui-shell 7.1
Compared all 25 gallery states with Figma; wrote docs/ui-design-qa.md. Fixed Call scope window (0-8 kHz per State 09), scope axis, hints, sheet type sizes, slip spacing, tape slit. 587 tests, gallery+reachability e2e (33) pass; one Escape-sheet flake. Open design decisions listed: AA LED, too-long readout, empty tape text, sheet artwork, system slip paper.

## 2026-11-19 - ui-shell 8.1
Full run green: typecheck, lint (7 warnings), test 589, props 162, slow 60, e2e 38/38 twice. Fixed a real bug: restartMic and send did not wait for a pending start(), so Try again could be dropped on a slow phone (mic-denied e2e failed 3/3 under load, 8/8 after). Also fixed offline e2e false failure. Unverified: real phones, iOS, CPU measurement.

## 2026-11-19 - ui-shell 7.1 (design decisions pass)
Applied 8 Figma decisions: AA lit whenever listening (req 8.3 updated), too-long and mic-off hints, Figma empty-tape sentence, SOS-held gallery readout, STANDBY tag, Show less caret, CSS striped system paper with first-power slip, onboarding art and page dots. 593 tests, 162 props, e2e 38/38 clean. Finding: Figma has no stripe layer, so stripe is our addition; ink on system paper is about 4.0:1, below AA 4.5.

## 2026-11-19 - ui-shell 9.1
Collapsed empty Reserved_Slots to 0x0 (no display:none, margins replace flex gap) and made Transmit fill its row (Device.tsx, device.css, transmit-key.css). Added e2e/slots.spec.ts and a Device unit test. Typecheck, vitest (240 tests) and Playwright dev project pass. Finding: gap on the faceplate flex added 20 px even for empty slots, so spacing moved to margins. reachability self-test timing assertion flaked once (605 ms vs 600), passed on rerun.


## 2026-11-19 - ui-shell 9.2
Added Chassis.tsx/css (corner screws, POWER label, side rail, bottom grille, channel grille ticks) and shared 13 px Sheet screws. Typecheck, 602 vitest tests and 44 e2e pass. Findings: 270:136 is a kicker container, real screws are 270:3 and 270:6. Grille ticks, rail and bottom grille are not Figma nodes (raster board 182:5), values came from the prototype.


## 2026-11-19 - ui-shell 9.3
Scope band lines now amber (--scope-band #6a4c0e, read from the State 09 Spectrogram PNG; caption gets --scope-band-caption). Warm-up is a pure warmUpFrame drawing one widening line; random stripe fill removed. tsc, 251 ui unit tests, biome and chassis e2e pass. Finding: Figma bakes band lines into a PNG, so the amber value was sampled, not a variable.


## 2026-11-19 - ui-shell 9.4
Removed the system paper stripe and --paper-system-stripe token. Added --print-system #121314 for system slips and contrast.test.ts. tsc and 256 ui unit tests pass; Playwright not run. Finding: old ink #1d1e21 on #7c7d7f measured 4.05:1; new ink gives 4.52:1 (Figma's own ink fails 4.5).


## 2026-11-19 - ui-shell 9.5
Design QA of the main screen (off, on, draft) at 390x844 against Figma 271:2, 182:2 and 273:2; results in docs/ui-design-qa.md. No UI fixes needed. typecheck, 610 unit tests, 45 e2e pass. Findings: prototype values listed with receiving tokens; open items are grille ticks, circuit board extent, scope gutter, scope while off, well count placement. System ink measures 4.51:1.


## 2026-11-19 - ui-shell 8.1 (re-run)
Re-ran the final checkpoint after task 9. typecheck, lint (exit 0, 7 warnings not from task 9), 610 unit, 163 property, 60 slow (250 s) and 45 e2e tests all pass. No code changes. Reachability timing flake did not recur.


## 2026-11-19 - ui-shell 9.6
Applied visual decisions: title two-line deboss via tokens, grille ticks kept, scope band lines drawn while off, byte count moved into the MESSAGE caption row per Figma. typecheck, lint (7 old warnings), 612 unit and 47 e2e tests pass. Finding: Figma has no message-well divider, so the earlier QA claim was wrong and was corrected.


## 2026-11-19 - ui-shell 9.7
Fixed Transmit touching the message well after slot collapse: well-to-Transmit gap 0 to 8 px, Transmit-to-Tape 44 to 20 px (derived from State 03 273:2). Spacing now sits on the visible neighbours. e2e gap checks added. typecheck, 613 unit, 47 e2e pass; first e2e run had two timing flakes (reachability, fake-mic) that passed alone.


## 2026-11-20 - ui-shell 9.8
Caption-to-well gap 0 to 8 px (Figma 273:150/273:155). Playwright webServer uses npm.cmd on Windows. Removed e2e timers (page.clock, carrierRearmed hook, hold-sends control), workers set to 1. Two full runs pass: typecheck, 613 unit, 48 e2e. Finding: fake-mic failed because parallel Chromium decoders overran the worker (up to 356 dropped chunks).


## 2026-11-20 - ui-shell 9.9
Title fill now --ink-2 (5.40:1 on plate, was 1.43:1). Update ready buttons filled and raised (labels 12-13:1, edges 3.4:1). Side rail moved above the blurred shell so it shows. Band line kept at #6a4c0e 1 px, which matches Figma exactly. typecheck, 630 unit, 48 e2e pass. Finding: Figma get_screenshot caps at 1x natural size.


## 2026-11-20 - ui-shell 9.10
Scope band lines now --amber at 60% (color-mix), 1.5 px, approved exception pending a Figma update. Drawn as a filled 1.5 px box, not border-top. typecheck, 630 unit, 49 e2e pass. Finding: Chromium rounds border widths down to whole device pixels, so a 1.5 px border rendered as 1 px at scale 1.


## 2026-11-20 - ui-shell 9.11
Confirmed in Figma: 68 band-line rectangles in 34 frames, 290 x 1.5 px, fill opacity 0.6, bound to light/led-amber (#ffb21a = --amber). Band lines no longer an exception; comments and docs updated, height + background drawing recorded as user-approved. typecheck, 630 unit tests and band-line e2e (off and on) pass. No token change.


## 2026-11-20 - ui-shell 10.1
Device and faceplate now fluid: device fills page minus 10 px gutters up to 430 px, faceplate fills device; parts stretch, Transmit takes the row minus SOS. Scope buffer follows rendered size x dpr (canvasBuffer). New e2e/fluid.spec.ts at 360/375/390/430. typecheck, 634 unit, 54 e2e pass. Measured well width 274/289/304/344 px; at 390 device 370, faceplate 340.


## 2026-11-20 - ui-shell 8.1 (re-run after 9.9 to 10.1)
Final checkpoint re-run. typecheck pass, lint exit 0 (7 old warnings), 634 unit (87 files), 164 property (36 files), 60 slow (505 s) and 54 e2e (workers 1, Playwright started its own servers) all pass. No code changes. No 134 in src/ui or design-system.md, State 03 has 8 lit segments, scan test 16/16. Audio-transport 14.1 already ticked, 13.2 left open.

## 2026-11-20 - relay 1.1
Created src/protocol/relay.ts: SEEN_MAX 256, checkRelay (MULTI_FRAME, NOT_RELAYED_TYPE, NO_HOPS_LEFT, HOP_LIMIT), canRelay, relayWire (decodeFrame then patchRouting, body-blind), hasSeen/markSeen. tsc and Biome pass. No tests run yet (property tests are tasks 1.3+). Finding: patchRouting failure after a valid decode maps to BAD_ROUTING to keep the error union small.

## 2026-11-20 - relay 1.2
Exported canRelay, checkRelay, relayWire, hasSeen, markSeen, SEEN_MAX and relay types from src/protocol/index.ts; added canRelay and relayWire to layering.test.ts. layering.test.ts 7/7 pass, Biome clean. Full suite not run yet.

## 2026-11-20 - relay 2.1
src/ui/model/tape.ts: added memory-only RelayMeta (hop, ttl, multi, keyOffer), optional relay and passedOn on heard and system slips, notice keys unreadable and relay-failed. Biome clean, no tsc errors in tape.ts. Tests not run.

## 2026-11-20 - relay 2.6
src/ui/model/send.ts: SEND_TTL comment now states a message sent with TTL 3 can be passed on three times. Comment only, value stays 3. No tests run.

## 2026-11-20 - relay 5.1
src/ui/copy.ts: added copy.relay strings (via, passedOn, passOnLabel, end reasons, unreadable, failed) and two slip notices. KEY_OFFER reason is Group keys can't be passed on. Join in the same room. Biome clean; tsc run returned no output, so typecheck unconfirmed.

## 2026-11-20 - relay 1.3
Added src/protocol/relay.prop.test.ts with three properties (predicate and refusal code against a reference model, reason order over 16 combinations, relayWire on real encoded wires), 300 runs each, verbose seeds. All pass. Biome clean (the command hung once until timeout, cause not investigated).

## 2026-11-20 - relay 2.2
src/ui/model/receive.ts: receiveFrame returns holdsWire; single-frame unreadable frames print an unreadable system slip; heard slips carry relay metadata; seen keys use the capped relay state. tsc and Biome clean. Tests not run; old unsupported assertions fail until 6.3. Choice: multi-frame slip uses min ttl.

## 2026-11-20 - relay 2.3
Created src/ui/model/relay-view.ts: pure relayView decision table (passed, restart, multi, key-offer, no-hops, hop-limit, action). No tsc errors in the file. Tests come in 6.9 and 6.10.

## 2026-11-20 - relay 2.4
src/ui/model/reducer.ts: added passed-on event setting passedOn on the matching heard or system slip; unknown id returns the same state. No tsc errors in the file. Reducer tests are task 6.5.

## 2026-11-20 - relay 2.5
src/ui/model/persist.ts: storedSlip strips relay metadata and keeps passedOn only when true; validSlip reads passedOn and accepts the new notice keys. Biome and tsc clean for the file. Persist tests not run (6.4, 6.14).

## 2026-11-20 - relay 6.4
Updated persist.test.ts and persist.prop.test.ts: new notice keys, passedOn kept only when true, storedSlip strips relay, round-trip expects storedSlip output. 13 tests passed; Biome reformatted one file after the run and vitest was not re-run.

## 2026-11-20 - relay 4.1
slip-parts.tsx: SlipButton takes disabled and ariaLabel; PassOn gets disabled and aria-label Pass it on, hop N. tsc clean for the file. 44 px target already comes from Slip.css. No disabled style added yet.

## 2026-11-20 - relay 3.1
controller.ts: runSend now wraps shared sendWire(wire, onOk) returning ok, busy or failed. tsc clean, 10 existing controller tests pass. Lint and full suite not run.

## 2026-11-20 - relay 6.3
Updated receive.prop.test.ts for unreadable slips, holdsWire, KEY_OFFER never held (16-byte body needed), hop 15 not held, multi-frame still unsupported. 11/11 pass, Biome clean. No bug found in receive.ts.

## 2026-11-20 - relay 1.4
Added Property 2 (Patched_Wire shape) to relay.prop.test.ts: same length at most 140, only byte 1 and CRC differ, hop+1, ttl-1, id/type/flag/index/total/body unchanged. 4/4 tests pass, Biome clean. Foreground shell returned no output; ran via background logs.

## 2026-11-20 - relay 6.9
Added relay-view.prop.test.ts (Property 14): relayView matches an independent oracle, other slips give none, action only with ttl>=1, hop<15, not multi, not KEY_OFFER, wire held. 3/3 pass; Biome reformatted after run, vitest not re-run. Rendered-text half of 4.16 waits for Slip.tsx (4.2).

## 2026-11-20 - relay 6.5
reducer.test.ts: three passed-on tests (heard slip, unreadable system slip, unknown id returns same state). 20/20 pass, Biome clean.

## 2026-11-20 - relay 1.5
Added Property 3 to relay.prop.test.ts: frameKey, aadFor and ivFor are equal for held and relayed wires, 300 runs, any non-KEY_OFFER type and encrypted flag. 5/5 tests pass, Biome clean.

## 2026-11-20 - relay 3.2
controller.ts: memory-only held Map keyed by slip id, filled when receiveFrame says holdsWire, pruned in dispatch when slips leave the tape, cleared on dispose. Not in UiState or saved state. tsc clean, 10 controller tests pass.

## 2026-11-20 - relay 4.2
Slip.tsx: new RelayPart renders Pass it on button, end-of-line reason, or Passed on from relayView; heard meta shows via N hop(s) instead of Hop n; unreadable slip text depends on action. tsc and Biome clean. Slip tests pending (6.1).

## 2026-11-20 - relay 6.7
Added Property 11 to receive.prop.test.ts: sequences of up to 30 TEXT events over 4 ids with random hop, ttl and echo; one slip per key, echoes and repeats change nothing. receive.prop.test.ts 12/12 pass, Biome clean.

## 2026-11-20 - relay 6.14
Added Property 18 to persist.prop.test.ts: passedOn true survives save and load, relay never persisted, bad values load as absent. 6/6 pass. Finding: design says a loaded passedOn slip is always kind passed, but relayView returns none for non-relayable system slips; test narrowed, design wording needs a fix.

## 2026-11-20 - relay 6.10
Added Property 15 to relay-view.prop.test.ts: via text is none at hop 0, via 1 hop at 1, via n hops above; passed-on keeps hop and via text. 500 runs each, 5/5 tests pass after Biome, vitest re-run.

## 2026-11-20 - relay 4.3
Tape.tsx: passOn prop replaced by relay(slip) view lookup and onPassOn(id), forwarded to every Slip. Not typechecked here; Screen.tsx still uses the old prop until 4.4.

## 2026-11-20 - relay 3.3
controller.ts: added passOn(slipId) and holdsWire(slipId). One send per tap, no send on hearing, refusals send nothing, decode error prints relay-failed, success marks seen then dispatches passed-on, BUSY keeps state. 10 controller tests pass. tsc has one expected error in Screen.tsx (4.4).

## 2026-11-20 - relay 6.1
Slip.test.ts: new cases for via hop text, passed, each reason, action (enabled and disabled), none, unreadable slip text; two old passOn tests moved to relay views. 18/18 pass after Biome and re-run. No bug in Slip.tsx.

## 2026-11-20 - relay 6.8
Added Property 13 to receive.prop.test.ts: holdsWire equals canRelay for any single frame, never for KEY_OFFER; unreadable slips carry no text or type name. 13/13 pass, Biome made no changes.

## 2026-11-20 - relay 1.6
Added Property 4 (body-blind) to relay.prop.test.ts: any body or encrypted flag is accepted unchanged; metamorphic pairs with different bodies, ids and flags give the same decision. 8/8 tests pass after Biome and re-run.

## 2026-11-20 - relay 1.7
Added Property 5 to relay.prop.test.ts: KEY_OFFER is never relayable for hop and ttl 0..15, any id and body; relayWire gives NOT_RELAYED_TYPE and no bytes; decision independent of body. 11/11 tests pass.

## 2026-11-20 - relay 4.4
Screen.tsx: ScreenActions gets passOn and holdsWire; Tape gets relayView per slip and onPassOn; canSendNow ignores the draft; gallery Heard slips show an action view; main.tsx gallery stubs added. Biome clean. One tsc error left in Screen.test.ts mock (task 6.2).

## 2026-11-20 - relay 6.11
Added src/ui/relay-controller.prop.test.ts (Property 16): hearing frames never calls send; a tap sends exactly once with bytes equal to relayWire; KEY_OFFER taps never send. 3/3 pass, about 0.2 s per run, 25 runs each.

## 2026-11-20 - relay 3.3 fix and 6.6
Bug caught by the 6.6 tests: passOn used transmitState, which needs a non-empty draft, so tapping Pass it on with an empty well sent nothing (8 of 11 new controller tests failed). Guard now checks only power, fault and sending. controller.test.ts and relay-controller.prop.test.ts pass 23/23.

## 2026-11-20 - relay 1.8
Added Property 6 to relay.prop.test.ts: relayWire twice on one wire gives equal bytes, input unchanged, output a new buffer. 300 runs, 12/12 tests pass.

## 2026-11-20 - relay 6.2
Screen.test.ts: mock actions gain passOn and holdsWire; three new cases (gallery action, live no-wire, live with wire). New Tape.test.ts covers relay view lookup, disabled and passed. 10 tests pass, typecheck exits 0. Finding: a live heard slip without relay metadata shows the restart reason, as designed.

## 2026-11-20 - relay 6.12
Added Property 17 to relay-controller.prop.test.ts: after 51 to 70 relayable frames the tape holds at most 50 slips and holdsWire is true exactly for slips still on the tape. 4/4 tests pass.

## 2026-11-20 - relay 6.13
Added Property 19 to relay-controller.prop.test.ts: hearing and passing on writes only the four existing storage keys, no wire bytes (array, hex or base64), no relay, wire or seen field on slips, passedOn only true, no localStorage/indexedDB/caches calls. 5/5 pass. First run failed on afterEach while a parallel task edited the file; second run passed.

## 2026-11-20 - relay 1.9
Added Property 7 to relay.prop.test.ts: chains of passes from hop 0 and ttl t keep hop non-decreasing and hop+ttl equal to t, end within t passes, then are refused. 13/13 tests pass, Biome clean.

## 2026-11-20 - relay 1.10
Added Property 8 to relay.prop.test.ts: flipping one byte or two adjacent bytes of any valid wire makes relayWire return BAD_CRC with no bytes. Limited to two adjacent bytes because CRC-16 catches bursts up to 16 bits; wider flips could pass the CRC about 1 in 65536 and flake. 14/14 tests pass.

## 2026-11-20 - relay 1.11
Added Property 9 to relay.prop.test.ts: relayWire and decodeFrame plus canRelay never throw on random bytes of length 0..200, or on valid frames truncated or extended (added because random bytes rarely pass the CRC). 17/17 tests pass, Biome clean.

## 2026-11-20 - relay 1.12
Added Property 10 to relay.prop.test.ts: markSeen never exceeds SEEN_MAX 256, holds no duplicates, matches an oldest-first model over up to 768 keys; 257 distinct inserts drop the first key, which is accepted as new again. 19/19 tests pass (100 and 50 runs for the long lists).

## 2026-11-20 - relay 1.13
Added Property 12 to relay.prop.test.ts: 2 to 6 simulated phones, random delivery order; each phone passes a message at most once, the sender never passes its own, simulation ends within n squared steps. 20/20 tests pass, Biome clean.

## 2026-11-20 - relay 7.1 checkpoint
All six commands pass: typecheck clean; lint 0 errors, 7 existing CSS warnings; test 699/699 (91 files); test:props 201/201; test:slow 60/60 (about 420 s); test:e2e 54/54. First e2e run crashed natively (0xC0000409) and passed on rerun. Optional source scan (1.14), slow modem test (6.17) and relay e2e (6.18) do not exist, so those paths are untested.

## 2026-11-20 - relay 4.5
Pass it on disabled state now shares the Transmit disabled rule: .slip-button:disabled added to the selector lists in transmit-key.css (cursor default, opacity 0.4), imported from slip-parts.tsx. New case in TransmitKey.test.ts. 46 tests pass, typecheck clean. Note: opacity dims the whole outline button, border included, because the label has no inner span.

## 2026-11-20 - relay 1.14
Added src/protocol/relay.test.ts: SEND_TTL 3 gives exactly 3 passes then NO_HOPS_LEFT, hop 15 refused, KEY_OFFER refused, index exports, and the source scan (no body, encrypted, slice, encode calls; .type only in the KEY_OFFER check). 15/15 pass, scan found no violation.

## 2026-11-20 - relay 6.15
Slip.test.ts: Pass it on accessible name per hop, 44 px hit area from Slip.css (45.5 px tall), native button for Enter and Space, disabled keeps label, mocked HTML copy renders as text. 23/23 pass. Gap: .slip-button has no min-width; width relies on label length.

## 2026-11-20 - relay 6.16
scan.test.ts: relay scans for no network, no hard-coded relay strings outside copy.ts, no radio/walkie/internet call in relay copy. All three pass. The existing layering scan caught a real violation: relay-channel.slow.test.ts imports src/ui from src/audio (fixed by 6.20).

## 2026-11-20 - relay 6.17
Added src/audio/relay-channel.slow.test.ts. Per-profile check passes on Room, Call, Quiet, 3/3 decoded each, about 4.5 s. Real bug caught by the A to B to C modem case: A printed its own message when B passed it on, because own-echo matches exact bytes and transmit never marks its key seen. Fix is task 3.4; case moves to src/ui in 6.20.

## 2026-11-20 - relay 6.18
e2e/fake-mic.spec.ts: new test hears the fixture TEXT frame (hop 0, no via text), taps Pass it on -> hop 1, sees Passed on with no extra slip, ignores the looped repeat, and still shows Passed on after reload. 55/55 e2e pass in 6.7 min. No native crash.

## 2026-11-20 - relay 3.4
controller.ts runSend: after a successful send, decode the sent wire and markSeen its frame key, so a passed-on copy of the phone's own message is ignored. BUSY and failed sends record nothing. own-echo.ts unchanged. Controller and relay/receive property tests pass (38), tsc and Biome clean.

## 2026-11-20 - relay 6.20
Moved the A to B to C case to src/ui/relay-chain.slow.test.ts using real controllers and the real ggwave modem: B prints hop 0 and passes on, C prints hop 1 with via 1 hop, A prints nothing for B's copy. src/audio/relay-channel.slow.test.ts keeps only the per-profile check. Slow tests 4/4 pass, scan.test.ts 19/19, typecheck clean.

## 2026-11-20 - relay 6.19
Added Property 20 to relay-controller.prop.test.ts: after an ok transmit, copies with any hop and ttl print nothing; after BUSY, MODEM_FAILED or a throw, a copy prints a Heard slip. 7/7 pass, 25 runs each. Limit: seen order is private, so a reorder without a slip would go unnoticed.

## 2026-11-20 - relay 7.1 checkpoint (rerun)
All six pass first time: typecheck; lint 0 errors, 7 existing warnings; test 725/725; test:props 203/203; test:slow 64/64 in 6 min 12 s, including both relay modem tests; test:e2e 55/55 in 3 min 33 s, including the relay test. No native crash this run.
