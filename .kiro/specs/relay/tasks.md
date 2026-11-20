# Implementation Plan: relay

## Overview

Implementation language: TypeScript (the design uses TypeScript throughout). The work follows the order protocol relay module, model and persistence, controller, UI components, copy, then tests and e2e, then a final checkpoint. The copy strings (task 5) are small and are used by the UI components (task 4), so the dependency graph schedules task 5.1 before task 4.1 even though it is numbered later.

On Windows, run npm through `npm.cmd` and `npx.cmd` (PowerShell blocks `npm.ps1`). Do not change the execution policy.

## Tasks

- [x] 1. Protocol relay module (`src/protocol`)
  - [x] 1.1 Create `src/protocol/relay.ts`
    - Export `SEEN_MAX = 256`, the types `RelayRefusal`, `RelayErrorCode`, `RelayError`, `RelayView` (a `Pick` of `type`, `hop`, `ttl`, `total`)
    - Implement `checkRelay` with the reason order `MULTI_FRAME`, `NOT_RELAYED_TYPE`, `NO_HOPS_LEFT`, `HOP_LIMIT`, reading `type` only to compare with KEY_OFFER (value 4)
    - Implement `canRelay` as a boolean wrapper over `checkRelay`
    - Implement `relayWire`: `decodeFrame`, then `checkRelay`, then `patchRouting(wire, hop + 1, ttl - 1)`. Return decode errors (including `BAD_CRC`) unchanged. Never throw. Never call `encodeFrame`, `splitPayload`, `makeFrames` or `newMessageId`. Never name `.body` or `.encrypted`, never slice bytes.
    - Implement `hasSeen` and `markSeen` (append, drop oldest beyond `SEEN_MAX`, a key already held leaves the list unchanged)
    - Import only from `./frame`, `./types` and `./budget`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 3.5, 3.6, 3.7, 8.1, 8.3_

  - [x] 1.2 Export the relay from `src/protocol/index.ts` and update `layering.test.ts`
    - Export `canRelay`, `checkRelay`, `relayWire`, `hasSeen`, `markSeen`, `SEEN_MAX` and the types `RelayError`, `RelayErrorCode`, `RelayRefusal`, `RelayView`
    - Add `canRelay` and `relayWire` to the function list in `src/protocol/layering.test.ts`
    - _Requirements: 8.3, 8.5, 8.6_

  - [x] 1.3 Write property test for the relayability predicate and reason order
    - Create `src/protocol/relay.prop.test.ts` with fast-check, `verbose: true` so the seed prints on failure, and the `frameArb` shape from `frame-patch.prop.test.ts`
    - **Property 1: Relayability predicate and reason order**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.9, 2.7, 9.6**

  - [x] 1.4 Write property test for the Patched_Wire shape
    - **Property 2: Patched_Wire shape**
    - **Validates: Requirements 1.6, 2.1, 2.3, 2.4, 2.5, 2.11, 8.1, 9.3, 9.4, 9.10**

  - [x] 1.5 Write property test that crypto inputs survive a relay
    - **Property 3: Crypto inputs survive a relay**
    - **Validates: Requirements 2.9, 3.5, 9.11**

  - [x] 1.6 Write property test for the body-blind relay
    - Include bodies that look like ciphertext and bodies that are not valid UTF-8, and the metamorphic pair check
    - **Property 4: Body-blind relay**
    - **Validates: Requirements 1.6, 1.7, 2.8, 9.7, 9.8**

  - [x] 1.7 Write property test that KEY_OFFER is never relayed
    - **Property 5: KEY_OFFER is never relayed**
    - **Validates: Requirements 1.3, 1.8, 2.7, 9.18**

  - [x] 1.8 Write property test for idempotent re-broadcast
    - **Property 6: Idempotent re-broadcast**
    - **Validates: Requirements 9.2**

  - [x] 1.9 Write property test for monotone and bounded chains of passes
    - **Property 7: Chains of passes are monotone and bounded**
    - **Validates: Requirements 2.10, 9.3, 9.4, 9.5**

  - [x] 1.10 Write property test that a corrupted frame is never re-sealed
    - **Property 8: A corrupted frame is never re-sealed**
    - **Validates: Requirements 2.6, 9.12**

  - [x] 1.11 Write property test that `relayWire` is total
    - Byte arrays of length 0 to 200, also `decodeFrame` followed by `canRelay`
    - **Property 9: relayWire is total**
    - **Validates: Requirements 1.10, 9.17**

  - [x] 1.12 Write property test for the capped Relay_State
    - **Property 10: The Relay_State is capped and drops the oldest key**
    - **Validates: Requirements 3.6, 3.7, 9.13**

  - [x] 1.13 Write property test for phones in one room
    - Model 2 to 6 phones that each apply the Relay_State rule and relay every accepted frame, with random delivery order
    - **Property 12: Phones in one room pass a message at most once each**
    - **Validates: Requirements 3.3, 9.16**

  - [x]* 1.14 Write unit tests and source scan in `src/protocol/relay.test.ts`
    - Chain of 3 passes from `SEND_TTL` 3, hop 15 with ttl 3, a KEY_OFFER wire refused with `NOT_RELAYED_TYPE`, index exports
    - Source scan: `relay.ts` has no `.body`, `.encrypted`, `.slice(`, `subarray(`, `encodeFrame`, `splitPayload`, `makeFrames` or `newMessageId`, and reads `.type` only in the KEY_OFFER comparison
    - _Requirements: 1.3, 1.7, 1.8, 2.2, 2.8, 2.10, 8.2, 8.5, 9.9_

- [x] 2. Model and persistence (`src/ui/model`)
  - [x] 2.1 Extend `src/ui/model/tape.ts`
    - Add `RelayMeta` (`hop`, `ttl`, `multi`, `keyOffer`)
    - Add optional `relay?: RelayMeta` (memory only) and `passedOn?: true` to the `heard` and `system` slip kinds
    - Add `"unreadable"` and `"relay-failed"` to `NoticeKey`
    - _Requirements: 3.10, 3.11, 4.12, 5.4_

  - [x] 2.2 Change `src/ui/model/receive.ts`
    - Import `SEEN_MAX`, `hasSeen`, `markSeen` and `canRelay` from the protocol index, and re-export `SEEN_MAX`
    - Return `holdsWire` from `receiveFrame`, equal to `canRelay(frame.header)` for single-frame frames that print a slip, false otherwise (never true for KEY_OFFER)
    - Unencrypted single-frame TEXT: Heard slip with `relay: { hop, ttl, multi: false, keyOffer: false }`
    - Other single-frame frames: System slip with `noticeKey: "unreadable"`, no text, no type name, and `relay.keyOffer` set from the header type
    - Multi-frame: keep the `unsupported` notice, and give the completed TEXT slip `relay.multi: true`
    - Own echoes and duplicates still print nothing and leave the state unchanged. Record every heard key in `seen`.
    - _Requirements: 3.1, 3.2, 3.4, 3.5, 3.6, 4.1, 4.3, 4.12, 4.13, 4.14, 5.4_

  - [x] 2.3 Create `src/ui/model/relay-view.ts`
    - Pure `relayView(slip, { held, canSendNow })` returning `none`, `action` (`hop` = `relay.hop + 1`, `disabled`), `reason` (`no-hops`, `hop-limit`, `restart`, `multi`, `key-offer`) or `passed`, in the decision order of the design table
    - _Requirements: 3.9, 4.2, 4.4, 4.5, 4.6, 4.7, 4.8, 4.10, 4.12, 4.14, 4.15, 4.16, 4.17_

  - [x] 2.4 Add the `passed-on` event to `src/ui/model/reducer.ts`
    - Set `passedOn: true` on the slip with that id. An unknown id returns the same state object.
    - _Requirements: 3.9, 3.10, 6.7_

  - [x] 2.5 Change `src/ui/model/persist.ts`
    - Add `storedSlip(slip)` that drops `relay` and keeps `passedOn` only when true, and use it in `serialize` and `write`
    - `validSlip` keeps `passedOn: true` only for the boolean `true`, ignores other values without dropping the slip, and never carries `relay`
    - Add `"unreadable"` and `"relay-failed"` to `NOTICE_KEYS`
    - Add no new storage key and write no wire bytes or Message_Key list
    - _Requirements: 3.8, 3.10, 3.11, 4.6, 4.17, 8.4_

  - [x] 2.6 Update the comment on `SEND_TTL` in `src/ui/model/send.ts`
    - State that `SEND_TTL` = 3 is the number of pass-ons a sent message survives. The value does not change.
    - _Requirements: 2.10_

- [x] 3. Controller (`src/ui/controller.ts`)
  - [x] 3.1 Split `runSend` into a shared send helper
    - The helper does the `transport.send` call and the `tx-start` and `tx-end` dispatches, with a callback for the success slip
    - `transmit()` passes the Sent slip and keeps its behavior unchanged
    - _Requirements: 6.4, 6.7_

  - [x] 3.2 Keep Held_Wires in memory and prune them
    - Add `const held = new Map<string, Uint8Array>()` outside `UiState` and outside the saved state
    - In the `frame` event, after `receiveFrame`, `held.set(slip.id, ev.wire)` when `holdsWire`, before the slip is dispatched
    - Add `pruneHeld()` after each dispatch so no wire outlives its slip (50-slip cap), and clear `held` in `dispose`
    - Never call `transport.send` when a frame is heard
    - _Requirements: 3.8, 4.1, 6.2, 8.4_

  - [x] 3.3 Add `passOn(slipId)` and `holdsWire(slipId)` to the controller
    - Return early when power is off, a fault is set, a transmission is in flight, the slip is missing or already `passedOn`, or no wire is held
    - Call `relayWire`. Send nothing on a refusal. On a decode error print a `relay-failed` System slip and send nothing.
    - Send once with the shared helper and no Sent slip. No retry, queue or schedule.
    - On ok: `markSeen` the key into `receive.seen`, dispatch `passed-on`, play the sent cues
    - On `BUSY`: change nothing else. On another error: keep the Relay_State, print a `relay-failed` System slip, keep the action.
    - Use the channel currently selected. Start no audio and no microphone.
    - _Requirements: 3.3, 3.9, 3.10, 6.1, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 7.1, 7.2, 7.5_

  - [x] 3.4 Record the sender's own message keys after a successful transmit
    - In `src/ui/controller.ts`, when the `transmit()` send outcome is `ok`, for each sent wire call `decodeFrame` and `markSeen(receive.seen, frameKey(frame))`, after the `tx-end` success dispatch. Today that is one key (`<hex message ID>:0`).
    - Use the same capped, memory-only `receive.seen` list. Store nothing new, and leave the Sent slip shape unchanged.
    - On `BUSY` or another error, record no key
    - Do not change `src/audio/own-echo.ts` or anything else in `src/audio`
    - _Requirements: 3.1, 3.2, 3.5, 3.8, 3.12_

- [x] 4. UI components (`src/ui`)
  - [x] 4.1 Update `slip-parts.tsx`
    - `PassOn` gains `disabled?: boolean` and an `aria-label` "Pass it on, hop N" built from `copy`
    - The label stays when disabled. Tap target at least 44 by 44 px and keyboard activation.
    - _Requirements: 4.2, 4.8, 4.9_

  - [x] 4.2 Update `Slip.tsx`
    - Accept `relay?: SlipRelayView` and `onPassOn?`. Render the action, the reason line, "Passed on" or nothing, as text and never as HTML.
    - Replace the `Hop n` meta text with the "via" text: nothing at hop 0, "via 1 hop", "via n hops"
    - Unreadable System slip: show "Can’t read this message. You can still pass it on." only when the view is `action`, otherwise "Can’t read this message." followed by the reason line
    - Leave the gallery slip kinds unchanged
    - _Requirements: 4.2, 4.4, 4.5, 4.6, 4.7, 4.10, 4.11, 4.13, 4.14, 4.15, 4.16, 4.17, 5.1, 5.2, 5.3, 5.4_

  - [x] 4.3 Update `Tape.tsx`
    - Replace the `passOn` prop with `relay?: (slip) => SlipRelayView` and add `onPassOn?: (id: string) => void`, forwarded to `Slip`
    - _Requirements: 4.2, 4.10_

  - [x] 4.4 Update `Screen.tsx` and the gallery wiring
    - Compute `relay` with `relayView(slip, { held: actions.holdsWire(slip.id), canSendNow })`, where `canSendNow` is power on, no fault and no transmission in flight
    - Add `passOn` and `holdsWire` to `ScreenActions` and connect them to the controller. Gallery extras produce `{ kind: "action", hop: slip.hop + 1, disabled: false }` and no-op actions.
    - Keep the amber older-phones notice on Quiet while a message is passed on, and keep the channel switch locked while sending
    - _Requirements: 4.2, 4.8, 6.1, 7.3, 7.5_

  - [x] 4.5 Give Pass it on the Transmit disabled styling
    - The disabled Pass it on button (`PassOn` in `slip-parts.tsx`, rendered with the native `disabled` attribute) uses the same disabled look as the Transmit keycap: the rule in `src/ui/styles/transmit-key.css` under "Disabled: label and sub-label dim to 40%" (`cursor: default`, label at `opacity: 0.4`)
    - Reuse that rule. Extend its selector list, or move it into one shared class or custom property that both buttons use. Do not copy the values into a second rule.
    - The button keeps its label "Pass it on → hop N", its accessible name and its 44 by 44 px target while disabled. Only the look changes.
    - Add a disabled Pass it on case to `src/ui/components/TransmitKey.test.ts`, which already covers the disabled Transmit keycap and reads `transmit-key.css`: the shared disabled rule applies to the Pass it on button and the label is still rendered
    - _Requirements: 4.8_

- [x] 5. Copy (`src/ui/copy.ts`)
  - [x] 5.1 Add the `relay` strings to `src/ui/copy.ts`
    - `via(n)`, `passedOn`, `passOnLabel(hop)`, `endNoHops`, `endHopLimit`, `endRestart`, `endMulti`, `endKeyOffer`, `unreadable` (`title`, `text`, `textRelayable`), `failed` (`title`, `text`)
    - Add the notice entries `unreadable` and `relay-failed` to `slip.notices`
    - Name only Room, Call and Quiet. No radio, walkie-talkie or internet-call wording.
    - _Requirements: 4.3, 4.4, 4.5, 4.6, 4.7, 4.10, 4.14, 5.1, 5.2, 5.5, 7.4_

- [x] 6. Tests and e2e
  - [x] 6.1 Update `Slip.test.ts`
    - `Hop n` becomes the "via" text. Add cases for `passed`, each `reason`, the `action` with `disabled`, and the unreadable System slip in both text forms. Gallery slip assertions stay.
    - _Requirements: 4.2, 4.4, 4.5, 4.6, 4.7, 4.8, 4.10, 4.14, 4.15, 4.16, 5.1, 5.2, 5.3_

  - [x] 6.2 Update `Tape` and `Screen` tests
    - The `passOn` prop becomes `relay` plus `onPassOn`. The gallery `extras.passOn` case maps to an `action` view.
    - _Requirements: 4.2, 4.10, 6.1_

  - [x] 6.3 Update `receive` tests and `receive.prop.test.ts`
    - A single-frame unreadable frame prints a System slip with `noticeKey: "unreadable"` and `relay` meta. A multi-frame unreadable frame still prints `unsupported`. `rs.seen.includes` becomes `hasSeen`. Add `holdsWire` assertions and the KEY_OFFER case.
    - _Requirements: 3.1, 3.2, 3.4, 4.1, 4.3, 4.13, 4.14_

  - [x] 6.4 Update `persist.test.ts` and `persist.prop.test.ts`
    - Add `unreadable` and `relay-failed` to the notice keys. Round-trip tests compare the `storedSlip` shape. Add `passedOn` cases: `true` kept, other values ignored, slip not dropped.
    - _Requirements: 3.10, 3.11, 4.6, 4.17_

  - [x] 6.5 Update the reducer tests
    - Add the `passed-on` event and the unknown-id case
    - _Requirements: 3.9, 3.10_

  - [x] 6.6 Update controller tests and add examples with the fake transport
    - Existing transmit tests pass unchanged after the `runSend` split
    - Examples: success path (key recorded, slip marked, no new slip, sending cues), `BUSY`, another error, no `start()` call, send on each of Room, Call and Quiet, a KEY_OFFER heard and tapped with no send
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 7.1_

  - [x] 6.7 Write property test that each message is shown once
    - Extend `src/ui/model/receive.prop.test.ts`
    - **Property 11: Each message is shown once**
    - **Validates: Requirements 3.1, 3.2, 3.4, 3.5, 9.14**

  - [x] 6.8 Write property test for held wires and unreadable notices
    - Extend `src/ui/model/receive.prop.test.ts`
    - **Property 13: Held wires and unreadable notices**
    - **Validates: Requirements 4.1, 4.3, 4.13, 4.14**

  - [x] 6.9 Write property test for the Pass it on decision table
    - Create `src/ui/model/relay-view.prop.test.ts`
    - **Property 14: The decision table of the Pass it on action**
    - **Validates: Requirements 3.9, 4.2, 4.4, 4.5, 4.6, 4.7, 4.8, 4.10, 4.12, 4.14, 4.15, 4.16, 4.17**

  - [x] 6.10 Write property test for the hop text
    - Extend `src/ui/model/relay-view.prop.test.ts`
    - **Property 15: Hop text**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4**

  - [x] 6.11 Write property test that hearing never sends and a tap sends once
    - Create `src/ui/relay-controller.prop.test.ts` with `fake-transport.ts`
    - **Property 16: Hearing never sends, a tap sends once, KEY_OFFER never sends**
    - **Validates: Requirements 6.1, 6.2, 6.4, 6.9**

  - [x] 6.12 Write property test that held wires never outlive their slip
    - Extend `src/ui/relay-controller.prop.test.ts`
    - **Property 17: Held wires never outlive their slip**
    - **Validates: Requirements 8.4**

  - [x] 6.13 Write property test that no wire or key list is stored
    - Extend `src/ui/relay-controller.prop.test.ts` with a recording `StorageLike`, `localStorage`, `indexedDB` and Cache API stub
    - **Property 19: No wire or key list is ever stored**
    - **Validates: Requirements 3.8, 3.11, 9.15**

  - [x] 6.14 Write property test that `passedOn` survives save and load
    - Extend `src/ui/model/persist.prop.test.ts`
    - **Property 18: passedOn survives a save and load, relay data does not**
    - **Validates: Requirements 3.10, 3.11, 4.6, 4.17**

  - [x]* 6.15 Write component tests for the Pass it on button
    - Extend `Slip.test.ts`: accessible name includes the next hop, 44 by 44 px size class, Enter and Space activation, markup in text rendered as text
    - _Requirements: 4.8, 4.9, 4.11_

  - [x]* 6.16 Add source scans to `src/ui/scan.test.ts`
    - No network facility in the relay files, no hard-coded relay strings in components, no "radio", "walkie" or "internet call" in relay copy
    - _Requirements: 5.5, 7.4, 8.2_

  - [x]* 6.17 Write the slow modem test `src/audio/relay-channel.slow.test.ts`
    - A Patched_Wire through the real ggwave modem under each channel profile gives an equal frame, a decode error or no result, never a different frame. Few runs.
    - Add one end-to-end relay case through the real ggwave modem, with a separate receive state per phone driven by the existing `receiveFrame`:
      - Phone A encodes and sends a TEXT frame
      - Phone B hears it through the modem, and its receive state prints a Heard slip. B passes it on with `relayWire`.
      - Phone C hears the Patched_Wire through the modem and prints a Heard slip whose meta shows "via 1 hop"
      - Phone A hears B's re-broadcast and ignores it as a duplicate: no new slip, and its seen list is unchanged
    - Keep the run count low, as for the other slow tests
    - _Requirements: 3.1, 3.2, 3.3, 5.2, 7.2, 9.19_

  - [x]* 6.18 Extend the Playwright e2e `e2e/fake-mic.spec.ts`
    - Play a fixture WAV that decodes to a TEXT frame, expect a Heard slip with "Pass it on → hop 1", tap it, expect "Passed on" and no extra slip, reload and expect "Passed on" again
    - Also check that the Heard slip meta shows no "via" text, because the fixture comes from the origin (hop 0)
    - _Requirements: 3.9, 3.10, 4.2, 4.10, 4.17, 5.1_

  - [x] 6.19 Write property test that a sender ignores passed-on copies of its own message
    - Extend `src/ui/relay-controller.prop.test.ts` with `fake-transport.ts`
    - Generate text within the Well_Limit, a channel and a send outcome (`ok`, `BUSY`, another error). After `ok`, feed copies of the sent frame with any `hop` and `ttl` (via `patchRouting` or one or more `relayWire` passes) as frame events with `ownEcho: false`, and assert no new slip and an unchanged Relay_State. After `BUSY` or an error, assert the Relay_State is unchanged by the send.
    - **Property 20: A sender ignores passed-on copies of its own message**
    - **Validates: Requirements 3.1, 3.2, 3.5, 3.12, 9.20**

  - [x] 6.20 Move the A→B→C modem case out of `src/audio`
    - `structure.md` forbids `src/audio` importing `src/ui`, and `src/audio/relay-channel.slow.test.ts` imports `../ui/copy`, `../ui/model/receive` and `../ui/model/send`
    - Keep the per-profile check (a Patched_Wire through the real modem gives an equal frame, a decode error or no result) in `src/audio/relay-channel.slow.test.ts`, with no `src/ui` import. Build its wires from `src/protocol` only.
    - Create `src/ui/relay-chain.slow.test.ts` (it may import `src/audio` and `src/protocol`) for the A→B→C case. `vitest.slow.config.ts` already includes `src/**/*.slow.test.ts`; confirm the new file runs under `npm.cmd run test:slow`.
    - Model A's send through the real Controller path with a transport that plays through the modem, or through the same seen-recording step that 3.4 adds (`decodeFrame` plus `markSeen(frameKey(...))` after an ok send)
    - Assert: B hears A and prints a Heard slip, B passes it on with `relayWire`, C prints a Heard slip whose meta shows "via 1 hop", and A prints no slip for B's copy and its seen list is unchanged
    - Keep the run count low, as for the other slow tests
    - _Requirements: 3.1, 3.2, 3.3, 3.12, 5.2, 8.3, 9.19, 9.20_

- [x] 7. Final checkpoint
  - [x] 7.1 Run everything and report
    - Run `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd test`, `npm.cmd run test:props`, `npm.cmd run test:slow` and `npm.cmd run test:e2e`. On Windows use `npm.cmd`, not `npm`.
    - Fix every failure in the relay work. Do not change protocol behaviour beyond the relay module (`src/protocol/relay.ts` and its exports).
    - The slow modem test (6.17) and the e2e extension (6.18) are optional tasks. The checkpoint runs whatever exists, so state in the report whether each of them was present when `test:slow` and `test:e2e` ran. State whether `src/ui/relay-chain.slow.test.ts` (6.20) ran under `test:slow`.
    - If `test:e2e` crashes natively (no test output and an exit code such as -1073740791, which is 0xC0000409), rerun it once. Report whether the crash happened on both runs.
    - Report a results table with one row per command: command, pass or fail, and counts (test files and tests passed, failed, skipped).
    - List every decision made that the user did not ask for.
    - Do not commit anything.
    - _Requirements: 8.2, 8.3, 9.1, 9.19_

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP. The 20 property tests (1.3 to 1.13, 6.7 to 6.14 and 6.19) are required and carry no `*`.
- Tasks 3.4, 6.19 and 6.20 come from the real-modem finding in 6.17: a phone heard a passed-on copy of its own message as new, because the own-echo check in `src/audio` matches exact bytes. The fix is in the Controller (3.4), and `src/audio` is unchanged.
- Tasks 6.1 to 6.6 are not optional: they keep the existing suite green after the model and UI changes
- Task 5.1 (copy) is scheduled before the UI components in the dependency graph
- Each task references specific requirements for traceability
- Property tests validate universal correctness properties, unit tests validate examples and edge cases

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2.1", "2.6", "5.1"] },
    { "id": 2, "tasks": ["1.3", "1.14", "2.2", "2.3", "2.4", "2.5"] },
    { "id": 3, "tasks": ["1.4", "3.1", "4.1", "6.3", "6.4", "6.5", "6.9", "6.17"] },
    { "id": 4, "tasks": ["1.5", "3.2", "4.2", "6.7", "6.10", "6.14"] },
    { "id": 5, "tasks": ["1.6", "3.3", "4.3", "6.1", "6.8"] },
    { "id": 6, "tasks": ["1.7", "4.4", "6.6", "6.11"] },
    { "id": 7, "tasks": ["1.8", "4.5", "6.2", "6.12", "6.16", "6.18"] },
    { "id": 8, "tasks": ["1.9", "6.13", "6.15"] },
    { "id": 9, "tasks": ["1.10"] },
    { "id": 10, "tasks": ["1.11"] },
    { "id": 11, "tasks": ["1.12"] },
    { "id": 12, "tasks": ["1.13"] },
    { "id": 13, "tasks": ["3.4"] },
    { "id": 14, "tasks": ["6.19", "6.20"] },
    { "id": 15, "tasks": ["7.1"] }
  ]
}
```
