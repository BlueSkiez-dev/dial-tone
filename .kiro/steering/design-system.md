---
inclusion: fileMatch
fileMatchPattern: ["src/ui/**", "src/**/*.tsx", "src/**/*.css"]
---

# Design system: "Ghost in the Line"

Source: Figma file `VDyiOLNBAavxsBHP15j1Sj` ("Dial Tone" variables, Components page `191:3`, States page `191:2`). Frame width 390 px. Direction and story: `product.md`. Re-read Figma when a value here looks wrong; this file is a snapshot taken from the file via the Figma MCP.

## Rules
- **Red is for SOS only.** Tokens `--sos`, `--sos-hi`, `--sos-lo`, `--sos-edge`, `--print-sos` appear only on the SOS button, the SOS slip band and the SOS ring. Warnings and errors, including "Too long", use amber (`--amber`, `--meter-warn`).
- **Phosphor green (`--phosphor`) appears only inside glass:** the status window readout, the scope, the group key display and check-word chips. LED lenses use `--green`. The raised signal line uses `--signal`.
- **Fonts are bundled locally.** No remote font URLs. Details and licenses: `tech.md` (Stack, Fonts). Bundle only the weights listed below.
- **Respect reduced motion.** Under `@media (prefers-reduced-motion: reduce)` drop the power-on LED sweep and CRT warm-up, the switch spring, line-by-line slip printing, the signal-line pulse, the ghost-text resolve and the sheet slide. Jump straight to the end state. Functional progress (SOS 2 s ring, Transmit airtime strip) still shows, without easing flourishes.
- Every sound event also has a visual and haptic cue. Tap targets stay large for stress use.
- Use tokens, not literal hex values. One literal has no token: `#040504` (LED bezel ring).

## Drawn in code (images in Figma)
- **Scope (CRT):** the Figma spectrogram is a PNG placeholder. Draw it live on a canvas from the analyser. Glass colors: `--screen`, `--scope-axis`, `--scope-band`, `--phosphor`.
- **Circuit board:** the frame "Circuit board (image, drawn in code)" sits under the frosted shell on every state. Draw it with SVG or canvas. The shell (frosted) is CSS blur over it.
- **Group code card QR:** the Figma code is an image. Generate the real code from the key (`dialtone:key?n=…&k=…`).
- Paper (Slip) and faceplate grain are PNG fills in Figma. Recreate with CSS or SVG noise, or save as local assets.
- Never hotlink Figma asset URLs. They expire after 7 days and break offline mode. Assets that stay as SVG (signal line, vias, icons) are downloaded and committed.

## Color tokens
CSS custom property names match Figma. Tokens not listed under "Mode-specific" have the same value in both modes (confirmed, including `--amber`, `--rocker-i` and `--latch-off`).

### Mode-specific (Ghost / Beige 96)
| Token | Ghost | Beige 96 |
|---|---|---|
| `--plate` | `#c4c5c7` | `#e1d8c3` |
| `--plate-hi` | `#d6d7d8` | `#eee7d7` |
| `--plate-lo` | `#aeafb2` | `#cbbfa5` |
| `--cap` | `#e7e8ea` | `#ede6d5` |
| `--cap-hi` | `#fdfdfd` | `#fcfaf3` |
| `--cap-lo` | `#d0d1d4` | `#d9cfb8` |
| `--ink` | `#1f2124` | `#1d1b16` |
| `--ink-2` | `#44474c` | `#554f41` |
| `--emboss` | `#a3a5a9` | `#c7bb9f` |
| `--shell` | `#e2e3e5` | `#e2dac8` |

### Same in both modes
| Group | Token | Value |
|---|---|---|
| Page background | `--bg-hi` | `#fbfbfa` |
| | `--bg` | `#ededeb` |
| | `--bg-lo` | `#e0e0dd` |
| Signals | `--green` | `#5cff7a` |
| | `--amber` | `#ffb21a` |
| | `--signal` | `#19c46f` |
| | `--meter-ok` | `#1f9d55` |
| | `--meter-warn` | `#df9410` |
| SOS | `--sos` | `#d9301f` |
| | `--sos-hi` | `#ff7562` |
| | `--sos-lo` | `#9e1e0e` |
| | `--sos-edge` | `#74160a` |
| | `--ink-on-sos` | `#ffffff` |
| Glass | `--glass` | `#0d0f0e` |
| | `--glass-hi` | `#1e2120` |
| | `--screen` | `#060807` |
| | `--phosphor` | `#7dffb2` |
| | `--ink-on-glass` | `#a3a9a3` |
| | `--ink-on-glass-strong` | `#dfe4de` |
| | `--ink-legend` | `#c3c8c2` |
| | `--scope-axis` | `#55735f` |
| | `--scope-band` | `#6b8d77` |
| Rocker, LEDs, latch | `--rocker` | `#18191b` |
| | `--rocker-i` | `#8c9095` |
| | `--rocker-o` | `#6d7176` |
| | `--led-label` | `#8e938e` |
| | `--led-label-on` | `#eef2ec` |
| | `--latch-off` | `#74787d` |
| | `--screw-slot` | `#565a5f` |
| Message well | `--well` | `#fafaf8` |
| | `--well-top` | `#efefed` |
| Keycap (dark) | `--key` | `#2a2c30` |
| | `--key-top` | `#3b3e42` |
| | `--key-bottom` | `#1e2023` |
| | `--key-edge` | `#0a0b0c` |
| | `--ink-on-key` | `#eef0ee` |
| | `--ink-on-key-dim` | `#9ea3a8` |
| Slip (paper) | `--paper` | `#fbfaf6` |
| | `--print` | `#1d1e21` |
| | `--print-meta` | `#55585c` |
| | `--print-hop` | `#127a43` |
| | `--print-sos` | `#c42b1c` |
| Sheet | `--scrim` | `#14161a`, used at 45% opacity |

## Type
Families: Barlow Condensed (silkscreen, keycaps, titles), IBM Plex Sans (body), IBM Plex Mono (data, readout, Tape). Sizes in px; tracking in px. "UC" means uppercase.

| Style (by use) | Family, weight | Size / line | Tracking |
|---|---|---|---|
| Device title ("Dial Tone") | Barlow Condensed Bold | 32 / 28.8 | 3.2, UC |
| Transmit keycap label | Barlow Condensed Bold | 20 / 20 | 4.4, UC |
| Channel switch label ("Room") | Barlow Condensed Bold | 17 / 18.7 | 2.38, UC |
| SOS label | Barlow Condensed Bold | 16 / 16 | 2.24 |
| Sheet title | Barlow Condensed Bold | 18 / 18 | 2.88, UC |
| Sheet kicker | Barlow Condensed Bold | 14 / 14 | 2.24, UC |
| Mini key label ("Key"); sheet LED legend | Barlow Condensed Bold | 12 / 12 (legend: normal) | 1.92, UC |
| Slip button ("Later") | Barlow Condensed Bold | 12.5 / 12.5 | 2, UC |
| Rocker "I" | Barlow Condensed Bold | 11 / 11 | 0 |
| LED label ("MR") | Barlow Condensed SemiBold | 11 / 11 | 1.98 |
| Silkscreen caption ("Power") | Barlow Condensed SemiBold | 11 / 11 | 2.2, UC |
| Scope band caption | Barlow Condensed SemiBold | 11 / normal | 1.76, UC |
| Message well text | IBM Plex Sans Regular | 17 / 23.8 | 0 |
| Mode description; empty-tape text | IBM Plex Sans Regular | 13 / 18.85, and 13 / 19.5 | 0 |
| Tagline | IBM Plex Sans Medium | 12 / 15.6 | 0 |
| Switch caption ("Speaker to mic") | IBM Plex Sans Regular | 11 / 14.3 | 0 |
| Slip note | IBM Plex Sans Regular | 12 / 17.4 | 0 |
| Sheet body | IBM Plex Sans Regular | 15 / 22.5 | 0 |
| Sheet button, "Install app" | IBM Plex Sans SemiBold | 15 / 22.5 | 0 |
| Sheet link ("Leave this group") | IBM Plex Sans SemiBold | 13 / normal | 0 |
| Readout code ("OK") | IBM Plex Mono SemiBold | 12 / 16.2 | 1.44 |
| Readout hint; key status | IBM Plex Mono Medium / Regular | 11.5 / 15.525 | 0 |
| Transmit sub-label ("ATDT · 2.2 s") | IBM Plex Mono Medium | 11 / normal | 0.66 |
| Airtime ("~2.2 s on air") | IBM Plex Mono Medium | 12 / normal | 0 |
| Scope axis ("8k") | IBM Plex Mono Regular | 10 / normal | 0 |
| Key title ("Open channel") | IBM Plex Mono SemiBold | 12.5 / 15 | 1.25, UC |
| Slip meta line | IBM Plex Mono SemiBold | 10.5 / 13.65 | 1.05, UC |
| Slip body | IBM Plex Mono Medium | 15 / 21.75 | 0 |
| Slip location text | IBM Plex Mono Regular | 12.5 / normal | 0 |
| SOS band ("*** SOS ***") | IBM Plex Mono Bold | 13 / 13 | 3.9 |
| SOS band, small | IBM Plex Mono Bold | 12 / 12 | 2.4 |
| Sheet fine print | IBM Plex Mono Regular | 9 and 9.5 / normal | 0 |
| Sheet group name | IBM Plex Mono SemiBold | 18 / normal | 1.44, UC |
| Check word ("YARROW") | IBM Plex Mono SemiBold | 13 / 13 | 1.3 |

Weights to bundle: Barlow Condensed 600, 700. IBM Plex Sans 400, 500, 600. IBM Plex Mono 400, 500, 600, 700.

## Radii (px)
`1`, `1.837`, `2`, `2.5`, `3`, `3.5`, `4`, `6`, `6.5`, `7`, `8`, `10`, `11`, `13`, `14`, `15`, `16`, `17`, `20`, `24` (app icon), `26`, `35`, `39`. Slip bottom edge is torn: teeth 10 wide, 5 deep.

## Shadows
Recipes as used in Figma. Roles are inferred from the shape of the value.

| Role | Value |
|---|---|
| Raised highlight (emboss, hairline) | `0 1px 0 rgba(255,255,255,.65)`, `0 .6px 0 rgba(255,255,255,.7)`, `0 1px 0 rgba(255,255,255,.75)` |
| Recessed (vent slots, wells, glass) | `inset 0 1px 1.5px rgba(0,0,0,.7)`, `inset 0 1px 2px rgba(0,0,0,.8)`, `inset 0 2px 7px rgba(0,0,0,.85)`, `inset 0 2px 5px rgba(0,0,0,.38)`, `inset 0 1px 3px rgba(0,0,0,.8)`, `inset 0 1px 1px rgba(0,0,0,.3)`, `inset 0 -1px 1px rgba(0,0,0,.35)` |
| Top edge light | `inset 0 1px 0 #fff`, `inset 0 1px 0 rgba(255,255,255,.2)` |
| Dark bezel ring | `0 0 0 1.5px #040504, 0 1px 0 2px rgba(255,255,255,.07)` |
| Green LED glow | `0 0 0 1.5px #040504, 0 0 10px 1px #5cff7a, 0 0 24px 0 rgba(92,255,122,.45)`; small: `0 0 6px #5cff7a` |
| Light keycap | `0 0 0 1.5px rgba(0,0,0,.16), 0 0 0 3px rgba(255,255,255,.5), 0 1px 1px rgba(0,0,0,.25)` |
| Keycap lift | `0 0 0 1px rgba(0,0,0,.13), 0 2px 0 rgba(0,0,0,.2), 0 4px 7px -3px rgba(0,0,0,.3)`; sheet: `0 0 0 1px rgba(0,0,0,.13), 0 3px 0 rgba(0,0,0,.2), 0 6px 10px -4px rgba(0,0,0,.3)` |
| Dark keycap lift | `0 0 0 1px var(--key-edge), 0 3px 0 var(--key-edge), 0 8px 14px -6px rgba(0,0,0,.55)` |
| SOS cap | `0 3px 0 var(--sos-edge), 0 7px 10px rgba(0,0,0,.5)` |
| Meter segment glow (Over) | `0 0 4px rgba(255,178,26,.55)` (`--amber` at 55%) |
| Slip | `0 1px 1px rgba(0,0,0,.2), 0 5px 7px rgba(0,0,0,.08)` |
| Sheet | `0 0 0 1px rgba(0,0,0,.08), 0 -12px 40px rgba(0,0,0,.28)` |

Sheet scrim: `--scrim` at 45% with `backdrop-filter: blur(3px)`. Panel hairline border `rgba(255,255,255,.07)`.

## Spacing and layout
- Page 390 wide. Device 370 (10 px side margin, 16 px top). Faceplate 340 wide, inset 15 px sides and 17 px top inside the device. Standard component width 304.
- Gaps seen: 2, 4, 6, 7, 8, 10, 12, 14, 16. Default grid gap is 8.
- Padding seen: 4, 6, 7, 9, 12, 14, 16, 17. Most used: horizontal `4` and `14`, vertical `4`.
- App icon 92 px, radius 24.

## Component inventory
Component sets on the Components page, with variants. Build each as a Preact component in `src/ui/`.

| Component | Variants | Notes |
|---|---|---|
| Rocker | State: On, Off | Power switch. The tap that starts audio. On: the "I" glows green. |
| LED | State: On, Off × Color: Green, Amber | Domed lens. Green: MR ready, AA listening, RD received, SD sending. Amber: CD carrier, OH call mode. Label lights with the lens. |
| Status window | State: Off, Ready, Sending, Received | Smoked glass, six LEDs, result-code readout (OK, RING, CARRIER, CONNECT, NO CARRIER, ATDT, ATZ, ERROR) plus a plain-language hint. |
| Channel switch | Position: Room, Call, Quiet | Slide switch. Thumb springs between positions. Arrow keys move it. Room = audible fastest, Call = dual-tone fastest (1.1-2.6 kHz), Quiet = ultrasound. |
| Message well | Meter: Normal, Over | Recessed field, 24-segment byte meter (segments 6 px tall, radius 1, unlit `rgba(0,0,0,.09)`) and real encoder airtime. Counts UTF-8 bytes. Lit segments are `--meter-ok`, switching to `--meter-warn` from 80%. Over: all 24 segments `--amber` with a 4 px amber glow, the byte count in bold `--ink`, the label "Too long", Transmit disabled. Never red. |
| Transmit key | State: Default, Sending, Disabled | Sub-label shows ATDT and airtime. Sending: label stays lit, light strip fills for the airtime. Disabled when off, empty, too long or busy. |
| SOS button | State: Default, Holding, Disabled | Hold to send, in a recessed collar. Holding: cap pressed, red ring fills over 2 s. Early release cancels. |
| Listen latch | State: Listening, Off, No mic, Disabled | Latching button with indicator light. No mic means microphone denied. Disabled means powered off. |
| Slip | Type: Sent, Heard, Relayed, SOS, System notice, Update ready, Locked, Locked (no key), Location, I'm safe | Thermal slip on the Tape. Meta line: direction, hop, mode, time, passed-on count. Heard slips have "Pass it on → hop N". SOS slips print a red band. Figma names the no-key variant `Type=Type=Locked, no key`. |
| Sheet | Type: Onboarding 1, 2, 3, Microphone, Key open, Key create, Key share, Key join, Key offer, Install | Screwed sub-panel that slides over a 45% scrim with 3 px blur. Grip, two screws, kicker, title, body, two-button row (light secondary, dark primary). |
| Group key bar | State: Open, Locked | Glass key display plus Key/Share mini key. Open: grey open padlock, "Open channel · Anyone nearby can read". Locked: phosphor closed padlock, group name, four check words. |
| Quick keys | none | Mini keys under the message well. "I'm safe" prefixes the message with "✓ I'm safe." "Location" inserts GPS coordinates (works offline). |
| Notice | Type: Install | Raised caution plate with an amber LED. Optional mini key. |
| Check words | none | Four words from the group key, on glass chips in phosphor. Must match on both phones before joining. |
| Group code card | none | Paper card with the scannable code and the group name. |
| App icon | none | 92 px, radius 24. Frosted shell, screwed plate, embossed wave. |

## State table
Sixteen states on the States page. "n/s" means the Figma note does not say.

| # | State | LEDs | Readout | Controls and other |
|---|---|---|---|---|
| 01 | Off | All dark | `— — —` | Transmit, SOS and Listen disabled. Scope shows faint static. |
| 02 | Self-test (~0.6 s) | All six lit | `ATZ` | n/s. Scope warms up from one bright line. |
| 03 | Ready (empty tape) | MR, AA | `OK`, "Listening" | Tape: "No paper yet". Group key open. |
| 04 | Sending | SD | `ATDT` + airtime | Key reads Sending and its strip fills. Pulse runs up the signal line. Real spectrogram. |
| 05 | Hearing a signal | CD (amber) | `CARRIER` | Shown after 2.5 s of quiet when energy enters the band. |
| 06 | Message received | RD | `CONNECT` | Decoded text resolves out of static (ghost moment). Slip prints. Pulse runs down. |
| 07 | SOS held | n/s | n/s | SOS cap pressed. Red ring fills over 2 s. Early release cancels. |
| 08 | SOS received (Call mode) | OH | n/s | Slip has a red `*** SOS ***` band. |
| 09 | Call mode | OH (amber) | n/s | Switch on Call. Band 1.1-2.6 kHz marked on the scope. |
| 10 | Quiet mode | n/s | n/s | Scope range 12-20 kHz, band 15-19.5 kHz. Amber notice about older phones. |
| 11 | Message too long | n/s | n/s | Meter amber (all 24 segments, 4 px glow), byte count in bold `--ink`, label "Too long", Transmit disabled. Note says over 134 bytes. |
| 12 | Microphone off | AA dark | n/s | Listen disabled, label "No mic". Sending still works. |
| 13 | Not listening | AA dark | `NO CARRIER` | Listen latch released. |
| 14 | Tape expanded | n/s | n/s | All slips shown. Button reads "Show less". |
| 15 | Light legend open | n/s | n/s | Opened by tapping the LEDs. |
| 16 | Beige case | n/s | n/s | Same layout, variables in Beige 96 mode. |

## Open issues
- **Meter limit.** Figma says "over 134 bytes". The real limit comes from the frame spec and `tech.md` Byte budget (140-byte cap minus header and crypto overhead). Don't hardcode 134.
- **Type, radii, shadows and spacing coverage.** Read from the State 03 faceplate, the Slip set, the Sheet set and the Message well only. Other components may add values.
- Role names for shadows and some type styles are inferred from sample text and shape.
