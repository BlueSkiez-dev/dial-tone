import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { MESSAGE_ID_LEN, TAG_LEN, wireBodyCapacity } from "./budget";
import { decodeFrame, encodeFrame } from "./frame";
import type { Frame, MessageType } from "./types";

// verbose prints the seed and path on failure so CI failures can be replayed.
const PARAMS = { verbose: true, numRuns: 1000 } as const;

const KEY_OFFER = 4;
const KEY_LEN = 16;

const messageIdArb = fc.uint8Array({
  minLength: MESSAGE_ID_LEN,
  maxLength: MESSAGE_ID_LEN,
});
const nibbleArb = fc.integer({ min: 0, max: 15 });
const ordinaryTypeArb = fc.constantFrom<MessageType>(0, 1, 2, 3, 5);

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

const fullBodyFrameArb: fc.Arbitrary<Frame> = ordinaryFrameArb.map((f) => ({
  header: f.header,
  body: new Uint8Array(wireBodyCapacity({ multi: f.header.total > 1 })).map(
    (_, i) => (i * 31 + f.header.hop) & 0xff,
  ),
}));

const validFrameArb = fc.oneof(
  { weight: 6, arbitrary: ordinaryFrameArb },
  { weight: 2, arbitrary: keyOfferFrameArb },
  { weight: 2, arbitrary: fullBodyFrameArb },
);

/** Flips bit i in transmission order: byte i >> 3, mask 0x80 >> (i & 7). */
function flipBit(bytes: Uint8Array, i: number): void {
  const idx = i >> 3;
  bytes[idx] = (bytes[idx] ?? 0) ^ (0x80 >> (i & 7));
}

function encode(frame: Frame): Uint8Array {
  const w = encodeFrame(frame);
  if (!w.ok) throw new Error("expected encodeFrame ok");
  return w.value;
}

/**
 * Window placement: uniform, anchored at the first bits (header), or anchored
 * to the last bits (CRC bytes), so every region and byte boundary is sampled.
 */
const errorArb = fc.record({
  frame: validFrameArb,
  mode: fc.constantFrom("uniform", "uniform", "head", "tail"),
  startSel: fc.nat({ max: 100_000 }),
  len: fc.integer({ min: 1, max: 16 }),
  middle: fc.integer({ min: 0, max: 0xffff }),
});

describe("Property 16: The CRC detects every single-bit and burst error", () => {
  /**
   * **Validates: Requirements 17.4, 3.15**
   */
  it("fails with BAD_CRC for any burst of 1 to 16 bits, wherever it sits", () => {
    fc.assert(
      fc.property(errorArb, ({ frame, mode, startSel, len, middle }) => {
        const w = encode(frame);
        const nbits = w.length * 8;
        const L = Math.min(len, nbits);
        const maxStart = nbits - L;
        const start =
          mode === "head"
            ? Math.min(startSel % 24, maxStart)
            : mode === "tail"
              ? Math.max(0, maxStart - (startSel % 24))
              : startSel % (maxStart + 1);

        const bad = w.slice();
        for (let k = 0; k < L; k++) {
          const set = k === 0 || k === L - 1 || ((middle >> k) & 1) === 1;
          if (set) flipBit(bad, start + k);
        }
        expect(bad).not.toEqual(w);

        const r = decodeFrame(bad);
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.error.code).toBe("BAD_CRC");
      }),
      PARAMS,
    );
  });

  describe("exhaustive single-bit flips of fixed frames", () => {
    const single: Frame = {
      header: {
        version: 1,
        type: 0,
        encrypted: false,
        hop: 2,
        ttl: 5,
        messageId: Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]),
        total: 1,
        index: 0,
      },
      body: new TextEncoder().encode("hello from the shelter"),
    };
    const multi: Frame = {
      header: {
        version: 1,
        type: 0,
        encrypted: true,
        hop: 0,
        ttl: 7,
        messageId: Uint8Array.from([9, 8, 7, 6, 5, 4, 3, 2]),
        total: 3,
        index: 1,
      },
      body: Uint8Array.from({ length: 40 }, (_, i) => (i * 7 + 3) & 0xff),
    };
    const full: Frame = {
      header: { ...single.header, total: 1, index: 0 },
      body: Uint8Array.from(
        { length: wireBodyCapacity({ multi: false }) },
        (_, i) => (i * 13 + 1) & 0xff,
      ),
    };

    for (const [name, frame] of [
      ["single-frame", single],
      ["multi-frame", multi],
      ["140-byte frame", full],
    ] as const) {
      it(`${name}: unmodified decodes, every bit flip is BAD_CRC`, () => {
        const w = encode(frame);
        if (name === "140-byte frame") expect(w.length).toBe(140);
        const ok = decodeFrame(w);
        expect(ok.ok).toBe(true);
        if (ok.ok) expect(ok.value).toEqual(frame);

        for (let i = 0; i < w.length * 8; i++) {
          const bad = w.slice();
          flipBit(bad, i);
          const r = decodeFrame(bad);
          expect(r.ok, `bit ${i}`).toBe(false);
          if (!r.ok) expect(r.error.code, `bit ${i}`).toBe("BAD_CRC");
        }
      });
    }
  });
});
