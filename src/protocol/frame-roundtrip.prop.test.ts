import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  CRC_LEN,
  frameOverhead,
  GGWAVE_MAX_PAYLOAD,
  headerLength,
  MESSAGE_ID_LEN,
  TAG_LEN,
  wireBodyCapacity,
} from "./budget";
import { crc16 } from "./crc16";
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

/** Non-KEY_OFFER types: TEXT, LOCATION, SAFE, SOS, RESEND_REQUEST. */
const ordinaryTypeArb = fc.constantFrom<MessageType>(0, 1, 2, 3, 5);

/** Ordinary frame: any total 1..16, any index, encrypted or not, body within wire capacity. */
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

/** KEY_OFFER frame: plaintext, single frame, 16-byte key plus name up to the wire capacity. */
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

/** Bodies at exactly the wire capacity, where off-by-one errors live. */
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

describe("Property 1: Wire round trip", () => {
  /**
   * **Validates: Requirements 2.9**
   */
  it("decodeFrame(encodeFrame(f)) deeply equals f for every valid frame", () => {
    fc.assert(
      fc.property(validFrameArb, (frame) => {
        const wire = encodeFrame(frame);
        expect(wire.ok).toBe(true);
        if (!wire.ok) return;

        const bytes = wire.value;
        expect(bytes.length).toBe(
          frameOverhead(frame.header.total) + frame.body.length,
        );
        expect(bytes.length).toBe(
          headerLength(frame.header.total) + frame.body.length + CRC_LEN,
        );
        expect(bytes.length).toBeLessThanOrEqual(GGWAVE_MAX_PAYLOAD);

        // The last two wire bytes are the big-endian CRC of everything before.
        const crc = crc16(bytes.subarray(0, bytes.length - CRC_LEN));
        expect(bytes[bytes.length - 2]).toBe(crc >> 8);
        expect(bytes[bytes.length - 1]).toBe(crc & 0xff);

        const back = decodeFrame(bytes);
        expect(back.ok).toBe(true);
        if (!back.ok) return;
        expect(back.value).toEqual(frame);
        // The CRC is wire-only: it is not a field of Frame or its header.
        expect(Object.keys(back.value).sort()).toEqual(["body", "header"]);
        expect("crc" in back.value.header).toBe(false);
      }),
      PARAMS,
    );
  });
});
