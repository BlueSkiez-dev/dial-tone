# UI design QA (ui-shell task 7.1)

Method: Figma screenshots from the MCP `get_screenshot` (file `VDyiOLNBAavxsBHP15j1Sj`), and Playwright screenshots of `?state=<name>` at 390 px width from `npm run dev`. Compared by eye. No pixel diff. The second pass also read node properties with `get_design_context` for the nodes listed below. Sizes that say "measured" come from screenshots; sizes that say "node" come from Figma properties.

## What was and was not compared

**Compared side by side (viewed and judged):** all 16 States (01 to 16) and the New screens 01 to 06, 15, 16, 17. The earlier pass covered 03, 06, 08, 09, 10, 11, New 01, 02, 15. The second pass (this one) viewed Figma and app screenshots for 01, 02, 04, 05, 07, 12, 13, 14, 15, 16, New 03, 04, 05, 06, 16, 17.

**Node properties read (get_design_context):** Sheet Microphone 270:155 (title 26 px, kicker 11 px, button size), Slip Update ready 270:462, Slip Relayed 213:459, Slip I'm safe 270:589. Sizes in the app were measured in the browser (getBoundingClientRect) for the Sheets, the SOS button, quick keys, group key bar, Transmit key, and the two slips.

**Not compared:** the Onboarding 1 and 2 node properties (only screenshots), animation (self-test sweep, warm-up, slip printing, ghost text), real-device rendering, and pixel differences (no pixel diff was run). State 02 and 04 to 06 frames in Figma are single frames of an animation; the app screenshots are taken 1.5 s after load, so LED sweep and warm-up cannot be matched frame by frame. The Slip variants Locked, Locked no key and Location were not compared (no gallery state, not printed by the live app). Sheet variants Key open to Key offer, Group key bar Locked, Check words and Group code card are deferred to the crypto spec.
## Rows

| State | Figma | Result | Fix or reason left |
|---|---|---|---|
| 01 Off `271:2` | `off` | Differences: readout hint was "Power is off.", Figma "Flip the power switch to start" (fixed); scope axis showed five ticks (6, 4, 2, 0, top label hidden), Figma shows three: "8k", "4k", "Hz" (fixed, see Scope below); Figma scope has a "STANDBY" tag top right, app has none; Figma frame shows the full content (group key bar, quick keys, SOS, long empty-tape text) dimmed, app keeps the slots empty. | Hint and axis fixed. STANDBY tag left: not in the spec, needs a decision. Slots and tape text as in State 03. |
| 02 Self-test `272:2` | `selftest` | Differences: hint "Self-test." vs Figma "Self-test…" (fixed). The app screenshot catches the warm-up mid-animation (scope bright green, OH amber mid sweep); Figma shows the end of the warm-up (dark scope with one green line, MR AA RD SD green, CD amber, OH off). | Hint fixed. Animation frames not comparable by screenshot; not checked. |
| 03 Ready `273:2` | `ready` | Differences: no CHANNEL and MESSAGE captions (fixed); no printer slit above the tape (fixed); status hint is longer than Figma's "Ready. Listening for messages."; scope caption read "ROOM BAND" instead of "ROOM · 1.9-6.4 KHZ" (fixed); empty tape text is "No paper yet", Figma has a longer sentence; Figma shows the group key bar, quick keys and SOS, the live-app slots stay empty by design; Figma puts the count "41 / 128 B" in the Message caption row as well as next to the meter, the app has it only next to the meter; the Figma fixture shows airtime "~2.2 s", the gallery has no transport so it shows "— s". | Fixed what is listed as fixed. Hint kept: it says the app listens only while open (tech.md rule). Empty tape text kept: the e2e test and copy.ts say "No paper yet" (needs a user decision). Slots kept empty: ui-shell design. |
| 04 Sending `274:2` | `sending` | Differences: Figma lights MR, **AA**, SD, the app lights MR, SD; Figma shows the channel switch at full strength, the app dims it while sending (it is disabled, e2e tests rely on it); Figma shows "Sending · 2.2 s" in the readout, the app shows "ATDT · 4.3 s" plus a longer hint that wraps to two lines (gallery fixture airtime and hint text); Figma shows a live spectrogram and a Sent slip, the gallery has no transport and no slip; Figma Transmit label "Sending" with the strip about 40% full, the app strip is about 10% full (fixture time). | **Needs a decision:** AA while sending (same as the received row: Figma keeps AA lit whenever Listen is on). Rest left: fixture content, not a layout difference. |
| 05 Hearing `275:2` | `hearing` | Differences: Figma lights MR, **AA**, CD, the app lights MR, CD; hint "Hearing a signal…" with an ellipsis (fixed); Figma shows spectrogram activity and a Sent slip, the gallery shows neither. | AA: see decision on 06 and 04. Hint fixed. |
| 06 Received `276:2` | `received` | Differences: Figma lights MR, **AA** and RD, the app lights MR and RD; Figma shows decoded text resolving on the scope, the gallery scope is static; readout hint "Message received" has no full stop in Figma; Figma tape slips overlapped the latch row in the app (fixed with the printer slit and a gap). | AA left as is: the status table in requirement 8.3 and the e2e row say `MR, RD`. **Needs a decision** (see open items). Ghost text left: not part of the gallery fixture. |
| 07 SOS held `277:2` | `sos-held` | Differences: Transmit sat at the top of the Actions row, Figma centres it on the 95 px SOS slot (fixed, `.part-transmit`); quick key labels were 14 px, Figma 12 px (fixed, `QuickKeys.css`); the readout while holding says `ATDT` and "Keep holding to send SOS…" in Figma, the app shows the normal `OK` row; red ring fills about 60% in both (looked equal). Measured: SOS 78 x 95, cap 78, key bar 304 x 54, quick keys 98.6 and 104.9 x 40 (Figma 98 and 104 x 40), Transmit 210 x 72, Actions row 101. All equal to the node sizes. | Readout while holding left: the status table has no SOS-hold row. **Needs a decision.** |
| 08 SOS received `278:2` | `sos-received` | Differences: SOS cap had no "SOS" text and the label read "SOS" (Figma: "SOS" in the cap, "HOLD 2 S" below) (fixed); quick keys stretched to half width each, Figma hugs the content (about 98 and 104 wide) (fixed); the gallery prints the SOS slip above the Tape, not inside it, so "No paper yet" shows under it; the slip's body text and the "Pass it on" button are missing in the gallery fixture; group key bar looks the right size but the caption "GROUP KEY" is missing. | Slip placement and missing text left: the fixture is a gallery stand-in and the e2e test expects 0 slips on the Tape. GROUP KEY caption left: it belongs to the deferred crypto spec. |
| 09 Call `279:2` | `call` | Scope window was 0 to 4 kHz with axis 3,2,1,0. Figma State 09 axis reads 8k, 4k, Hz, so the window is 0 to 8 kHz. Caption now "CALL · 1.1-2.6 KHZ". | Fixed: `scope-map.ts` call window 0 to 8000. This closes the earlier unverified Call window item. |
| 10 Quiet `280:2` | `quiet` | Window 12 to 20 kHz matches Figma (axis 20k, 16k, Hz). Caption and notice say 15-19.4 kHz, Figma says 15-19.5 kHz. Notice text matches. | Kept 19.4: the measured band (`PROFILES.quiet.carrierBandHz` is 15000 to 19400). Design open question 5. |
| 11 Too long `281:2` | `too-long` | 24 of 24 segments lit, amber, label "Too long", bold count, Transmit disabled, no red. Figma header reads "158 / 128 B" so the limit label says 128 in both. Differences: Figma status readout says "Message is too long to send. Shorten it."; the app readout shows the normal Ready hint. | Readout hint left: the status table has no too-long row. **Needs a decision.** |
| 12 Mic off `282:2` | `mic-off` | Differences: Figma readout is `OK` with "Ready to send. Microphone is off, so you can't hear messages."; the app shows `NO CARRIER` with "No microphone. You can still send."; latch "No mic" and AA dark match. | Left: the e2e table and requirement 8.3 say `NO CARRIER` for no microphone. **Needs a decision** (code and hint text). |
| 13 Not listening `283:2` | `not-listening` | Matches (MR only, `NO CARRIER`, latch "Listen"). Hint was "Not listening. Press Listen.", Figma "Not listening. Press Listen to hear messages." (fixed). | Fixed. |
| 14 Tape expanded `284:2` | `tape-expanded` | Structure matches: five slips 280 wide with torn edges, "Show less" key at the bottom. Differences: Figma "Show less" has a small caret; the gallery slips are placeholders ("Message 1" to "Message 5", all Heard) where Figma shows Sent, Heard, hop 2, SOS with Pass it on buttons. | Caret left (it would change the button name used by tests; needs a decision). Fixture text left: gallery stand-in. |
| 15 Legend `285:2` | `legend` | Matches in structure: two columns, MR CD RD left and AA OH SD right, same meanings. Differences: the divider above the legend is dotted in the app and a plain hairline in Figma; the readout hint is longer in the app. | Left: hairline style is a 1 px detail, not changed. |
| 16 Beige `286:2` | `beige` | Palette matches (tan faceplate, cream keys, dark glass). The Figma frame shows a received message with three slips and "See 1 more", the app fixture is the empty ready screen. Layout is identical to Ghost (checked by the e2e beige test). | Fixture content left. |
| New 01 Onboarding 1 `242:2` | `onboarding-1` | Differences: art panel sat under the body, Figma puts it between the title and the body (fixed); title was 18 px, Figma about 22 px with wider tracking, so it wraps like Figma (fixed); button labels were Plex Sans mixed case, Figma is condensed caps (fixed); Figma art is two phone outlines with a wave and labels YOU and ANY PHONE, the app has text only; Figma's last line "No internet, no accounts, no servers." is bold and body size, the app has it as small grey fine print; Figma shows three page dots under the buttons, the app has none; Figma screws are larger and drawn with a slot. | Layout, title and button fixes applied. Artwork, bold line, page dots and screws left: they need new drawn parts, not a CSS tweak. |
| New 02 Onboarding 2 `244:2` | `onboarding-2` | Same sheet differences as 01 (art order, title, buttons fixed; microphone drawing, page dots left). | As above. |
| New 03 Onboarding 3 `245:2` | `onboarding-3` | Differences: the two install steps ("Open the browser menu (the three dots)", "Choose Install app or Add to Home screen") were missing (fixed, reuses the Install sheet copy); kicker was 14 px bold, node `270:136` says 11 px SemiBold tracking 2.2 (fixed); title was 22 px, node `270:139` says 26 px / 27.3, tracking 2.08 (fixed; Mic reset now wraps to two lines like Figma); button gap 12 and height 48, node says gap 10 and 52 (fixed). Left: three page dots under the buttons, larger screws. Sheet height measured 415 px, Figma 471 px (dots, spacing). | Fixed what is listed. Dots and screws left (new drawn parts). |
| New 04 First power-on `246:2` | `first-power` | Difference: Figma prints the dark "Dial Tone · Listening while open" system slip on the Tape. The gallery fixture has an empty tape ("No paper yet"). The slip itself exists and prints in the live app (reducer, first power-on). The system slip paper in Figma is a striped grey paper image (Slip description says "striped paper"), the app uses the light paper. | Left: the e2e table says `first-power` has 0 slips and the beige test compares it with `beige`; adding the slip means editing both. Striped paper needs a new asset. **Needs a decision.** |
| New 05 Mic denied `247:2` | `mic-denied` | Differences: the app adds the line "The browser blocked the microphone." above the body (written by the implementer, Figma has none); sheet is 382 px high, node says 361. Kicker, title and button sizes fixed as above. Figma shows the readout `OK` behind the sheet (see State 12). | Extra line left: it tells the user the cause (requirement text). Kept. |
| New 06 Mic reset `248:2` | `mic-reset` | Differences: title was "Microphone is off", Figma "Microphone access was reset" (fixed); body was two paragraphs, Figma has one: "Your phone forgot the permission. iPhones do this after a while. Allow it again to keep hearing messages." (fixed in `SheetContent.tsx` and `sheet-copy.ts`; `Sheet.test.ts` assertion updated to the new text). After the fix the screenshot matches Figma in title wrap, body and button positions. Sheet is 399 px high, the Figma screenshot shows about 411 px. | Fixed. 12 px height gap not traced. |
| New 15 Install sheet `257:2` | `install-sheet` | After fixes it matches Figma in order and spacing: title, app icon on the plate without a glass panel, body, list. Differences: the app adds an "iPhone: tap Share..." line that Figma's frame does not show; Figma's two list items are spaced further apart; screws. | Icon panel and order fixed. iPhone line kept (iOS needs it; requirement text). |
| New 16 Install notice `258:2` | `install-notice` | Difference: the Notice sat above the Tape header and crowded it, Figma puts it below the Tape, after the empty-tape text (fixed in `Screen.tsx`, 16 px gap in `Notice.css`). Plate, amber LED, text and INSTALL key look the same. | Fixed. |
| New 17 Update ready `259:2` | `update-ready` | Differences: Figma paper is the dark striped system paper, the app uses the light paper; Figma shows the Sent slip under it, the gallery has only the update slip. Text, meta line, Later and Restart now buttons match (node `270:462`: 280 wide, buttons 7 px radius, 12.5 px labels). | Paper left: needs the striped paper asset. **Needs a decision.** |

## Component sizes (node properties against the app)

| Component | Figma node | App | Result |
|---|---|---|---|
| Slip Relayed `213:459` | 280 x 169.3, meta block 39.3, Pass it on row 43.5 | 280 x 172.3, meta block was 42.3 (the empty line-break element added a 3 px row gap) | Fixed with `margin-top: -3px` on `.slip-meta-break`. Not re-measured after the fix. |
| Slip I'm safe `270:589` | 280 x 158.9, stamp 96 x 20, no padding above the text | 280 x 165.9, stamp 94.8 x 18, text had 9 px padding above | Fixed: stamp padding and text padding in `Slip.css`. Not re-measured after the fix; the sums match 158.9 on paper. Stamp width stays 94.8 (text width differs by about 1 px). |
| Sheet `270:345` Microphone | 390 x 361 | denied 381.8, reset 399.1 | The extra line and a longer title account for part of it. Left. |
| Sheet Onboarding 1, 2, 3, Install | 484, 479, 471, 421 | 472.5, 445.2, 415.1, 420.3 | Install matches. Onboarding differences come from the missing artwork and page dots. Left. |
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
- Second pass: `Scope.tsx`, `scope.css` (three axis labels, top label visible); `copy.ts` (hints for off, selftest, carrier, latch-off); `Sheet.css` (kicker 11 px, title 26 px, button height 52 and gap 10); `SheetContent.tsx`, `sheet-copy.ts` (install steps on Onboarding 3, own title and body for Mic reset); `Sheet.test.ts` (reset assertion follows the new text); `Screen.tsx`, `Notice.css` (notice below the Tape); `device.css` (Transmit centred on the SOS slot); `QuickKeys.css` (12 px labels); `Slip.css` (Relayed meta height, I'm safe stamp and text spacing).

## Strings written by the implementer (not from Figma), for review

- Slot names: "Group key (reserved)", "Quick messages (reserved)", "SOS (reserved)"; "Circuit board"; tape label "Tape"; "Show less".
- Status hints: "Power is off.", "Self-test.", "Cannot send. Power off and on again.", "Could not send. Try again.", "Sending. Keep this phone near.", "Message received.", "Hearing a signal.", "Ready. Listens only while the app is open and the screen is on.", "Listening, but this phone may filter the sound. Signals can be missed.", "Listening stopped. Screen is off.", "Not listening. Press Listen.", "No microphone. You can still send."
- Status lights label: "Status lights. Tap for the light legend."; Rocker label "Power".
- Notices: "Cannot show this" and its text; "Microphone" / "The microphone stopped again. Sending still works."
- Scope caption format "Room · 1.9-6.4 kHz" is built from the profile, not copied (Figma's text matches for Room and Call).
- Sheet and channel strings in `sheet-copy.ts` and `channel-copy.ts` were not re-audited in this pass.

## Open items for the user

1. AA LED: Figma keeps AA lit whenever Listen is on (Received, Sending, Hearing). Requirement 8.3 lights AA only in the idle `OK` row. Which is right?
2. Too-long: add the readout text "Message is too long to send. Shorten it."?
3. Empty tape text: Figma has a longer sentence than "No paper yet".
4. Sheet artwork (phones and wave, microphone drawing), page dots, bold last line of Onboarding 1: build or accept the text-only art.
5. Mic off readout: Figma `OK` with "Ready to send. Microphone is off, so you can't hear messages."; app `NO CARRIER` with "No microphone. You can still send."
6. SOS held readout: Figma `ATDT` with "Keep holding to send SOS…". No row in the status table.
7. Off-state scope "STANDBY" tag, and the caret on "Show less".
8. System slip paper (striped, dark grey) for first power-on and Update ready. Also whether the `first-power` gallery state should print the notice slip (needs changes to the e2e table and the beige test).
9. Not compared: animation frames (self-test, warm-up, printing), Slip Locked, Locked no key and Location, real-device rendering, pixel differences. The Relayed and I'm safe heights were fixed from node numbers but not re-measured in the browser.

