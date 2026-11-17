# Implementation Plan: frame-protocol

## Overview

Implement the pure TypeScript frame protocol in `src/protocol/`, following `requirements.md` and `design.md` in this folder (do not modify them while executing tasks). The design uses TypeScript, so all tasks use TypeScript.

Revision (CRC-16 trailer): the slow ggwave test found that ggwave 0.4.0 FASTEST modes silently return wrong bytes. `design.md` and `requirements.md` now add a 2-byte CRC-16/CCITT-FALSE trailer to every frame (Requirement 17, an instance of Requirement 15). Tasks 1 to 10 are the original plan and keep their status markers. Tasks 12 to 17 revise the code and tests those tasks produced, and are marked "Revises task N.M". Capacities change from 130, 114, 129, 113 to 128, 112, 127, 111, and the KEY_OFFER name limit changes from 114 to 112 bytes. The text of tasks 1 to 10 still shows the old numbers, and tasks 12 to 17 override them. Files are built in this order: `budget.ts`, `frame.ts`, `message-id.ts`, `frame-crypto-inputs.ts`, `segment.ts`, `index.ts`, then the slow ggwave round-trip test. Each module is implemented first, then tested.

Ground rules for every task:
- Do not commit anything. Never run `git add` or `git commit`. The user makes one commit when the whole spec is done.
- Use `npm.cmd` and `npx.cmd`. PowerShell blocks `npm.ps1` on this machine. Do not change the execution policy.
- Pin every dependency to an exact version (no `^` or `~`). Get each version from `npm.cmd view <pkg> version`. Never guess a version.
- Every task and every test sub-task is required. Property tests are the point of this spec.
- Unit tests are `*.test.ts`, property tests are `*.prop.test.ts`, both next to the code. Property tests use fast-check and print the seed on failure (for example by passing `{ verbose: true }` and logging `seed` and `path` in the failure message, or by setting `fc.configureGlobal({ verbose: 2 })`).
- `src/protocol` must not import from `src/audio` or `src/ui`, and may use only `TextEncoder` and `crypto.getRandomValues` at runtime.
- Every function that can fail on data returns `Result` (`{ ok: true, value } | { ok: false, error: { code } }`) and never throws on data.

## Tasks

- [x] 1. Scaffold the project as far as this spec needs
  - [x] 1.1 Create `package.json`, `.nvmrc`, `.npmrc` and install dev dependencies
    - Do not commit anything in this task or any other task. No `git add`, no `git commit`.
    - Create `.nvmrc` with the installed Node version (`node --version`).
    - Create `.npmrc` with `save-exact=true`.
    - Create `package.json` with `"type": "module"`, `"private": true`, and the scripts from `tech.md` that this spec needs: `typecheck` (`tsc --noEmit`), `lint` (`biome check`), `format` (`biome check --write`), `test` (`vitest run`), `test:props` (`vitest run prop.test`, which filters to `*.prop.test.ts` files), `test:watch`, and `test:slow` (added in task 1.2).
    - Install as exact-pinned devDependencies, taking each version from `npm.cmd view <pkg> version`: `typescript`, `vitest`, `fast-check`, `@biomejs/biome`, and `@types/node`.
    - For `@types/node`, pick the version whose major matches the Node major in `.nvmrc`. Check with `npm.cmd view @types/node versions` if the latest major differs. Reason: the project has no DOM lib, so `TextEncoder` and `globalThis.crypto` do not type-check without the Node types.
    - Run `npm.cmd install` once to create `package-lock.json`, then confirm `npm.cmd ci` works. Confirm no `^` or `~` appears in `package.json`.
    - Do not install Preact, Vite or any other package that this spec does not need.
    - _Requirements: 14.2, 14.4_

  - [x] 1.2 Create `tsconfig.json`, `biome.json`, Vitest configs and the slow-test script
    - `tsconfig.json`: `strict: true`, `noUncheckedIndexedAccess: true`, `"types": ["node"]` (needed because there is no DOM lib, see task 1.1), `module` and `moduleResolution` suited to ESM with Vite-style imports, `noEmit: true`, `include: ["src", "vendor"]` as appropriate. Do not add the `DOM` lib.
    - `biome.json`: enable lint and format, exclude `vendor` and build output. Configure it against the pinned Biome version's schema (check the version's own schema URL, do not guess keys).
    - `vitest.config.ts`: `environment: 'node'`, `include: ['src/**/*.test.ts']`, `exclude: ['**/node_modules/**', '**/*.slow.*']` so that `npm.cmd test` and `test:props` never pick up slow tests.
    - `vitest.slow.config.ts`: `environment: 'node'`, `include: ['src/**/*.slow.test.ts']`, a long `testTimeout`, and no `exclude` of slow files.
    - Add the npm script `"test:slow": "vitest run --config vitest.slow.config.ts"`.
    - Add a trivial passing placeholder test under `src/protocol/` (for example `scaffold.test.ts` checking `new TextEncoder().encode('é').length === 2` and `globalThis.crypto.getRandomValues` exists). It proves `TextEncoder` and `crypto` type-check and that `npm.cmd test` runs. Delete the placeholder in task 2.2 once real tests exist.
    - Run `npm.cmd run typecheck`, `npm.cmd run lint` and `npm.cmd test` and fix configuration problems.
    - _Requirements: 14.2, 14.4_

- [x] 2. Implement `budget.ts`
  - [x] 2.1 Create `src/protocol/budget.ts`
    - Export constants `GGWAVE_MAX_PAYLOAD` (140), `VERSION` (1), `MESSAGE_ID_LEN` (8), `TAG_LEN` (16), `IV_LEN` (12), `HEADER_LEN_SINGLE` (10), `HEADER_LEN_MULTI` (11), `MAX_FRAMES` (16), `MAX_HOP` (15), `MAX_TTL` (15).
    - Implement `headerLength(total)` returning 10 for total 1 and 11 for total above 1.
    - Implement `wireBodyCapacity({ multi })` as `GGWAVE_MAX_PAYLOAD` minus the header length (130 single, 129 multi), independent of the encrypted flag.
    - Implement `plaintextCapacity({ encrypted, multi })` as `wireBodyCapacity` minus `TAG_LEN` when encrypted, otherwise `wireBodyCapacity` (130, 114, 129, 113 with TAG_LEN 16). Derive both from the constants. No hard-coded capacity number.
    - Implement `utf8ByteLength(text)` equal to `new TextEncoder().encode(text).length`, so unpaired surrogates count as 3 bytes.
    - _Requirements: 4.4, 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x] 2.2 Write unit tests for `budget.ts` and remove the scaffold placeholder
    - Create `src/protocol/budget.test.ts`.
    - Check every constant value, `headerLength(1)` and `headerLength(2..16)`, `wireBodyCapacity` (130, 129), `plaintextCapacity` (130, 114, 129, 113), and that `wireBodyCapacity` ignores the encrypted flag.
    - Check `utf8ByteLength` for ASCII, 2-byte, 3-byte and 4-byte code points, and a lone surrogate (3 bytes), and that it equals the `TextEncoder` length.
    - Delete `src/protocol/scaffold.test.ts`.
    - _Requirements: 4.4, 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 3. Implement `frame.ts`
  - [x] 3.1 Create shared types in `src/protocol/types.ts`
    - Define `Result<T, E>` as `{ ok: true; value: T } | { ok: false; error: E }` with error objects shaped `{ code }`, plus `ok()` and `err()` helpers.
    - Define `MessageType` (0 to 5), `FrameHeader`, `Frame`, and the closed error-code unions: `EncodeError`, `DecodeError` (`TOO_SHORT`, `TOO_LONG`, `BAD_VERSION`, `RESERVED_BITS`, `UNKNOWN_TYPE`, `BAD_FRAME_INDEX`, `NON_CANONICAL`, `BODY_TOO_SHORT`, `KEY_OFFER_ENCRYPTED`, `KEY_OFFER_MULTIFRAME`), `SegmentError`, `ReassembleError`, `CryptoInputError`, `MessageIdError`, matching the closed sets in clauses 12.2, 12.4 and 12.6.
    - Import nothing from `src/audio` or `src/ui`.
    - _Requirements: 1.8, 12.2, 12.3, 12.4, 12.6, 14.1_

  - [x] 3.2 Implement `encodeFrame` and `frameKey` in `src/protocol/frame.ts`
    - Lay out byte 0 as version (bits 7 to 6), encrypted (bit 5), multi-frame (bit 4), type (bits 3 to 1), reserved 0 (bit 0). Byte 1 is hop (high 4 bits) and TTL (low 4 bits). Bytes 2 to 9 are the Message_ID. Byte 10 is index (high 4 bits) and total minus 1 (low 4 bits) only when total is above 1. The Body follows. Set the multi-frame flag if and only if total is above 1. Use no length field and no terminator.
    - Validate in the exact precedence of clause 2.10: `BAD_VERSION`, `BAD_ID_LENGTH`, `BAD_ROUTING`, `BAD_FRAME_INDEX`, `BAD_TYPE`, `BODY_TOO_SHORT` (encrypted, body under TAG_LEN), `KEY_OFFER_ENCRYPTED`, `KEY_OFFER_MULTIFRAME`, `BODY_TOO_SHORT` (KEY_OFFER, body under 16), `FRAME_TOO_LONG`. Integer checks must reject non-integers and NaN.
    - Return a new array that does not alias the input Body or Message_ID, and do not mutate the input Frame. Accept an opaque RESEND_REQUEST body. Do not validate UTF-8 in TEXT bodies.
    - Implement `frameKey(frame)` as lowercase hex Message_ID, a colon, and the decimal frame index.
    - Use `GGWAVE_MAX_PAYLOAD`, `headerLength`, `TAG_LEN` and the other constants from `budget.ts`. No literal sizes.
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.10, 2.11, 3.14, 4.1, 4.2, 4.6, 6.1, 6.2, 6.5, 6.7, 16.1, 16.2_

  - [x] 3.3 Implement `decodeFrame` in `src/protocol/frame.ts`
    - Check in the exact precedence of clause 3.13: `TOO_SHORT` (under 10 bytes), `TOO_LONG` (over 140), `BAD_VERSION`, `RESERVED_BITS`, `UNKNOWN_TYPE` (types 6 and 7), `KEY_OFFER_ENCRYPTED`, `KEY_OFFER_MULTIFRAME`, `TOO_SHORT` (multi-frame flag set and under 11 bytes), `NON_CANONICAL` (multi-frame flag set and total 1, checked before index validity), `BAD_FRAME_INDEX`, `BODY_TOO_SHORT` (encrypted body under TAG_LEN, or KEY_OFFER body under 16).
    - When the multi-frame flag is 0, return index 0 of total 1.
    - Return a Frame whose Body and Message_ID are copies (use `slice`, not `subarray`). Never throw for any input of any length. Do not validate UTF-8.
    - Ensure every accepted input re-encodes to identical bytes.
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12, 3.13, 3.14, 6.3, 6.4, 6.5, 12.1, 12.2, 12.3, 12.5, 16.3_

  - [x] 3.4 Implement `patchRouting` in `src/protocol/frame.ts`
    - Run `decodeFrame` first and return its error unchanged, even when hop or TTL are also invalid (so an input under 2 bytes returns `TOO_SHORT`).
    - Then return `BAD_ROUTING` when hop or TTL is not an integer from 0 to 15 (including hop 16). Produce no bytes on error.
    - Otherwise return a copy of the same length that differs from the input only at byte 1. Do not mutate the input. Equal arguments give equal bytes.
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.6, 10.7, 10.8, 10.9, 12.4_

  - [x] 3.5 Write property test for the wire round trip
    - File: `src/protocol/frame-roundtrip.prop.test.ts`.
    - **Property 1: Wire round trip**
    - For every valid frame (any valid header, body within `wireBodyCapacity` for its total, encrypted bodies at least TAG_LEN, KEY_OFFER restrictions respected), `decodeFrame(encodeFrame(f))` deeply equals `f`.
    - Print the fast-check seed on failure.
    - **Validates: Requirements 2.9**

  - [x] 3.6 Write property test for canonical encoding
    - File: `src/protocol/frame-canonical.prop.test.ts`.
    - **Property 2: Canonical encoding**
    - For every byte array of length 0 to 200, when `decodeFrame` succeeds with value `f`, `encodeFrame(f)` equals the input bytes. Bias the generator so a good share of inputs are accepted (for example, start from a valid header byte pattern and mutate).
    - Print the fast-check seed on failure.
    - **Validates: Requirements 3.12**

  - [x] 3.7 Write property test that the decoder is total
    - File: `src/protocol/frame-total.prop.test.ts`.
    - **Property 3: Decoder is total**
    - For every byte array of length 0 to 200, `decodeFrame` returns without throwing and any failure code belongs to the closed `DecodeError` set. Include a unit-style check of the precedence order in clause 3.13 with hand-built inputs that fail several checks at once (including multi-frame flag 1 with total 1 and an out-of-range index, which must return `NON_CANONICAL`).
    - Print the fast-check seed on failure.
    - **Validates: Requirements 12.1, 12.2, 3.13**

  - [x] 3.8 Write property test for the length guard
    - File: `src/protocol/frame-length.prop.test.ts`.
    - **Property 4: Length guard**
    - For every otherwise valid frame, `encodeFrame` fails with `FRAME_TOO_LONG` if and only if `headerLength(total) + body.length` exceeds 140. Every successful output is at most 140 bytes. A body of exactly `wireBodyCapacity` (130 single, 129 multi) is accepted and one more byte is rejected, for both encrypted and plaintext frames. Include the KEY_OFFER boundary through the public frame API: 16-byte key plus 114-byte name is accepted and 115 bytes fails with `FRAME_TOO_LONG`.
    - Print the fast-check seed on failure.
    - **Validates: Requirements 4.1, 4.2, 4.6, 6.6, 6.7**

  - [x] 3.9 Write property test for the routing patch
    - File: `src/protocol/frame-patch.prop.test.ts`.
    - **Property 9: Routing patch is the only relay edit**
    - For every accepted wire frame and every hop and TTL from 0 to 15, `patchRouting` differs from the input only at byte 1, decodes to the same frame except hop and TTL, is idempotent, leaves the input unmodified, and keeps `frameKey`, `aadFor` and `ivFor` results equal (import `aadFor` and `ivFor` from `frame-crypto-inputs.ts`, created in task 6.1). For hop or TTL outside 0 to 15, including 16, it fails with `BAD_ROUTING`. For invalid wire bytes it returns the decode error even when hop is also invalid.
    - Print the fast-check seed on failure.
    - **Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.6, 10.7, 10.8, 10.9**

  - [x] 3.10 Write property test for KEY_OFFER rules
    - File: `src/protocol/frame-keyoffer.prop.test.ts`.
    - **Property 15: KEY_OFFER is plaintext and single-frame**
    - For every KEY_OFFER frame, `encodeFrame` fails with `KEY_OFFER_ENCRYPTED` when encrypted is true and with `KEY_OFFER_MULTIFRAME` when total is above 1. For every byte array with type bits 4 and the encrypted bit set, `decodeFrame` fails with `KEY_OFFER_ENCRYPTED`, and with the multi-frame bit set (encrypted bit clear) it fails with `KEY_OFFER_MULTIFRAME`. A 16-byte key with a name of 0 to 114 UTF-8 bytes round-trips deeply equal, and 115 bytes fails with `FRAME_TOO_LONG`. A KEY_OFFER body under 16 bytes fails with `BODY_TOO_SHORT` on encode and decode. Types 6 and 7 always fail with `UNKNOWN_TYPE`.
    - Print the fast-check seed on failure.
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 3.5**

  - [x] 3.11 Write unit tests for `frame.ts`
    - File: `src/protocol/frame.test.ts`.
    - Byte-exact wire examples from the design: single plaintext TEXT frame with hop 0, TTL 7, body "hi" (B0 `0x40`, routing `0x07`, length 12), and the second frame of an encrypted three-frame SOS message (B0 `0x76`, FRAME byte `0x12`).
    - Each encode error code and each decode error code with a hand-built input, plus the encode precedence order of clause 2.10 with inputs failing several checks.
    - Boundaries: empty body, hop and TTL at 0 and 15, total 16 with index 15, body at `wireBodyCapacity` and plus 1, `patchRouting` accepting hop 15 and rejecting hop 16, `patchRouting` on inputs under 2 bytes returning `TOO_SHORT`.
    - Non-aliasing: mutating the input body or Message_ID after encode does not change the output, and mutating decoded output does not change the input bytes. `frameKey` format. TEXT body with invalid UTF-8 decodes without error. RESEND_REQUEST with an opaque body round-trips.
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.8, 1.10, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.10, 2.11, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.13, 3.14, 10.4, 10.6_

- [x] 4. Checkpoint - frame codec
  - Ensure all tests pass, ask the user if questions arise.
  - Run `npm.cmd run typecheck`, `npm.cmd run lint` and `npm.cmd test`.

- [x] 5. Implement `message-id.ts`
  - [x] 5.1 Create `src/protocol/message-id.ts`
    - Implement `newMessageId(rng?)` returning `Result<Uint8Array, { code: 'BAD_RNG' }>`.
    - The default RNG fills 8 bytes with `globalThis.crypto.getRandomValues`. An injected RNG is called with 8 and its bytes are returned (copied). If the injected RNG returns an array whose length is not 8, return `BAD_RNG`. Never throw for invalid RNG output.
    - _Requirements: 7.1, 7.2, 7.3, 7.6, 12.3, 12.6_

  - [x] 5.2 Write property test for message IDs
    - File: `src/protocol/message-id.prop.test.ts`.
    - **Property 13: Message IDs**
    - For any injected RNG output of exactly 8 bytes, the result is `ok` with those same bytes. For any other length (0 to 32 excluding 8), the result is `BAD_RNG`. With the default RNG, `newMessageId` always returns 8 bytes, and 1,000 calls give 1,000 distinct values (a sanity check, not a statistical test).
    - Print the fast-check seed on failure.
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.6**

- [x] 6. Implement `frame-crypto-inputs.ts`
  - [x] 6.1 Create `src/protocol/frame-crypto-inputs.ts`
    - Implement `aadFor({ messageId, type, total })` returning a 10-byte `Result`: the 8-byte Message_ID, the type byte, then total minus 1. Mark the layout PROVISIONAL in a code comment that points at design open item 1 (the `crypto` spec confirms it). Validate in order: `BAD_ID_LENGTH`, `BAD_TYPE` (outside 0 to 5), `BAD_FRAME_INDEX` (total not an integer from 1 to 16).
    - Implement `ivFor(messageId, index)` returning a 12-byte `Result`: the 8-byte Message_ID followed by the index as a 4-byte big-endian integer. Validate in order: `BAD_ID_LENGTH`, `BAD_FRAME_INDEX` (index not an integer from 0 to 15).
    - Use `IV_LEN` and `MESSAGE_ID_LEN` from `budget.ts`. Do not call WebCrypto. Return new arrays and never throw.
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.7, 12.3, 12.6, 14.3_

  - [x] 6.2 Write property test for AAD isolation
    - File: `src/protocol/frame-aad.prop.test.ts`.
    - **Property 10: Relay can't forge the AAD**
    - `aadFor` output is 10 bytes and does not depend on hop, TTL, frame index, the encrypted flag, the multi-frame flag or the body (compute it from decoded headers of frames that differ only in those fields). It changes when Message_ID, type or total changes.
    - Print the fast-check seed on failure.
    - **Validates: Requirements 11.1, 11.2, 11.3**

  - [x] 6.3 Write property test that IVs never repeat
    - File: `src/protocol/frame-iv.prop.test.ts`.
    - **Property 11: IVs never repeat**
    - For any two pairs `(messageId, index)`, `ivFor` returns equal 12-byte values if and only if both the Message_ID and the index are equal. Check the 4-byte big-endian index layout.
    - Print the fast-check seed on failure.
    - **Validates: Requirements 11.4, 11.5**

  - [x] 6.4 Write unit tests for `frame-crypto-inputs.ts`
    - File: `src/protocol/frame-crypto-inputs.test.ts`.
    - Byte-exact `aadFor` and `ivFor` examples. Error codes and precedence from clause 11.7 with inputs failing several checks (`BAD_ID_LENGTH` before `BAD_TYPE` before `BAD_FRAME_INDEX`; index 16 and non-integer index for `ivFor`). Output arrays are fresh copies.
    - _Requirements: 11.1, 11.4, 11.7, 12.6_

- [x] 7. Implement `segment.ts`
  - [x] 7.1 Implement `splitPayload` in `src/protocol/segment.ts`
    - Signature `splitPayload(payload: Uint8Array, opts: { encrypted: boolean; utf8Boundaries: boolean }): Result<Uint8Array[], SegmentError>`.
    - With `utf8Boundaries` and a payload that is not valid UTF-8, return `INVALID_UTF8` first. Validate strictly with a small hand-written UTF-8 validator (reject overlong forms, surrogates U+D800 to U+DFFF and code points above U+10FFFF). Do not use `TextDecoder`, to stay inside the allowed runtime facilities of clause 14.4.
    - An empty payload returns one empty chunk. A payload at most the single-frame `plaintextCapacity` returns exactly one chunk equal to the payload. Otherwise split greedily into chunks of at most the multi-frame `plaintextCapacity`, with cuts only between UTF-8 sequences when `utf8Boundaries` is set. Every chunk except the empty-payload chunk is non-empty. Return `TOO_MANY_FRAMES` only when no split into at most 16 chunks exists.
    - Return copies of the payload bytes, and base every capacity decision on byte lengths from `budget.ts`.
    - _Requirements: 4.5, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.11, 12.6_

  - [x] 7.2 Implement `makeFrames` in `src/protocol/segment.ts`
    - Signature `makeFrames(template, bodies): Result<Frame[], ...>` where the template has type, encrypted, hop, TTL and messageId.
    - Return exactly one error, chosen by the order of clause 8.9: `EMPTY_SET` (zero bodies), `TOO_MANY_FRAMES` (over 16 bodies), `BAD_ID_LENGTH`, `BAD_ROUTING`, `BAD_TYPE`, `KEY_OFFER_ENCRYPTED`, `KEY_OFFER_MULTIFRAME` (KEY_OFFER with more than one body), then in ascending index order `BODY_TOO_SHORT` and `FRAME_TOO_LONG` (body over `wireBodyCapacity` for total n).
    - On success return n Frames sharing Message_ID, type, encrypted flag, hop and TTL, with total n and indexes 0 to n minus 1. Reuse the validation from `frame.ts` rather than duplicating it, and copy the body bytes.
    - _Requirements: 8.8, 8.9, 12.6_

  - [x] 7.3 Implement `reassemble` in `src/protocol/segment.ts`
    - Return `EMPTY_SET` for no frames. Evaluate frames in ascending index order, ordering equal indexes lexicographically by Message_ID, type, encrypted flag, total and Body (clause 9.8). The first frame in that order that mismatches the first frame returns `MISMATCHED_FRAMES` (Message_ID, type, encrypted flag or total differ), and one that repeats an earlier index with a different Body returns `CONFLICTING_DUPLICATE`.
    - When all indexes 0 to total minus 1 are present, return `complete: true` with the payload (Bodies joined in index order) and message info (Message_ID, type, encrypted flag, total), with no hop or TTL. Otherwise return `complete: false` with the ascending missing indexes and the total.
    - Treat Bodies as opaque bytes. Never decrypt. The result must not depend on arrival order, duplicates, or hop and TTL values.
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.8, 9.9, 12.6_

  - [x] 7.4 Write property test for the byte-based length guard
    - File: `src/protocol/segment-guard.prop.test.ts`.
    - **Property 5: Length guard counts bytes**
    - For Unicode strings that include 2-, 3- and 4-byte code points and unpaired surrogates, convert with `TextEncoder`. For strings whose byte length exceeds 130 while the character count is at most 130, a single-frame send path rejects them or `splitPayload` produces multiple frames, and no encoded frame exceeds 140 bytes. `utf8ByteLength` is used for the decision, never `string.length`. Include a generator that guarantees such strings occur.
    - Print the fast-check seed on failure.
    - **Validates: Requirements 4.4, 4.5**

  - [x] 7.5 Write property test for the split bound
    - File: `src/protocol/segment-split.prop.test.ts`.
    - **Property 8: Split bound**
    - `splitPayload` never returns more than 16 chunks, every chunk is within the multi-frame `plaintextCapacity` (or the payload is one chunk within the single-frame capacity), chunks concatenate to the payload, and every chunk is non-empty except the single chunk of an empty payload. `TOO_MANY_FRAMES` is returned only when no valid split into at most 16 chunks exists (check against a reference computation of the minimum chunk count, including the UTF-8 cut points). With `utf8Boundaries`, invalid UTF-8 returns `INVALID_UTF8` and each chunk of a valid payload is valid UTF-8 by itself.
    - Print the fast-check seed on failure.
    - **Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.11**

  - [x] 7.6 Write property test for the multi-frame round trip
    - File: `src/protocol/segment-roundtrip.prop.test.ts`.
    - **Property 6: Multi-frame round trip**
    - For every payload that `splitPayload` accepts, `makeFrames` then `encodeFrame` then `decodeFrame` then `reassemble` returns the original payload for any arrival order and with arbitrary duplicated frames and different hop and TTL values. All frames share one ID and total, indexes are 0 to n minus 1, and each encoded frame is at most 140 bytes. Cover encrypted and plaintext modes (treat bodies as opaque, with tag-sized padding for the encrypted mode, since `reassemble` does not decrypt).
    - Print the fast-check seed on failure.
    - **Validates: Requirements 8.3, 8.8, 9.1, 9.2, 9.7**

  - [x] 7.7 Write property test for the UTF-8 round trip
    - File: `src/protocol/segment-utf8.prop.test.ts`.
    - **Property 7: UTF-8 round trip**
    - For every Unicode string that fits in 16 frames (including astral code points and unpaired surrogates, which become U+FFFD), encode with `TextEncoder`, split with `utf8Boundaries`, build frames, reassemble, and decode as UTF-8: the result equals the original string with lone surrogates replaced by U+FFFD. Each chunk is valid UTF-8 on its own.
    - Print the fast-check seed on failure.
    - **Validates: Requirements 8.4, 8.10**

  - [x] 7.8 Write property test for reassembly inconsistency
    - File: `src/protocol/segment-inconsistent.prop.test.ts`.
    - **Property 12: Reassembly rejects inconsistency**
    - Frames that differ in Message_ID, type, encrypted flag or total return `MISMATCHED_FRAMES`. The same index with different Bodies returns `CONFLICTING_DUPLICATE`. A missing index returns `complete: false` with exactly the missing indexes in ascending order and the total. An empty set returns `EMPTY_SET`. When both error kinds are present, the error follows the evaluation order of clause 9.8 regardless of input order.
    - Print the fast-check seed on failure.
    - **Validates: Requirements 9.3, 9.4, 9.5, 9.6, 9.8**

  - [x] 7.9 Write unit tests for `segment.ts`
    - File: `src/protocol/segment.test.ts`.
    - `splitPayload`: empty payload, payload at exactly the single-frame capacity for both modes (130, 114) and one byte over, a 4-byte code point straddling a cut, `INVALID_UTF8`, and `TOO_MANY_FRAMES` at 16 full chunks plus one byte.
    - `makeFrames`: success shape, and each error code in the precedence order of clause 8.9 with inputs failing several checks, including zero bodies and a KEY_OFFER with two bodies.
    - `reassemble`: reordering, identical duplicates, differing hop and TTL, missing indexes, and the example for clause 9.8 ordering.
    - _Requirements: 8.1, 8.2, 8.4, 8.5, 8.7, 8.9, 8.11, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.8_

- [x] 8. Checkpoint - all protocol modules
  - Ensure all tests pass, ask the user if questions arise.
  - Run `npm.cmd run typecheck`, `npm.cmd run lint` and `npm.cmd test`.

- [x] 9. Public index and layering
  - [x] 9.1 Create `src/protocol/index.ts`
    - Re-export `encodeFrame`, `decodeFrame`, `patchRouting`, `frameKey`, `splitPayload`, `makeFrames`, `reassemble`, `aadFor`, `ivFor`, `newMessageId`, every budget constant, `headerLength`, `wireBodyCapacity`, `plaintextCapacity`, `utf8ByteLength`, and the public types of these functions (`Frame`, `FrameHeader`, `MessageType`, `Result`, the error unions, `SplitOptions`, `FrameTemplate`, `MessageInfo`, `Reassembly`).
    - This is the single public entry point of `src/protocol`.
    - _Requirements: 14.5, 14.6_

  - [x] 9.2 Write a layering and purity test
    - File: `src/protocol/layering.test.ts`.
    - Read every non-test `.ts` file in `src/protocol` and assert none imports from `src/audio`, `src/ui`, `vendor`, `ggwave`, or `node:` modules, and that none references `crypto.subtle`. Assert that the runtime facilities used are limited to `TextEncoder` and `crypto.getRandomValues` (scan for `fetch`, `window`, `document`, `subtle`).
    - Assert that importing `./index` exposes every name listed in clause 14.5 (check each export exists at runtime, and the constants have the values of clause 5.1).
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5_

- [x] 10. Slow ggwave round-trip test
  - [x] 10.1 Vendor ggwave 0.4.0 unmodified with its license
    - Locate the prototype ggwave file at `dial-tone/prototype/vendor/ggwave.js`. This folder is outside this workspace. First search for it (the workspace parent folders and the user's `Desktop\Hackathons\Kiroween` folder, for example with `Get-ChildItem -Recurse -Filter ggwave.js`). If it cannot be found, stop and ask the user for the path with the user_input tool. Do not fetch ggwave from the network in its place without the user's approval.
    - Copy it to `vendor/ggwave.js` byte-for-byte (use `Copy-Item`, not a text read and write). Verify with a hash comparison: `Get-FileHash` (SHA-256) of the source and the copy must match. Never edit the vendored file.
    - Copy the real ggwave license text to `vendor/GGWAVE-LICENSE.txt` from the prototype folder (look for a license file next to or above `vendor/`) or from the ggwave 0.4.0 distribution. Never write the license text from memory. If the prototype folder has no license file, stop and ask the user before continuing.
    - Create `vendor/package.json` containing exactly `{"type": "commonjs"}`. Reason: the root `package.json` has `"type": "module"`, so Node would otherwise load the UMD `vendor/ggwave.js` as ESM and fail. The nearest `package.json` decides, and this one makes the file load as CommonJS.
    - Confirm `biome.json` excludes `vendor` and `tsconfig.json` does not type-check `vendor/ggwave.js`.
    - Do not commit anything.
    - _Requirements: 13.4, 14.1_

  - [x] 10.2 Write the slow ggwave tests
    - File: `src/protocol/ggwave.slow.test.ts` (the name `*.slow.test.ts` is excluded from `npm.cmd test` and `test:props` by the `**/*.slow.*` exclude from task 1.2, and run by `npm.cmd run test:slow`).
    - Load ggwave with `createRequire` from `node:module`: `createRequire(import.meta.url)('../../vendor/ggwave.js')`. Do not use ESM `import` for it. Create the ggwave instance with sample rate 48000 (the rate of the recorded evidence), with the same factory and parameter calls that the vendored build exposes (read the vendored file's API first, do not guess names).
    - **Property 14: Wire survives the modem (slow)**: using fast-check with a small run count (for example 5 to 10 per profile), for frames of up to 140 bytes that include 0x00 and 0xFF and invalid UTF-8 sequences (build them with `encodeFrame` and also with raw arbitrary bytes), ggwave encode followed by decode returns bytes identical to the input under each Channel_Profile named in `.kiro/steering/field-findings.md` (read the file and use its profile names: at least DT fastest, audible fastest and ultrasound fastest). Print the fast-check seed on failure.
    - **Truncation test (clause 13.2)**: give ggwave a 141-byte payload, then decode, and assert the decoded bytes are the first 140 bytes only. This shows the length guard of requirement 4 is mandatory.
    - **Offset decode test (clause 13.3)**: stream a 140-byte DT frame to ggwave decoders in 1024-sample chunks, at sample offsets 0, 256 and 512, and assert the frame decodes at each. Do not assert that offset 768 decodes. Record in a comment that offset 768 fails in the recorded evidence, which is why the audio layer runs several offset decoders.
    - The test must not run under `npm.cmd test`. Confirm `npm.cmd test` does not list it and `npm.cmd run test:slow` does.
    - _Requirements: 13.1, 13.2, 13.3, 13.4_

- [x] 11. Baseline checkpoint before the CRC revision (replaces the earlier final checkpoint, which moves to task 17)
  - Ensure all tests pass, ask the user if questions arise.
  - Run `npm.cmd run typecheck`, `npm.cmd run lint` and `npm.cmd test` as separate steps and report each result. Do not require `npm.cmd run test:slow` to pass here. The Property 14 assertion written in task 10.2 expects exact bytes from ggwave, which the evidence contradicts, and task 16.1 replaces it.
  - Confirm `npm.cmd test` and `npm.cmd run test:props` do not run `ggwave.slow.test.ts`.
  - Confirm no commit was made.

- [x] 12. CRC revision: constants, `crc16` module and error type
  - [x] 12.1 Revise `src/protocol/budget.ts` (Revises task 2.1)
    - Add `export const CRC_LEN = 2;`. Keep `HEADER_LEN_SINGLE` 10 and `HEADER_LEN_MULTI` 11 and `headerLength` unchanged.
    - Add `frameOverhead(total)` returning `headerLength(total) + CRC_LEN` (12 for total 1, 13 for total above 1).
    - Change `wireBodyCapacity({ multi })` to `GGWAVE_MAX_PAYLOAD - frameOverhead(multi ? 2 : 1)`, which gives 128 single and 127 multi. The current code computes `GGWAVE_MAX_PAYLOAD - header` (130, 129), so only the subtraction changes. `plaintextCapacity` keeps its formula (`wire - TAG_LEN` when encrypted) and now gives 128, 112, 127, 111. No hard-coded capacity number.
    - Update the doc comments that say 130 and 129.
    - _Requirements: 5.1, 5.2, 5.3, 5.5, 5.6_

  - [x] 12.2 Revise the unit tests in `src/protocol/budget.test.ts` (Revises task 2.2)
    - Add `CRC_LEN` (2) to the constants check.
    - Change `wireBodyCapacity` expectations from 130 and 129 to 128 and 127, and the `plaintextCapacity` expectations from 130, 114, 129, 113 to 128, 112, 127, 111.
    - Add `frameOverhead` tests: 12 for total 1 and 13 for totals 2 to 16, and that `frameOverhead(total) === headerLength(total) + CRC_LEN`.
    - Add a consistency test: `GGWAVE_MAX_PAYLOAD - frameOverhead(1) === wireBodyCapacity({ multi: false })` and the same for the multi-frame case.
    - _Requirements: 5.1, 5.2, 5.3, 5.5, 5.6_

  - [x] 12.3 Create `src/protocol/crc16.ts` (New)
    - Implement `export function crc16(bytes: Uint8Array): number` as CRC-16/CCITT-FALSE: polynomial 0x1021, initial value 0xFFFF, no input or output reflection, no final XOR. Return a number from 0 to 0xFFFF. A bitwise loop or a 256-entry table generated at module load are both acceptable.
    - Do not mutate the input and never throw. Use no runtime facility beyond plain TypeScript.
    - Do not export it from `src/protocol/index.ts` (clause 14.5).
    - _Requirements: 17.1, 14.1, 14.4_

  - [x] 12.4 Write unit tests for `crc16` (New)
    - File: `src/protocol/crc16.test.ts`.
    - The standard check value: `crc16` of the ASCII bytes of "123456789" is `0x29B1`. Empty input gives `0xFFFF`.
    - The two wire examples of the design: `crc16` of `40 07 01 02 03 04 05 06 07 08 68 69` is `0xD991`, and `crc16` of `56 16 01 02 03 04 05 06 07 08 12 41` is `0x2A73`. Also assert the full wire arrays ending in `D9 91` and `2A 73`.
    - Residue: for several messages `m`, `crc16(m || bigEndian(crc16(m)))` is `0`.
    - The function does not mutate its input and handles a 140-byte array of 0xFF.
    - _Requirements: 17.1, 17.2_

  - [x] 12.5 Add `BAD_CRC` to the `DecodeError` union in `src/protocol/types.ts` (Revises task 3.1)
    - `DecodeError` becomes `TOO_SHORT`, `TOO_LONG`, `BAD_CRC`, `BAD_VERSION`, `RESERVED_BITS`, `UNKNOWN_TYPE`, `BAD_FRAME_INDEX`, `NON_CANONICAL`, `BODY_TOO_SHORT`, `KEY_OFFER_ENCRYPTED`, `KEY_OFFER_MULTIFRAME` (clause 12.2). The `patchRouting` error type is `EncodeError | DecodeError`, which now includes `BAD_CRC`. Do not add a CRC field to `Frame` or `FrameHeader`.
    - _Requirements: 12.2, 12.4, 17.3_

  - [x] 12.6 Revise `src/protocol/index.ts` exports (Revises task 9.1)
    - Export `CRC_LEN` and `frameOverhead` with the other budget exports. Do not export `crc16`.
    - _Requirements: 14.5_

- [x] 13. CRC revision: frame codec
  - [x] 13.1 Revise `encodeFrame` in `src/protocol/frame.ts` (Revises task 3.2)
    - The total length becomes `headerLength(total) + body.length + CRC_LEN`, and the `FRAME_TOO_LONG` guard (over 140) counts the CRC. Keep the validation precedence of clause 2.10 unchanged.
    - After writing the header and body, compute `crc16` over `out.subarray(0, len - 2)` and write it big-endian into the last two bytes. Use `CRC_LEN` and `frameOverhead` from `budget.ts`, no literal sizes.
    - Do not put the CRC into the `Frame` type.
    - _Requirements: 1.11, 2.1, 2.10, 4.1, 4.2, 4.6, 17.1, 17.3_

  - [x] 13.2 Revise `decodeFrame` in `src/protocol/frame.ts` (Revises task 3.3)
    - Order of checks (clause 3.13): `TOO_SHORT` (under 12 bytes), `TOO_LONG` (over 140), then `BAD_CRC` (the last two bytes, high byte first, differ from `crc16` of the preceding bytes), and only then `BAD_VERSION`, `RESERVED_BITS`, `UNKNOWN_TYPE`, `KEY_OFFER_ENCRYPTED`, `KEY_OFFER_MULTIFRAME`, `TOO_SHORT` (multi-frame flag set and under 13 bytes), `NON_CANONICAL`, `BAD_FRAME_INDEX`, `BODY_TOO_SHORT`. Read no field before the CRC check passes.
    - The returned Body is `bytes.slice(offset, length - 2)`, so it excludes the CRC. Keep copies (no `subarray`).
    - Every accepted input must re-encode to identical bytes.
    - _Requirements: 3.1, 3.2, 3.6, 3.11, 3.12, 3.13, 3.15, 12.2, 17.3_

  - [x] 13.3 Revise `patchRouting` in `src/protocol/frame.ts` (Revises task 3.4)
    - Run `decodeFrame` first and return its error unchanged, including `BAD_CRC`, even when hop or TTL is also invalid.
    - Then validate hop and TTL (`BAD_ROUTING`). Otherwise copy the input, set byte 1, recompute `crc16` over the copy minus its last two bytes, and write it big-endian into the last two bytes. Needs no key. Do not mutate the input. Equal arguments give equal bytes.
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.6, 10.9, 10.10_

- [x] 14. CRC revision: update existing tests whose numbers change
  - [x] 14.1 Revise `src/protocol/frame.test.ts` (Revises task 3.11)
    - Replace the wire examples with the byte-exact ones from the design: `40 07 01 02 03 04 05 06 07 08 68 69 D9 91` (14 bytes) and `56 16 01 02 03 04 05 06 07 08 12 41 2A 73` (14 bytes). Keep the encrypted three-frame SOS layout check (B0 `0x76`, FRAME `0x12`) but build it with a 16-byte body and assert that the last two bytes equal `crc16` of the rest.
    - Boundary test: body of 128 bytes accepted and 129 rejected for a single frame (output length 140), 127 accepted and 128 rejected for `total` 2.
    - Every hand-built decode input for a field error (`BAD_VERSION`, `RESERVED_BITS`, `UNKNOWN_TYPE`, `KEY_OFFER_*`, `NON_CANONICAL`, `BAD_FRAME_INDEX`, `BODY_TOO_SHORT`, the multi-frame `TOO_SHORT`) must end with a correct CRC (compute with `crc16`, big-endian). Length errors: under 12 bytes gives `TOO_SHORT`, over 140 gives `TOO_LONG`.
    - New cases: a wrong CRC returns `BAD_CRC`; a wrong CRC on bytes that also have a field defect (bad version, reserved bit, unknown type) returns `BAD_CRC`; a 12-byte input with a correct CRC and the multi-frame flag set returns `TOO_SHORT`; decoded Body excludes the CRC; `patchRouting` on a corrupted-CRC frame returns `BAD_CRC`, and the patched output of a good frame decodes and has a recomputed CRC; `patchRouting` on inputs under 12 bytes and under 2 bytes returns `TOO_SHORT`.
    - Update the decode precedence test for clause 3.13 to the new total order.
    - _Requirements: 1.11, 2.1, 2.10, 3.1, 3.2, 3.6, 3.13, 3.15, 4.6, 10.6, 10.10, 17.1_

  - [x] 14.2 Revise `src/protocol/frame-length.prop.test.ts` (Revises task 3.8, Property 4)
    - The guard is `headerLength(total) + body.length + 2 > 140`. Wire body boundaries: 128 single and 127 multi (plain and encrypted alike).
    - KEY_OFFER boundary: 16-byte key plus a name of 0 to 112 bytes accepted (112 gives a 140-byte frame), 113 fails with `FRAME_TOO_LONG`. The 2-byte-character example: 56 characters (112 bytes) fit and 57 characters (114 bytes) do not.
    - _Requirements: 4.1, 4.2, 4.6, 6.6, 6.7_

  - [x] 14.3 Revise `src/protocol/frame-keyoffer.prop.test.ts` (Revises task 3.10, Property 15)
    - Change `MAX_NAME_BYTES` from 114 to 112, the 115-byte failing name to 113, and the oversized-body generator `maxLength` from 130 to 128.
    - Byte arrays built by hand for `decodeFrame` (type bits 4 with the E or M bit set, types 6 and 7) must end with a correct CRC so the field error is reached. Add one case with a wrong CRC that returns `BAD_CRC`.
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 3.5_

  - [x] 14.4 Revise the round-trip, canonical and total property tests (Revises tasks 3.5, 3.6 and 3.7, Properties 1, 2 and 3)
    - `frame-roundtrip.prop.test.ts`: bodies up to `wireBodyCapacity` (128 or 127). Also assert the last two bytes of the wire equal `crc16` of the rest and that the decoded Frame has no CRC field. Properties 1.
    - `frame-canonical.prop.test.ts`: raw random bytes almost never carry a correct CRC, so add a generator that builds arbitrary bytes of 10 to 138 bytes and appends the correct CRC, mixed with raw bytes of 0 to 200. A good share of inputs must be accepted. Property 2.
    - `frame-total.prop.test.ts`: the closed set now includes `BAD_CRC`. Include the CRC-corrected generator so field errors are exercised, and update the clause 3.13 precedence examples (length, then `BAD_CRC`, then fields; multi-frame `TOO_SHORT` under 13 bytes with a correct CRC; `NON_CANONICAL` before `BAD_FRAME_INDEX` with a correct CRC). Property 3.
    - _Requirements: 2.9, 3.12, 3.13, 12.1, 12.2, 17.1, 17.3_

  - [x] 14.5 Revise `src/protocol/frame-patch.prop.test.ts` (Revises task 3.9, Property 9)
    - Body generator `maxLength` from 129 to 127 so multi-frame frames fit.
    - `patchRouting` output differs from the input only at byte 1 and the last two bytes, decodes successfully (the CRC is correct), is idempotent, and keeps `frameKey`, `aadFor` and `ivFor` equal. For a wire frame whose CRC was corrupted, the result is `BAD_CRC` even when hop is also invalid.
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.6, 10.9, 10.10_

  - [x] 14.6 Revise `segment.ts` checks and the segment tests (Revises tasks 7.1 to 7.9, Properties 5, 6, 7, 8 and 12)
    - First confirm that `segment.ts` takes every capacity from `budget.ts` and hard-codes none. If it hard-codes a number, replace it with the `budget.ts` function. No other change to `segment.ts` is expected.
    - `segment.test.ts`: single-frame capacities 128 and 112 (and one byte over gives chunks of `[127, 2]` and `[111, 2]`), the cut-inside-code-point case (`bytes(128)` plus a 4-byte code point splits as `[127, 5]` with `utf8Boundaries` off), 16 full chunks of 127 and 111 accepted and one byte more rejected with `TOO_MANY_FRAMES`, `makeFrames` single body of 128 accepted and 129 giving `FRAME_TOO_LONG`, and the multi-frame capacity 127 (`[bytes(127), bytes(127)]` accepted, `[bytes(1), bytes(128)]` rejected).
    - `segment-guard.prop.test.ts` (Property 5): the guard is 128 bytes. Strings with at most 128 characters and more than 128 UTF-8 bytes are never sent as one frame, and no frame exceeds 140 bytes. Update the generator limits (the head of 3-byte characters must produce at least 129 bytes).
    - `segment-split`, `segment-roundtrip`, `segment-utf8` and `segment-inconsistent` property tests (Properties 8, 6, 7 and 12): replace any literal 130, 129, 114, 113 and 16-frame limits (2064, 1808) with values from `budget.ts` or with 128, 127, 112, 111, 2032 and 1776. Re-run to confirm no frame exceeds 140 bytes with the CRC included.
    - _Requirements: 4.4, 4.5, 8.1, 8.2, 8.5, 8.6, 8.8, 8.9, 9.7_

  - [x] 14.7 Check the crypto-input tests for impact (Revises tasks 6.2, 6.3 and 6.4 only if affected)
    - Confirm `frame-crypto-inputs.test.ts`, `frame-aad.prop.test.ts` and `frame-iv.prop.test.ts` pass unchanged: `aadFor` and `ivFor` do not depend on the CRC. If any of them builds frames through `encodeFrame` with bodies near the old capacity, change the limit to the new one. Add to `frame-aad.prop.test.ts` an assertion that `aadFor` output is equal for a frame and its `patchRouting` output.
    - _Requirements: 11.2, 17.5_

  - [x] 14.8 Revise the layering and index test (Revises task 9.2)
    - Task 9.2 is in progress. Do this sub-task after task 9.2 is complete.
    - In `src/protocol/layering.test.ts`, add `CRC_LEN` (2) and `frameOverhead` to the list of names that `./index` must expose, check `CRC_LEN` in the clause 5.1 constant values, and assert that `crc16` is not exported from `./index`.
    - Make sure the scan of non-test files covers the new `crc16.ts` (no forbidden imports, no `crypto.subtle`, no `fetch`, `window` or `document`).
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5_

- [x] 15. New fast property test: the CRC detects bit errors
  - [x] 15.1 Write property test for single-bit and burst errors (New)
    - File: `src/protocol/frame-crc.prop.test.ts`.
    - **Property 16: The CRC detects every single-bit and burst error**
    - For every valid frame (any valid header, body within `wireBodyCapacity`, encrypted bodies at least TAG_LEN, KEY_OFFER restrictions respected), take `w = encodeFrame(f)`. Generate a window start bit, a window length from 1 to 16 (clamped so the window lies inside the frame), and an error pattern inside the window whose first and last bits are set. Bit order is transmission order: bit `i` is byte `i >> 3`, mask `0x80 >> (i & 7)`. XOR the pattern into a copy of `w` and assert `decodeFrame` fails with `BAD_CRC`. Cover windows that sit in the header, the body, the CRC bytes, and across byte boundaries.
    - Also check exhaustively that every single-bit flip of a few fixed frames (single-frame, multi-frame, 140-byte frame) returns `BAD_CRC`, and that the unmodified frame still decodes.
    - Print the fast-check seed on failure.
    - **Validates: Requirements 17.4, 3.15**

- [x] 16. Rewrite the slow ggwave test (Property 14)
  - [x] 16.1 Rewrite `src/protocol/ggwave.slow.test.ts` (Revises task 10.2, which is in progress)
    - Task 10.2 is in progress. Do this sub-task after task 10.2 is complete, and rewrite the Property 14 part only. Keep the ggwave loader, the 141-byte truncation test (clause 13.2) and the offset 0, 256, 512 decode test (clause 13.3) as they are. The truncation test stays unchanged because ggwave corruption is deterministic per payload and it uses a fixed payload that has passed on every run, so it cannot become flaky.
    - **Property 14: A frame survives the modem or is rejected (slow)**: with fast-check and a small run count per profile, for frames built with `encodeFrame` (bodies containing 0x00 and 0xFF and invalid UTF-8, lengths up to the wire capacity, single and multi-frame headers), send the wire bytes through ggwave under each Channel_Profile in `field-findings.md` including DT fastest, audible fastest and ultrasound fastest, and decode. Assert that either ggwave returns nothing, or `decodeFrame(received)` fails (any `DecodeError`, expected `BAD_CRC` or `TOO_SHORT`), or it returns a Frame deeply equal to the one sent. Fail only when `decodeFrame` returns a different Frame. Do not narrow the generators to avoid failing payloads. Print the fast-check seed on failure.
    - **Evidence test (clause 13.5)**: for each Channel_Profile (the FASTEST, FAST and NORMAL profiles available in the vendored build, at 48000 Hz, 0.6 s of silence on each side, 1024-sample chunks), send the three recorded failing raw payloads as fixed regression cases: ULTRASOUND_FASTEST `[192,128,128,226,40,36,0,255]`, AUDIBLE_FASTEST `[255,192,128,128,226,40,253,0]`, and the exact 28-byte ULTRASOUND_FASTEST payload `[122,88,2,3,253,54,200,250,7,3,3,128,226,40,0,25,201,0,0,17,17,16,181,8,0,255,192,128]` (recorded as decoded to `[226,200,0]` in 20 of 20 replays). Do not assert that these decode wrongly. Log the result of each. Then run a seeded sweep of 150 random payloads of 1 to 60 bytes per profile. Count equal, wrong and not-decoded results per profile and log the counts with `console.info`. Do not assert that the raw bytes equal the input. Assert only that the counts add up to the number of payloads sent. Record in a comment that the recorded sweep gave 3 wrong (AUDIBLE_FASTEST), 1 wrong (DT_FASTEST), 2 wrong (ULTRASOUND_FASTEST), 0 wrong in the FAST modes, and 0 not decoded in every FASTEST and FAST mode, with 3 not decoded in AUDIBLE_NORMAL.
    - The test must not run under `npm.cmd test`. Confirm `npm.cmd test` does not list it and `npm.cmd run test:slow` does.
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5_

- [x] 17. Final checkpoint - full verification (replaces the earlier final checkpoint)
  - Ensure all tests pass, ask the user if questions arise.
  - Run these as separate steps and report each result: `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd test`, then `npm.cmd run test:slow`. Report the per-profile counts of wrong results from the evidence test.
  - Confirm `npm.cmd test` and `npm.cmd run test:props` do not run `ggwave.slow.test.ts`.
  - Grep `src/protocol` for the old numbers (130, 129, 114, 113 as capacities, 115 as the KEY_OFFER failing name) and confirm none remains.
  - Confirm no commit was made and `git status` shows only uncommitted files. The user will make the single commit.

## Notes

- Every task is required. There are no optional markers.
- Each task references specific requirement clauses for traceability. All 15 design properties have a property test task: P1 (3.5), P2 (3.6), P3 (3.7), P4 (3.8), P5 (7.4), P6 (7.6), P7 (7.7), P8 (7.5), P9 (3.9), P10 (6.2), P11 (6.3), P12 (7.8), P13 (5.2), P14 (10.2), P15 (3.10).
- Task 3.9 imports `aadFor` and `ivFor` from task 6.1, so it runs in a later wave than 6.1.
- CRC revision: tasks 12 to 17 change code and tests written by tasks 1 to 10. Completed tasks keep their status markers. Tasks 9.2 and 10.2 are in progress, so 14.8 and 16.1 start after them (wave 9 onward in the graph).
- Property 14 is rewritten by task 16.1 (frame survives the modem or is rejected) and the new Property 16 (CRC detects bit and burst errors) is task 15.1. All 16 design properties now have a task: P1 (3.5, 14.4), P2 (3.6, 14.4), P3 (3.7, 14.4), P4 (3.8, 14.2), P5 (7.4, 14.6), P6 (7.6, 14.6), P7 (7.7, 14.6), P8 (7.5, 14.6), P9 (3.9, 14.5), P10 (6.2, 14.7), P11 (6.3), P12 (7.8, 14.6), P13 (5.2), P14 (10.2, 16.1), P15 (3.10, 14.3), P16 (15.1).
- Test inputs for `decodeFrame` that target a field error must carry a correct CRC, because `BAD_CRC` is checked before every field.
- Task 11 is now a baseline checkpoint before the CRC work. The final checkpoint is task 17.
- Never commit. The user commits once when the spec is done.
- Use `npm.cmd` and `npx.cmd` only.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["2.1", "10.1"] },
    { "id": 3, "tasks": ["2.2", "3.1"] },
    { "id": 4, "tasks": ["3.2", "5.1", "6.1", "7.1"] },
    { "id": 5, "tasks": ["3.3", "5.2", "6.2", "6.3", "6.4", "7.2", "7.5"] },
    { "id": 6, "tasks": ["3.4", "3.5", "3.6", "3.7", "3.8", "3.10", "7.3", "7.4"] },
    { "id": 7, "tasks": ["3.9", "3.11", "7.6", "7.7", "7.8", "7.9", "9.1"] },
    { "id": 8, "tasks": ["9.2", "10.2"] },
    { "id": 9, "tasks": ["12.1", "12.3", "12.5"] },
    { "id": 10, "tasks": ["12.2", "12.4", "12.6", "13.1"] },
    { "id": 11, "tasks": ["13.2"] },
    { "id": 12, "tasks": ["13.3"] },
    { "id": 13, "tasks": ["14.1", "14.2", "14.3", "14.4", "14.5", "14.6", "14.7", "14.8", "15.1", "16.1"] }
  ]
}
```
