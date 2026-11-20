# Figma source map

Figma file `VDyiOLNBAavxsBHP15j1Sj` ("Dial Tone"). Read through the Figma MCP (`get_metadata`, `get_design_context`, `download_assets`). This is the index for the Design QA task. Sizes are in px, from the Components page.

Status values: **build** (in the ui-shell spec), **component only** (component built, never printed by the live app), **deferred** (not built in this spec).

## States page (`191:2`), 390 px wide

Each state frame is `Page > Device (370 wide) > (Circuit board, Shell (frosted), Faceplate)`. The Faceplate is 340 wide.

| # | Frame | Node id | Gallery name | Status |
|---|---|---|---|---|
| 01 | Off | `271:2` | `off` | build |
| 02 | Self-test | `272:2` | `selftest` | build |
| 03 | Ready (empty tape) | `273:2` | `ready` | build |
| 04 | Sending | `274:2` | `sending` | build |
| 05 | Hearing a signal | `275:2` | `hearing` | build |
| 06 | Message received | `276:2` | `received` | build |
| 07 | SOS being held | `277:2` | `sos-held` | build |
| 08 | SOS received | `278:2` | `sos-received` | build |
| 09 | Call mode | `279:2` | `call` | build |
| 10 | Quiet mode | `280:2` | `quiet` | build |
| 11 | Message too long | `281:2` | `too-long` | build |
| 12 | Microphone off | `282:2` | `mic-off` | build |
| 13 | Not listening | `283:2` | `not-listening` | build |
| 14 | Tape expanded | `284:2` | `tape-expanded` | build |
| 15 | Light legend open | `285:2` | `legend` | build |
| 16 | Beige case | `286:2` | `beige` | build |

State 03 frame: 390 x 1302 (Page 390 x 1302.57). Device 370 x 1246.57 at (10, 16). Faceplate 340 x 1212.57 at (15, 17).

## Components page (`191:3`)

| Component | Node id | Size | Variants (node id) | Status |
|---|---|---|---|---|
| Rocker | `213:13` | 40 x 54 per variant | On `213:7`, Off `213:12` | build |
| LED | `213:40` | 44.33 x 39 (lens 12 high, label 11) | On/Green `213:21`, Off/Green `213:27`, On/Amber `213:33`, Off/Amber `213:39` | build |
| Status window | `213:195` | 304 x 113 | Off `213:80`, Ready `213:118`, Sending `213:156`, Received `213:194` | build |
| Channel switch | `213:252` | 304 x 69.99 (thumb 60 high) | Room `213:215`, Call `213:233`, Quiet `213:251` | build |
| Message well | `213:319` | 304 x 123.39 | Normal `213:286`, Over `213:318` | build |
| Transmit key | `213:343` | 210 x 72 | Default `213:327`, Sending `213:334`, Disabled `213:342` | build |
| SOS button | `213:377` | 78 x 95 (cap 78, label 11, gap 6) | Default `213:355`, Holding `213:366`, Disabled `213:376` | build |
| Listen latch | `213:413` | 304 x 26 | Listening `213:388`, Off `213:396`, No mic `213:404`, Disabled `213:412` | build |
| Slip | `213:481` | 280 wide (heights below) | Sent `213:428`, Heard `213:444`, Relayed `213:459`, SOS `213:480`, System notice `270:444`, Update ready `270:462`, Locked `270:477`, Locked no key `270:540` (named `Type=Type=Locked, no key`), Location `270:569`, I'm safe `270:589` | Sent, Heard, System notice, Update ready: build. Relayed, SOS: component only. Locked, Locked no key, Location, I'm safe: component only (see note) |
| Sheet | `270:345` | 390 wide (heights below) | Onboarding 1 `270:41`, 2 `270:79`, 3 `270:127`, Microphone `270:155`, Key open `270:179`, Key create `270:205`, Key share `270:244`, Key join `270:269`, Key offer `270:302`, Install `270:344` | Onboarding 1-3, Microphone, Install: build. Key open to Key offer: **deferred** (crypto spec) |
| Group key bar | `270:376` | Open 304 x 54, Locked 304 x 66.05 | Open `270:361`, Locked `270:375` | **deferred** |
| Quick keys | `270:389` | 304 x 40 | none | **deferred** |
| Notice | `270:401` | 304 x 58 | Install `270:400` | build |
| Check words | `270:413` | 346 x 36 | none | **deferred** |
| Group code card | `270:421` | 346 x 268 | none | **deferred** |
| App icon | `270:433` | 92 x 92, radius 24 | none | build (PNG files in `public/art/`) |

Slip heights: Sent 113.15, Heard 156.65, Relayed 169.30, SOS 177.65, System notice 173.30, Update ready 178.40, Locked 173.30, Locked no key 220.99, Location 216.99, I'm safe 158.90. The bottom edge is torn (10 px teeth, 5 px deep).

Sheet heights: Onboarding 1 484, Onboarding 2 479, Onboarding 3 471, Microphone 361, Key open 308, Key create 294, Key share 594, Key join 263, Key offer 344, Install 421.

Note: the Slip variants Relayed, SOS, Locked, Locked no key, Location and I'm safe are built as components (so the gallery can show State 08), but the live app never prints them in this spec.

## Reserved slots on the State 03 faceplate

The faceplate keeps three slots whose content is deferred. The layout must reserve their height so later specs can fill them without moving the rest. Heights from State 03 (`273:2`, Faceplate `273:8`):

| Slot | Node id | Height | Detail |
|---|---|---|---|
| Group key bar | `273:129` "Group key" | 76 | Label row 22 + Key bar `273:133` 54 (Key display `273:134` 54, Key button `273:146` 54). Top 625.68. Fixed Open state in this spec is not built: reserve the slot. |
| Quick keys | `273:188` "Quick messages" | 40 | Quick key / I'm safe `273:189` 40, Quick key / Location `273:193` 40. |
| SOS | `273:208` "SOS" (inside Actions `273:218`) | 95 | Button 78 + label 11 + gap 6 (grid rows 78 + 11, gap 6). The Actions row `273:198` is 95 high. |

The Message block `273:149` is a grid of 22 (label row) + 123.39 (well) + 40 (quick keys) + 101 (actions row) at top 721.68. Other fixed heights on the faceplate: Header 71 (Wordmark 50.39), Status window 113 at top 117, Scope 198 at top 250 (Screen 184), Channel 137.68 at top 468, Tape header 132.5 at top 1052.07, Listen latch 22 and button 26.

## Main screen spacing (Figma_Main)

Read with `get_metadata` and `get_design_context` on State 03 (`273:2`, Faceplate `273:8`). Figma_Main `0:1` (`182:2`) is a flat import with no separate nodes for these parts, so the State 03 frames are the measured source. Positions are relative to the Message grid `273:149` (top 721.68 in the faceplate).

| Part | Node id | y | Height | Bottom |
|---|---|---|---|---|
| Message well | `273:155` | 30.00 | 123.39 | 153.39 |
| Quick messages (slot) | `273:188` | 161.39 | 40 | 201.39 |
| Actions row | `273:218` | 209.39 | 101 | 310.39 |
| Transmit key | `273:199` (in Container `273:198`, y 6) | 226.89 | 72 | 298.89 |
| Tape header | `273:219` | 1052.07 in the faceplate (Message ends at 1032.07) | 132.5 | |

The Message grid has `gap: 8px` and rows 22 / 123.39 / 40 / 101. Transmit sits 11.5 px below the top of the 95 px Container, which starts 6 px below the top of the Actions row, so Transmit is centred on the SOS slot.

Gaps with the slots present (measured): well to Transmit 226.89 - 153.39 = **73.5 px** (8 + 40 + 8 + 6 + 11.5). Transmit to Tape 11.5 + 20 = **31.5 px**.

Gaps with the three Reserved_Slots collapsed (derived, Figma never shows this layout): the quick keys slot and its grid gap leave, and the 6 px Actions padding and 11.5 px centring offset exist only to centre Transmit on the SOS slot, so they leave too. What remains between visible neighbours is the Message grid gap and the faceplate part gap.
- Well to Transmit (`273:155` to `273:199`): **8 px**, the Message grid gap (nearest gap between visible neighbours, also label to well and well to quick keys).
- Transmit to Tape (`273:199` to `273:219`): **20 px**, the faceplate part gap between the Message block and the Tape header.

Build: `.actions-row { margin-top: 8px }`, `.slot-quick-keys:not(.slot-empty) { margin-top: 8px }` and no `.part-tape` margin override (the 20 px faceplate rule applies). With the slots mounted the layout gives 73.5 px and 31.5 px, equal to the measured Figma gaps.

Caption row to well (task 9.8, requirement 21.25), read with `get_metadata` on `273:149`:

| Part | Node id | y | Height | Bottom |
|---|---|---|---|---|
| MESSAGE caption row ("Label row") | `273:150` | 0 | 22 | 22 |
| Message well | `273:155` | 30.00 | 123.39 | 153.39 |

Caption-to-well gap: 30 - 22 = **8 px**, the Message grid gap. Build: `.part-well { margin-top: 8px }` (the well carries it, no slot is involved). The byte count `273:153`/`182:134` stays at y 5.5 to 16.5 in the caption row, so it now sits 13.5 px above the well top (`.byte-meter-count-row { bottom: calc(100% + 13.5px) }`).

## New screens page (`219:2`)

| Screen | Node id | Gallery name | Status |
|---|---|---|---|
| 01 Onboarding 1, Sound | `242:2` | `onboarding-1` | build |
| 02 Onboarding 2, Listens while open | `244:2` | `onboarding-2` | build |
| 03 Onboarding 3, Install | `245:2` | `onboarding-3` | build |
| 04 First power-on notice | `246:2` | `first-power` | build |
| 05 Microphone denied | `247:2` | `mic-denied` | build |
| 06 Microphone reset | `248:2` | `mic-reset` | build |
| 07 to 13 Group key, locked messages | `249:2` to `255:2` | not built | **deferred** (crypto spec) |
| 14 I'm safe and Location | `256:2` | not built | **deferred** (quick keys) |
| 15 Install sheet | `257:2` | `install-sheet` | build |
| 16 Install notice | `258:2` | `install-notice` | build |
| 17 Update ready slip | `259:2` | `update-ready` | build |

## Deferred items

- Sheet variants Key open, Key create, Key share, Key join, Key offer (`270:179`, `270:205`, `270:244`, `270:269`, `270:302`)
- Group key bar (`270:376`)
- Quick keys (`270:389`)
- Check words (`270:413`)
- Group code card (`270:421`)
- New screens 07 to 14 (`249:2` to `256:2`)

## Downloaded assets (`public/art/`)

Saved once from asset URLs (State 03 `get_design_context`, `download_assets` on `270:433` and `213:444`). No code references a Figma URL; the URLs expire after 7 days.

| File | Source | Notes |
|---|---|---|
| `signal-line.svg` | State 03 "Signal line" `273:11` | Raised signal line. |
| `signal-line-vias.svg` | State 03 "Signal line vias" `273:12` | Vias. |
| `icon-padlock-open.svg` | Group key bar icon (18 x 18, stroke `#8E938E`) | For the deferred key bar. |
| `icon-check.svg` | Quick key "I'm safe" icon (14 x 14, stroke `#1F2124`) | For the deferred quick keys. |
| `icon-pin.svg` | Quick key "Location" icon (14 x 14, stroke `#1F2124`) | For the deferred quick keys. |
| `sos-ring.svg` | SOS collar ring (78 x 78) | Progress ring base. |
| `app-icon-wave.svg` | App icon "embossed wave" (44 x 44) | Vector of the wave only. |
| `faceplate-grain.png` | Faceplate fill (180 x 180 tile, 5% black noise, shown at 50 px) | Faceplate grain texture. |
| `paper-grain.png` | Slip paper fill (180 x 180 tile, 5% black noise) | Paper grain texture. |
| `icon-192.png`, `icon-512.png` | App icon `270:433` | 192 and 512 px, rounded corners, transparent outside. |
| `icon-512-maskable.png` | App icon `270:433` | Icon at 72% on `#e7e8ea`, inside the maskable safe zone. |
| `apple-touch-icon-180.png` | App icon `270:433` | 180 px on `#e7e8ea`, rounded icon. |

The PNG app icons are made from a 4x Figma export of `270:433` (shadow and background cropped away, rounded mask radius 24/92 applied), because Figma exports no PNG at those sizes.

Not downloaded: the spectrogram PNG (`f98ac`) is a design placeholder; the app draws the real spectrogram. The circuit board is drawn in code.

## Chassis details (Figma_Main)

Figma_Main is the page `0:1` ("Main"), frame "Dial Tone" `182:2` (390 x 1671). Chassis `182:4` is 370 x 1615.02 at (10, 16). Faceplate `182:8` is 340 x 1581.02 at (15, 17) inside it. The page is a flat import: only the parts below are separate nodes. Positions are relative to the parent named in each row. Read with `get_metadata` and `get_design_context`, and checked against a `get_screenshot` of `182:2`.

| Detail | Node id | Parent | Position and size | Built as |
|---|---|---|---|---|
| Corner screw, top left | `182:296` | Faceplate | box (6.79, 6.79) 15.419 x 15.419, screw 13 px, rotate 12 | `CornerScrews`, `Screw` |
| Corner screw, top right | `182:299` | Faceplate | box (316.33, 5.33) 18.34 x 18.34, rotate 41 | same |
| Corner screw, bottom left | `182:302` | Faceplate | box (5.98, 1557.99) 17.046 x 17.046, rotate 67 | same |
| Corner screw, bottom right | `182:305` | Faceplate | box (316.92, 1557.93) 17.164 x 17.164, rotate 24 | same |
| Screw slot bars | `182:297`/`182:298` (and the same pairs in each screw) | Screw | 7 x 2, left 3, top 5.5; second bar turned 90 degrees (2 x 7 at left 5.5, top 3); fill `--screw-slot`, shadow `0 .6px 0 rgba(255,255,255,.7)` | `.chassis-screw::before/::after` |
| POWER label | `182:40` (box), `182:41` (text "Power") | Power container `182:32` | 38.32 x 11, centred under the rocker, 6 px below it; Barlow Condensed SemiBold 11/11, tracking 2.2, uppercase, `--ink-2` | `PowerLabel`, `.power-slot` gap 6 |
| Faceplate title | `182:25`, `182:26` | Header `182:16` | "Dial Tone", Barlow Condensed Bold 32/28.8, tracking 3.2, uppercase, Figma fill `#a3a5a9` (`--emboss`). The build uses the fill Token `--title-fill` (alias of `--ink-2`, task 9.9), because `--emboss` reached only 1.43:1 (Ghost) and 1.34:1 (Beige 96) on `--plate`. The darker fill and the two-line deboss shadow are the approved exception (requirement 21.6) | `.wordmark h1` with `--title-fill` and `--shadow-title-deboss` |
| Side rail: mounting hole (dimple) | in the raster `182:5` (no node) | Chassis | centre (361.5, 30% of height), radius 3.6, stroke 1.3 px. Measured on the `182:5` screenshot (task 9.9): centre (361.1, 484.0 of 1615 = 29.97%), stroke-centre radius 3.5 | `SideRail`, `.chassis-rail-dimple`, drawn above `.device-shell` |
| Side rail: slot | in the raster `182:5` (no node) | Chassis | path rect (358, 34% of height), 7 x 78, radius 3.5, stroke 1.3 px (outer box 8.3 x 79.3). Measured on the `182:5` screenshot (task 9.9): stroke centres x 357.7 to 364.6, y 548.7 to 626.5 (top 33.98%, 77.8 high) | `.chassis-rail-slot`, drawn above `.device-shell` |
| Bottom grille | in the raster `182:5` (no node) | Chassis | 18 slots, each 5 x 8, 9 px apart (gap 4), first slot at x = 105, y = height - 12 (4 px above the bottom edge) | `BottomGrille` |
| Channel key grille ticks | none in Figma_Main | Channel key | 7 ticks, 4 px apart, strip 26 x 5, 7 px below the top of the key, centred (value taken from the Prototype_Reference, see below) | `GrilleTicks`, inside `.channel-thumb` |
| Sheet screw, left | `270:3` (Onboarding 1 `270:41`) | Sheet | box (10.79, 8.99) 15.419, rotate 12; built 12 px from the left, 10.2 px from the top | `Screw` in `Sheet.tsx` |
| Sheet screw, right | `270:6` (Onboarding 1 `270:41`) | Sheet | box (362.33, 7.53) 18.34, rotate 41; built 12 px from the right, 10.2 px from the top | same |

Screw ids in the other Sheets (all named "Screw", 13 px, rotate 12 and 41): Onboarding 2 `270:43`, `270:46`. Onboarding 3 `270:81`, `270:84`. Microphone `270:129`, `270:132`. Install `270:304`, `270:307`. Node `270:136` is not a screw. In the Microphone sheet `270:155` it is the content Container (x 22, y 33, 346 x 303) that holds the kicker. The metadata for Onboarding 2, 3, Microphone and Install lists the screw boxes at x 13.49 and 370.86, while the code of `270:41` has 10.79 and 362.33. The build follows the code of `270:41`, which matches the Prototype_Reference (`.sheet .screw` 12 px from each side).

Screw face (Figma `182:296` and `270:3`): radial gradient centred at (4.94, 3.9) px with radius 12.156 px, stops `#fff` 0%, `#dcdde0` 35%, `#bcbdc1` 67.5%, `#9b9da2` 100%. Shadows: `0 0 0 1.5px rgba(0,0,0,.16), 0 0 0 3px rgba(255,255,255,.5), 0 1px 1px rgba(0,0,0,.25)` and inset `0 -1px 1px rgba(0,0,0,.35)`. These are `--screw-face`, `--shadow-keycap-light` and `--shadow-recess-7`.

Values taken from the Prototype_Reference (`../dial-tone/prototype/index.html`), because Figma_Main holds them only as pixels of the raster `182:5`:

| Value | Prototype line | Received by |
|---|---|---|
| Side rail slot `rr(W-12, H*0.34, 7, 78, 3.5)`, hole `arc(W-8.5, H*0.3, 3.6)`, stroke 1.3 px, `rgba(46,48,52,.32)` | `drawPCB`, lines 517 to 520 | `.chassis-rail-slot`, `.chassis-rail-dimple`, `--board-ink-rail` |
| Header pins: 18, x = W/2 - 80 + 9i, y = H - 12, 5 x 8, `rgba(46,48,52,.2)` | `drawPCB`, line 513 | `.chassis-bottom-grille`, `--board-ink-pin` |
| Grille ticks: strip 26 x 5 at top 7, repeating 90deg gradient `rgba(0,0,0,.22) 0 1px, rgba(255,255,255,.9) 1px 2px, transparent 2px 4px` | `.thumb::before`, line 154 | `GrilleTicks`, `--grille-dark`, `--grille-light` |

The side rail and bottom grille positions were checked on the Figma screenshot of `182:2` (slot 77 px high, hole centre and pins at the same offsets). The grille ticks are not visible on the Room key in that screenshot, and the code of `182:107` has no tick layer, so they are not in Figma_Main. See the open item in the task result.

Side rail re-check (task 9.9, requirements 21.8 and 21.27): the `get_screenshot` of `182:5` shows the rail (a ring and a rounded slot on the right edge, 1.3 px strokes), so the rail stays and the "visible" branch applies. The geometry above was already within 1 px of the screenshot. The rail had been drawn inside `.device-board`, under the shell's 6 px backdrop blur, so in the browser the strokes were erased (dimple centre and stroke differed by about 0 grey levels). It is now a sibling after `.device-shell`, and only the dimple and the slot are drawn. The dashed vertical traces next to the rail in `182:5` belong to the raster board (circuit board crop, requirement 21.23), not to the Side_Rail.

Scope band lines (requirement 21.12, read in task 9.11): every scope in the file has a "Band lines" frame with two rectangles, "Band edge · high" and "Band edge · low", 290 x 1.5, no stroke, one solid fill bound to the variable `light/led-amber` (`VariableID:211:40`, collection "Dial Tone", rgb(255, 178, 26) in Ghost (clear) and Beige 96, the value of `--amber`) at fill opacity 0.6. Frames read: Figma_Main `308:101` (rectangles `308:102`, `308:103`), States `308:2` to `308:47` (State 01 `308:2` to State 16 `308:47`, every third id), New screens `308:50` to `308:98` (Screen 01 to Screen 17), 34 frames and 68 rectangles, none differing. The Components page has no Scope component and no band rectangle. The app follows Figma: `--scope-band: color-mix(in srgb, var(--amber) 60%, transparent)` and `--scope-band-weight: 1.5px`, the same in Ghost and Beige 96, with `--scope-band-caption` (`#6b8d77`) for the caption. Each line is a 1.5 px high filled box (`height` plus `background`, no border), the drawing method the user approved in task 9.10, because Chromium snaps border widths down to whole device pixels. Rendered values read by `e2e/chassis.spec.ts`, off and on: background colour `color(srgb 1 0.698039 0.101961 / 0.6)` (rgb(255, 178, 26) at alpha 0.6), height 1.5px.

## Message well count and divider (Figma_Main, task 9.6)

Read with `get_metadata` of `213:286` and `get_design_context` of `182:8`, checked on a `get_screenshot` of the Section `182:130` (304 x 275 at 316 px). Positions are relative to the parent in the row.

| Detail | Node id | Parent | Position and size | Built as |
|---|---|---|---|---|
| Message caption row | `182:131` | Section `182:130` | 304 x 22, padding 0 4, items centred | `.message-block > .silk-label` (22 px high, centred) |
| Byte count "41 / 128 B" | `182:134` (box), `182:135` (text) | caption row | right edge 4 px in from the row edge, y 5.5 to 16.5 (11 px), Barlow Condensed SemiBold 11, tracking 2.2, uppercase, `--ink-2` | `.byte-meter-count-row` (`right: 4px`, `bottom: calc(100% + 5.5px)` of the well) |
| Well text field | `182:138` | well `182:136` | 304 x 91.39, padding 14 14 6 | `.message-well-field` |
| Byte meter row | `182:140` (`213:258`) | well | y 91.39, 304 x 32, padding 4 14 12, gap 12 | `.byte-meter` |
| Segments | `182:141` (`213:259`) | meter row | (14, 9), 170 x 6 in Normal, 206 x 6 in Over | `.byte-meter-segments` |
| Airtime | `182:166` (`213:284`) | meter row | (196, 4), 94 x 16, Plex Mono Medium 12. In Over, "Too long" (`213:316`) at (232, 4), 58 x 16 | `.byte-meter-airtime`, `.byte-meter-label` |
| Divider line | none | | Figma_Main has no divider node in the well. The only 1 px lines are the status window rule `182:76` and the Details rule `182:267`, both elsewhere | none drawn |

The Playwright check in `e2e/chassis.spec.ts` ("message well") compares these boxes with a 1 px tolerance. The count is compared against the Message block top, which is the caption row top.

Title deboss (requirement 21.6, approved exception): Figma `182:26` has the fill only. The shadow comes from the Prototype_Reference line 109, see `docs/ui-design-qa.md`.
