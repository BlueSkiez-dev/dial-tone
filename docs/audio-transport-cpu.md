# Audio transport: decoder CPU measurement

**Status: PENDING. No number in this file has been measured.** The tooling exists, but nobody has run it on a real phone yet. Audio-transport task 13.2 stays unticked in `.kiro/specs/audio-transport/tasks.md` until the user runs the measurement and fills in the tables below. Until then the receive scope stays `"all"` (`RX_LISTEN_SCOPE` in `src/audio/profiles.ts`) and the decoder count stays 4 (`DECODER_OFFSETS` in `src/audio/phase-chunker.ts`).

Requirements: ui-shell 17.8, audio-transport 1.9, 1.10, 1.11, 4.1, 4.5, 4.7.

## Tooling

Open the built app with `?cpu=1`, for example `https://<host>/dial-tone/?cpu=1`. Use the built app (`npm run build`, then `npm run preview`, or the deployed Pages build). `vite dev` serves the worker differently and gives wrong timings.

- Without the flag nothing is recorded, no overlay is loaded and no channel is opened.
- With the flag the page passes `cpu: true` in the decode worker's `init` message. The worker then times each incoming chunk (rate adapter plus all decoders) with `performance.now()` and posts a report about once a second on a `BroadcastChannel` named `dial-tone-cpu`. A small text overlay at the bottom left of the page shows the latest report, and the same text goes to the console as `[cpu]`.
- The timing code only reads clocks. It does not change what the decoders receive or return.
- The overlay shows: sample rate, receive scope, decoder count, chunk count, the chunk period (1024 samples at the context rate, which is the budget), busy time per chunk (median, 95th percentile, max, share of the period), resampler time per chunk (median, 95th percentile), chunks over budget, chunks dropped by the worker queue (`overrun`), `decoderHits` per offset, startup time, and the heap size of each ggwave module when the browser exposes it.
- Median and 95th percentile cover the newest 4096 chunks (about 87 s at 48 kHz). The chunk count, over-budget count and dropped count cover the whole run.
- Heap size is read from the ggwave module object by duck typing. If the overlay shows `n/a`, read it from the browser instead (Chrome: `chrome://inspect` memory, or the task manager; Safari: Web Inspector memory timeline).
- Busy time is wall-clock time inside the worker. On a throttled or thermally limited phone it includes the slowdown, which is what we want.
- The overlay and report code: `src/audio/cpu-probe.ts`, `src/audio/cpu-debug.ts`, `src/ui/cpu-overlay.ts`.

## Plan

Run on one mid-range phone, foreground tab, screen on, battery saver off, charger state noted. Play `tests/fixtures/call-known-frame.wav` (or a looped message) from a second device near the microphone, so the decoders have real signal to work on. Also run a quiet-room pass with no signal for the idle cost. Let each configuration run for at least 2 minutes before reading the numbers.

1. **Main case: 4 decoders x 5 protocols, scope `"all"`.** This is the shipped default. Record the full result block.
2. **1, 2, 3 and 4 decoders, scope `"all"`.** Change `DECODER_OFFSETS` in `src/audio/phase-chunker.ts` to the first N of `[0, 256, 512, 768]`, rebuild, and measure each. More than 4 offsets cannot be chosen without a third ggwave module (a module holds at most 4 live instances).
3. **Same counts with the active family only, scope `"active"`.** Set `RX_LISTEN_SCOPE` to `"active"` in `src/audio/profiles.ts`, rebuild and measure 1 to 4 decoders. Restore `"all"` afterwards unless the decision below says otherwise.
4. **Resampler cost on a 44.1 kHz device.** On a device whose `AudioContext` runs at 44,100 Hz (the overlay shows the rate), measure the main case. Compare resampler plus decoders against the decoders alone on a 48 kHz device. The overlay's resample line is the resampler's own share.
5. **Memory and startup.** With two modules loaded (decode and encode), record the heap size of each and the startup time. Compare the worker footprint of about 120 MB with the Node baseline in the audio-transport `design.md`: decode module 88.3 MB with 4 decoders, encode module 31.1 MB idle.
6. **6 protocols.** Repeat the main case with 6 protocols if the Quiet retry speed changes to FAST (design open question 2), because that adds `ULTRASOUND_FAST` to the receive set. Not needed while the retry speed stays as it is.

### Decision rule

If scope `"all"` is too slow, meaning busy time per chunk exceeds the budget (the chunk period) or `overrun` events appear, set `RX_LISTEN_SCOPE` to `"active"` in `profiles.ts`, record why in the decision section below (device, sample rate, decoders, protocols, busy time per chunk and the budget that was exceeded), then choose the decoder count and set `DECODER_OFFSETS` to match. If no mid-range phone is available, leave the scope at `"all"` and the count at 4, and keep this document marked pending.

## Results

Leave a cell empty until it has been measured. Do not copy numbers from the Node tests or from the simulation.

### Test device

| Field | Value |
|---|---|
| Phone model | |
| OS and browser version | |
| `AudioContext` sample rate (Hz) | |
| Chunk period (ms, 1024 samples at that rate) | |
| Budget used (ms) | |
| Date | |
| Signal source (fixture, second device) | |
| Battery saver, charger | |

### Busy time per chunk

| Scope | Decoders | Protocols | Rate (Hz) | Median (ms) | p95 (ms) | Max (ms) | Over budget | Dropped (`overrun`) | `decoderHits` per offset |
|---|---|---|---|---|---|---|---|---|---|
| all | 4 | 5 | | | | | | | |
| all | 3 | 5 | | | | | | | |
| all | 2 | 5 | | | | | | | |
| all | 1 | 5 | | | | | | | |
| active | 4 | | | | | | | | |
| active | 3 | | | | | | | | |
| active | 2 | | | | | | | | |
| active | 1 | | | | | | | | |

### Resampler cost (44.1 kHz device)

| Device | Rate (Hz) | Decoders | Decoders alone, 48 kHz: median / p95 (ms) | Resampler plus decoders: median / p95 (ms) | Resampler alone: median / p95 (ms) |
|---|---|---|---|---|---|
| | 44100 | | | | |

### Memory and startup

| Module | Heap (MB) | Node baseline (MB) |
|---|---|---|
| Decode (4 decoders) | | 88.3 |
| Encode (idle) | | 31.1 |
| Worker footprint total | | about 120 |

| Startup time with two modules (ms) | |
|---|---|
| | |

### 6 protocols (only if the Quiet retry speed changes to FAST)

| Decoders | Median (ms) | p95 (ms) | Over budget | Dropped |
|---|---|---|---|---|
| 4 | | | | |

### Decision

| Field | Value |
|---|---|
| Receive scope chosen (`"all"` or `"active"`) | pending, default `"all"` |
| Decoder count chosen | pending, default 4 |
| Why (device, rate, decoders, protocols, busy time per chunk, budget exceeded) | |
| Audio-transport task 13.2 ticked | no |
