# Requirements Document

## Introduction

Relay lets a message hop from phone to phone over sound when the sender and the final reader are too far apart. Phone A sends. Phone B hears it, and the person holding B taps "Pass it on". Phone B plays the same frame again, and phone C hears it. Nothing is relayed unless a person taps.

This spec owns the relay rules that `frame-protocol` leaves open (its "Obligations on other specs"): which frames may be passed on, the hop and TTL rule, duplicate suppression, and the UI action. It reuses the existing protocol pieces and adds no wire field: `decodeFrame`, `patchRouting`, `frameKey` and the 4-bit hop and TTL fields of the routing byte in `src/protocol`. It refuses KEY_OFFER frames by their header type. It also replaces the placeholder `SEND_TTL = 3` comment in `src/ui/model/send.ts` ("The relay spec owns the real rule") and turns on the "Pass it on → hop N" button that exists today only in gallery extras (`Screen.tsx` `extras.passOn`, `Tape.tsx` `passOn`, `Slip.tsx`, `slip-parts.tsx`).

Terminology follows `frame-protocol`. In a frame, `hop` counts hops travelled so far and only increases (the origin sends 0). `ttl` is the number of hops still allowed and only decreases. "Hops left" means `ttl`. When this spec says a relay "lowers the hops left by one", the frame gets `ttl - 1` and `hop + 1`, both written by `patchRouting`. The label "Pass it on → hop N" shows the hop the next phone will hear: N = hop + 1 (the existing `Screen.tsx` code already computes it this way).

### Body-blind relay

The relay is body-blind. It never reads the body or the encrypted flag to decide anything. Its decisions use only these header fields: `type` (to refuse KEY_OFFER), `total`, and the routing byte (hop and TTL). It also reads message ID and frame index to build the Message_Key. It then patches hop and TTL with `patchRouting` (which recomputes the CRC) and re-sends the result. Verifying the incoming CRC reads the bytes for integrity only. No relay decision depends on the content of the body or on the encrypted flag.

Because of this rule, any single-frame message (total = 1) that is not a KEY_OFFER, with TTL of at least 1 and hop below 15, can be passed on, whatever its encrypted flag and whatever its body holds. That includes TEXT, SOS, LOCATION, SAFE, RESEND_REQUEST, encrypted frames (group-key messages), and frames of a type this phone does not know. A relay holds no key and never needs one.

### KEY_OFFER is never relayed

`frame-protocol` decides that a group key is handed over only between phones in the same room. A relay therefore never passes on a KEY_OFFER. The relay recognises it by the `type` field in the frame HEADER only, never by the body, so the relay stays body-blind. The check applies whatever the TTL and hop of the frame are. The reason is `NOT_RELAYED_TYPE`.

Scope:
- In scope: single-frame messages (total = 1) heard by the live app on Room, Call and Quiet, of any type except KEY_OFFER, encrypted or not.
- Out of scope: KEY_OFFER frames, multi-frame messages (total greater than 1), and any automatic or timed relaying. Multi-frame relaying is left to a later spec. Radio, walkie-talkie and other untested channels are not claimed.

### Forward note for the crypto spec

The `crypto` spec must keep `ttl` and `hop` outside the encrypted and authenticated part of a frame. They must never be in the AAD or in the ciphertext. Only the message ID and the type may be authenticated as AAD (per the byte-budget steering). Then a relay that holds no key can carry an encrypted message (such as an encrypted TEXT) it cannot read, and the receiver's authentication check still passes, because the relay changes only bytes that the check does not cover. Relays re-broadcast the original ciphertext and never re-encrypt. The group key itself travels only in a KEY_OFFER, which a relay never passes on. Requirement 2.9 pins this from the relay side.

Assumptions (accepted at review):
1. Pass-on keeps the wire bytes (Held_Wire) of a heard frame in memory for the current session only. `ui-shell` requirement 16.5 forbids storing binary data, so the Held_Wire is never stored. The boolean `passedOn` on the slip is not binary data and IS persisted with the slip. After a reload, a slip that was passed on shows "Passed on", and a slip that was not passed on shows no Pass it on action and says why.
2. Pass-on is offered once per message per phone. After the tap the slip shows "Passed on" and offers no second tap.
3. The channel used to pass a message on is the channel selected on the switch at tap time. The decoders do not report which channel a frame arrived on.
4. A KEY_OFFER is never passed on (see "KEY_OFFER is never relayed").

## Glossary

- **Relay**: The pure module `src/protocol/relay.ts` that decides whether a heard frame may be passed on and produces the wire bytes to re-play. It imports nothing from `src/audio` or `src/ui`. It is body-blind (see the Introduction). It may read the header fields `type`, `total`, hop and TTL, and never the body or the encrypted flag, for a decision.
- **Relay_State**: The in-memory record of message keys this phone has heard, passed on or sent, with its cap. It holds no binary data and is never persisted.
- **Heard_Slip**: A Tape slip that the app prints for a received single-frame frame and that can carry the Pass_On_Action. It is either a received TEXT message slip printed by `receiveFrame`, or an Unreadable_Notice.
- **Unreadable_Notice**: A Tape notice slip that the app prints for a received single-frame frame whose body this phone cannot read (for example an encrypted frame, which the live app prints as an "unsupported" notice today, or a frame of a type the app does not show). It carries no body text.
- **Not_Relayed_Type**: The message type KEY_OFFER (type value 4), which a relay never passes on. It is recognised by the `type` field in the frame header only.
- **Passed_On_Flag**: The boolean `passedOn` stored on a Heard_Slip. It is true after the user passes the message on. It is the only relay datum persisted with a slip.
- **Pass_On_Action**: The "Pass it on → hop N" button on a Heard_Slip.
- **Relay_Controller**: The part of `src/ui/controller.ts` that handles a tap on the Pass_On_Action and calls `UiTransport.send`.
- **Held_Wire**: The original received wire bytes of a heard frame, kept in memory next to its Heard_Slip for the current session only.
- **Hops_Left**: The `ttl` field of a frame.
- **Hop_Count**: The `hop` field of a frame.
- **Message_Key**: The result of `frameKey` for a frame: lowercase hex message ID, a colon, and the frame index in decimal.
- **Relayable_Frame**: A frame whose header decodes, whose `total` equals 1, whose `type` is not KEY_OFFER, whose Hops_Left is at least 1 and whose Hop_Count is below 15. The encrypted flag and the body play no part.
- **Patched_Wire**: The bytes returned by `patchRouting(heldWire, hop + 1, ttl - 1)`.
- **End_Of_Line_Reason**: The plain-language text on a Heard_Slip that has no hops left or cannot be passed on.
- **SEEN_MAX**: The cap of the Relay_State, 256 Message_Keys.
- **UiTransport**, **Tape**, **Slip**, **Well_Limit**: As defined in `ui-shell`.

## Requirements

### Requirement 1: Relayable frames

**User Story:** As a person holding a phone that heard a message, I want the app to offer Pass it on for every message that can really be passed on, so that I never send a frame the network will drop and never block one I cannot read.

#### Acceptance Criteria

1. THE Relay SHALL provide `canRelay(frame)` that returns true if and only if the frame is a Relayable_Frame.
2. IF a frame has `total` greater than 1, THEN THE Relay SHALL report the reason `MULTI_FRAME`.
3. IF a frame has the header type KEY_OFFER, THEN THE Relay SHALL report the reason `NOT_RELAYED_TYPE`, whatever its Hops_Left and Hop_Count are.
4. IF a frame has Hops_Left of 0, THEN THE Relay SHALL report the reason `NO_HOPS_LEFT`.
5. IF a frame has Hop_Count of 15, THEN THE Relay SHALL report the reason `HOP_LIMIT`, even when Hops_Left is at least 1.
6. WHEN a frame has `total` equal to 1, a type other than KEY_OFFER, Hops_Left of at least 1 and Hop_Count below 15, THE Relay SHALL accept it, including TEXT, SOS, LOCATION, SAFE, RESEND_REQUEST and a type this phone does not know, and whatever its encrypted flag and body are.
7. THE Relay SHALL base its decision only on the header fields `type`, `total`, Hop_Count and Hops_Left, and SHALL NOT read the encrypted flag or the body to accept or reject a frame, and SHALL NOT report a reason that depends on them.
8. THE Relay SHALL identify KEY_OFFER by the `type` field of the header and SHALL NOT inspect the body for that purpose.
9. WHEN several reasons apply, THE Relay SHALL report the first in this order: `MULTI_FRAME`, `NOT_RELAYED_TYPE`, `NO_HOPS_LEFT`, `HOP_LIMIT`.
10. THE Relay SHALL return a Result and SHALL NOT throw for any input.

### Requirement 2: Pass-on produces the same message with the hops lowered

**User Story:** As a relaying person, I want the phone to re-play the exact message I heard, so that nothing is retyped, re-encoded, decrypted or altered on the way.

#### Acceptance Criteria

1. WHEN `relayWire(heldWire)` is called with the Held_Wire of a Relayable_Frame, THE Relay SHALL return the Patched_Wire with hop increased by 1 and TTL decreased by 1.
2. THE Relay SHALL produce the Patched_Wire by calling `patchRouting` on the Held_Wire and SHALL NOT call `encodeFrame`, `splitPayload`, `makeFrames` or `newMessageId`.
3. THE Patched_Wire SHALL differ from the Held_Wire only at byte 1 (the routing byte) and in the 2-byte CRC trailer.
4. THE Patched_Wire SHALL keep the message ID, type, encrypted flag, frame index, total and body of the Held_Wire unchanged, byte for byte.
5. THE Patched_Wire SHALL be accepted by `decodeFrame` and SHALL be at most 140 bytes long.
6. IF the CRC of the Held_Wire does not match its bytes, or `decodeFrame` rejects the Held_Wire for any other reason, THEN THE Relay SHALL return that decode error (including `BAD_CRC`) and SHALL produce no bytes, so that the Relay never re-seals a corrupted frame with a fresh valid CRC.
7. WHEN the Held_Wire belongs to a frame that is not a Relayable_Frame, including a KEY_OFFER, THE Relay SHALL return the reason of Requirement 1 and SHALL produce no bytes.
8. THE Relay SHALL read the type field only to refuse KEY_OFFER, SHALL NOT decode or inspect the body, SHALL hold no key, and SHALL never encrypt or decrypt, so that the body bytes of an encrypted frame stay untouched.
9. THE hop and TTL fields SHALL stay outside the authenticated data, as `aadFor` and `ivFor` already define, so that a Patched_Wire yields the same `aadFor` and `ivFor` output as its Held_Wire and a receiver's authentication check on a relayed encrypted frame passes.
10. THE Relay SHALL NOT change the original sender's `SEND_TTL`, so that a message sent with `SEND_TTL` of 3 can be passed on at most 3 times along one path.
11. WHEN `patchRouting` writes the new hop and TTL, THE Relay SHALL rely on it to recompute the CRC over the patched bytes, so that the Patched_Wire carries a CRC that matches its own bytes.

### Requirement 3: Duplicate suppression

**User Story:** As a person in a room with two relaying phones, I want each message to be shown and passed on once, so that two relays do not loop the same message.

#### Acceptance Criteria

1. THE Relay_State SHALL record the Message_Key of every frame this phone has heard (including frames it did not print), of every frame this phone has passed on, and of every frame this phone has sent successfully (criterion 12).
2. WHEN `receiveFrame` receives a frame whose Message_Key is in the Relay_State, THE Tape SHALL print nothing and THE Relay_State SHALL stay unchanged.
3. WHEN this phone passes a message on, THE Relay_State SHALL record the Message_Key of the message, so that a later copy of that message, with any Hop_Count and Hops_Left, is ignored.
4. WHEN a frame with `ownEcho` true is heard, THE Tape SHALL print nothing, as `ui-shell` requirement 7.2 states.
5. THE Relay_State SHALL key copies of one message by message ID and frame index only, so that copies that differ in Hop_Count and Hops_Left count as the same message.
6. THE Relay_State SHALL keep at most SEEN_MAX keys (256) and SHALL drop the oldest key first, so that the list cannot grow without bound.
7. IF a key has been dropped by the cap, THEN THE Relay_State SHALL treat a later copy as new, and the spec accepts that a person must tap to pass it on again.
8. THE Relay_State SHALL live in memory only. THE app SHALL NOT write the Relay_State, any Message_Key list or any Held_Wire to localStorage, IndexedDB, the Cache API or any other storage, and a fresh session SHALL start with an empty Relay_State.
9. WHEN the same Heard_Slip has been passed on, THE Pass_On_Action SHALL be removed from that slip.
10. WHEN a Heard_Slip is passed on, THE app SHALL set the Passed_On_Flag of that slip to true and SHALL persist it with the slip through the existing slip storage of `ui-shell`.
11. THE Passed_On_Flag SHALL be a boolean and SHALL be the only relay datum stored with a slip, so that `ui-shell` requirement 16.5 (no binary data stored) still holds.
12. WHEN this phone sends a message successfully (`UiTransport.send` returns ok for a Transmit), THE Relay_State SHALL record the Message_Key of every frame of that message, using the same capped, memory-only list, so that a passed-on copy of its own message, with any Hop_Count and Hops_Left, prints no slip. IF the send returns `BUSY` or another error, THEN THE Relay_State SHALL record no key for that message.

### Requirement 4: The Pass it on action on a Heard slip

**User Story:** As a person who heard a message, I want a clear button to pass it on, even when I cannot read the message, so that I can help it reach someone farther away.

#### Acceptance Criteria

1. WHEN the app receives a Relayable_Frame that is not an own echo and not a duplicate, THE app SHALL keep its Held_Wire in memory next to a Heard_Slip, whatever the encrypted flag of the frame is.
2. WHEN a Heard_Slip is for a Relayable_Frame, its Held_Wire is available and its Passed_On_Flag is false, THE Tape SHALL show the Pass_On_Action with the label "Pass it on → hop N", where N is Hop_Count plus 1.
3. WHEN a received frame is a single-frame message that is not a KEY_OFFER, whose body this phone cannot read and whose Hops_Left is at least 1 and Hop_Count is below 15, THE app SHALL print an Unreadable_Notice with the Pass_On_Action and the text "Can’t read this message. You can still pass it on."
4. IF a Heard_Slip is for a frame with Hops_Left of 0, THEN THE Tape SHALL show no Pass_On_Action and SHALL show the End_Of_Line_Reason "End of the line. This message has no hops left to pass on."
5. IF a Heard_Slip is for a frame with Hop_Count of 15 and Hops_Left of at least 1, THEN THE Tape SHALL show no Pass_On_Action and SHALL show the End_Of_Line_Reason "End of the line. This message has gone as far as it can."
6. IF a Heard_Slip has no Held_Wire (loaded from storage after a reload) and its Passed_On_Flag is false, THEN THE Tape SHALL show no Pass_On_Action and SHALL show the End_Of_Line_Reason "Can’t be passed on after the app restarts."
7. IF a Heard_Slip is for a multi-frame message, THEN THE Tape SHALL show no Pass_On_Action and SHALL show the End_Of_Line_Reason "Long messages can’t be passed on yet."
8. WHILE the power is off, a transmission is in flight, or a fault is set, THE Pass_On_Action SHALL be disabled and SHALL keep its label.
9. THE Pass_On_Action SHALL have a tap target of at least 44 by 44 px, an accessible name that includes the next hop, and keyboard operation, as `ui-shell` requirement 19.3 states.
10. WHEN the user passes a message on, THE Heard_Slip SHALL show the text "Passed on" in place of the Pass_On_Action, and THE Tape SHALL NOT print a separate Relayed slip.
11. THE Tape SHALL render the End_Of_Line_Reason and the Unreadable_Notice text as text and never as HTML.
12. THE Heard_Slip SHALL keep Hops_Left in memory next to Hop_Count, so that criteria 4 to 5 can be decided without the Held_Wire.
13. THE Unreadable_Notice SHALL show no body bytes and no decoded text, and SHALL show no message type name, except the KEY_OFFER reason of criterion 14, which the relay reads from the header type.
14. IF a Heard_Slip or Unreadable_Notice is for a KEY_OFFER frame, THEN THE Tape SHALL show no Pass_On_Action, SHALL NOT show the text "You can still pass it on", and SHALL show the End_Of_Line_Reason "Group keys can’t be passed on. Join in the same room."
15. WHEN an Unreadable_Notice has Hops_Left of 0, THE Tape SHALL show the no-hops-left End_Of_Line_Reason of criterion 4 and SHALL NOT show the text "You can still pass it on".
16. FOR ALL Unreadable_Notices, THE Tape SHALL show the text "You can still pass it on" if and only if the notice also shows the Pass_On_Action, which holds only when the frame is a Relayable_Frame.
17. WHEN a Heard_Slip with a Passed_On_Flag of true is loaded from storage after a reload, THE Tape SHALL show "Passed on" and no Pass_On_Action, and SHALL NOT show the restart reason of criterion 6. Any other slip (for example a System slip that is not an Unreadable_Notice, such as `mic-again`) SHALL show neither "Passed on" nor a Pass_On_Action nor an End_Of_Line_Reason, whatever its Passed_On_Flag is.

### Requirement 5: Hop count on the slip

**User Story:** As a reader, I want to see how many phones a message passed through, so that I can judge how far it travelled.

#### Acceptance Criteria

1. WHEN a Heard_Slip is for a frame with Hop_Count of 1, THE Slip SHALL show "via 1 hop" in its meta line.
2. WHEN a Heard_Slip is for a frame with Hop_Count of n greater than 1, THE Slip SHALL show "via n hops" in its meta line.
3. WHEN a Heard_Slip is for a frame with Hop_Count of 0, THE Slip SHALL show no "via" text.
4. THE Slip SHALL take the number from the Hop_Count of the frame as received, and SHALL NOT change it when the user passes the message on.
5. THE copy file `src/ui/copy.ts` SHALL hold the "via" strings, the End_Of_Line_Reason strings, the Unreadable_Notice text and "Passed on", so that no component hard-codes them.

### Requirement 6: Nothing is sent automatically

**User Story:** As a person with a limited battery who owns what my phone says aloud, I want relaying only when I tap, so that my phone never broadcasts on its own.

#### Acceptance Criteria

1. THE Relay_Controller SHALL call `UiTransport.send` for a relay only from the handler of a tap or keyboard activation on the Pass_On_Action.
2. WHEN a frame is heard, THE app SHALL NOT call `UiTransport.send`, whatever the frame's type and Hops_Left are.
3. THE app SHALL NOT queue, schedule, retry or repeat a relay after a failure, and SHALL leave the Pass_On_Action available for another tap.
4. WHEN the user taps the Pass_On_Action, THE Relay_Controller SHALL send exactly one transmission of the Patched_Wire.
5. IF `UiTransport.send` returns `BUSY`, THEN THE Relay_Controller SHALL keep the Pass_On_Action and the Relay_State unchanged, so that the user can tap again.
6. IF `UiTransport.send` returns an error other than `BUSY`, THEN THE Relay_Controller SHALL keep the Relay_State unchanged, print a System notice slip with a plain reason, and keep the Pass_On_Action.
7. WHEN `UiTransport.send` returns ok, THE Relay_Controller SHALL record the Message_Key in the Relay_State, set the Passed_On_Flag of the Heard_Slip to true, and show the sending cues of `ui-shell` requirement 6.4 (SD lit, `ATDT` with the airtime, signal line pulse, haptic where available).
8. THE Relay_Controller SHALL start no audio and no microphone, because the tap happens while the power is already on.
9. IF the Relay_Controller is asked to pass on a frame that is not a Relayable_Frame, including a KEY_OFFER, THEN THE Relay_Controller SHALL NOT call `UiTransport.send`.

### Requirement 7: Channels

**User Story:** As a relaying person, I want to pass a message on through whichever channel suits my situation, so that the message can cross a room, a phone call or a quiet space.

#### Acceptance Criteria

1. THE Relay_Controller SHALL send the Patched_Wire with the channel currently selected on the channel switch, which may be Room, Call or Quiet.
2. THE Relay SHALL produce the same Patched_Wire bytes on every channel, so that the channel choice affects only how the bytes are played.
3. WHEN the channel is Quiet, THE Device_Screen SHALL keep the amber older-phones notice of `ui-shell` requirement 10.5 while a message is passed on.
4. THE app copy for Pass it on SHALL name only Room, Call and Quiet, and SHALL NOT mention radio, walkie-talkie or internet calls.
5. WHILE a transmission is in flight, THE channel switch SHALL ignore changes, as `ui-shell` requirement 10.4 states.

### Requirement 8: Limits and offline operation

**User Story:** As a user with no internet, I want relaying to work fully offline within the protocol limits.

#### Acceptance Criteria

1. THE Relay SHALL never produce Wire_Bytes longer than 140 bytes, and the length of a Patched_Wire SHALL equal the length of its Held_Wire.
2. THE Relay SHALL make no network call and SHALL import no module that does, and the existing source-scan test of `ui-shell` requirement 20.5 SHALL cover the relay files.
3. THE Relay SHALL import only from `src/protocol` and SHALL run in Node under Vitest with `environment: node`.
4. THE Held_Wire SHALL be kept in memory only, for the Heard_Slips that are on the Tape, and SHALL be dropped when its slip is dropped by the 50-slip cap of `ui-shell` requirement 7.11.
5. THE `src/ui` code SHALL import the Relay only through the `src/protocol` index, and `src/protocol/index.ts` SHALL export `canRelay` and `relayWire` with their public types.
6. THE size table of `frame-protocol` SHALL stay unchanged, because relay adds no header byte, no field and no airtime beyond the frame that was heard.

### Requirement 9: Correctness properties

**User Story:** As a protocol engineer, I want the hop, TTL, body-blindness and duplicate rules pinned by property-based tests, so that flooding stays bounded and idempotent and the relay never touches content.

#### Acceptance Criteria

1. THE test suite SHALL include a property test file `relay.prop.test.ts` using fast-check, which prints the seed on failure.
2. FOR ALL Relayable_Frames, passing a message on twice from the same Held_Wire SHALL return equal bytes (idempotent re-broadcast).
3. FOR ALL Relayable_Frames, the Patched_Wire SHALL have a Hop_Count exactly 1 greater than the Held_Wire, and FOR ALL chains of passes the Hop_Count SHALL never decrease (hop count only increases).
4. FOR ALL Relayable_Frames, the Patched_Wire SHALL have Hops_Left exactly 1 lower than the Held_Wire, and the sum Hop_Count plus Hops_Left SHALL stay equal across a chain of passes.
5. FOR ALL frames with an origin Hops_Left of t from 0 to 15 and Hop_Count of 0, a chain of passes SHALL end after at most t passes, and the frame after the last pass SHALL not be a Relayable_Frame (TTL always ends propagation).
6. FOR ALL frames of a type other than KEY_OFFER with Hop_Count of 15, `relayWire` SHALL return `HOP_LIMIT` (or `MULTI_FRAME` when `total` is greater than 1, or `NO_HOPS_LEFT` when Hops_Left is 0, by the order of Requirement 1.9) and SHALL produce no bytes.
7. FOR ALL single-frame frames of any type except KEY_OFFER with Hops_Left of at least 1 and Hop_Count below 15, with any encrypted flag and any body bytes (including random bytes that look encrypted, and bodies that are not valid UTF-8), the body bytes of the Patched_Wire SHALL be identical to the body bytes of the Held_Wire, and `relayWire` SHALL accept the frame (body-blind relay).
8. FOR ALL pairs of Held_Wires that have equal header fields (message ID, type, index, total, hop, TTL) and different bodies of equal length, `canRelay` SHALL give the same answer, and the reason and the routing change of `relayWire` SHALL be the same (metamorphic property). The decision MAY depend on the header fields type, total, Hop_Count and Hops_Left, and SHALL NOT depend on body bytes or on the encrypted flag, so the property SHALL also hold for pairs that differ only in the encrypted flag.
9. A source-scan test SHALL show that `src/protocol/relay.ts` never reads the body of a frame (it reads no `body` property and slices no bytes past the header, except through `decodeFrame` and `patchRouting` for the CRC check).
10. FOR ALL Relayable_Frames, the Patched_Wire SHALL differ from the Held_Wire only at byte 1 and in the CRC trailer, SHALL carry a CRC that matches its own bytes, and SHALL decode to a frame with an equal message ID, type, encrypted flag, index, total and body.
11. FOR ALL Relayable_Frames, `frameKey`, `aadFor` and `ivFor` SHALL be equal for the Held_Wire and the Patched_Wire.
12. FOR ALL Held_Wires with a wrong CRC (a valid frame with any single byte changed outside the CRC trailer, or any change to the trailer), `relayWire` SHALL return a decode error and produce no bytes, so that a bad CRC is never re-sealed.
13. FOR ALL sequences of inserts into the Relay_State, of any length and with any duplicates, the number of stored Message_Keys SHALL never exceed SEEN_MAX (256), and once the cap is reached an insert SHALL drop the oldest key.
14. FOR ALL sequences of heard frames, in any order and with any duplicates, THE Relay_State SHALL accept each Message_Key at most once while it is held, so that a repeated message ID (with any Hop_Count and Hops_Left) never produces a second slip (duplicate IDs ignored).
15. FOR ALL runs of the Relay_State and the Relay_Controller, no call SHALL write a Message_Key list, the Relay_State or a Held_Wire to any storage API. The test SHALL install a recording stub for `localStorage`, `indexedDB` and the Cache API and SHALL show that the only relay datum written is the boolean Passed_On_Flag of a slip, and that no written value contains a Held_Wire or a Message_Key.
16. FOR ALL pairs of phones that hear each other's passes of one message, THE system SHALL pass the message through each phone at most once, so that two relays in one room do not loop. The test SHALL model this with a simulated set of phones that each apply the Relay_State rule and relay every frame they accept.
17. FOR ALL byte arrays of length 0 to 200, `canRelay` and `relayWire` SHALL return without throwing.
18. FOR ALL KEY_OFFER frames, with any Hops_Left from 0 to 15 and any Hop_Count from 0 to 15, `canRelay` SHALL return false and `relayWire` SHALL return `NOT_RELAYED_TYPE` and produce no bytes (KEY_OFFER is never relayed).
19. THE fast properties in criteria 2 to 18 SHALL use the default run count and SHALL NOT call ggwave. A slow test MAY send a Patched_Wire through the real modem under each channel profile and SHALL accept either an equal frame, a decode error, or no result (never a different frame), as `frame-protocol` Property 14 states.
20. FOR ALL messages this phone sent successfully, and FOR ALL later copies of any frame of that message with any Hop_Count and Hops_Left (as produced by one or more passes on other phones), `receiveFrame` SHALL print no slip and SHALL leave the Relay_State unchanged, even when `ownEcho` is false. FOR ALL sends that return `BUSY` or another error, the Relay_State SHALL stay unchanged.

## Open items for review

Settled:
1. Pass-on after a reload: the Held_Wire is never stored, so an un-passed slip offers no action after a reload and says why. The boolean Passed_On_Flag is persisted, so a slip that was passed on still shows "Passed on" (assumption 1, Requirements 3.10, 3.11 and 4.17). The Relay_State dedupe list stays memory-only.
2. `SEND_TTL` stays 3 (a design parameter). Raising it is a one-constant change if three hops is too few.
3. TTL goes down by one and hop goes up by one in the same patch, as `frame-protocol` defines. The earlier "hop count lowered by one" wording is not used.
4. One Pass it on tap per message per phone, with the channel chosen on the switch at tap time, and "Passed on" shown on the slip.
5. KEY_OFFER is never relayed. `frame-protocol` wins: a group key is handed over only in the same room. The relay refuses it by header type (`NOT_RELAYED_TYPE`) and stays body-blind (Requirements 1.3, 1.8, 4.14 and 9.18). This replaces the earlier open question about warning before a KEY_OFFER is passed on.
6. The decision may depend on the header fields type, total, hop and TTL, never on body bytes or the encrypted flag. Body-blindness is tested by the metamorphic property (9.8) and a source scan (9.9). No read-counting spy is used.
7. The Unreadable_Notice offers "You can still pass it on" only when the frame is relayable (TTL of at least 1, hop below 15, not KEY_OFFER). With TTL of 0 it shows the no-hops-left reason (Requirements 4.15 and 4.16).
8. A sender ignores passed-on copies of its own message. The real-modem test found that the own-echo check in `src/audio/own-echo.ts` matches exact bytes only, and a Patched_Wire differs at byte 1 and in the CRC, so the sender saw its own message as new. The fix is in the Controller: a successful Transmit records the Message_Key of every sent frame in the Relay_State (Requirements 3.12 and 9.20). The own-echo byte matching in `src/audio` is unchanged and still catches the sender's direct echo.

Open:
1. Multi-frame relaying is out of scope. It needs a rule for passing a whole set of frames (and the partial-set case) and is left to a later spec.
2. Frames the app prints no slip for. Requirement 4.1 keeps a Held_Wire and 4.3 prints an Unreadable_Notice for any unreadable single-frame frame. Whether SOS, LOCATION and SAFE get their own slips with a Pass_On_Action (owned by the specs for those types) or only the generic Unreadable_Notice is not decided here. The minimal rule stands until those specs exist. KEY_OFFER is settled and gets no Pass_On_Action.
3. The `crypto` spec must keep `ttl` and `hop` outside the AAD and the ciphertext, authenticate only the message ID and type, and never re-encrypt on relay (see "Forward note for the crypto spec"). That spec must restate this as its own criteria.
4. The Unreadable_Notice and KEY_OFFER reason wording is first-draft copy and needs a copy review.
