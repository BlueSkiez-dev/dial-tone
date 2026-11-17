import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  GGWAVE_MAX_PAYLOAD,
  headerLength,
  MAX_FRAMES,
  MESSAGE_ID_LEN,
  TAG_LEN,
  wireBodyCapacity,
} from "./budget";
import { encodeFrame } from "./frame";
import type { Frame, MessageType } from "./types";

// verbose prints the seed and path on failure so CI failures can be replayed.
const PARAMS = { verbose: true, numRuns: 500 } as const;

const messageIdArb = fc.uint8Array({
  minLength: MESSAGE_ID_LEN,
  maxLength: MESSAGE_ID_LEN,
});
// KEY_OFFER (4) is covered separately because it has its own restrictions.
const typeArb = fc.constantFrom<MessageType>(0, 1, 2, 3, 5);
const totalArb = fc.integer({ min: 1, max: MAX_FRAMES });

function makeFrame(opts: {
  type: MessageType;
  encrypted: boolean;
  hop: number;
  ttl: number;
  messageId: Uint8Array;
  total: number;
  index: number;
  body: Uint8Array;
}): Frame {
  return {
    header: {
      version: 1,
      type: opts.type,
      encrypted: opts.encrypted,
      hop: opts.hop,
      ttl: opts.ttl,
      messageId: opts.messageId,
      index: opts.index,
      total: opts.total,
    },
    body: opts.body,
  };
}

/** Otherwise-valid frames whose body length straddles the 140-byte boundary. */
const frameArb: fc.Arbitrary<Frame> = fc
  .record({
    type: typeArb,
    encrypted: fc.boolean(),
    hop: fc.integer({ min: 0, max: 15 }),
    ttl: fc.integer({ min: 0, max: 15 }),
    messageId: messageIdArb,
    total: totalArb,
    indexSeed: fc.nat({ max: MAX_FRAMES - 1 }),
    // Encrypted bodies need at least TAG_LEN bytes, so start at TAG_LEN for all.
    body: fc.uint8Array({
      minLength: TAG_LEN,
      maxLength: GGWAVE_MAX_PAYLOAD + 10,
    }),
  })
  .map((r) =>
    makeFrame({
      type: r.type,
      encrypted: r.encrypted,
      hop: r.hop,
      ttl: r.ttl,
      messageId: r.messageId,
      total: r.total,
      index: r.indexSeed % r.total,
      body: r.body,
    }),
  );

function bodyOfLength(n: number): Uint8Array {
  return new Uint8Array(n).fill(0xab);
}

describe("Property 4: Length guard", () => {
  /**
   * **Validates: Requirements 4.1, 4.2**
   */
  it("fails with FRAME_TOO_LONG iff header + body exceeds 140, and output is at most 140", () => {
    fc.assert(
      fc.property(frameArb, (frame) => {
        // header + body + 2-byte CRC trailer
        const wireLen =
          headerLength(frame.header.total) + frame.body.length + 2;
        const r = encodeFrame(frame);
        if (wireLen > GGWAVE_MAX_PAYLOAD) {
          expect(r.ok).toBe(false);
          if (!r.ok) expect(r.error.code).toBe("FRAME_TOO_LONG");
        } else {
          expect(r.ok).toBe(true);
          if (r.ok) {
            expect(r.value.length).toBe(wireLen);
            expect(r.value.length).toBeLessThanOrEqual(GGWAVE_MAX_PAYLOAD);
          }
        }
      }),
      PARAMS,
    );
  });

  /**
   * **Validates: Requirements 4.6**
   */
  it("accepts a body of exactly wireBodyCapacity and rejects one more byte, encrypted or not", () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        typeArb,
        messageIdArb,
        totalArb,
        fc.nat({ max: MAX_FRAMES - 1 }),
        (encrypted, type, messageId, total, indexSeed) => {
          const cap = wireBodyCapacity({ multi: total > 1 });
          const base = {
            type,
            encrypted,
            hop: 0,
            ttl: 0,
            messageId,
            total,
            index: indexSeed % total,
          };

          const atCap = encodeFrame(
            makeFrame({ ...base, body: bodyOfLength(cap) }),
          );
          expect(atCap.ok).toBe(true);
          if (atCap.ok) expect(atCap.value.length).toBe(GGWAVE_MAX_PAYLOAD);

          const over = encodeFrame(
            makeFrame({ ...base, body: bodyOfLength(cap + 1) }),
          );
          expect(over.ok).toBe(false);
          if (!over.ok) expect(over.error.code).toBe("FRAME_TOO_LONG");
        },
      ),
      PARAMS,
    );
  });

  /**
   * KEY_OFFER boundary through the public frame API: 16-byte key plus a name
   * of 0 to 112 bytes is accepted (112 gives a 140-byte frame), and 113 bytes
   * of name is rejected.
   *
   * **Validates: Requirements 6.6, 6.7**
   */
  it("KEY_OFFER accepts a 16-byte key plus up to 112 name bytes and rejects 113", () => {
    const keyOfferFrame = (messageId: Uint8Array, nameLen: number): Frame =>
      makeFrame({
        type: 4,
        encrypted: false,
        hop: 0,
        ttl: 0,
        messageId,
        total: 1,
        index: 0,
        body: bodyOfLength(16 + nameLen),
      });

    fc.assert(
      fc.property(
        messageIdArb,
        fc.integer({ min: 0, max: 112 }),
        (messageId, nameLen) => {
          const r = encodeFrame(keyOfferFrame(messageId, nameLen));
          expect(r.ok).toBe(true);
          // 10-byte header + 16-byte key + name + 2-byte CRC
          if (r.ok) expect(r.value.length).toBe(10 + 16 + nameLen + 2);
        },
      ),
      PARAMS,
    );

    fc.assert(
      fc.property(messageIdArb, (messageId) => {
        const r = encodeFrame(keyOfferFrame(messageId, 113));
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error.code).toBe("FRAME_TOO_LONG");
      }),
      PARAMS,
    );
  });

  /**
   * The guard counts bytes, not characters. A group name of 57 two-byte
   * characters is 112 bytes and fits. 57 characters is 114 bytes and does not,
   * although 57 characters is far below any character limit.
   *
   * **Validates: Requirements 4.1, 6.7**
   */
  it("counts UTF-8 bytes, not characters, for a multi-byte KEY_OFFER name", () => {
    const enc = new TextEncoder();
    const key = new Uint8Array(16).fill(1);
    const build = (name: string): Frame => {
      const nameBytes = enc.encode(name);
      const body = new Uint8Array(16 + nameBytes.length);
      body.set(key, 0);
      body.set(nameBytes, 16);
      return makeFrame({
        type: 4,
        encrypted: false,
        hop: 0,
        ttl: 0,
        messageId: new Uint8Array(MESSAGE_ID_LEN),
        total: 1,
        index: 0,
        body,
      });
    };

    const fits = "\u00e9".repeat(56); // 56 chars, 112 bytes
    const tooLong = "\u00e9".repeat(57); // 57 chars, 114 bytes
    expect(fits.length).toBe(56);
    expect(enc.encode(fits).length).toBe(112);
    expect(encodeFrame(build(fits)).ok).toBe(true);

    expect(tooLong.length).toBe(57);
    const r = encodeFrame(build(tooLong));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("FRAME_TOO_LONG");
  });
});
