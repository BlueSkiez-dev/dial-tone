# Tech

Status: the repo has no application code yet (only `docs/`, `LICENSE`, `.kiro/`). Framework, bundler and test runner are not chosen. Confirm with the user and update this file once they are set. Do not assume a stack.

## Known stack
- Platform: single installable, offline-first PWA (HTTPS only). No native app.
- Modem: `ggwave` v0.4.0 (WASM, MIT, Reed-Solomon). Vendored in the earlier spike. Keep its license file and credit it.
- Crypto: libsodium (mentioned in the brief as a disclosed dependency).
- Audio: Web Audio API / `getUserMedia`.
- License: MIT.
- Planned: property-based testing (e.g. fast-check if JS/TS), GitHub Actions running tests headless via Kiro CLI, a custom "Ears" MCP server (`decode_wav`, `measure_ber`, `simulate_channel`), and a separate Kiro Crew app repo ("Base Station").

## Hard constraints
- No network calls at runtime. Everything works offline. Don't add fetch/XHR/CDN links or remote fonts.
- Audio and mic start only from a user tap (browser autoplay rules).
- Microphone must disable echoCancellation, noiseSuppression and autoGainControl.
- Listening only works in the foreground. The UI must say so, not imply background listening.
- Mic permission may reset (iOS). Handle re-asking.
- Quiet (ultrasound) mode needs a fallback hint, since some phones can't hear it.
- Keep the frame header small. Changes need a size justification in the spec (byte-budget rule).
- Dependencies: pin exact versions. Disclose any pre-existing code in the README.

## Protocol findings that shape code
- Dual-tone (~1.1-2.6 kHz) is the only protocol that survived simulated narrowband channels. Field-verified for mobile calls only. Use it for Call mode.
- Audible (up to ~6.4 kHz) is for Room only. Ultrasound is for Quiet only.
- Decoding depends on frame alignment. Run 3-4 decoders in parallel, offset by 256 samples.
- Voice notes work at low Opus bitrates (12-16 kbps) and fail at higher ones.
- Measure noise against the transmit level.

## Testing approach
Property-based tests are expected for:
- Round trip: `decode(encode(m)) == m` under every channel profile
- Relay: re-broadcast is idempotent, hop count only increases, TTL always ends propagation
- Crypto: right key opens, any other key fails
- Decode succeeds at every frame alignment

## Commands
None exist yet. Add install, dev, build, test and lint commands here after scaffolding.

The earlier spike was served with: `npx http-server@14.1.1 <dir> -p 5173` (localhost allows the mic; phones need HTTPS).

## Kiro conventions
- Spec-driven: one spec per feature (`frame-protocol`, `relay`, `crypto`, `channel-modes`, `ui-flows`, `base-station`) with EARS acceptance criteria.
- `.kiro/` must stay committed (not in `.gitignore`).
- Planned hooks: PBT on save in `/protocol`, offline guard, byte-budget check, UI contrast check, journal entry in `docs/kiro-journal.md` on task completion.
- When the agent repeats a mistake, add a steering rule.
