import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { MAX_HOP, MAX_TTL, MESSAGE_ID_LEN, TAG_LEN } from "./budget";
import { decodeFrame, encodeFrame, frameKey, patchRouting } from "./frame";
import { aadFor, ivFor } from "./frame-crypto-inputs";
import type { Frame, MessageType } from "./types";

// Print the seed and path on failure so CI failures can be replayed.
const PARAMS = { verbose: true, numRuns: 300 } as const;

const hopTtlArb = fc.integer({ min: 0, max: 15 });

/** Hop or TTL values that patchRouting must reject, including 16 (15 + 1). */
const badRoutingValueArb = fc.oneof(
  fc.constant(16),
  fc.constant(-1),
  fc.constant(Number.NaN),
  fc.constant(Number.POSITIVE_INFINITY),
  fc.constant(1.5),
  fc.integer({ min: 16, max: 1000 }),
  fc.integer({ min: -1000, max: -1 }),
);

/** Arbitrary valid Frame; every one encodes successfully. */
const frameArb: fc.Arbitrary<Frame> = fc
  .record({
    type: fc.integer({ min: 0, max: 5 }),
    encrypted: fc.boolean(),
    total: fc.integer({ min: 1, max: 16 }),
    indexSeed: fc.integer({ min: 0, max: 15 }),
    hop: hopTtlArb,
    ttl: hopTtlArb,
    messageId: fc.uint8Array({
      minLength: MESSAGE_ID_LEN,
      maxLength: MESSAGE_ID_LEN,
    }),
    body: fc.uint8Array({ minLength: 0, maxLength: 127 }),
  })
  .map((r): Frame => {
    const keyOffer = r.type === 4;
    const encrypted = keyOffer ? false : r.encrypted;
    const total = keyOffer ? 1 : r.total;
    const index = r.indexSeed % total;
    let body = r.body;
    if ((encrypted || keyOffer) && body.length < TAG_LEN) {
      const padded = new Uint8Array(TAG_LEN);
      padded.set(body);
      body = padded;
    }
    return {
      header: {
        version: 1,
        type: r.type as MessageType,
        encrypted,
        hop: r.hop,
        ttl: r.ttl,
        messageId: r.messageId,
        index,
        total,
      },
      body,
    };
  });

/** Arbitrary accepted wire frame, produced by the real encoder. */
const wireArb: fc.Arbitrary<Uint8Array> = frameArb.map((f) => {
  const r = encodeFrame(f);
  if (!r.ok) throw new Error(`encodeFrame failed: ${r.error.code}`);
  return r.value;
});

function decode(wire: Uint8Array): Frame {
  const r = decodeFrame(wire);
  if (!r.ok) throw new Error(`decodeFrame failed: ${r.error.code}`);
  return r.value;
}

function patch(wire: Uint8Array, hop: number, ttl: number): Uint8Array {
  const r = patchRouting(wire, hop, ttl);
  if (!r.ok) throw new Error(`patchRouting failed: ${r.error.code}`);
  return r.value;
}

function bytesOf<T>(r: { ok: true; value: T } | { ok: false; error: unknown }) {
  if (!r.ok) throw new Error("expected ok result");
  return r.value;
}

describe("Property 9: Routing patch is the only relay edit", () => {
  /**
   * **Validates: Requirements 10.1, 10.2, 10.3**
   */
  it("differs from the input only at byte 1 and the last two bytes, decodes successfully, and sets hop and TTL", () => {
    fc.assert(
      fc.property(wireArb, hopTtlArb, hopTtlArb, (wire, hop, ttl) => {
        const out = patch(wire, hop, ttl);
        expect(out.length).toBe(wire.length);
        for (let i = 0; i < wire.length - 2; i++) {
          if (i !== 1) expect(out[i]).toBe(wire[i]);
        }
        expect(out[1]).toBe((hop << 4) | ttl);
        // The CRC trailer is recomputed, so the result must decode.
        expect(decodeFrame(out).ok).toBe(true);
      }),
      PARAMS,
    );
  });

  /**
   * **Validates: Requirements 10.1, 10.7**
   */
  it("decodes to the same frame except hop and TTL", () => {
    fc.assert(
      fc.property(wireArb, hopTtlArb, hopTtlArb, (wire, hop, ttl) => {
        const original = decode(wire);
        const patched = decode(patch(wire, hop, ttl));
        expect(patched).toEqual({
          header: { ...original.header, hop, ttl },
          body: original.body,
        });
      }),
      PARAMS,
    );
  });

  /**
   * **Validates: Requirements 10.8**
   */
  it("is idempotent and deterministic for equal arguments", () => {
    fc.assert(
      fc.property(wireArb, hopTtlArb, hopTtlArb, (wire, hop, ttl) => {
        const once = patch(wire, hop, ttl);
        const twice = patch(once, hop, ttl);
        expect(Array.from(twice)).toEqual(Array.from(once));
        expect(Array.from(patch(wire, hop, ttl))).toEqual(Array.from(once));
      }),
      PARAMS,
    );
  });

  /**
   * **Validates: Requirements 10.6**
   */
  it("leaves the input unmodified and returns a fresh array", () => {
    fc.assert(
      fc.property(wireArb, hopTtlArb, hopTtlArb, (wire, hop, ttl) => {
        const snapshot = Array.from(wire);
        const out = patch(wire, hop, ttl);
        expect(Array.from(wire)).toEqual(snapshot);
        expect(out).not.toBe(wire);
        expect(out.buffer).not.toBe(wire.buffer);
      }),
      PARAMS,
    );
  });

  /**
   * **Validates: Requirements 10.2, 10.3**
   */
  it("keeps frameKey, aadFor and ivFor unchanged", () => {
    fc.assert(
      fc.property(wireArb, hopTtlArb, hopTtlArb, (wire, hop, ttl) => {
        const a = decode(wire);
        const b = decode(patch(wire, hop, ttl));
        expect(frameKey(b)).toBe(frameKey(a));
        expect(Array.from(bytesOf(aadFor(b.header)))).toEqual(
          Array.from(bytesOf(aadFor(a.header))),
        );
        expect(
          Array.from(bytesOf(ivFor(b.header.messageId, b.header.index))),
        ).toEqual(
          Array.from(bytesOf(ivFor(a.header.messageId, a.header.index))),
        );
      }),
      PARAMS,
    );
  });

  /**
   * **Validates: Requirements 10.4**
   */
  it("fails with BAD_ROUTING for hop or TTL outside 0 to 15, including hop 16", () => {
    fc.assert(
      fc.property(
        wireArb,
        fc.oneof(
          fc.tuple(badRoutingValueArb, hopTtlArb),
          fc.tuple(hopTtlArb, badRoutingValueArb),
          fc.tuple(badRoutingValueArb, badRoutingValueArb),
        ),
        (wire, [hop, ttl]) => {
          const r = patchRouting(wire, hop, ttl);
          expect(r.ok).toBe(false);
          if (!r.ok) expect(r.error.code).toBe("BAD_ROUTING");
        },
      ),
      PARAMS,
    );
    // The relay case: a frame received with hop 15 cannot be patched to hop 16.
    fc.assert(
      fc.property(wireArb, hopTtlArb, (wire, ttl) => {
        const r = patchRouting(wire, MAX_HOP + 1, ttl);
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error.code).toBe("BAD_ROUTING");
        const r2 = patchRouting(wire, ttl, MAX_TTL + 1);
        expect(r2.ok).toBe(false);
        if (!r2.ok) expect(r2.error.code).toBe("BAD_ROUTING");
      }),
      PARAMS,
    );
  });

  /**
   * **Validates: Requirements 10.9**
   */
  it("returns the decode error for invalid wire bytes, even when hop is also invalid", () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ minLength: 0, maxLength: 200 }),
        fc.oneof(hopTtlArb, badRoutingValueArb),
        fc.oneof(hopTtlArb, badRoutingValueArb),
        (bytes, hop, ttl) => {
          const decoded = decodeFrame(bytes);
          fc.pre(!decoded.ok);
          const r = patchRouting(bytes, hop, ttl);
          expect(r.ok).toBe(false);
          if (!r.ok && !decoded.ok) {
            expect(r.error.code).toBe(decoded.error.code);
          }
        },
      ),
      PARAMS,
    );
  });

  /**
   * **Validates: Requirements 10.9, 10.10**
   */
  it("returns BAD_CRC for a corrupted CRC, even when hop is also invalid", () => {
    fc.assert(
      fc.property(
        wireArb,
        fc.integer({ min: 0, max: 1 }),
        fc.integer({ min: 1, max: 255 }),
        fc.oneof(hopTtlArb, badRoutingValueArb),
        fc.oneof(hopTtlArb, badRoutingValueArb),
        (wire, which, xor, hop, ttl) => {
          const bad = Uint8Array.from(wire);
          const at = bad.length - 2 + which;
          bad[at] = (bad[at] ?? 0) ^ xor;
          const r = patchRouting(bad, hop, ttl);
          expect(r.ok).toBe(false);
          if (!r.ok) expect(r.error.code).toBe("BAD_CRC");
        },
      ),
      PARAMS,
    );
  });

  /**
   * **Validates: Requirements 10.9**
   */
  it("returns TOO_SHORT for inputs under 2 bytes", () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ minLength: 0, maxLength: 1 }),
        fc.oneof(hopTtlArb, badRoutingValueArb),
        fc.oneof(hopTtlArb, badRoutingValueArb),
        (bytes, hop, ttl) => {
          const r = patchRouting(bytes, hop, ttl);
          expect(r.ok).toBe(false);
          if (!r.ok) expect(r.error.code).toBe("TOO_SHORT");
        },
      ),
      PARAMS,
    );
  });
});
