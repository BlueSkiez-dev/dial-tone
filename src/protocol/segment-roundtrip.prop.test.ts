import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  GGWAVE_MAX_PAYLOAD,
  MAX_FRAMES,
  MESSAGE_ID_LEN,
  plaintextCapacity,
  TAG_LEN,
} from "./budget";
import { decodeFrame, encodeFrame } from "./frame";
import { makeFrames, reassemble, splitPayload } from "./segment";
import type { Frame, MessageType } from "./types";

// verbose prints the seed and path on failure so CI failures can be replayed.
const PARAMS = { verbose: true, numRuns: 200 } as const;

function concat(chunks: readonly Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

const arr = (b: Uint8Array): number[] => Array.from(b);

// Types other than KEY_OFFER (4), which is plaintext and single-frame only.
const typeArb = fc.constantFrom(0, 1, 2, 3, 5) as fc.Arbitrary<MessageType>;
const idArb = fc.uint8Array({
  minLength: MESSAGE_ID_LEN,
  maxLength: MESSAGE_ID_LEN,
});
const routeArb = fc.record({
  hop: fc.integer({ min: 0, max: 15 }),
  ttl: fc.integer({ min: 0, max: 15 }),
});

// Payload sizes cover the single-frame limit, multi-frame sizes and the
// 16-frame limit for the given mode.
function payloadArb(encrypted: boolean): fc.Arbitrary<Uint8Array> {
  const max = plaintextCapacity({ encrypted, multi: true }) * MAX_FRAMES;
  const single = plaintextCapacity({ encrypted, multi: false });
  return fc.oneof(
    fc.uint8Array({ minLength: 0, maxLength: max }),
    fc.integer({ min: 0, max }).map((n) => new Uint8Array(n).fill(0xff)),
    fc
      .constantFrom(single, single + 1, max - 1, max)
      .map((n) => new Uint8Array(n).fill(0x00)),
  );
}

const scenarioArb = fc.boolean().chain((encrypted) =>
  fc.record({
    encrypted: fc.constant(encrypted),
    payload: payloadArb(encrypted),
    type: typeArb,
    messageId: idArb,
    base: fc.array(routeArb, { minLength: MAX_FRAMES, maxLength: MAX_FRAMES }),
    extras: fc.array(
      fc.record({
        pick: fc.nat({ max: MAX_FRAMES - 1 }),
        hop: fc.integer({ min: 0, max: 15 }),
        ttl: fc.integer({ min: 0, max: 15 }),
      }),
      { maxLength: 24 },
    ),
    // One sort key per delivery gives an arbitrary arrival order.
    keys: fc.array(fc.integer(), { minLength: 40, maxLength: 40 }),
    template: routeArb,
  }),
);

describe("Property 6: Multi-frame round trip", () => {
  /**
   * **Validates: Requirements 8.3, 8.8, 9.1, 9.2, 9.7**
   */
  it("split, make, encode, decode (any order, duplicates, other hop/TTL), reassemble returns the payload", () => {
    fc.assert(
      fc.property(scenarioArb, (s) => {
        const split = splitPayload(s.payload, {
          encrypted: s.encrypted,
          utf8Boundaries: false,
        });
        expect(split.ok).toBe(true);
        if (!split.ok) return;
        const chunks = split.value;
        const n = chunks.length;

        // reassemble never decrypts: the wire body of an encrypted frame is the
        // chunk followed by a tag-sized pad standing in for the GCM tag.
        const bodies = chunks.map((c) =>
          s.encrypted ? concat([c, new Uint8Array(TAG_LEN).fill(0xa5)]) : c,
        );

        const made = makeFrames(
          {
            type: s.type,
            encrypted: s.encrypted,
            hop: s.template.hop,
            ttl: s.template.ttl,
            messageId: s.messageId,
          },
          bodies,
        );
        expect(made.ok).toBe(true);
        if (!made.ok) return;
        const frames = made.value;
        expect(frames.length).toBe(n);

        // Shared ID and total, indexes 0..n-1.
        frames.forEach((f, i) => {
          expect(arr(f.header.messageId)).toEqual(arr(s.messageId));
          expect(f.header.total).toBe(n);
          expect(f.header.index).toBe(i);
        });

        // Deliveries: every frame once, plus duplicates, each with its own
        // hop and TTL, then put in an arbitrary order.
        const deliveries: { idx: number; hop: number; ttl: number }[] = [];
        for (let i = 0; i < n; i++) {
          const r = s.base[i] as { hop: number; ttl: number };
          deliveries.push({ idx: i, hop: r.hop, ttl: r.ttl });
        }
        for (const e of s.extras) {
          deliveries.push({ idx: e.pick % n, hop: e.hop, ttl: e.ttl });
        }
        const ordered = deliveries
          .map((d, i) => ({ d, k: (s.keys[i] as number) ?? i }))
          .sort((a, b) => a.k - b.k)
          .map((x) => x.d);

        const received: Frame[] = [];
        for (const d of ordered) {
          const src = frames[d.idx] as Frame;
          const wire = encodeFrame({
            header: { ...src.header, hop: d.hop, ttl: d.ttl },
            body: src.body,
          });
          expect(wire.ok).toBe(true);
          if (!wire.ok) return;
          expect(wire.value.length).toBeLessThanOrEqual(GGWAVE_MAX_PAYLOAD);
          const dec = decodeFrame(wire.value);
          expect(dec.ok).toBe(true);
          if (!dec.ok) return;
          received.push(dec.value);
        }

        const out = reassemble(received);
        expect(out.ok).toBe(true);
        if (!out.ok || !out.value.complete) {
          expect(out.ok && out.value.complete).toBe(true);
          return;
        }
        expect(out.value.message.total).toBe(n);
        expect(out.value.message.type).toBe(s.type);
        expect(out.value.message.encrypted).toBe(s.encrypted);
        expect(arr(out.value.message.messageId)).toEqual(arr(s.messageId));

        // Reassembled bytes are the joined wire bodies.
        expect(arr(out.value.payload)).toEqual(arr(concat(bodies)));

        // Removing the pad from each body recovers the original payload.
        let pos = 0;
        const stripped: Uint8Array[] = [];
        for (const c of chunks) {
          const len = c.length + (s.encrypted ? TAG_LEN : 0);
          stripped.push(out.value.payload.slice(pos, pos + c.length));
          pos += len;
        }
        expect(arr(concat(stripped))).toEqual(arr(s.payload));
      }),
      PARAMS,
    );
  });
});

describe("Property 6: fixed boundary examples", () => {
  /**
   * **Validates: Requirements 8.3, 8.8, 9.1**
   */
  it("a 16-frame plaintext message round-trips and every frame is at most 140 bytes", () => {
    const payload = new Uint8Array(
      plaintextCapacity({ encrypted: false, multi: true }) * MAX_FRAMES,
    ).map((_, i) => i % 251);
    const split = splitPayload(payload, {
      encrypted: false,
      utf8Boundaries: false,
    });
    expect(split.ok).toBe(true);
    if (!split.ok) return;
    const made = makeFrames(
      {
        type: 0 as MessageType,
        encrypted: false,
        hop: 0,
        ttl: 15,
        messageId: new Uint8Array(MESSAGE_ID_LEN).fill(7),
      },
      split.value,
    );
    expect(made.ok).toBe(true);
    if (!made.ok) return;
    const received: Frame[] = [];
    for (const f of made.value.slice().reverse()) {
      const wire = encodeFrame(f);
      expect(wire.ok).toBe(true);
      if (!wire.ok) return;
      expect(wire.value.length).toBeLessThanOrEqual(GGWAVE_MAX_PAYLOAD);
      const dec = decodeFrame(wire.value);
      expect(dec.ok).toBe(true);
      if (dec.ok) received.push(dec.value);
    }
    const out = reassemble(received);
    expect(out.ok && out.value.complete).toBe(true);
    if (out.ok && out.value.complete) {
      expect(arr(out.value.payload)).toEqual(arr(payload));
    }
  });
});
