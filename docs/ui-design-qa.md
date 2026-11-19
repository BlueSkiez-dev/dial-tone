# UI design QA (ui-shell task 7.1)

Method: Figma screenshots from the MCP `get_screenshot` (file `VDyiOLNBAavxsBHP15j1Sj`), and Playwright screenshots of `?state=<name>` at 390 px width from `npm run dev`. Compared by eye. No pixel diff. The second pass also read node properties with `get_design_context` for the nodes listed below. Sizes that say "measured" come from screenshots; sizes that say "node" come from Figma properties.

## What was and was not compared

**Compared side by side (viewed and judged):** all 16 States (01 to 16) and the New screens 01 to 06, 15, 16, 17. The earlier pass covered 03, 06, 08, 09, 10, 11, New 01, 02, 15. The second pass (this one) viewed Figma and app screenshots for 01, 02, 04, 05, 07, 12, 13, 14, 15, 16, New 03, 04, 05, 06, 16, 17.

**Node properties read (get_design_context):** Sheet Microphone 270:155 (title 26 px, kicker 11 px, button size), Slip Update ready 270:462, Slip Relayed 213:459, Slip I'm safe 270:589. Sizes in the app were measured in the browser (getBoundingClientRect) for the Sheets, the SOS button, quick keys, group key bar, Transmit key, and the two slips.

**Not compared:** the Onboarding 1 and 2 node properties (only screenshots), animation (self-test sweep, warm-up, slip printing, ghost text), real-device rendering, and pixel differences (no pixel diff was run). State 02 and 04 to 06 frames in Figma are single frames of an animation; the app screenshots are taken 1.5 s after load, so LED sweep and warm-up cannot be matched frame by frame. The Slip variants Locked, Locked no key and Location were not compared (no gallery state, not printed by the live app). Sheet variants Key open to Key offer, Group key bar Locked, Check words and Group code card are deferred to the crypto spec.
## Rows

| State | Figma | Result | Fix or reason left |
|---|---|---|---|
| 01 Off `271:2` | `off` | Differences: readout hint was "Power is off.", Figma "Flip the power switch to start" (fixed); scope axis showed five ticks (6, 4, 2, 0, top label hidden), Figma shows three: "8k", "4k", "Hz" (fixed, see Scope below); Figma scope has a "STANDBY" tag top right, app has none; Figma frame shows the full content (group key bar, quick keys, SOS, long empty-tape text) dimmed, app keeps the slots empty. | Hint and axis fixed. **Resolved (decision 6):** STANDBY tag added on the scope while off (top 8, right 8, Barlow Condensed SemiBold 11, `--scope-band`, as node `271:98`). Slots and tape text as in State 03. |
| 02 Self-test `272:2` | `selftest` | Differences: hint "Self-test." vs Figma "Self-test…" (fixed). The app screenshot catches the warm-up mid-animation (scope bright green, OH amber mid sweep); Figma shows the end of the warm-up (dark scope with one green line, MR AA RD SD green, CD amber, OH off). | Hint fixed. Animation frames not comparable by screenshot; not checked. |
| 03 Ready `273:2` | `ready` | Differences: no CHANNEL and MESSAGE captions (fixed); no printer slit above the tape (fixed); status hint is longer than Figma's "Ready. Listening for messages."; scope caption read "ROOM BAND" instead of "ROOM · 1.9-6.4 KHZ" (fixed); empty tape text is "No paper yet", Figma has a longer sentence; Figma shows the group key bar, quick keys and SOS, the live-app slots stay empty by design; Figma puts the count "41 / 128 B" in the Message caption row as well as next to the meter, the app has it only next to the meter; the Figma fixture shows airtime "~2.2 s", the gallery has no transport so it shows "— s". | Fixed what is listed as fixed. Hint kept: it says the app listens only while open (tech.md rule). **Resolved (decision 3):** empty tape text is now Figma's sentence (node `271:230`): "No paper yet. Messages you send and hear print here, and anything you hear can be passed on to the next phone." Updated in `copy.ts`, `Slip.test.ts`, `e2e/gallery.spec.ts`. Slots kept empty: ui-shell design. |
| 04 Sending `274:2` | `sending` | Differences: Figma lights MR, **AA**, SD, the app lights MR, SD; Figma shows the channel switch at full strength, the app dims it while sending (it is disabled, e2e tests rely on it); Figma shows "Sending · 2.2 s" in the readout, the app shows "ATDT · 4.3 s" plus a longer hint that wraps to two lines (gallery fixture airtime and hint text); Figma shows a live spectrogram and a Sent slip, the gallery has no transport and no slip; Figma Transmit label "Sending" with the strip about 40% full, the app strip is about 10% full (fixture time). | **Resolved (decision 1):** AA is lit while sending (MR, AA, SD). Rest left: fixture content, not a layout difference. |
| 05 Hearing `275:2` | `hearing` | Differences: Figma lights MR, **AA**, CD, the app lights MR, CD; hint "Hearing a signal…" with an ellipsis (fixed); Figma shows spectrogram activity and a Sent slip, the gallery shows neither. | **Resolved (decision 1):** AA lit (MR, AA, CD). Hint fixed. |
| 06 Received `276:2` | `received` | Differences: Figma lights MR, **AA** and RD, the app lights MR and RD; Figma shows decoded text resolving on the scope, the gallery scope is static; readout hint "Message received" has no full stop in Figma; Figma tape slips overlapped the latch row in the app (fixed with the printer slit and a gap). | **Resolved (decision 1):** AA lit (MR, AA, RD); requirement 8.3, design, status table and e2e rows updated. Ghost text left: not part of the gallery fixture. |
| 07 SOS held `277:2` | `sos-held` | Differences: Transmit sat at the top of the Actions row, Figma centres it on the 95 px SOS slot (fixed, `.part-transmit`); quick key labels were 14 px, Figma 12 px (fixed, `QuickKeys.css`); the readout while holding says `ATDT` and "Keep holding to send SOS…" in Figma, the app shows the normal `OK` row; red ring fills about 60% in both (looked equal). Measured: SOS 78 x 95, cap 78, key bar 304 x 54, quick keys 98.6 and 104.9 x 40 (Figma 98 and 104 x 40), Transmit 210 x 72, Actions row 101. All equal to the node sizes. | **Resolved for the gallery (decision 5):** the `sos-held` fixture shows `ATDT` with "Keep holding to send SOS…" and MR, AA lit (Figma LEDs). Only the gallery does this (`Screen.tsx`, `sosRing > 0`); the live readout comes with the SOS spec. |
| 08 SOS received `278:2` | `sos-received` | Differences: SOS cap had no "SOS" text and the label read "SOS" (Figma: "SOS" in the cap, "HOLD 2 S" below) (fixed); quick keys stretched to half width each, Figma hugs the content (about 98 and 104 wide) (fixed); the gallery prints the SOS slip above the Tape, not inside it, so "No paper yet" shows under it; the slip's body text and the "Pass it on" button are missing in the gallery fixture; group key bar looks the right size but the caption "GROUP KEY" is missing. | Slip placement and missing text left: the fixture is a gallery stand-in and the e2e test expects 0 slips on the Tape. GROUP KEY caption left: it belongs to the deferred crypto spec. |
| 09 Call `279:2` | `call` | Scope window was 0 to 4 kHz with axis 3,2,1,0. Figma State 09 axis reads 8k, 4k, Hz, so the window is 0 to 8 kHz. Caption now "CALL · 1.1-2.6 KHZ". | Fixed: `scope-map.ts` call window 0 to 8000. This closes the earlier unverified Call window item. |
| 10 Quiet `280:2` | `quiet` | Window 12 to 20 kHz matches Figma (axis 20k, 16k, Hz). Caption and notice say 15-19.4 kHz, Figma says 15-19.5 kHz. Notice text matches. | Kept 19.4: the measured band (`PROFILES.quiet.carrierBandHz` is 15000 to 19400). Design open question 5. |
| 11 Too long `281:2` | `too-long` | 24 of 24 segments lit, amber, label "Too long", bold count, Transmit disabled, no red. Figma header reads "158 / 128 B" so the limit label says 128 in both. Differences: Figma status readout says "Message is too long to send. Shorten it."; the app readout shows the normal Ready hint. | **Resolved (decision 2):** the `OK` row shows "Message is too long to send. Shorten it." while the draft is over the limit (hint key `too-long`). |
| 12 Mic off `282:2` | `mic-off` | Differences: Figma readout is `OK` with "Ready to send. Microphone is off, so you can't hear messages."; the app shows `NO CARRIER` with "No microphone. You can still send."; latch "No mic" and AA dark match. | **Resolved (decision 4):** no microphone reads `OK` with Figma's hint; the e2e rows (also `mic-denied`, `mic-reset`), requirement 8.3, design and tests follow. |
| 13 Not listening `283:2` | `not-listening` | Matches (MR only, `NO CARRIER`, latch "Listen"). Hint was "Not listening. Press Listen.", Figma "Not listening. Press Listen to hear messages." (fixed). | Fixed. |
| 14 Tape expanded `284:2` | `tape-expanded` | Structure matches: five slips 280 wide with torn edges, "Show less" key at the bottom. Differences: Figma "Show less" has a small caret; the gallery slips are placeholders ("Message 1" to "Message 5", all Heard) where Figma shows Sent, Heard, hop 2, SOS with Pass it on buttons. | **Resolved (decision 6):** caret added as an `aria-hidden` SVG chevron (12 px, gap 8) after "Show less"; the button name is unchanged. Fixture text left: gallery stand-in. |
| 15 Legend `285:2` | `legend` | Matches in structure: two columns, MR CD RD left and AA OH SD right, same meanings. Differences: the divider above the legend is dotted in the app and a plain hairline in Figma; the readout hint is longer in the app. | Left: hairline style is a 1 px detail, not changed. |
| 16 Beige `286:2` | `beige` | Palette matches (tan faceplate, cream keys, dark glass). The Figma frame shows a received message with three slips and "See 1 more", the app fixture is the empty ready screen. Layout is identical to Ghost (checked by the e2e beige test). | Fixture content left. |
| New 01 Onboarding 1 `242:2` | `onboarding-1` | Differences: art panel sat under the body, Figma puts it between the title and the body (fixed); title was 18 px, Figma about 22 px with wider tracking, so it wraps like Figma (fixed); button labels were Plex Sans mixed case, Figma is condensed caps (fixed); Figma art is two phone outlines with a wave and labels YOU and ANY PHONE, the app has text only; Figma's last line "No internet, no accounts, no servers." is bold and body size, the app has it as small grey fine print; Figma shows three page dots under the buttons, the app has none; Figma screws are larger and drawn with a slot. | **Resolved (decision 8):** the glass panel now holds the two phones and the wave (`public/art/sheet-onboarding-1.svg`, from nodes `270:18` and `270:22`), with YOU and ANY PHONE as text placed as in Figma; the last line is SemiBold ink at body size (`.sheet-strong`); three page dots under the buttons (lit green lamp on step 1). Sheet height 483.6 against 484. Screws: now 13 px, rotated and slotted (task 9.2, nodes `270:3` and `270:6`). |
| New 02 Onboarding 2 `244:2` | `onboarding-2` | Same sheet differences as 01 (art order, title, buttons fixed; microphone drawing, page dots left). | **Resolved (decision 8):** microphone drawing and the green AA lamp (`public/art/sheet-onboarding-2.svg`, nodes `270:58`, `270:61`), AA and "SCREEN ON = LISTENING" as text, page dots (step 2). The last line "Your phone asks for permission..." is body size (15 px), not the small note (node `270:68`). Sheet height 478.8 against 479. Screws now 13 px, rotated and slotted (task 9.2). |
| New 03 Onboarding 3 `245:2` | `onboarding-3` | Differences: the two install steps ("Open the browser menu (the three dots)", "Choose Install app or Add to Home screen") were missing (fixed, reuses the Install sheet copy); kicker was 14 px bold, Figma says 11 px SemiBold tracking 2.2 (fixed; the kicker sits inside the content container `270:136`, which is neither the kicker text node nor a screw); title was 22 px, node `270:139` says 26 px / 27.3, tracking 2.08 (fixed; Mic reset now wraps to two lines like Figma); button gap 12 and height 48, node says gap 10 and 52 (fixed). Page dots now drawn (step 3). Sheet height was 415 px, Figma 471 px. | **Resolved (decision 8):** page dots; spacing now follows the node tree (content starts 33 px down, 10 px between blocks, 16 px after the art slot, 18 px before the buttons, 24 px at the bottom, list items 10 px apart). Height 471.1 against 471. Screws now 13 px, rotated and slotted (task 9.2). |
| New 04 First power-on `246:2` | `first-power` | Difference: Figma prints the dark "Dial Tone · Listening while open" system slip on the Tape. The gallery fixture has an empty tape ("No paper yet"). The slip itself exists and prints in the live app (reducer, first power-on). The system slip paper in Figma is plain grey (the Slip description says "striped paper", but the nodes carry no stripe layer), the app used the light paper. | **Resolved (decision 7):** `first-power` prints the "Listening while open" system slip on the Tape, on the grey system paper (Decision 7 as updated: grey paper plus grain, no stripe, ink 4.51:1; see Update ready). `beige` carries the same slip so the beige test still compares like with like. The e2e table has 1 slip for both, and `gallery.test.ts` checks the two Tapes are equal. |
| New 05 Mic denied `247:2` | `mic-denied` | Differences: the app adds the line "The browser blocked the microphone." above the body (written by the implementer, Figma has none); sheet is 382 px high, node says 361. Kicker, title and button sizes fixed as above. Figma shows the readout `OK` behind the sheet (see State 12). | Extra line left: it tells the user the cause (requirement text). Kept. |
| New 06 Mic reset `248:2` | `mic-reset` | Differences: title was "Microphone is off", Figma "Microphone access was reset" (fixed); body was two paragraphs, Figma has one: "Your phone forgot the permission. iPhones do this after a while. Allow it again to keep hearing messages." (fixed in `SheetContent.tsx` and `sheet-copy.ts`; `Sheet.test.ts` assertion updated to the new text). After the fix the screenshot matches Figma in title wrap, body and button positions. Sheet is 399 px high, the Figma screenshot shows about 411 px. | Fixed. 12 px height gap not traced. |
| New 15 Install sheet `257:2` | `install-sheet` | After fixes it matches Figma in order and spacing: title, app icon on the plate without a glass panel, body, list. Differences: the app adds an "iPhone: tap Share..." line that Figma's frame does not show; Figma's two list items are spaced further apart; screws. | Icon panel and order fixed. iPhone line kept (iOS needs it; requirement text). |
| New 16 Install notice `258:2` | `install-notice` | Difference: the Notice sat above the Tape header and crowded it, Figma puts it below the Tape, after the empty-tape text (fixed in `Screen.tsx`, 16 px gap in `Notice.css`). Plate, amber LED, text and INSTALL key look the same. | Fixed. |
| New 17 Update ready `259:2` | `update-ready` | Differences: Figma paper is the dark striped system paper, the app uses the light paper; Figma shows the Sent slip under it, the gallery has only the update slip. Text, meta line, Later and Restart now buttons match (node `270:462`: 280 wide, buttons 7 px radius, 12.5 px labels). | **Resolved (decision 7, updated in task 9.4):** system slips (first power-on, Update ready, and the notice keys unsupported, mic-again, listening-open) use CSS-only grey paper: `--paper-system` `#7c7d7f` plus the paper grain, and nothing else. The stripe first added by Decision 7 is removed (`--paper-system-stripe` deleted), because the Figma file has no stripe layer: the paper vectors `261:9` and `246:231` have only the grain tile as a fill and Figma draws the empty base as `#7c7d7f`. The ink is `--print-system` `#121314`: 4.51:1 on the paper (the old `--print` `#1d1e21` gave 4.05:1), in Ghost and in Beige 96 (Beige overrides neither Token). Slip height 179 against 178.4. |

## Component sizes (node properties against the app)

| Component | Figma node | App | Result |
|---|---|---|---|
| Slip Relayed `213:459` | 280 x 169.3, meta block 39.3, Pass it on row 43.5 | 280 x 172.3, meta block was 42.3 (the empty line-break element added a 3 px row gap) | Fixed with `margin-top: -3px` on `.slip-meta-break`. Not re-measured after the fix. |
| Slip I'm safe `270:589` | 280 x 158.9, stamp 96 x 20, no padding above the text | 280 x 165.9, stamp 94.8 x 18, text had 9 px padding above | Fixed: stamp padding and text padding in `Slip.css`. Not re-measured after the fix; the sums match 158.9 on paper. Stamp width stays 94.8 (text width differs by about 1 px). |
| Sheet `270:345` Microphone | 390 x 361 | denied 372.8, reset 390.1 | Still taller. Figma ends the body with an empty 11 px paragraph plus 10 px padding that is not copied (it would add 21 px of blank space), and the app adds the cause line on "denied". Left. |
| Sheet Onboarding 1, 2, 3, Install | 484, 479, 471, 421 | 483.6, 478.8, 471.1, 453.3 | Onboarding 1 to 3 match. Install is 32 px taller: the iPhone line the app adds (22.5 px plus 10 px gap). With that line removed it is 420.8. Onboarding 3 and Install now hold the app icon in the 132 px slot on the plate (no glass), as Figma 270:316. |
| SOS `213:377` | 78 x 95 | 78 x 95, cap 78 | Matches. |
| Quick keys `270:389` | 304 x 40 | 304 x 40, keys 98.6 and 104.9 wide | Matches (font size fixed to 12 px). |
| Group key bar `270:376` Open | 304 x 54 in a 76 px slot | 304 x 54 in 76 | Matches. The "GROUP KEY" caption row is still missing (crypto spec). |
| Transmit key `213:343` | 210 x 72 | 210 x 72 | Matches. |
| Scope axis | "8k", "4k", "Hz" (Quiet: "20k", "16k", "Hz") | five ticks, top label clipped | Fixed: three labels, the top label is now inside the glass. |

## Measured segment counts (gallery, `?state=`)

| State | Lit segments | Colour |
|---|---|---|
| 03 ready (41 of 128 B) | 8 | `--meter-ok` (the Figma frame also shows 8 green) |
| 04 sending (same draft) | 8 | `--meter-ok` |
| 11 too-long (158 of 128 B in Figma, 140 in the gallery draft) | 24 | `--amber` |

Segment counts came from `.byte-meter-segment` elements that are not `data-color="off"`; the e2e gallery test asserts the same values (8 and 24) and passes. The glow and bold ink I checked by eye, not by computed style.

## Fixes applied in `src/ui`

- `Device.tsx`, `device.css`, `copy.ts`: CHANNEL and MESSAGE silkscreen captions.
- `Tape.tsx`, `Tape.css`: printer slit above the slips and the empty text.
- `SosButton.tsx`, `SosButton.css`: "SOS" in the cap, label "Hold 2 s".
- `QuickKeys.css`: keys hug their content.
- `scope-map.ts`: Call window 0 to 8 kHz. `Screen.tsx`: scope caption "NAME · lo-hi kHz" from the measured band.
- `Sheet.tsx`, `Sheet.css`, `SheetContent.tsx`: art above body, plain icon art, condensed caps buttons.
- Decisions 7 and 8: `tokens.css` (`--paper-system`, `--paper-system-stripe` (removed in task 9.4), `--dot-off`, `--shadow-glass-ring`, `--glass-gloss`; the new rgba values live here, so the per-file rgba pins in `scan.test.ts` are unchanged); `Slip.css` (system paper); `model/gallery.ts`, `gallery.test.ts`, `e2e/gallery.spec.ts`, `e2e/reachability.spec.ts` (first-power and beige carry the system slip); `Sheet.tsx`, `Sheet.css`, `SheetContent.tsx` (art before body in the DOM, page dots, glass panel with ring and gloss, Figma spacing, `.sheet-strong`, top corners 30 px); new `public/art/sheet-onboarding-1.svg` and `sheet-onboarding-2.svg` (both in the service worker precache, checked in `dist/sw.js`).
- Second pass: `Scope.tsx`, `scope.css` (three axis labels, top label visible); `copy.ts` (hints for off, selftest, carrier, latch-off); `Sheet.css` (kicker 11 px, title 26 px, button height 52 and gap 10); `SheetContent.tsx`, `sheet-copy.ts` (install steps on Onboarding 3, own title and body for Mic reset); `Sheet.test.ts` (reset assertion follows the new text); `Screen.tsx`, `Notice.css` (notice below the Tape); `device.css` (Transmit centred on the SOS slot); `QuickKeys.css` (12 px labels); `Slip.css` (Relayed meta height, I'm safe stamp and text spacing).

## Strings written by the implementer (not from Figma), for review

- Slot names: "Group key (reserved)", "Quick messages (reserved)", "SOS (reserved)"; "Circuit board"; tape label "Tape"; "Show less".
- Status hints: "Power is off.", "Self-test.", "Cannot send. Power off and on again.", "Could not send. Try again.", "Sending. Keep this phone near.", "Message received.", "Hearing a signal.", "Ready. Listens only while the app is open and the screen is on.", "Listening, but this phone may filter the sound. Signals can be missed.", "Listening stopped. Screen is off.", "Not listening. Press Listen.", "No microphone. You can still send."
- Status lights label: "Status lights. Tap for the light legend."; Rocker label "Power".
- Notices: "Cannot show this" and its text; "Microphone" / "The microphone stopped again. Sending still works."
- Scope caption format "Room · 1.9-6.4 kHz" is built from the profile, not copied (Figma's text matches for Room and Call).
- Sheet and channel strings in `sheet-copy.ts` and `channel-copy.ts` were not re-audited in this pass.

## Open items for the user

1. ~~AA LED~~ Resolved: lit whenever listening is active, in every powered-on row.
2. ~~Too-long hint~~ Resolved.
3. ~~Empty tape text~~ Resolved (Figma sentence).
4. ~~Sheet artwork, page dots, bold last line of Onboarding 1~~ Resolved (decision 8). Screws are now 13 px, rotated and slotted (task 9.2).
5. ~~Mic off readout~~ Resolved: `OK` with the Figma hint.
6. ~~SOS held readout~~ Resolved in the gallery only. The live SOS readout waits for the SOS spec.
7. ~~STANDBY tag and Show less caret~~ Resolved.
8. ~~System slip paper~~ Resolved (decision 7): grey CSS paper on every system slip, `first-power` and `beige` print the slip. The stripe was removed in task 9.4 and the ink `--print-system` is `#121314` (4.51:1 on `#7c7d7f`, was 4.05:1 with `--print` `#1d1e21`). The Install notice is a caution plate (New 16), not a slip, so it keeps its plate; there is no Install key among the notice slips.
9. Not compared: animation frames (self-test, warm-up, printing), Slip Locked, Locked no key and Location, real-device rendering, pixel differences. The Relayed and I'm safe heights were fixed from node numbers but not re-measured in the browser.

## Main screen against Figma_Main (task 9.5, requirements 21.16 to 21.19)

Method: Figma `get_screenshot` of `0:1` (the Main page; its one frame is `182:2`, 390 x 1671, a received-message state), `271:2` (State 01 Off) and `273:2` (State 03 Ready). Figma_Main holds one state only, so the off and on-with-draft states are paired with the matching State frames. Playwright (Chromium, 390 x 844, `npm run dev`, real controls: Skip onboarding, rocker, self-test wait, typing in the Message well) saved `app-off.png`, `app-on.png` and `app-draft.png` next to the Figma PNGs in `test-results/qa-shots` (git-ignored, not committed; `npm run test:e2e` wipes that folder). Compared by eye, no pixel diff. The dev build shows a "Fake transport (dev only)" badge that is not part of the design.

| State | Figma node | Differences found | Fix or reason left |
|---|---|---|---|
| Off | `271:2` (and `182:2` for header, status window and chassis) | Corner screws, POWER label, rail, dimple and bottom grille match in position and look. The rocker has an amber ring in the app (the first-use rocker hint after onboarding), Figma has none. Figma draws the Room band lines on the dark scope while off; the app now draws them too (task 9.6, requirement 21.20). The title deboss is the Prototype_Reference two-line shadow, an approved exception (requirement 21.6), not a difference. Figma shows the dimmed full content (group key bar, quick keys, SOS); the app collapses the reserved slots (requirement 21.1). The circuit board shows less around the shell than the Figma raster `182:5`. | Rocker ring kept: it tells a new user to tap it. Band lines while off: fixed in task 9.6 (`--scope-band`, faint static and STANDBY kept). Collapsed slots: by requirement. Board: known difference left unchanged (requirement 21.23).|
| On (after the self-test) | `273:2` (`182:2` for status window and scope) | OK row and MR, AA lit match. The band line is amber and solid in `--scope-band`, caption "ROOM · 1.9-6.4 KHZ" as in Figma; the app scope has a darker left gutter behind the axis labels where Figma has none. Figma ends with an empty Tape; the live app prints the "Dial Tone · Listening while open" system slip on first power-on (grey paper, no stripe). The hint is longer than Figma's. The group key bar, quick keys and SOS are collapsed in the app. | System slip: first-power flow. Hint kept (State 03 row above). Gutter: open item 3. |
| On with a draft | `273:2` and `182:2` (Message well, Transmit key) | Figma puts "41 / 128 B" in the MESSAGE caption row and the meter and airtime row inside the well. The app had the count next to the meter. Figma_Main has no divider line between text and meter, and the app draws none (checked in the browser: no border, rule or separator in the well). Transmit is full width in the app (SOS slot collapsed), 210 wide in Figma. The textarea shows a dark focus ring. The QA draft differs from Figma's ("39 / 128 B", about 5.1 s). | Count moved to the caption row in task 9.6 (requirement 21.21), the meter row now matches 213:258. Full-width Transmit: requirement 21.2. Focus ring is the focus cue, kept. |

No difference under requirement 21 needed a change in `src/ui` in this pass: tasks 9.1 to 9.4 had already built the chassis details, the scope band, the warm-up and the system slip.

### Known items carried from earlier tasks

- Grille ticks, the side rail and the bottom grille are not Figma nodes. Figma_Main draws the rail and grille in the raster board `182:5`, and the ticks do not appear at all. Their values were read from the Prototype_Reference and the rail and grille were checked on the Figma screenshot.
- `270:136` is not a screw. It is the content container (it holds the kicker) of the Onboarding 3 and Microphone sheets. The real Sheet screws are `270:3` and `270:6` (Onboarding 1), `270:43` and `270:46`, `270:81` and `270:84`, `270:129` and `270:132`, `270:304` and `270:307`. The New 03 row now says so.
- Figma's own system slip ink fails 4.5:1 on its paper, so the Token `--print-system` (`#121314`, 4.51:1) was added instead of using Figma's value.
- `--scope-band` is `#6a4c0e`, and `--scope-band-caption` (`#6b8d77`) was added for the caption text. The band line is drawn solid.

### Screw and stripe notes (updated)

Sheet screws are 13 px, rotated and slotted, and the chassis corner screws match their Figma boxes (task 9.2). Earlier "10 px screws" notes are replaced above. The Decision 7 stripe is gone (New 04 and New 17 rows).

### Prototype_Reference: values read, nothing copied

`../dial-tone/prototype/index.html` was used only to read CSS values. Figma wins wherever it has a value.

| Value | Prototype location | Received by |
|---|---|---|
| Side rail slot `rr(W-12, H*0.34, 7, 78, 3.5)`, dimple `arc(W-8.5, H*0.3, 3.6)`, stroke 1.3 px, `rgba(46,48,52,.32)` | `drawPCB`, lines 517 to 520 | `.chassis-rail-slot`, `.chassis-rail-dimple`, `--board-ink-rail` |
| Bottom grille: 18 slots 5 x 8, 9 px apart, x = W/2 - 80 + 9i, y = H - 12, `rgba(46,48,52,.2)` | `drawPCB`, line 513 | `.chassis-bottom-grille`, `--board-ink-pin` |
| Grille ticks: strip 26 x 5, top 7, gradient `rgba(0,0,0,.22) 0 1px, rgba(255,255,255,.9) 1px 2px, transparent 2px 4px` | `.thumb::before`, line 154 | `GrilleTicks`, `--grille-dark`, `--grille-light` |
| Sheet screw offset, 12 px from each side | `.sheet .screw` | `.sheet-screw` position in `Sheet.css` |

### Open items (requirement 21.19)

1. Channel key grille ticks: not Figma nodes. The Prototype_Reference is their source, an approved exception (requirement 21.7). Not an open item.
2. Raster board `182:5` crop: known difference, intentionally left unchanged (requirement 21.23). Not an open item.
3. Scope left gutter: known difference, intentionally left unchanged (requirement 21.23). Not an open item.
4. Scope `271:2` band lines while off: fixed in task 9.6 (requirement 21.20).
5. Message well `273:149`: count and divider: fixed in task 9.6 (requirement 21.21). Figma_Main has no divider node.
6. Group key bar `270:376`, quick keys `270:389`, SOS `213:377`: absent from the live app by design (requirement 21.1).

### Visual decisions (task 9.6, requirements 21.6, 21.7, 21.20 to 21.23)

- Approved exceptions to Figma_Main, sourced from the Prototype_Reference: the faceplate title deboss and the channel key grille ticks. Neither is reported as a failure.
- Title deboss value taken from `../dial-tone/prototype/index.html` line 109 (`.mark`): `text-shadow: 0 1px 0 rgba(255,255,255,.85), 0 -1px 0 rgba(0,0,0,.3)`. Received by Tokens `--title-deboss-light`, `--title-deboss-dark` and `--shadow-title-deboss`, used by `.wordmark h1`.
- Known differences intentionally left unchanged: the circuit board crop (the app draws the board in code and shows less of it than the raster `182:5`) and the darker left gutter behind the Scope axis labels. They are not open items and not failures.
- Off-state band lines: the Scope draws the active channel's two band lines in `--scope-band` while the power is off, with the faint static and the STANDBY tag kept. They are DOM lines over the canvas, so the e2e check reads their computed colour, width and position rather than canvas pixels.
- Message well: the byte count "41 / 128 B" sits in the MESSAGE caption row (Figma `182:135`), and the meter row matches `213:258`. Figma_Main has no divider node in the well, so none is drawn; the e2e check asserts there is none.

### Checks run

`npm.cmd run typecheck` passed. `npm.cmd run lint` reports 7 warnings and no errors. `npm.cmd test`: 87 files, 610 tests passed. `npm.cmd run test:e2e`: 45 passed.

### Strings written by the implementer in this task

None. The QA draft typed for the screenshot is not in the app.
