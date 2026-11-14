---
inclusion: fileMatch
fileMatchPattern: ["src/protocol/**", "src/audio/**"]
---

# Field findings as rules

Source: `docs/FIELD-FINDINGS.md` (simulation plus real-phone tests, Nov 13). Read it before changing a channel profile. Stack and pipeline details live in `tech.md` (see "Audio pipeline" and "Byte budget"); this file only holds the channel rules.

## Channel rules
- **Call mode uses dual-tone (DT) only.** DT tones sit at ~1.1-2.6 kHz (measured 1,120-2,580 Hz), inside the voice band. It is the only family that survived every simulated narrowband channel. Default profile: DT fastest (~3 s for a 24-character message).
- **Audible is for Room mode only.** Its tones reach ~6.4 kHz, so it fails on any narrowband path.
- **Ultrasound is for Quiet mode only.** Short range. Nothing narrowband carries it. Some phones can't hear it, so Quiet needs a fallback hint.
- **Receivers must try several frame alignments.** Decoding depends on alignment: one Opus 32 kbps message decoded at only 1 of 4 offsets. Use parallel decoders offset by 256 samples. Decoder count and threading: `tech.md` "Audio pipeline".
- **Measure test noise against the transmitted level.** A channel simulator that adds noise at an absolute level gives wrong results. Express noise as a ratio to the transmit level.
- **Voice notes only work at low Opus bitrates.** Simulated: 12 and 16 kbps decode, 24 kbps mostly fails, 32 kbps fails. Real-phone voice notes worked. The cause (Opus switching to CELT above ~20 kbps) is a guess, not verified. Don't state it as fact.
- **Never claim walkie-talkie, radio or internet-call support.** All three are untested on real hardware. No Radio mode in the UI, copy, README or demo until it is tested. See `product.md`.

## Verification status
- Field-verified on real phones: room, mobile call, voice note.
- Simulation only: DT on walkie-talkie channels, G.711 phone-call model.
- Not covered by simulation: AMR/AMR-WB/EVS speech codecs, real speakers and mics, room acoustics, voice-note app noise suppression.

When a field test changes a finding, update `docs/FIELD-FINDINGS.md` first, then this file.
