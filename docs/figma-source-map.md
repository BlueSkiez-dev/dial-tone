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
