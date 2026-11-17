# Tech

Status: stack chosen, no application code yet (only `docs/`, `LICENSE`, `.kiro/`). Scripts and versions below are the plan. Update this file when scaffolding lands and the real `package.json` exists.

## Stack
- Build: Vite + TypeScript (`strict`, plus `noUncheckedIndexedAccess` because we slice bytes constantly)
- UI: Preact (no `preact/compat` unless a dependency forces it)
- PWA: `vite-plugin-pwa` for service worker and manifest. Use `registerType: 'prompt'`, never silent auto-reload, so an update can't restart the app mid-message.
- Unit and property tests: Vitest + fast-check. E2E: Playwright.
- Lint and format: Biome. Exclude `/vendor` and build output.
- Package manager: npm. Commit `package-lock.json`, install with `npm ci`, set `save-exact=true` in `.npmrc`, pin Node via `.nvmrc`.
- Modem: `ggwave` 0.4.0 (WASM, MIT, Reed-Solomon), vendored unmodified in `/vendor` with `GGWAVE-LICENSE.txt`. Credit and disclose it.
- Crypto: WebCrypto AES-GCM with 128-bit keys. No crypto dependency (libsodium dropped).
- Audio: Web Audio API, `AudioWorklet` for capture, `getUserMedia` for the mic.
- Fonts: Barlow Condensed, IBM Plex Sans, IBM Plex Mono, bundled locally (OFL). Latin subset, woff2 only. Keep license files.
- License: MIT.
- Versions: pin every dependency to an exact version (no `^` or `~`), Biome included. Pin at scaffold time from `npm view <pkg> version`; do not guess versions. Confirm `vite-plugin-pwa` supports the chosen Vite major before installing.
- Planned, separate from the app: GitHub Actions running tests headless via Kiro CLI, a custom "Ears" MCP server (`decode_wav`, `measure_ber`, `simulate_channel`), and a separate Kiro Crew repo ("Base Station").

## Audio pipeline
- Capture with an `AudioWorklet`, not `ScriptProcessorNode` (deprecated, runs on the main thread, drops audio when the scope and animations are busy).
- Decode in a Web Worker that owns the ggwave WASM instances. Connect worklet to worker with a `MessageChannel` so audio never touches the main thread. Transfer `ArrayBuffer`s, don't copy.
- Do not use `SharedArrayBuffer`. It needs COOP/COEP headers, which GitHub Pages can't set.
- Run 3-4 decoder instances in parallel, offset by 256 samples. Measure CPU on a low-end phone before settling on the count.
- Create ggwave with the `AudioContext`'s actual `sampleRate` (44.1 or 48 kHz). Don't hardcode it and don't resample.
- The spectrogram and scope read an `AnalyserNode` on the main thread. Keep that separate from the decode path.
- `vendor/ggwave.js` (0.4.0, verified) is a UMD build with the WASM inlined as base64. It is one file with no separate `.wasm`, so there is nothing extra to precache. It loads in a classic worker via `importScripts()`, so the decode worker must be a classic worker, not a module worker. Don't edit the vendored file.
- The worklet, the decode worker and `vendor/ggwave.js` must all be in the service worker precache, or offline mode breaks. Verify with the built app (`npm run preview`), not `vite dev`.

## Byte budget
- ggwave's payload cap is exactly 140 bytes (verified on vendored 0.4.0). It counts bytes, not characters. Anything longer is silently truncated with no error.
- The app must reject over-length payloads before calling encode. Never rely on ggwave to report it. Count encoded bytes (UTF-8), not characters, in the UI length limit and the byte meter.
- Airtime is about 0.1 s per byte. A full 140-byte payload in DT_FASTEST takes 13.4 s. Every byte costs airtime.
- Encryption cost: the 12-byte IV plus 16-byte tag is 28 bytes, about 3 s extra per Call message. Sending the IV is what costs the extra 12 bytes (about 1.2 s), so the derived IV below matters.
- Budget per message: 140 - header and CRC trailer (12 bytes in a single frame: 10-byte header plus 2-byte CRC) - crypto overhead. With the derived IV only the 16-byte tag remains, so an encrypted single frame holds 140 - 12 - 16 = 112 bytes of text. Product copy rounds this to "~110 bytes of text per encrypted message", because the `crypto` spec may still change the tag length. The exact numbers (128 plaintext, 112 encrypted) come from `plaintextCapacity`.
- Encryption: AES-128-GCM. Relays hold no key, and TTL and hop count change in transit, so they must stay outside the authenticated data. Authenticate message ID and type as AAD.
- IV decision (preferred, to be specified in the `crypto` spec): derive the 12-byte IV from the 8-byte message ID plus a 4-byte frame index instead of transmitting it. That drops overhead to the 16-byte tag. Rules:
  - A message ID is random and never reused under the same key.
  - Relays re-broadcast the original ciphertext. They never re-encrypt.
  - Multi-frame messages use a different frame index per frame.
  - The spec must include the collision math for random 64-bit message IDs.
- Group key is 128 bits, which keeps the "key screech" short.

## Hard constraints
- No network calls at runtime. Everything works offline. Don't add fetch/XHR/CDN links or remote fonts. The service worker's own update check is the only exception.
- HTTPS only (mic and service worker need a secure origin). `localhost` is fine for dev.
- Audio and mic start only from a user tap (browser autoplay rules).
- Microphone must disable echoCancellation, noiseSuppression and autoGainControl.
- Listening only works in the foreground. The UI must say so, not imply background listening.
- Mic permission may reset (iOS). Handle re-asking.
- Quiet (ultrasound) mode needs a fallback hint, since some phones can't hear it.
- Keep the frame header small. Changes need a size justification in the spec.
- Reject payloads over 140 bytes before encode (see Byte budget).
- If deployed to GitHub Pages under a subpath, set Vite `base` and the PWA `scope`/`start_url` to match.
- Disclose pre-existing code (ggwave, fonts) in the README.

## Protocol findings
Channel rules (dual-tone for Call, audible for Room, ultrasound for Quiet, frame alignment, noise measurement, voice-note bitrates, no untested-channel claims) are in `field-findings.md`. It loads when editing protocol or audio code.

## Testing approach
- Tests live next to the code. `*.test.ts` for unit tests, `*.prop.test.ts` for property tests.
- Protocol code runs in Node under Vitest (`environment: node`, no DOM). Node has WebCrypto built in.
- Keep fast pure properties (relay, crypto, framing) separate from slow ones that call real ggwave WASM and a simulated channel. Use fewer runs for the slow ones.
- Print and keep the fast-check seed on failure so CI failures can be replayed.
- Property tests are expected for:
  - Round trip: `decode(encode(m)) == m` under every channel profile
  - Relay: re-broadcast is idempotent, hop count only increases, TTL always ends propagation
  - Crypto: right key opens, any other key fails
  - IVs never repeat: distinct (message ID, frame index) pairs always give distinct IVs
  - Length guard: any payload over 140 bytes is rejected before encode, and one at or under 140 bytes is accepted. Include multi-byte UTF-8 so character count and byte count differ.
  - Decode succeeds at every frame alignment
- Playwright e2e uses Chromium with a fake mic fed from a WAV file (`--use-fake-device-for-media-stream --use-file-for-fake-audio-capture`). WebKit and iOS audio can't be tested this way. Check those on real phones.

## Commands
These are the planned npm scripts. They do not exist until the project is scaffolded.

```
npm ci                 # install exact locked versions
npm run dev            # Vite dev server (localhost, mic allowed)
npm run dev:https      # dev over HTTPS for real phones (needs a local-cert plugin, pin it if added)
npm run build          # tsc --noEmit, then vite build
npm run preview        # serve the built app; use this to test the service worker and offline mode
npm run typecheck      # tsc --noEmit
npm run lint           # biome check
npm run format         # biome check --write
npm test               # vitest run (all unit and property tests)
npm run test:props     # vitest run on *.prop.test.ts only
npm run test:watch     # vitest in watch mode
npm run test:e2e       # playwright test
```

Shell note: on this Windows machine PowerShell blocks `npm.ps1`. Run `npm.cmd` or `npx.cmd` instead. Don't change the execution policy.

## Kiro conventions
- Spec-driven: one spec per feature (`frame-protocol`, `relay`, `crypto`, `channel-modes`, `ui-flows`, `base-station`) with EARS acceptance criteria.
- `.kiro/` must stay committed (not in `.gitignore`).
- Planned hooks: PBT on save in `src/protocol`, offline guard, byte-budget check, UI contrast check, journal entry in `docs/kiro-journal.md` on task completion.
- When the agent repeats a mistake, add a steering rule.
