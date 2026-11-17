import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { GGWAVE_MAX_PAYLOAD, MAX_FRAMES, MESSAGE_ID_LEN } from "./budget";
import { crc16 } from "./crc16";
import { decodeFrame, encodeFrame } from "./frame";
import type { Frame, MessageType } from "./types";

// verbose prints the seed and path on failure so CI failures can be replayed.
const PARAMS = { verbose: true, numRuns: 500 } as const;

const KEY_LEN = 16;
const MAX_NAME_BYTES = 112;

const messageIdArb = fc.uint8Array({
  minLength: MESSAGE_ID_LEN,
  maxLength: MESSAGE_ID_LEN,
});
const nibbleArb = fc.integer({ min: 0, max: 15 });

function keyOfferFrame(opts: {
  encrypted?: boolean;
  total?: number;
  index?: number;
  hop?: number;
  ttl?: number;
  messageId: Uint8Array;
  body: Uint8Array;
}): Frame {
  const total = opts.total ?? 1;
  return {
    header: {
      version: 1,
      type: 4 as MessageType,
      encrypted: opts.encrypted ?? false,
      hop: opts.hop ?? 0,
      ttl: opts.ttl ?? 0,
      messageId: opts.messageId,
      index: opts.index ?? 0,
      total,
    },
    body: opts.body,
  };
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

/**
 * Raw wire bytes: B0 built from the flags, then `rest` (routing, ID, optional
 * frame byte, body) of arbitrary content, then a correct CRC-16 trailer so
 * the field checks after the CRC check are reached. Total length is
 * 1 + rest.length + 2.
 */
function wireWithB0(b0: number, rest: Uint8Array): Uint8Array {
  const out = new Uint8Array(1 + rest.length + 2);
  out[0] = b0;
  out.set(rest, 1);
  const crc = crc16(out.subarray(0, out.length - 2));
  out[out.length - 2] = crc >> 8;
  out[out.length - 1] = crc & 0xff;
  return out;
}

/** Rest bytes so that the whole wire (with CRC) is 12 to 140 bytes. */
const restArb = fc.uint8Array({
  minLength: 9,
  maxLength: GGWAVE_MAX_PAYLOAD - 3,
});

/** B0 for version 1, reserved bit 0, given flags and type. */
function b0For(encrypted: boolean, multi: boolean, type: number): number {
  return (
    (1 << 6) | ((encrypted ? 1 : 0) << 5) | ((multi ? 1 : 0) << 4) | (type << 1)
  );
}

/** Group names as UTF-8 bytes of 0 to 112 bytes, built from 1-, 2-, 3- and 4-byte characters. */
const nameBytesArb: fc.Arbitrary<Uint8Array> = fc
  .array(fc.constantFrom("a", "\u00e9", "\u20ac", "\u{1F600}"), {
    maxLength: MAX_NAME_BYTES,
  })
  .map((chars) => {
    const enc = new TextEncoder();
    let used = 0;
    let text = "";
    for (const c of chars) {
      const n = enc.encode(c).length;
      if (used + n > MAX_NAME_BYTES) break;
      used += n;
      text += c;
    }
    return enc.encode(text);
  });

const keyArb = fc.uint8Array({ minLength: KEY_LEN, maxLength: KEY_LEN });

describe("Property 15: KEY_OFFER is plaintext and single-frame", () => {
  /**
   * **Validates: Requirements 6.1**
   */
  it("encode rejects an encrypted KEY_OFFER with KEY_OFFER_ENCRYPTED", () => {
    fc.assert(
      fc.property(
        messageIdArb,
        fc.integer({ min: 1, max: MAX_FRAMES }),
        fc.nat({ max: MAX_FRAMES - 1 }),
        fc.uint8Array({ minLength: KEY_LEN, maxLength: 128 }),
        (messageId, total, indexSeed, body) => {
          const r = encodeFrame(
            keyOfferFrame({
              encrypted: true,
              total,
              index: indexSeed % total,
              messageId,
              body,
            }),
          );
          expect(r.ok).toBe(false);
          if (!r.ok) expect(r.error.code).toBe("KEY_OFFER_ENCRYPTED");
        },
      ),
      PARAMS,
    );
  });

  /**
   * **Validates: Requirements 6.2**
   */
  it("encode rejects a multi-frame plaintext KEY_OFFER with KEY_OFFER_MULTIFRAME", () => {
    fc.assert(
      fc.property(
        messageIdArb,
        fc.integer({ min: 2, max: MAX_FRAMES }),
        fc.nat({ max: MAX_FRAMES - 1 }),
        // Any body length, including too short and too long: the multi-frame
        // check comes first in the precedence of clause 2.10.
        fc.uint8Array({ minLength: 0, maxLength: GGWAVE_MAX_PAYLOAD + 20 }),
        (messageId, total, indexSeed, body) => {
          const r = encodeFrame(
            keyOfferFrame({
              total,
              index: indexSeed % total,
              messageId,
              body,
            }),
          );
          expect(r.ok).toBe(false);
          if (!r.ok) expect(r.error.code).toBe("KEY_OFFER_MULTIFRAME");
        },
      ),
      PARAMS,
    );
  });

  /**
   * **Validates: Requirements 6.3**
   */
  it("decode rejects type 4 with the encrypted bit set with KEY_OFFER_ENCRYPTED", () => {
    fc.assert(
      fc.property(fc.boolean(), restArb, (multi, rest) => {
        const r = decodeFrame(wireWithB0(b0For(true, multi, 4), rest));
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error.code).toBe("KEY_OFFER_ENCRYPTED");
      }),
      PARAMS,
    );
  });

  /**
   * **Validates: Requirements 6.4**
   */
  it("decode rejects type 4 with the multi-frame bit set (encrypted clear) with KEY_OFFER_MULTIFRAME", () => {
    fc.assert(
      fc.property(restArb, (rest) => {
        const r = decodeFrame(wireWithB0(b0For(false, true, 4), rest));
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error.code).toBe("KEY_OFFER_MULTIFRAME");
      }),
      PARAMS,
    );
  });

  /**
   * **Validates: Requirements 6.5**
   */
  it("a KEY_OFFER body under 16 bytes fails with BODY_TOO_SHORT on encode and decode", () => {
    fc.assert(
      fc.property(
        messageIdArb,
        nibbleArb,
        nibbleArb,
        fc.uint8Array({ minLength: 0, maxLength: KEY_LEN - 1 }),
        (messageId, hop, ttl, body) => {
          const enc = encodeFrame(keyOfferFrame({ messageId, hop, ttl, body }));
          expect(enc.ok).toBe(false);
          if (!enc.ok) expect(enc.error.code).toBe("BODY_TOO_SHORT");

          // Hand-built wire: B0, routing, ID, body. Single frame, plaintext.
          const rest = concat(
            new Uint8Array([(hop << 4) | ttl]),
            concat(messageId, body),
          );
          const dec = decodeFrame(wireWithB0(b0For(false, false, 4), rest));
          expect(dec.ok).toBe(false);
          if (!dec.ok) expect(dec.error.code).toBe("BODY_TOO_SHORT");
        },
      ),
      PARAMS,
    );
  });

  /**
   * **Validates: Requirements 6.6**
   */
  it("a 16-byte key with a name of 0 to 112 UTF-8 bytes round-trips deeply equal", () => {
    fc.assert(
      fc.property(
        messageIdArb,
        nibbleArb,
        nibbleArb,
        keyArb,
        nameBytesArb,
        (messageId, hop, ttl, key, name) => {
          expect(name.length).toBeLessThanOrEqual(MAX_NAME_BYTES);
          const frame = keyOfferFrame({
            messageId,
            hop,
            ttl,
            body: concat(key, name),
          });
          const enc = encodeFrame(frame);
          expect(enc.ok).toBe(true);
          if (!enc.ok) return;
          const dec = decodeFrame(enc.value);
          expect(dec.ok).toBe(true);
          if (dec.ok) expect(dec.value).toEqual(frame);
        },
      ),
      PARAMS,
    );
  });

  /**
   * Also covers the boundary with arbitrary (non-text) name bytes, 0 to 112.
   *
   * **Validates: Requirements 6.6**
   */
  it("round-trips arbitrary name bytes of 0 to 112 bytes", () => {
    fc.assert(
      fc.property(
        messageIdArb,
        keyArb,
        fc.uint8Array({ minLength: 0, maxLength: MAX_NAME_BYTES }),
        (messageId, key, name) => {
          const frame = keyOfferFrame({ messageId, body: concat(key, name) });
          const enc = encodeFrame(frame);
          expect(enc.ok).toBe(true);
          if (!enc.ok) return;
          const dec = decodeFrame(enc.value);
          expect(dec.ok).toBe(true);
          if (dec.ok) expect(dec.value).toEqual(frame);
        },
      ),
      PARAMS,
    );
  });

  /**
   * **Validates: Requirements 6.7**
   */
  it("a 16-byte key with a 113-byte name fails with FRAME_TOO_LONG", () => {
    fc.assert(
      fc.property(
        messageIdArb,
        keyArb,
        fc.uint8Array({ minLength: 113, maxLength: 113 }),
        (messageId, key, name) => {
          const r = encodeFrame(
            keyOfferFrame({ messageId, body: concat(key, name) }),
          );
          expect(r.ok).toBe(false);
          if (!r.ok) expect(r.error.code).toBe("FRAME_TOO_LONG");
        },
      ),
      PARAMS,
    );
  });

  /**
   * **Validates: Requirements 3.5**
   */
  it("decode rejects types 6 and 7 with UNKNOWN_TYPE for any flags and content", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(6, 7),
        fc.boolean(),
        fc.boolean(),
        restArb,
        (type, encrypted, multi, rest) => {
          const r = decodeFrame(
            wireWithB0(b0For(encrypted, multi, type), rest),
          );
          expect(r.ok).toBe(false);
          if (!r.ok) expect(r.error.code).toBe("UNKNOWN_TYPE");
        },
      ),
      PARAMS,
    );
  });

  /**
   * **Validates: Requirements 6.3**
   */
  it("a hand-built KEY_OFFER with a wrong CRC fails with BAD_CRC", () => {
    fc.assert(
      fc.property(restArb, fc.integer({ min: 1, max: 255 }), (rest, flip) => {
        const wire = wireWithB0(b0For(true, false, 4), rest);
        wire[wire.length - 1] = (wire[wire.length - 1] ?? 0) ^ flip;
        const r = decodeFrame(wire);
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error.code).toBe("BAD_CRC");
      }),
      PARAMS,
    );
  });
});
