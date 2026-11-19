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
