# Requirements Document

## Introduction

The frame protocol defines the bytes that Dial Tone hands to ggwave for one transmission. A frame carries a message ID, hop count, TTL, frame index and total, an encryption flag, a message type, a body and a 2-byte CRC-16 trailer. The whole frame must fit ggwave's 140-byte payload cap. These requirements are derived from the approved `design.md` in this folder and constrain the pure TypeScript module in `src/protocol/`.

Revision note: the slow ggwave test found that ggwave 0.4.0 FASTEST modes silently return wrong bytes for some payloads, even without noise. The decision is to add a CRC-16 trailer to every frame. This is the header-growth case that Requirement 15 governs: `design.md` states the 2 extra bytes, about 0.2 s of airtime per frame, and the new capacities in its size table. The new trailer is specified in Requirement 17, and the clauses it changes are 1.11, 2.1, 3.1, 3.6, 3.13, 3.15, 4.6, 5.1 to 5.6, 6.6, 6.7, 10.1, 10.6, 10.10, 12.2, 13.1, 13.5, 14.1 to 14.5 and 15.3.

Out of scope: AES-GCM sealing and opening (`crypto` spec), dedupe and the relay decision (`relay` spec), message body formats for LOCATION, SAFE, SOS and RESEND_REQUEST (`ui-flows` and later specs), and audio capture and playback (`src/audio`). Duties that fall on those specs are listed under "Obligations on other specs" after the numbered requirements. They are not requirements on this module.

Numbering rule: requirement numbers and clause numbers are stable. `design.md` correctness properties reference clauses as "Validates: Requirements X.Y". Never renumber. A removed clause stays in place marked "(withdrawn)". New clauses are appended at the end of their requirement, and new requirements are appended after the last one.

Error precedence rule: every function that can return several errors returns the first failing check in the order given by its precedence clause (2.10 for encode, 3.13 for decode, 8.9 for makeFrames, 9.8 for reassemble, 10.9 for patchRouting, 11.7 for aadFor and ivFor).

## Glossary

- **Frame_Codec**: The `frame.ts` component with `encodeFrame`, `decodeFrame`, `patchRouting` and `frameKey`.
- **Crc16**: The `crc16.ts` component with the function `crc16`, used only by Frame_Codec.
- **Budget**: The `budget.ts` component that holds the byte constants and `headerLength`, `frameOverhead`, `wireBodyCapacity`, `plaintextCapacity` and `utf8ByteLength`.
- **Segmenter**: The `segment.ts` component with `splitPayload`, `makeFrames` and `reassemble`.
- **Crypto_Inputs**: The `frame-crypto-inputs.ts` component with `aadFor` and `ivFor`.
- **Message_ID_Generator**: The `message-id.ts` component with `newMessageId`.
- **Protocol_Index**: The single file `src/protocol/index.ts` that re-exports the public API of `src/protocol`.
- **Frame_Protocol_Spec**: The `requirements.md` and `design.md` files in this spec folder.
- **Test_Suite**: The Vitest and fast-check tests of `src/protocol`, including the slow test file that loads `vendor/ggwave.js`.
- **Result**: The return type `{ ok: true, value } | { ok: false, error: { code } }` used for every function that can fail on data.
- **Frame**: A header plus a body, serialized as one wire byte array. The Frame object does not contain the CRC_Trailer.
- **Valid_Frame**: A Frame that passes every encode validation rule of Requirement 2, including the KEY_OFFER rules of Requirement 6, and whose encoded length is at most 140 bytes.
- **Wire_Bytes**: The `Uint8Array` form of a Frame including its CRC_Trailer, passed to and from ggwave.
- **CRC_Trailer**: The last 2 bytes of Wire_Bytes: the CRC-16/CCITT-FALSE of every preceding byte, high byte first. Defined in Requirement 17.
- **Header_Length**: 10 bytes when `total` is 1, 11 bytes when `total` is greater than 1. It does not include the CRC_Trailer.
- **Frame_Overhead**: Header_Length plus the 2-byte CRC_Trailer: 12 bytes for a single frame and 13 bytes for a multi-frame message.
- **Body**: The plaintext payload, or ciphertext followed by the TAG_LEN-byte tag when the encrypted flag is set.
- **Wire_Body_Capacity**: The maximum Body length on the wire, equal to GGWAVE_MAX_PAYLOAD minus Frame_Overhead: 128 for a single frame and 127 for a multi-frame message. The encrypted flag does not change it.
- **Plaintext_Capacity**: The maximum plaintext chunk length that fits in one frame, equal to Wire_Body_Capacity minus TAG_LEN when encrypted and equal to Wire_Body_Capacity when plaintext. With TAG_LEN = 16 the four values are 128 (single, plaintext), 112 (single, encrypted), 127 (multi, plaintext) and 111 (multi, encrypted). These numbers are worked examples, not constants.
- **Routing_Byte**: Byte 1 of Wire_Bytes, holding hop in the high 4 bits and TTL in the low 4 bits.
- **KEY_OFFER**: Message type 4, which carries the group key for the key screech.
- **Message_ID**: The 8-byte identifier shared by all frames of one message.
- **AAD**: Additional authenticated data for AES-GCM, produced by Crypto_Inputs.
- **IV**: The 12-byte AES-GCM nonce derived by Crypto_Inputs and never transmitted.
- **ggwave**: The vendored ggwave 0.4.0 WASM modem.
- **Channel_Profile**: A ggwave protocol and speed combination named in `field-findings.md` (for example DT fastest, audible fastest, ultrasound fastest).

## Requirements

### Requirement 1: Frame layout and field ranges

**User Story:** As a protocol engineer, I want a fixed, compact frame layout with defined field ranges, so that every node parses the same bytes the same way and header cost stays small.

#### Acceptance Criteria

1. THE Frame_Codec SHALL encode byte 0 as version in bits 7 to 6, encrypted flag in bit 5, multi-frame flag in bit 4, message type in bits 3 to 1, and a reserved bit 0 set to 0.
2. THE Frame_Codec SHALL encode byte 1 as hop in bits 7 to 4 and TTL in bits 3 to 0.
3. THE Frame_Codec SHALL encode bytes 2 to 9 as the 8-byte Message_ID.
4. WHERE the Frame has a total greater than 1, THE Frame_Codec SHALL encode byte 10 as frame index in bits 7 to 4 and total minus 1 in bits 3 to 0, and SHALL start the Body at byte 11.
5. WHERE the Frame has a total of 1, THE Frame_Codec SHALL omit the frame-index byte and start the Body at byte 10.
6. THE Frame_Codec SHALL use protocol version 1 and SHALL treat every other version value, including 0, as invalid.
7. THE Frame_Codec SHALL accept hop and TTL values from 0 to 15, total from 1 to 16, and frame index from 0 to total minus 1.
8. THE Frame_Codec SHALL accept message types 0 (TEXT), 1 (LOCATION), 2 (SAFE), 3 (SOS), 4 (KEY_OFFER) and 5 (RESEND_REQUEST), and SHALL treat types 6 and 7 as unknown.
9. THE Frame_Codec SHALL set the multi-frame flag to 1 if and only if total is greater than 1.
10. THE Frame_Codec SHALL encode and decode a Frame of type 5 (RESEND_REQUEST) with an opaque Body and SHALL leave the Body format to a later spec.
11. THE Frame_Codec SHALL end every Wire_Bytes array with the 2-byte CRC_Trailer of Requirement 17, so that the Body ends two bytes before the end of the frame.

### Requirement 2: Frame encoding and validation

**User Story:** As a sender, I want the encoder to reject invalid frames and produce one canonical byte form, so that nothing malformed or ambiguous reaches ggwave.

#### Acceptance Criteria

1. WHEN a Valid_Frame is provided, THE Frame_Codec SHALL return Wire_Bytes whose length equals Header_Length plus Body length plus 2 (the CRC_Trailer length).
2. IF a Frame has a Message_ID that is not exactly 8 bytes, THEN THE Frame_Codec SHALL return the error `BAD_ID_LENGTH`.
3. IF a Frame has a hop or TTL that is not an integer from 0 to 15, THEN THE Frame_Codec SHALL return the error `BAD_ROUTING`.
4. IF a Frame has a total that is not an integer from 1 to 16, or an index that is not an integer from 0 to total minus 1, THEN THE Frame_Codec SHALL return the error `BAD_FRAME_INDEX`.
5. IF a Frame has a message type outside 0 to 5, THEN THE Frame_Codec SHALL return the error `BAD_TYPE`.
6. IF a Frame has a version other than 1, THEN THE Frame_Codec SHALL return the error `BAD_VERSION`.
7. IF a Frame has the encrypted flag set and a Body shorter than TAG_LEN bytes, THEN THE Frame_Codec SHALL return the error `BODY_TOO_SHORT`.
8. WHEN `encodeFrame` returns Wire_Bytes, THE Frame_Codec SHALL return a new array that does not alias the input Body or Message_ID, and SHALL leave the input Frame unmodified.
9. FOR ALL Valid_Frames, decoding the result of encoding SHALL produce a Frame deeply equal to the original (round-trip property).
10. IF a Frame fails more than one validation rule, THEN THE Frame_Codec SHALL return the error of the first failing check in this order: `BAD_VERSION`, `BAD_ID_LENGTH`, `BAD_ROUTING`, `BAD_FRAME_INDEX`, `BAD_TYPE`, `BODY_TOO_SHORT` (encrypted flag set), `KEY_OFFER_ENCRYPTED`, `KEY_OFFER_MULTIFRAME`, `BODY_TOO_SHORT` (type KEY_OFFER), `FRAME_TOO_LONG`.
11. THE Frame_Codec SHALL provide `frameKey` that returns the lowercase hexadecimal Message_ID, a colon, and the frame index in decimal.

### Requirement 3: Frame decoding and canonical form

**User Story:** As a receiver, I want strict decoding of heard bytes, so that corrupted or foreign frames are dropped and every accepted frame has exactly one byte representation.

#### Acceptance Criteria

1. IF the input has fewer than 12 bytes, THEN THE Frame_Codec SHALL return the error `TOO_SHORT`.
2. IF the input has more than 140 bytes, THEN THE Frame_Codec SHALL return the error `TOO_LONG`.
3. IF the version bits are not 1, THEN THE Frame_Codec SHALL return the error `BAD_VERSION`.
4. IF the reserved bit is 1, THEN THE Frame_Codec SHALL return the error `RESERVED_BITS`.
5. IF the message type bits are 6 or 7, THEN THE Frame_Codec SHALL return the error `UNKNOWN_TYPE`.
6. IF the multi-frame flag is 1 and the input has fewer than 13 bytes, THEN THE Frame_Codec SHALL return the error `TOO_SHORT`.
7. IF the multi-frame flag is 1 and total minus 1 equals 0, THEN THE Frame_Codec SHALL return the error `NON_CANONICAL`.
8. IF the multi-frame flag is 1, total is at least 2 and the frame index is not less than total, THEN THE Frame_Codec SHALL return the error `BAD_FRAME_INDEX`.
9. IF the encrypted flag is 1 and the Body is shorter than TAG_LEN bytes, THEN THE Frame_Codec SHALL return the error `BODY_TOO_SHORT`.
10. WHEN the multi-frame flag is 0, THE Frame_Codec SHALL decode the frame as index 0 of total 1.
11. WHEN `decodeFrame` returns a Frame, THE Frame_Codec SHALL return a Frame whose Body and Message_ID do not alias the input bytes, and whose Body excludes the CRC_Trailer.
12. FOR ALL byte arrays accepted by `decodeFrame`, encoding the decoded Frame SHALL produce bytes equal to the input (canonical encoding property).
13. IF the input fails more than one decode check, THEN THE Frame_Codec SHALL return the error of the first failing check in this order: `TOO_SHORT` (fewer than 12 bytes), `TOO_LONG`, `BAD_CRC`, `BAD_VERSION`, `RESERVED_BITS`, `UNKNOWN_TYPE`, `KEY_OFFER_ENCRYPTED`, `KEY_OFFER_MULTIFRAME`, `TOO_SHORT` (multi-frame flag 1 and fewer than 13 bytes), `NON_CANONICAL`, `BAD_FRAME_INDEX`, `BODY_TOO_SHORT`. The two length checks and `BAD_CRC` come before every field check, so a frame with a wrong CRC returns `BAD_CRC` whatever its fields contain. Canonical form is checked before index validity, so a multi-frame flag of 1 with total 1 returns `NON_CANONICAL` whatever the frame index is.
14. THE Frame_Codec SHALL decode a TEXT Body as opaque bytes without validating UTF-8, so that the UI decodes text leniently.
15. IF the input has from 12 to 140 bytes and its CRC_Trailer is not equal to the CRC-16 of the preceding bytes, THEN THE Frame_Codec SHALL return the error `BAD_CRC` without reading any header field.

### Requirement 4: Length guard counts bytes

**User Story:** As a user, I want over-length messages rejected before sending, so that ggwave never silently truncates my message.

#### Acceptance Criteria

1. IF the encoded length of a Frame, including the CRC_Trailer, would exceed 140 bytes, THEN THE Frame_Codec SHALL return the error `FRAME_TOO_LONG` and SHALL NOT produce Wire_Bytes.
2. WHEN the encoded length of a Frame, including the CRC_Trailer, is 140 bytes or fewer and the Frame passes every other validation rule, THE Frame_Codec SHALL return Wire_Bytes.
3. (withdrawn, redundant with 4.1 and 4.2)
4. THE Budget SHALL provide `utf8ByteLength(text)` that returns a value equal to the length of `TextEncoder.encode(text)`, which counts UTF-8 bytes and not characters, and counts each unpaired surrogate as 3 bytes (the encoding of U+FFFD).
5. THE Segmenter SHALL take payloads as bytes and not as strings, and SHALL base every capacity decision on byte lengths, so that a caller who converts text with `TextEncoder` gets frames that never exceed 140 bytes for any Unicode string, including 2-byte, 3-byte and 4-byte code points and unpaired surrogates.
6. WHEN a Body has exactly Wire_Body_Capacity bytes for the Frame's total (128 when total is 1, 127 when total is greater than 1), THE Frame_Codec SHALL accept the Frame, and WHEN the Body has Wire_Body_Capacity plus 1 bytes, THE Frame_Codec SHALL return `FRAME_TOO_LONG`. The encrypted flag does not change this boundary.

### Requirement 5: Size and budget constants

**User Story:** As a developer, I want all size constants defined in one place, so that no other file hard-codes a byte count.

#### Acceptance Criteria

1. THE Budget SHALL export `GGWAVE_MAX_PAYLOAD` equal to 140, `VERSION` equal to 1, `MESSAGE_ID_LEN` equal to 8, `TAG_LEN` equal to 16, `IV_LEN` equal to 12, `HEADER_LEN_SINGLE` equal to 10, `HEADER_LEN_MULTI` equal to 11, `CRC_LEN` equal to 2, `MAX_FRAMES` equal to 16, `MAX_HOP` equal to 15 and `MAX_TTL` equal to 15.
2. THE Budget SHALL provide `headerLength(total)` that returns 10 when total is 1 and 11 when total is greater than 1.
3. THE Budget SHALL provide `wireBodyCapacity` that returns GGWAVE_MAX_PAYLOAD minus `frameOverhead`, which is 128 for a single frame and 127 for a multi-frame message, independent of the encrypted flag.
4. THE Budget SHALL provide `utf8ByteLength(text)` that returns the number of bytes in the UTF-8 encoding of the text.
5. THE Budget SHALL provide `plaintextCapacity` that returns `wireBodyCapacity` minus TAG_LEN when encrypted and `wireBodyCapacity` when plaintext, and SHALL derive both capacity functions from GGWAVE_MAX_PAYLOAD, `headerLength`, CRC_LEN and TAG_LEN without any hard-coded capacity value.
6. THE Budget SHALL provide `frameOverhead(total)` that returns `headerLength(total)` plus CRC_LEN, which is 12 when total is 1 and 13 when total is greater than 1.

### Requirement 6: KEY_OFFER constraints

**User Story:** As a group organizer, I want the key screech frame to be plaintext, single-frame and well-formed, so that the key is shared only as intended and the rules are enforceable by tests.

#### Acceptance Criteria

1. IF a Frame of type KEY_OFFER has the encrypted flag set, THEN THE Frame_Codec SHALL return the error `KEY_OFFER_ENCRYPTED` on encode.
2. IF a Frame of type KEY_OFFER has a total greater than 1, THEN THE Frame_Codec SHALL return the error `KEY_OFFER_MULTIFRAME` on encode.
3. IF decoded bytes have a correct CRC_Trailer, type bits 4 and the encrypted flag 1, THEN THE Frame_Codec SHALL return the error `KEY_OFFER_ENCRYPTED`.
4. IF decoded bytes have a correct CRC_Trailer, type bits 4 and the multi-frame flag 1, THEN THE Frame_Codec SHALL return the error `KEY_OFFER_MULTIFRAME`.
5. IF a KEY_OFFER Frame has a Body shorter than 16 bytes, THEN THE Frame_Codec SHALL return the error `BODY_TOO_SHORT` on encode and on decode.
6. WHEN a KEY_OFFER Frame has a 16-byte key and a group name of 0 to 112 UTF-8 bytes (Wire_Body_Capacity of 128 minus the 16-byte key), THE Frame_Codec SHALL encode it and decode it back to a deeply equal Frame, and any inequality SHALL count as a Frame_Codec defect and a Test_Suite failure.
7. IF a KEY_OFFER Frame has a 16-byte key and a group name of 113 UTF-8 bytes, THEN THE Frame_Codec SHALL return the error `FRAME_TOO_LONG`.
8. (withdrawn, the relay rules are listed under "Obligations on other specs")

### Requirement 7: Message ID generation

**User Story:** As a sender, I want random 8-byte message IDs, so that dedupe works and derived IVs are not reused.

#### Acceptance Criteria

1. WHEN `newMessageId` is called, THE Message_ID_Generator SHALL return a Result whose value is exactly 8 bytes.
2. WHEN an RNG function is injected, THE Message_ID_Generator SHALL return the 8 bytes produced by that function.
3. WHERE no RNG function is injected, THE Message_ID_Generator SHALL obtain bytes from `globalThis.crypto.getRandomValues`.
4. WHEN `newMessageId` is called 1,000 times with the default RNG, THE Message_ID_Generator SHALL return 1,000 distinct values.
5. (withdrawn, moved to Requirement 2 as clause 2.11)
6. IF an injected RNG function returns an array whose length is not 8, THEN THE Message_ID_Generator SHALL return the error `BAD_RNG`.

### Requirement 8: Payload splitting

**User Story:** As a sender, I want long payloads split into frames that each fit the cap, so that long messages can be sent as several transmissions.

#### Acceptance Criteria

1. WHEN the payload length is at most the single-frame Plaintext_Capacity for the encryption mode, THE Segmenter SHALL return exactly one chunk equal to the payload.
2. WHEN the payload length exceeds the single-frame Plaintext_Capacity, THE Segmenter SHALL return chunks that each have at most the multi-frame Plaintext_Capacity bytes.
3. FOR ALL payloads, THE Segmenter SHALL return chunks whose concatenation equals the payload.
4. WHERE the `utf8Boundaries` option is set, THE Segmenter SHALL cut only between UTF-8 sequences, so that each chunk is valid UTF-8 on its own.
5. IF more than 16 chunks are needed, THEN THE Segmenter SHALL return the error `TOO_MANY_FRAMES`.
6. THE Segmenter SHALL split greedily, so that each chunk is as long as the multi-frame Plaintext_Capacity and the permitted cut points allow, and SHALL return `TOO_MANY_FRAMES` only when no split into at most 16 chunks exists given the multi-frame Plaintext_Capacity and, where `utf8Boundaries` is set, the UTF-8 cut points. Every chunk SHALL be non-empty except the single chunk returned for an empty payload.
7. WHEN the payload is empty, THE Segmenter SHALL return one empty chunk.
8. WHEN `makeFrames` receives a valid template and n bodies with n from 1 to 16, each within Wire_Body_Capacity for total n, THE Segmenter SHALL return n Frames that share the Message_ID, type, encrypted flag, hop and TTL, with total equal to n and indexes 0 to n minus 1.
9. THE Segmenter SHALL make `makeFrames` return no Frames and one error, chosen as the first failing check in this order: `EMPTY_SET` (zero bodies), `TOO_MANY_FRAMES` (more than 16 bodies), the template checks of Requirement 2 in the order `BAD_ID_LENGTH`, `BAD_ROUTING`, `BAD_TYPE`, `KEY_OFFER_ENCRYPTED`, then `KEY_OFFER_MULTIFRAME` (type KEY_OFFER with more than one body), then, in ascending index order, `BODY_TOO_SHORT` (encrypted body or KEY_OFFER body shorter than its minimum) and `FRAME_TOO_LONG` (body longer than Wire_Body_Capacity for total n). Zero bodies is invalid input and never produces Frames.
10. FOR ALL Unicode strings that fit in 16 frames, decoding the reassembled TEXT payload as UTF-8 SHALL return the original string (UTF-8 round-trip property), where the caller converts the string to bytes with `TextEncoder` and unpaired surrogates become U+FFFD.
11. IF `utf8Boundaries` is set and the payload is not valid UTF-8, THEN THE Segmenter SHALL return the error `INVALID_UTF8` from `splitPayload`.

### Requirement 9: Frame reassembly

**User Story:** As a receiver, I want to rebuild a message from frames that arrive in any order, with duplicates, so that relays and echoes do not break long messages.

#### Acceptance Criteria

1. WHEN frames of one message cover indexes 0 to total minus 1, THE Segmenter SHALL return a complete result containing the payload (the Bodies joined in index order), the Message_ID, the type, the encrypted flag and the total, and containing no hop or TTL.
2. WHEN frames are supplied in any order, with identical duplicates, or with different hop and TTL values, THE Segmenter SHALL return a result equal to the result for the frames supplied once in index order.
3. WHEN some indexes are absent, THE Segmenter SHALL return an incomplete result that lists the missing indexes in ascending order and the total.
4. IF two frames have the same index and different Bodies, THEN THE Segmenter SHALL return the error `CONFLICTING_DUPLICATE`.
5. IF frames differ in Message_ID, type, encrypted flag or total, THEN THE Segmenter SHALL return the error `MISMATCHED_FRAMES`.
6. IF the frame set is empty, THEN THE Segmenter SHALL return the error `EMPTY_SET`.
7. FOR ALL payloads up to 16 frames long, reassembling the frames from `makeFrames` over the result of `splitPayload` SHALL return the original payload, and each encoded frame SHALL be at most 140 bytes (multi-frame round trip).
8. IF several errors compete, THEN THE Segmenter SHALL evaluate the frames in ascending index order, ordering frames with equal index by the lexicographic order of Message_ID, type, encrypted flag, total and Body, and SHALL return the error caused by the first frame in that order that either mismatches the first frame of that order (`MISMATCHED_FRAMES`) or has the same index as an earlier frame and a different Body (`CONFLICTING_DUPLICATE`).
9. THE Segmenter SHALL treat Bodies as opaque bytes in `reassemble` and SHALL NOT decrypt, so that the caller passes frames whose Bodies are already opened plaintext chunks.

### Requirement 10: Routing patch and hop limit

**User Story:** As a relay author, I want a routing patch that needs no key, so that relays can change hop and TTL without touching the ciphertext or the authenticated fields.

#### Acceptance Criteria

1. WHEN `patchRouting` is called with Wire_Bytes accepted by `decodeFrame` and with hop and TTL each from 0 to 15, THE Frame_Codec SHALL return bytes of the same length that differ from the input in at most byte 1 and the two CRC_Trailer bytes.
2. WHEN `patchRouting` succeeds, THE Frame_Codec SHALL return bytes that decode to the same Frame as the input except for hop and TTL.
3. WHEN `patchRouting` succeeds, THE Frame_Codec SHALL return bytes whose decoded Message_ID, type, total and index equal those of the input, so that `frameKey` and the `aadFor` and `ivFor` results computed from the decoded header fields are equal for the input and the output.
4. IF the hop or TTL passed to `patchRouting` is not an integer from 0 to 15, including a hop of 16, THEN THE Frame_Codec SHALL return the error `BAD_ROUTING` and SHALL NOT produce bytes, so that a frame received with hop 15 cannot be patched forward.
5. (withdrawn, redundant with 10.4)
6. WHEN `patchRouting` is called, THE Frame_Codec SHALL first run `decodeFrame` on the input and SHALL return the resulting decode error without producing bytes, so that an input of fewer than 12 bytes, including fewer than 2 bytes, returns `TOO_SHORT` and an input with a wrong CRC_Trailer returns `BAD_CRC`.
7. WHEN `patchRouting` is called twice with equal hop and TTL, THE Frame_Codec SHALL return equal bytes (idempotence).
8. THE Frame_Codec SHALL leave the input Wire_Bytes of `patchRouting` unmodified.
9. IF both the input and the hop or TTL are invalid, THEN THE Frame_Codec SHALL return the decode error of clause 10.6 and not `BAD_ROUTING`.
10. WHEN `patchRouting` succeeds, THE Frame_Codec SHALL recompute the CRC_Trailer over the patched bytes, so that `decodeFrame` accepts the result, and SHALL NOT require any key.

### Requirement 11: AAD and derived IV inputs

**User Story:** As a crypto spec author, I want exact AAD and IV bytes defined by the frame module, so that encryption binds the right fields and never reuses a nonce.

#### Acceptance Criteria

1. THE Crypto_Inputs SHALL provide `aadFor` that returns a Result whose value is 10 bytes: the 8-byte Message_ID, the message type byte, and total minus 1. This AAD layout, including total, is PROVISIONAL until the `crypto` spec confirms it (design open item 1).
2. THE Crypto_Inputs SHALL return `aadFor` output that does not depend on hop, TTL, frame index, the encrypted flag, the multi-frame flag, the Body or the CRC_Trailer.
3. WHEN the Message_ID, type or total changes, THE Crypto_Inputs SHALL return different `aadFor` output.
4. THE Crypto_Inputs SHALL provide `ivFor` that returns a Result whose value is 12 bytes: the 8-byte Message_ID followed by the frame index as a 4-byte big-endian integer.
5. FOR ALL pairs of (Message_ID, frame index), `ivFor` SHALL return equal bytes if and only if both the Message_ID and the index are equal.
6. (withdrawn, covered by 11.4 and the wire layout of Requirement 1)
7. IF the input of `aadFor` or `ivFor` is invalid, THEN THE Crypto_Inputs SHALL return the first failing error in this order. For `aadFor`: `BAD_ID_LENGTH` (Message_ID not 8 bytes), `BAD_TYPE` (type outside 0 to 5), `BAD_FRAME_INDEX` (total not an integer from 1 to 16). For `ivFor`: `BAD_ID_LENGTH`, `BAD_FRAME_INDEX` (index not an integer from 0 to 15).

### Requirement 12: Error handling on untrusted bytes

**User Story:** As a receiver, I want the parser to survive any audio input, so that a hostile or noisy source cannot crash the app.

#### Acceptance Criteria

1. FOR ALL byte arrays of any length, THE Frame_Codec SHALL return from `decodeFrame` without throwing, and the Test_Suite SHALL sample this claim with lengths 0 to 200.
2. WHEN `decodeFrame` fails, THE Frame_Codec SHALL return an error whose code belongs to the closed set `TOO_SHORT`, `TOO_LONG`, `BAD_CRC`, `BAD_VERSION`, `RESERVED_BITS`, `UNKNOWN_TYPE`, `BAD_FRAME_INDEX`, `NON_CANONICAL`, `BODY_TOO_SHORT`, `KEY_OFFER_ENCRYPTED` and `KEY_OFFER_MULTIFRAME`.
3. THE Frame_Codec, Segmenter, Crypto_Inputs and Message_ID_Generator SHALL return data errors as `{ ok: false, error: { code } }` values and SHALL NOT throw for invalid data.
4. WHEN `encodeFrame` fails, THE Frame_Codec SHALL return an error whose code belongs to the closed set `BAD_ID_LENGTH`, `BAD_ROUTING`, `BAD_FRAME_INDEX`, `BAD_TYPE`, `BAD_VERSION`, `BODY_TOO_SHORT`, `KEY_OFFER_ENCRYPTED`, `KEY_OFFER_MULTIFRAME` and `FRAME_TOO_LONG`, and WHEN `patchRouting` fails, THE Frame_Codec SHALL return an error whose code belongs to the closed set formed by `BAD_ROUTING` and every `decodeFrame` code of clause 12.2.
5. WHEN a frame is rejected by `decodeFrame`, THE Frame_Codec SHALL expose the error code so that the caller can drop the frame and count it in a diagnostic counter.
6. WHEN a Segmenter, Crypto_Inputs or Message_ID_Generator function fails, THE function SHALL return an error whose code belongs to its closed set: for `splitPayload`, `INVALID_UTF8` and `TOO_MANY_FRAMES`; for `makeFrames`, `EMPTY_SET`, `TOO_MANY_FRAMES`, `BAD_ID_LENGTH`, `BAD_ROUTING`, `BAD_TYPE`, `KEY_OFFER_ENCRYPTED`, `KEY_OFFER_MULTIFRAME`, `BODY_TOO_SHORT` and `FRAME_TOO_LONG`; for `reassemble`, `EMPTY_SET`, `MISMATCHED_FRAMES` and `CONFLICTING_DUPLICATE`; for `aadFor`, `BAD_ID_LENGTH`, `BAD_TYPE` and `BAD_FRAME_INDEX`; for `ivFor`, `BAD_ID_LENGTH` and `BAD_FRAME_INDEX`; for `newMessageId`, `BAD_RNG`.

### Requirement 13: ggwave transport integrity

**User Story:** As a protocol engineer, I want evidence of how often ggwave returns wrong bytes, and a guarantee that a wrong result is never accepted as a different frame, so that the binary wire format is safe to use.

#### Acceptance Criteria

1. THE Test_Suite SHALL include a slow test (few runs) that samples the claim that, for every Frame accepted by `encodeFrame`, ggwave encode followed by decode under each Channel_Profile in `field-findings.md` (including the FASTEST profiles) yields received bytes for which `decodeFrame` returns a Frame equal to the Frame sent, or returns an error, or ggwave returns no bytes, and never returns a Frame different from the Frame sent. The generators SHALL include bodies with bytes 0x00 and 0xFF and invalid UTF-8 sequences and SHALL NOT be narrowed to avoid payloads that ggwave is known to corrupt.
2. THE Test_Suite SHALL include a test that gives a 141-byte payload to ggwave and demonstrates that ggwave truncates it to 140 bytes, so that the length guard in Requirement 4 is shown to be mandatory.
3. THE Test_Suite SHALL include a test that streams a 140-byte DT frame to ggwave decoders at sample offsets 0, 256 and 512 and shows that the frame decodes at each. Decoding at any single alignment is not guaranteed: the recorded evidence shows that offset 768 fails, which is why the audio layer runs several offset decoders (see "Obligations on other specs").
4. THE Frame_Codec SHALL NOT depend on ggwave, so that this requirement is verified only by the slow test file that loads `vendor/ggwave.js`.
5. THE Test_Suite SHALL include a slow evidence test that sends raw payloads (the three recorded failing payloads as fixed regression cases, and a random sweep of payloads of 1 to 60 bytes) through each Channel_Profile and logs, per Channel_Profile, the counts of equal, wrong and not-decoded results, and SHALL NOT assert that the raw bytes returned by ggwave equal the bytes sent.

### Requirement 14: Module purity and layering

**User Story:** As a maintainer, I want the protocol code to be pure and headless, so that it runs in Node under Vitest and stays independent of audio and UI.

#### Acceptance Criteria

1. THE Frame_Codec, Crc16, Budget, Segmenter, Crypto_Inputs and Message_ID_Generator SHALL reside in `src/protocol/` and SHALL NOT import from `src/audio` or `src/ui`.
2. THE Frame_Codec, Crc16, Budget, Segmenter, Crypto_Inputs and Message_ID_Generator SHALL run in Node under Vitest with `environment: node` and no DOM.
3. THE Crypto_Inputs SHALL NOT call WebCrypto.
4. THE Frame_Codec, Crc16, Budget, Segmenter, Crypto_Inputs and Message_ID_Generator SHALL use no runtime facility other than `TextEncoder` and `crypto.getRandomValues`, and each of them MAY use none, one or both of these.
5. THE Protocol_Index SHALL export `encodeFrame`, `decodeFrame`, `patchRouting`, `frameKey`, `splitPayload`, `makeFrames`, `reassemble`, `aadFor`, `ivFor`, `newMessageId`, every Budget constant (including `CRC_LEN`), `headerLength`, `frameOverhead`, `wireBodyCapacity`, `plaintextCapacity` and `utf8ByteLength`, together with the public types of these functions. THE Protocol_Index SHALL NOT export `crc16`, which stays internal to `src/protocol`.
6. THE `src/audio` and `src/ui` code SHALL import from `src/protocol` only through the Protocol_Index.

### Requirement 15: Header growth needs a size justification

**User Story:** As a protocol engineer, I want every header change justified in bytes and seconds, so that airtime does not grow unnoticed.

#### Acceptance Criteria

1. WHEN a change increases Header_Length or adds a header field, THE Frame_Protocol_Spec SHALL contain an updated size table in `design.md` that states the new airtime of a full frame and the remaining Wire_Body_Capacity and Plaintext_Capacity values.
2. THE Frame_Protocol_Spec SHALL contain the updated size table before the Frame_Codec wire format changes.
3. THE Frame_Protocol_Spec SHALL record the CRC_Trailer of Requirement 17 as a change under clause 15.1, stating its 2 bytes, its airtime cost of about 0.2 s per frame, the Frame_Overhead of 12 and 13 bytes, and the capacities 128, 112, 127 and 111.

### Requirement 16: Raw wire format

**User Story:** As a protocol engineer, I want the wire format fixed as raw binary with implicit length, so that no header bytes are spent on length or termination.

#### Acceptance Criteria

1. THE Frame_Codec SHALL produce and accept Wire_Bytes as a raw binary `Uint8Array`, with no text encoding applied to the whole frame.
2. THE Frame_Codec SHALL include no length field and no terminator byte in Wire_Bytes.
3. THE Frame_Codec SHALL take the frame length from the length of the byte array that ggwave returns, which ggwave variable-length mode carries in the transmission.

### Requirement 17: Frame integrity trailer

**User Story:** As a receiver, I want every frame to carry an integrity check, so that bytes that ggwave returned wrongly are dropped instead of shown or relayed as real.

Rationale: ggwave 0.4.0 FASTEST modes silently return wrong bytes for some payloads, even without noise (see "Wire representation" in `design.md`). Plaintext and KEY_OFFER frames carry no GCM tag, and relays hold no key. The CRC-16 trailer is the header-growth change that Requirement 15 governs.

#### Acceptance Criteria

1. THE Frame_Codec SHALL append to every encoded frame a 2-byte CRC_Trailer equal to CRC-16/CCITT-FALSE (polynomial 0x1021, initial value 0xFFFF, no input or output reflection, no final XOR) of every preceding byte, with the high byte first.
2. THE Crc16 SHALL return 0x29B1 for the ASCII bytes of "123456789", 0xFFFF for an empty input, and 0x0000 for any message followed by its own CRC_Trailer.
3. THE Frame_Codec SHALL keep the CRC_Trailer out of the Frame object, so that a Frame contains header fields and Body only and the CRC_Trailer exists only in Wire_Bytes.
4. FOR ALL Valid_Frames, any single-bit flip and any burst of at most 16 consecutive bits flipped in the Wire_Bytes SHALL cause `decodeFrame` to return the error `BAD_CRC`.
5. THE Frame_Codec SHALL leave `aadFor` and `ivFor` unchanged by the CRC_Trailer, so that the AAD remains Message_ID, type and total minus 1, and the CRC_Trailer lies outside the authenticated data.

## Obligations on other specs

The following duties belong to other specs. They are not requirements on `src/protocol` and are not tested by this spec.

- `relay`: never rebroadcast a KEY_OFFER, whatever its `ttl` or `hop`. Never forward a frame with `hop` = 15, because `hop` + 1 does not fit in 4 bits. Drop every frame for which `decodeFrame` fails, including `BAD_CRC`, instead of forwarding it, and forward only the output of `patchRouting`, which recomputes the CRC_Trailer without a key.
- `crypto`: rotate the group key before 1,000,000 messages. Confirm or narrow the provisional 10-byte AAD. Decide the GCM tag length.
- `ui-flows`: show the check words and get the user's confirmation before joining a group from a KEY_OFFER. Warn that anyone in earshot hears the key during the key screech, and keep QR as the default way to share the key.
- `audio-transport`: run several decoder instances offset by 256 samples. Decoding is not guaranteed at every alignment, and the evidence shows offset 768 fails. Choose the ggwave speed per Channel_Profile knowing that FASTEST modes returned wrong bytes in 6 of 450 sampled payloads and the FAST modes returned none in 450 sampled payloads. That sample is a speed-choice input and not a guarantee.
- ID rules, owned by the sender, `relay` and `crypto` specs: create a new Message_ID on every send, rebroadcast the stored Wire_Bytes unchanged (or patched with `patchRouting`), never re-encrypt on relay, and re-roll the Message_ID when it matches a locally known ID.
