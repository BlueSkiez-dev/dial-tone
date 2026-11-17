import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { MESSAGE_ID_LEN, TAG_LEN, wireBodyCapacity } from "./budget";
import { crc16 } from "./crc16";
import { decodeFrame, encodeFrame } from "./frame";
import type { Frame, MessageType } from "./types";

/**
 * Property 2: Canonical encoding.
 * For every byte array of length 0 to 200, when decodeFrame succeeds with
 * value f, encodeFrame(f) equals the input bytes.
 *
 * **Validates: Requirements 3.12**
 */

const NUM_RUNS = 2000;

const KEY_OFFER = 4;
const KEY_LEN = 16;

const messageIdArb = fc.uint8Array({
  minLength: MESSAGE_ID_LEN,
  maxLength: MESSAGE_ID_LEN,
});
const nibbleArb = fc.integer({ min: 0, max: 15 });
const ordinaryTypeArb = fc.constantFrom<MessageType>(0, 1, 2, 3, 5);

/** Valid ordinary frame (same shape as frame-roundtrip.prop.test.ts). */
const ordinaryFrameArb: fc.Arbitrary<Frame> = fc
  .record({
    type: ordinaryTypeArb,
    encrypted: fc.boolean(),
    hop: nibbleArb,
    ttl: nibbleArb,
    messageId: messageIdArb,
    total: fc.integer({ min: 1, max: 16 }),
  })
  .chain((h) =>
    fc
      .record({
        index: fc.integer({ min: 0, max: h.total - 1 }),
        body: fc.uint8Array({
          minLength: h.encrypted ? TAG_LEN : 0,
          maxLength: wireBodyCapacity({ multi: h.total > 1 }),
        }),
      })
      .map(({ index, body }) => ({
        header: { version: 1 as const, ...h, index },
        body,
      })),
  );

/** Valid KEY_OFFER frame: plaintext, single frame. */
const keyOfferFrameArb: fc.Arbitrary<Frame> = fc
  .record({
    hop: nibbleArb,
    ttl: nibbleArb,
    messageId: messageIdArb,
    body: fc.uint8Array({
      minLength: KEY_LEN,
      maxLength: wireBodyCapacity({ multi: false }),
    }),
  })
  .map(({ body, ...h }) => ({
    header: {
      version: 1 as const,
      type: KEY_OFFER as MessageType,
      encrypted: false,
      total: 1,
      index: 0,
      ...h,
    },
    body,
  }));

const validFrameArb = fc.oneof(
  { weight: 4, arbitrary: ordinaryFrameArb },
  { weight: 1, arbitrary: keyOfferFrameArb },
);

type Mutation =
  | { kind: "none" }
  | { kind: "byte"; pos: number; value: number }
  | { kind: "bit"; pos: number; bit: number };

const mutationArb: fc.Arbitrary<Mutation> = fc.oneof(
  { weight: 4, arbitrary: fc.constant<Mutation>({ kind: "none" }) },
  {
    weight: 3,
    arbitrary: fc.record({
      kind: fc.constant("byte" as const),
      pos: fc.nat({ max: 199 }),
      value: fc.integer({ min: 0, max: 255 }),
    }),
  },
  {
    weight: 3,
    arbitrary: fc.record({
      kind: fc.constant("bit" as const),
      pos: fc.nat({ max: 199 }),
      bit: fc.integer({ min: 0, max: 7 }),
    }),
  },
);

/** A valid frame encoded to wire bytes, then sometimes with one byte or bit changed. */
const mutatedValid: fc.Arbitrary<Uint8Array> = fc
  .tuple(validFrameArb, mutationArb)
  .map(([frame, m]) => {
    const enc = encodeFrame(frame);
    if (!enc.ok) throw new Error("valid frame arbitrary failed to encode");
    const bytes = new Uint8Array(enc.value);
    if (bytes.length === 0 || m.kind === "none") return bytes;
    const pos = m.pos % bytes.length;
    if (m.kind === "byte") bytes[pos] = m.value;
    else bytes[pos] = (bytes[pos] ?? 0) ^ (1 << m.bit);
    return bytes;
  });

/** Fully arbitrary bytes, length 0 to 200. Mostly rejected, covers the error paths. */
const arbitraryBytes = fc.uint8Array({ minLength: 0, maxLength: 200 });

function withCrc(body: Uint8Array): Uint8Array {
  const out = new Uint8Array(body.length + 2);
  out.set(body, 0);
  const crc = crc16(body);
  out[body.length] = crc >> 8;
  out[body.length + 1] = crc & 0xff;
  return out;
}

/** Arbitrary 10 to 138 bytes with the correct CRC appended, so field checks are reached. */
const crcCorrected: fc.Arbitrary<Uint8Array> = fc
  .uint8Array({ minLength: 10, maxLength: 138 })
  .map(withCrc);

/** Same, but B0 forced to version 1, rsv 0, so a good share is accepted. */
const crcCorrectedV1: fc.Arbitrary<Uint8Array> = fc
  .tuple(
    fc.integer({ min: 0, max: 0x1f }),
    fc.uint8Array({ minLength: 9, maxLength: 137 }),
  )
  .map(([low, rest]) => {
    const body = new Uint8Array(rest.length + 1);
    body[0] = 0x40 | (low << 1);
    body.set(rest, 1);
    return withCrc(body);
  });

const anyBytes = fc.oneof(
  { arbitrary: mutatedValid, weight: 5 },
  { arbitrary: crcCorrected, weight: 2 },
  { arbitrary: crcCorrectedV1, weight: 2 },
  { arbitrary: arbitraryBytes, weight: 1 },
);

describe("Property 2: canonical encoding", () => {
  it("re-encoding any accepted input gives back the identical bytes", () => {
    let accepted = 0;
    let total = 0;

    fc.assert(
      fc.property(anyBytes, (bytes) => {
        total++;
        const decoded = decodeFrame(bytes);
        if (!decoded.ok) return true;
        accepted++;
        const encoded = encodeFrame(decoded.value);
        expect(encoded.ok).toBe(true);
        if (!encoded.ok) return false;
        expect(Array.from(encoded.value)).toEqual(Array.from(bytes));
        return true;
      }),
      { numRuns: NUM_RUNS, verbose: true },
    );

    // The generator must exercise the accepted path, or the property is vacuous.
    expect(accepted).toBeGreaterThan(total * 0.1);
  });
});
