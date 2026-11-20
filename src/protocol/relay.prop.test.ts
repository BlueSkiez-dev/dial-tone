import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { GGWAVE_MAX_PAYLOAD, MESSAGE_ID_LEN, TAG_LEN } from "./budget";
import { decodeFrame, encodeFrame, frameKey } from "./frame";
import { aadFor, ivFor } from "./frame-crypto-inputs";
import type { RelayRefusal, RelayView } from "./relay";
import {
  canRelay,
  checkRelay,
  hasSeen,
  markSeen,
  relayWire,
  SEEN_MAX,
} from "./relay";
import type { Frame, MessageType } from "./types";

// Print the seed and path on failure so CI failures can be replayed.
const PARAMS = { verbose: true, numRuns: 300 } as const;

const KEY_OFFER = 4;

const hopTtlArb = fc.integer({ min: 0, max: 15 });

/** Header view over every type, hop, ttl and total the relay can see. */
const viewArb: fc.Arbitrary<RelayView> = fc.record({
  type: fc.integer({ min: 0, max: 5 }).map((t) => t as MessageType),
  hop: hopTtlArb,
  ttl: hopTtlArb,
  total: fc.integer({ min: 1, max: 16 }),
});

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
    const keyOffer = r.type === KEY_OFFER;
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

/** Reference model of the rule, written independently of relay.ts. */
function expectedRefusal(v: RelayView): RelayRefusal | null {
  if (v.total > 1) return "MULTI_FRAME";
  if (v.type === KEY_OFFER) return "NOT_RELAYED_TYPE";
  if (v.ttl === 0) return "NO_HOPS_LEFT";
  if (v.hop === 15) return "HOP_LIMIT";
  return null;
}

describe("Property 1: Relayability predicate and reason order", () => {
  /**
   * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.9**
   */
  it("checkRelay accepts iff relayable and otherwise reports the first reason in order", () => {
    fc.assert(
      fc.property(viewArb, (view) => {
        const expected = expectedRefusal(view);
        const r = checkRelay(view);
        if (expected === null) {
          expect(r.ok).toBe(true);
        } else {
          expect(r.ok).toBe(false);
          if (!r.ok) expect(r.error.code).toBe(expected);
        }
        expect(canRelay(view)).toBe(expected === null);
      }),
      PARAMS,
    );
  });

  /**
   * **Validates: Requirements 1.3, 1.4, 1.5, 1.9**
   */
  it("reports the first of several applicable reasons", () => {
    // Every combination of conditions, so overlaps are always covered.
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        (multi, keyOffer, noHops, hopLimit) => {
          const view: RelayView = {
            type: (keyOffer ? KEY_OFFER : 0) as MessageType,
            total: multi ? 2 : 1,
            ttl: noHops ? 0 : 1,
            hop: hopLimit ? 15 : 0,
          };
          const order: [boolean, RelayRefusal][] = [
            [multi, "MULTI_FRAME"],
            [keyOffer, "NOT_RELAYED_TYPE"],
            [noHops, "NO_HOPS_LEFT"],
            [hopLimit, "HOP_LIMIT"],
          ];
          const first = order.find(([applies]) => applies)?.[1] ?? null;
          const r = checkRelay(view);
          if (first === null) {
            expect(r.ok).toBe(true);
          } else {
            expect(r.ok).toBe(false);
            if (!r.ok) expect(r.error.code).toBe(first);
          }
        },
      ),
      PARAMS,
    );
  });

  /**
   * **Validates: Requirements 1.6, 2.7, 9.6**
   */
  it("relayWire returns the same refusal and no bytes for a valid wire whose header is refused", () => {
    fc.assert(
      fc.property(frameArb, (frame) => {
        const expected = expectedRefusal(frame.header);
        const enc = encodeFrame(frame);
        if (!enc.ok) throw new Error(`encodeFrame failed: ${enc.error.code}`);
        const r = relayWire(enc.value);
        if (expected === null) {
          expect(r.ok).toBe(true);
        } else {
          expect(r.ok).toBe(false);
          if (!r.ok) expect(r.error.code).toBe(expected);
          expect("value" in r).toBe(false);
        }
      }),
      PARAMS,
    );
  });
});

/** Valid single-frame, non-KEY_OFFER frames with ttl >= 1 and hop < 15. */
const relayableFrameArb: fc.Arbitrary<Frame> = frameArb
  .filter((f) => f.header.type !== KEY_OFFER)
  .map(
    (f): Frame => ({
      header: {
        ...f.header,
        total: 1,
        index: 0,
        hop: f.header.hop % 15,
        ttl: Math.max(1, f.header.ttl),
      },
      body: f.body,
    }),
  );

describe("Property 2: Patched_Wire shape", () => {
  /**
   * **Validates: Requirements 1.6, 2.1, 2.3, 2.4, 2.5, 2.11, 8.1, 9.3, 9.4, 9.10**
   */
  it("keeps length, changes only byte 1 and the CRC trailer, and moves hop and ttl by one", () => {
    fc.assert(
      fc.property(relayableFrameArb, (frame) => {
        const enc = encodeFrame(frame);
        if (!enc.ok) throw new Error(`encodeFrame failed: ${enc.error.code}`);
        const wire = enc.value;
        const r = relayWire(wire);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        const out = r.value;

        expect(out.length).toBe(wire.length);
        expect(out.length).toBeLessThanOrEqual(GGWAVE_MAX_PAYLOAD);
        for (let i = 0; i < wire.length; i++) {
          if (i === 1 || i >= wire.length - 2) continue;
          expect(out[i]).toBe(wire[i]);
        }

        const dec = decodeFrame(out);
        expect(dec.ok).toBe(true);
        if (!dec.ok) return;
        const h = dec.value.header;
        expect(h.hop).toBe(frame.header.hop + 1);
        expect(h.ttl).toBe(frame.header.ttl - 1);
        expect(h.type).toBe(frame.header.type);
        expect(h.encrypted).toBe(frame.header.encrypted);
        expect(h.index).toBe(frame.header.index);
        expect(h.total).toBe(frame.header.total);
        expect(h.version).toBe(frame.header.version);
        expect(Array.from(h.messageId)).toEqual(
          Array.from(frame.header.messageId),
        );
        expect(Array.from(dec.value.body)).toEqual(Array.from(frame.body));
      }),
      PARAMS,
    );
  });
});

describe("Property 3: Crypto inputs survive a relay", () => {
  /**
   * **Validates: Requirements 2.9, 3.5, 9.11**
   */
  it("frameKey, aadFor and ivFor are equal before and after a relay", () => {
    fc.assert(
      fc.property(relayableFrameArb, (frame) => {
        const enc = encodeFrame(frame);
        if (!enc.ok) throw new Error(`encodeFrame failed: ${enc.error.code}`);
        const before = decodeFrame(enc.value);
        const relayed = relayWire(enc.value);
        expect(before.ok).toBe(true);
        expect(relayed.ok).toBe(true);
        if (!before.ok || !relayed.ok) return;
        const after = decodeFrame(relayed.value);
        expect(after.ok).toBe(true);
        if (!after.ok) return;

        expect(frameKey(after.value)).toBe(frameKey(before.value));

        const aadBefore = aadFor(before.value.header);
        const aadAfter = aadFor(after.value.header);
        expect(aadBefore.ok && aadAfter.ok).toBe(true);
        if (aadBefore.ok && aadAfter.ok) {
          expect(Array.from(aadAfter.value)).toEqual(
            Array.from(aadBefore.value),
          );
        }

        const ivBefore = ivFor(
          before.value.header.messageId,
          before.value.header.index,
        );
        const ivAfter = ivFor(
          after.value.header.messageId,
          after.value.header.index,
        );
        expect(ivBefore.ok && ivAfter.ok).toBe(true);
        if (ivBefore.ok && ivAfter.ok) {
          expect(Array.from(ivAfter.value)).toEqual(Array.from(ivBefore.value));
        }
      }),
      PARAMS,
    );
  });
});

/** Bodies that are not valid UTF-8 (lone continuation and invalid lead bytes). */
const nonUtf8BodyArb = fc
  .array(fc.constantFrom(0x80, 0xbf, 0xc0, 0xc1, 0xf5, 0xfe, 0xff), {
    minLength: TAG_LEN,
    maxLength: 127,
  })
  .map((a) => Uint8Array.from(a));

/** Any body at all: random bytes (ciphertext-like), non-UTF-8, or empty. */
const anyBodyArb = fc.oneof(
  fc.uint8Array({ minLength: 0, maxLength: 127 }),
  fc.uint8Array({ minLength: TAG_LEN, maxLength: 127 }),
  nonUtf8BodyArb,
);

/** Build a valid frame from header fields, forcing the shape rules of the format. */
function shaped(
  h: RelayView,
  encrypted: boolean,
  body: Uint8Array,
  indexSeed: number,
  messageId: Uint8Array,
): Frame {
  const keyOffer = h.type === KEY_OFFER;
  const enc = keyOffer ? false : encrypted;
  const total = keyOffer ? 1 : h.total;
  let b = body;
  if ((enc || keyOffer) && b.length < TAG_LEN) {
    b = new Uint8Array(TAG_LEN);
    b.set(body);
  }
  return {
    header: {
      version: 1,
      type: h.type,
      encrypted: enc,
      hop: h.hop,
      ttl: h.ttl,
      messageId,
      index: indexSeed % total,
      total,
    },
    body: b,
  };
}

const idArb = fc.uint8Array({
  minLength: MESSAGE_ID_LEN,
  maxLength: MESSAGE_ID_LEN,
});

function relayOutcome(frame: Frame) {
  const enc = encodeFrame(frame);
  if (!enc.ok) throw new Error(`encodeFrame failed: ${enc.error.code}`);
  const r = relayWire(enc.value);
  if (!r.ok) return { ok: false as const, code: r.error.code };
  const dec = decodeFrame(r.value);
  if (!dec.ok)
    throw new Error(`patched wire did not decode: ${dec.error.code}`);
  return {
    ok: true as const,
    hop: dec.value.header.hop,
    ttl: dec.value.header.ttl,
    routing: r.value[1],
  };
}

describe("Property 4: Body-blind relay", () => {
  /**
   * **Validates: Requirements 1.6, 1.7, 2.8, 9.7**
   */
  it("accepts every relayable single-frame wire whatever the encrypted flag and body, and leaves the body untouched", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 5 }).filter((t) => t !== KEY_OFFER),
        fc.integer({ min: 0, max: 14 }),
        fc.integer({ min: 1, max: 15 }),
        fc.boolean(),
        anyBodyArb,
        idArb,
        (type, hop, ttl, encrypted, body, id) => {
          const frame = shaped(
            { type: type as MessageType, hop, ttl, total: 1 },
            encrypted,
            body,
            0,
            id,
          );
          const enc = encodeFrame(frame);
          if (!enc.ok) throw new Error(`encodeFrame failed: ${enc.error.code}`);
          const r = relayWire(enc.value);
          expect(r.ok).toBe(true);
          if (!r.ok) return;
          const dec = decodeFrame(r.value);
          expect(dec.ok).toBe(true);
          if (!dec.ok) return;
          expect(Array.from(dec.value.body)).toEqual(Array.from(frame.body));
          expect(dec.value.header.encrypted).toBe(frame.header.encrypted);
        },
      ),
      PARAMS,
    );
  });

  /**
   * Metamorphic pair: equal type, hop, ttl and total, different encrypted
   * flag and body. The decision and the routing change must be equal.
   *
   * **Validates: Requirements 1.7, 2.8, 9.8**
   */
  it("gives the same decision and routing change for wires that differ only in encrypted flag and body", () => {
    fc.assert(
      fc.property(
        viewArb,
        fc.boolean(),
        fc.boolean(),
        anyBodyArb,
        anyBodyArb,
        idArb,
        idArb,
        fc.integer({ min: 0, max: 15 }),
        (view, encA, encB, bodyA, bodyB, idA, idB, indexSeed) => {
          const a = shaped(view, encA, bodyA, indexSeed, idA);
          const b = shaped(view, encB, bodyB, indexSeed, idB);
          const ra = relayOutcome(a);
          const rb = relayOutcome(b);
          expect(rb).toEqual(ra);
          expect(canRelay(a.header)).toBe(canRelay(b.header));
        },
      ),
      PARAMS,
    );
  });

  /**
   * **Validates: Requirements 1.7, 2.8, 9.8**
   */
  it("gives the same outcome when only the encrypted flag differs", () => {
    fc.assert(
      fc.property(
        viewArb,
        fc.uint8Array({ minLength: TAG_LEN, maxLength: 127 }),
        idArb,
        fc.integer({ min: 0, max: 15 }),
        (view, body, id, indexSeed) => {
          const a = shaped(view, false, body, indexSeed, id);
          const b = shaped(view, true, body, indexSeed, id);
          expect(relayOutcome(b)).toEqual(relayOutcome(a));
        },
      ),
      PARAMS,
    );
  });
});

/** KEY_OFFER body: 16-byte key plus a name of 0 to 112 bytes. */
const keyOfferBodyArb = fc.uint8Array({ minLength: 16, maxLength: 128 });

function keyOfferWire(
  hop: number,
  ttl: number,
  id: Uint8Array,
  body: Uint8Array,
): Uint8Array {
  const enc = encodeFrame({
    header: {
      version: 1,
      type: KEY_OFFER as MessageType,
      encrypted: false,
      hop,
      ttl,
      messageId: id,
      index: 0,
      total: 1,
    },
    body,
  });
  if (!enc.ok) throw new Error(`encodeFrame failed: ${enc.error.code}`);
  return enc.value;
}

describe("Property 5: KEY_OFFER is never relayed", () => {
  /**
   * **Validates: Requirements 1.3, 1.8, 2.7, 9.18**
   */
  it("relayWire refuses every valid KEY_OFFER wire with NOT_RELAYED_TYPE and no bytes", () => {
    fc.assert(
      fc.property(
        hopTtlArb,
        hopTtlArb,
        idArb,
        keyOfferBodyArb,
        (hop, ttl, id, body) => {
          const r = relayWire(keyOfferWire(hop, ttl, id, body));
          expect(r.ok).toBe(false);
          if (!r.ok) expect(r.error.code).toBe("NOT_RELAYED_TYPE");
          expect("value" in r).toBe(false);
        },
      ),
      PARAMS,
    );
  });

  /**
   * **Validates: Requirements 1.3, 1.8**
   */
  it("a KEY_OFFER view is never relayable, and total decides MULTI_FRAME versus NOT_RELAYED_TYPE", () => {
    fc.assert(
      fc.property(
        hopTtlArb,
        hopTtlArb,
        fc.integer({ min: 1, max: 16 }),
        (hop, ttl, total) => {
          const view: RelayView = {
            type: KEY_OFFER as MessageType,
            hop,
            ttl,
            total,
          };
          expect(canRelay(view)).toBe(false);
          const r = checkRelay(view);
          expect(r.ok).toBe(false);
          if (!r.ok) {
            expect(r.error.code).toBe(
              total > 1 ? "MULTI_FRAME" : "NOT_RELAYED_TYPE",
            );
          }
        },
      ),
      PARAMS,
    );
  });

  /**
   * The result depends on the header type only, not the body.
   *
   * **Validates: Requirements 1.8, 2.7**
   */
  it("two KEY_OFFER wires with different bodies give the same result", () => {
    fc.assert(
      fc.property(
        hopTtlArb,
        hopTtlArb,
        idArb,
        keyOfferBodyArb,
        keyOfferBodyArb,
        (hop, ttl, id, bodyA, bodyB) => {
          const a = relayWire(keyOfferWire(hop, ttl, id, bodyA));
          const b = relayWire(keyOfferWire(hop, ttl, id, bodyB));
          expect(b).toEqual(a);
        },
      ),
      PARAMS,
    );
  });
});

describe("Property 6: Idempotent re-broadcast", () => {
  /**
   * **Validates: Requirements 9.2**
   */
  it("relaying the same Held_Wire twice gives equal bytes and leaves the Held_Wire unchanged", () => {
    fc.assert(
      fc.property(relayableFrameArb, (frame) => {
        const enc = encodeFrame(frame);
        if (!enc.ok) throw new Error(`encodeFrame failed: ${enc.error.code}`);
        const wire = enc.value;
        const snapshot = Array.from(wire);

        const first = relayWire(wire);
        const second = relayWire(wire);

        expect(first.ok).toBe(true);
        expect(second.ok).toBe(true);
        if (!first.ok || !second.ok) return;
        expect(Array.from(second.value)).toEqual(Array.from(first.value));
        expect(Array.from(wire)).toEqual(snapshot);
        // The result is a fresh buffer, not the input.
        expect(first.value).not.toBe(wire);
      }),
      PARAMS,
    );
  });
});

describe("Property 7: Chains of passes are monotone and bounded", () => {
  /**
   * **Validates: Requirements 2.10, 9.3, 9.4, 9.5**
   */
  it("hop never drops, hop + ttl stays constant, at most t passes happen, and the chain ends on a refused wire", () => {
    fc.assert(
      fc.property(
        relayableFrameArb,
        fc.integer({ min: 0, max: 15 }),
        (base, t) => {
          const frame: Frame = {
            header: { ...base.header, hop: 0, ttl: t },
            body: base.body,
          };
          const enc = encodeFrame(frame);
          if (!enc.ok) throw new Error(`encodeFrame failed: ${enc.error.code}`);

          let wire = enc.value;
          let passes = 0;
          let prevHop = 0;
          // Guard against a runaway chain: more than 16 passes is already a failure.
          for (let i = 0; i < 17; i++) {
            const r = relayWire(wire);
            if (!r.ok) break;
            const dec = decodeFrame(r.value);
            expect(dec.ok).toBe(true);
            if (!dec.ok) return;
            const h = dec.value.header;
            expect(h.hop).toBeGreaterThanOrEqual(prevHop);
            expect(h.hop + h.ttl).toBe(t);
            prevHop = h.hop;
            wire = r.value;
            passes++;
          }

          expect(passes).toBeLessThanOrEqual(t);
          const last = decodeFrame(wire);
          expect(last.ok).toBe(true);
          if (!last.ok) return;
          expect(canRelay(last.value.header)).toBe(false);
          expect(relayWire(wire).ok).toBe(false);
        },
      ),
      PARAMS,
    );
  });
});

describe("Property 8: A corrupted frame is never re-sealed", () => {
  /**
   * Changes one byte, or two adjacent bytes, anywhere in the wire (header,
   * body or CRC trailer). The change spans at most 16 bits, so the CRC-16
   * always detects it.
   *
   * **Validates: Requirements 2.6, 9.12**
   */
  it("relayWire returns a decode error and no bytes for any valid wire with a CRC-breaking change", () => {
    fc.assert(
      fc.property(
        frameArb,
        fc.nat({ max: 100_000 }),
        fc.integer({ min: 1, max: 255 }),
        fc.option(fc.integer({ min: 1, max: 255 }), { nil: undefined }),
        (frame, posSel, xorA, xorB) => {
          const enc = encodeFrame(frame);
          if (!enc.ok) throw new Error(`encodeFrame failed: ${enc.error.code}`);
          const bad = enc.value.slice();
          const pos = posSel % (bad.length - (xorB === undefined ? 0 : 1));
          bad[pos] = (bad[pos] ?? 0) ^ xorA;
          if (xorB !== undefined) bad[pos + 1] = (bad[pos + 1] ?? 0) ^ xorB;
          expect(Array.from(bad)).not.toEqual(Array.from(enc.value));

          const r = relayWire(bad);
          expect(r.ok).toBe(false);
          if (!r.ok) expect(r.error.code).toBe("BAD_CRC");
          expect("value" in r).toBe(false);
        },
      ),
      PARAMS,
    );
  });
});

describe("Property 9: relayWire is total", () => {
  /**
   * **Validates: Requirements 1.10, 9.17**
   */
  it("relayWire never throws on any byte array of length 0 to 200", () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 0, maxLength: 200 }), (bytes) => {
        const r = relayWire(bytes);
        expect(typeof r.ok).toBe("boolean");
        if (r.ok) expect(r.value.length).toBe(bytes.length);
        else expect(typeof r.error.code).toBe("string");
      }),
      PARAMS,
    );
  });

  /**
   * **Validates: Requirements 1.10, 9.17**
   */
  it("decodeFrame followed by canRelay never throws on any byte array of length 0 to 200", () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 0, maxLength: 200 }), (bytes) => {
        const d = decodeFrame(bytes);
        if (d.ok) expect(typeof canRelay(d.value.header)).toBe("boolean");
      }),
      PARAMS,
    );
  });

  /**
   * Random bytes almost never pass the CRC, so also mutate valid wires.
   *
   * **Validates: Requirements 1.10, 9.17**
   */
  it("relayWire never throws on valid wires that are truncated or extended", () => {
    fc.assert(
      fc.property(
        frameArb,
        fc.nat({ max: 200 }),
        fc.uint8Array({ minLength: 0, maxLength: 60 }),
        (frame, cut, extra) => {
          const enc = encodeFrame(frame);
          if (!enc.ok) throw new Error(`encodeFrame failed: ${enc.error.code}`);
          const truncated = enc.value.slice(0, cut % (enc.value.length + 1));
          const extended = new Uint8Array(enc.value.length + extra.length);
          extended.set(enc.value);
          extended.set(extra, enc.value.length);
          for (const bytes of [truncated, extended]) {
            const r = relayWire(bytes);
            expect(typeof r.ok).toBe("boolean");
            const d = decodeFrame(bytes);
            if (d.ok) expect(typeof canRelay(d.value.header)).toBe("boolean");
          }
        },
      ),
      PARAMS,
    );
  });
});

describe("Property 10: The Relay_State is capped and drops the oldest key", () => {
  /**
   * Keys come from a pool larger than SEEN_MAX so the cap is reached and
   * duplicates occur. The list is compared with an independent model.
   *
   * **Validates: Requirements 3.6, 3.7, 9.13**
   */
  it("stays within SEEN_MAX with no duplicates, and drops the oldest key first", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: SEEN_MAX + 100 }), {
          minLength: 0,
          maxLength: SEEN_MAX * 3,
        }),
        (ids) => {
          let seen: readonly string[] = [];
          let model: string[] = [];
          for (const id of ids) {
            const key = `k${id}`;
            const before = seen;
            seen = markSeen(seen, key);
            if (model.includes(key)) {
              // A held key leaves the list unchanged.
              expect(seen).toBe(before);
            } else {
              model.push(key);
              if (model.length > SEEN_MAX) model = model.slice(1);
            }
            expect(seen.length).toBeLessThanOrEqual(SEEN_MAX);
            expect(new Set(seen).size).toBe(seen.length);
            expect(hasSeen(seen, key)).toBe(true);
            expect(Array.from(seen)).toEqual(model);
          }
        },
      ),
      { ...PARAMS, numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 3.6, 3.7, 9.13**
   */
  it("after SEEN_MAX + 1 distinct inserts the first key is no longer held", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.string({ minLength: 1, maxLength: 8 }), {
          minLength: SEEN_MAX + 1,
          maxLength: SEEN_MAX + 40,
        }),
        (keys) => {
          let seen: readonly string[] = [];
          for (const k of keys) seen = markSeen(seen, k);
          const first = keys[0] as string;
          expect(hasSeen(seen, first)).toBe(false);
          expect(seen.length).toBe(SEEN_MAX);
          // The newest keys are all still held.
          for (const k of keys.slice(-SEEN_MAX)) {
            expect(hasSeen(seen, k)).toBe(true);
          }
          // A dropped key counts as new again (3.7).
          const again = markSeen(seen, first);
          expect(hasSeen(again, first)).toBe(true);
          expect(again.length).toBe(SEEN_MAX);
        },
      ),
      { ...PARAMS, numRuns: 50 },
    );
  });
});

describe("Property 12: Phones in one room pass a message at most once each", () => {
  /**
   * Each phone is `{ seen }`. Every phone hears every broadcast. A phone that
   * has not seen the key marks it, counts one pass and re-broadcasts the
   * patched wire if the relay accepts it. Deliveries happen in random order.
   *
   * **Validates: Requirements 3.3, 9.16**
   */
  it("passes the message through each phone at most once and the simulation ends", () => {
    fc.assert(
      fc.property(
        relayableFrameArb,
        fc.integer({ min: 2, max: 6 }),
        fc.array(fc.nat({ max: 1_000_000 }), { minLength: 80, maxLength: 80 }),
        (base, phoneCount, picks) => {
          const enc = encodeFrame(base);
          if (!enc.ok) throw new Error(`encodeFrame failed: ${enc.error.code}`);
          const first = decodeFrame(enc.value);
          if (!first.ok) throw new Error("valid wire did not decode");
          const key = frameKey(first.value);

          const phones = Array.from({ length: phoneCount }, () => ({
            seen: [] as readonly string[],
            passes: 0,
          }));
          // Phone 0 sends the original and records its own key.
          const origin = phones[0];
          if (!origin) throw new Error("no phone");
          origin.seen = markSeen(origin.seen, key);
          const queue: { to: number; wire: Uint8Array }[] = [];
          const broadcast = (from: number, wire: Uint8Array) => {
            for (let to = 0; to < phoneCount; to++) {
              if (to !== from) queue.push({ to, wire });
            }
          };
          broadcast(0, enc.value);

          let steps = 0;
          while (queue.length > 0) {
            steps++;
            // Each accepting phone adds at most phoneCount - 1 deliveries.
            expect(steps).toBeLessThanOrEqual(phoneCount * phoneCount);
            const at = (picks[steps % picks.length] ?? 0) % queue.length;
            const [delivery] = queue.splice(at, 1);
            if (!delivery) break;
            const phone = phones[delivery.to];
            if (!phone) break;
            const d = decodeFrame(delivery.wire);
            if (!d.ok) throw new Error("relayed wire did not decode");
            const k = frameKey(d.value);
            expect(k).toBe(key);
            if (hasSeen(phone.seen, k)) continue;
            phone.seen = markSeen(phone.seen, k);
            phone.passes++;
            const r = relayWire(delivery.wire);
            if (r.ok) broadcast(delivery.to, r.value);
          }

          for (const p of phones) expect(p.passes).toBeLessThanOrEqual(1);
          expect(origin.passes).toBe(0);
        },
      ),
      PARAMS,
    );
  });
});
