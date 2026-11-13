# Product: Dial Tone

Offline-first PWA messenger that turns text into modem-style audio (data-over-sound). Verified on real phones: speaker to mic, mobile phone call, voice note. Walkie-talkie and radio are untested, so do not claim them in the app, copy or docs. Built for the Kiroween 2026 hackathon (category: Resurrection). Deadline: Dec 4, 2026, 2:00 PM PT.

Tagline: "The internet can be switched off. Sound can't."

## Audience and story
People hit by internet shutdowns or disasters (hurricanes, earthquakes, wildfires) where ordinary voice calls still work. Demo persona: Amara, a volunteer coordinator relaying a message between shelters.

## Core features (must have)
- Send/receive short text (~140 chars) via `ggwave` (MIT, WASM). Credit and disclose it.
- Live spectrogram and waveform; byte-by-byte decode visualization.
- Relay ("pass it on"): hop count, message IDs to dedupe, TTL to bound spread.
- End-to-end encryption with a shared group key (QR code or "key screech"). Relays can't read content.
- Channel modes: Room (audible, fastest), Call (dual-tone, fastest), Quiet (ultrasound, short range). No Radio mode is advertised until tested on real radios.
- Installable PWA, fully offline once loaded.

Should have: location pin, "I'm safe", SOS (repeating screech), tape mode (export .wav), multi-frame messages.

## Non-goals
No photos/files (bandwidth is 8-16 bytes/sec), no accounts or servers (local-first), no native iOS/Android app.

## Design direction: "Ghost in the Line" (approved Nov 13)
The app is a physical modem rendered with hardware-grade realism. It replaces the earlier dark "phosphor black" idea. Full detail: `docs/BRIEF.md` section 6.

- Source of truth: the Figma "Dial Tone" frame (390 px phone width), read via the Figma MCP. The prototype (BlueSkiez-dev/dial-tone-prototype) is a reference only. Rebuild from specs, don't copy its code.
- Material: frosted see-through "ghost" shell with the circuit board visible. Inside, a light screwed-down faceplate with grain texture and raised lettering. A beige 1996 variant is a token swap.
- Parts, each with a real job:
  - smoked-glass status window with six domed LEDs (MR, AA, CD, OH, RD, SD) and a modem result-code readout (OK, RING, CARRIER, CONNECT, NO CARRIER, ATDT)
  - rocker power switch (this is the tap that starts audio)
  - CRT scope behind curved glass
  - ridged three-way slide switch (Room, Call, Quiet)
  - recessed message well with a 24-segment byte meter and real airtime
  - Transmit keycap
  - hold-to-send SOS button with a progress ring
  - thermal-printer Tape showing the three latest slips, with See more
  - raised signal line that pulses up when sending and down when receiving
- Palette: light faceplate greys. Phosphor green (#7dffb2) inside the glass only. Green and amber LEDs. Red (#d9301f) reserved for SOS only.
- Type: Barlow Condensed (silkscreen labels), IBM Plex Sans (body), IBM Plex Mono (data and Tape). Bundle fonts locally, no remote fonts.
- Motion: power-on self-test (LED sweep, CRT warm-up), springy slide switch, slips print line by line. Respect reduced-motion.
- Signature visual: the scope, with decoded text resolving out of static. Each message leaves a shareable "voiceprint".
- Halloween flavor lives in copy and sound design only. UI stays usable.
- Accessibility: every sound event has a visual and haptic cue. Large tap targets for stress use.
- Do not use copyrighted music or third-party trademarks (including messaging, phone or radio logos).

## Related docs
- `docs/BRIEF.md`: full concept, scope, constraints, plan
- `docs/FIELD-FINDINGS.md`: channel test results that drive protocol choices
