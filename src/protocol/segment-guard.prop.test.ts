import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  GGWAVE_MAX_PAYLOAD,
  plaintextCapacity,
  TAG_LEN,
  utf8ByteLength,
  VERSION,
  wireBodyCapacity,
} from "./budget";
import { encodeFrame } from "./frame";
import { makeFrames, splitPayload } from "./segment";
import type { Frame, MessageType } from "./types";

// verbose prints the seed and path on failure so CI failures can be replayed.
const PARAMS = { verbose: true, numRuns: 300 } as const;

const encoder = new TextEncoder();
const TEXT_TYPE = 0 as MessageType;
const MESSAGE_ID = new Uint8Array(8).fill(7);

/** Wire body for a chunk: encrypted bodies carry a tag-sized suffix (opaque, no real crypto here). */
function wireBody(chunk: Uint8Array, encrypted: boolean): Uint8Array {
  if (!encrypted) return chunk;
  const out = new Uint8Array(chunk.length + TAG_LEN);
  out.set(chunk);
  return out;
}

function singleFrame(body: Uint8Array, encrypted: boolean): Frame {
  return {
    header: {
      version: VERSION,
      type: TEXT_TYPE,
      encrypted,
      hop: 0,
      ttl: 7,
      messageId: MESSAGE_ID,
      index: 0,
      total: 1,
    },
    body,
  };
}

// UTF-16 code unit generators. Strings are built from code units so that
// string.length (the "character count") is exact.
const asciiUnit = fc
  .integer({ min: 0x20, max: 0x7e })
  .map((u) => String.fromCharCode(u));
const twoByteUnit = fc
  .integer({ min: 0x80, max: 0x7ff })
  .map((u) => String.fromCharCode(u));
const threeByteUnit = fc
  .oneof(
    fc.integer({ min: 0x800, max: 0xd7ff }),
    fc.integer({ min: 0xe000, max: 0xffff }),
  )
  .map((u) => String.fromCharCode(u));
const loneSurrogateUnit = fc
  .integer({ min: 0xd800, max: 0xdfff })
  .map((u) => String.fromCharCode(u)); // encodes as U+FFFD, 3 bytes
const astralChar = fc
  .integer({ min: 0x10000, max: 0x10ffff })
  .map((cp) => String.fromCodePoint(cp)); // 2 units, 4 bytes

const anyChar = fc.oneof(
  asciiUnit,
  twoByteUnit,
  threeByteUnit,
  loneSurrogateUnit,
  astralChar,
);

// Arbitrary Unicode strings of mixed width, long enough to cross the single-frame capacity.
const anyString = fc.array(anyChar, { maxLength: 500 }).map((a) => a.join(""));

// Strings with at most 128 characters (UTF-16 units) but more than 128 UTF-8 bytes.
// The head is 43..90 three-byte characters (at least 129 bytes); the tail is mixed.
const overByteLimitString = fc
  .tuple(
    fc.array(threeByteUnit, { minLength: 43, maxLength: 90 }),
    fc.array(anyChar, { maxLength: 40 }),
  )
  .map(([head, tail]) => {
    let s = head.join("");
    for (const c of tail) {
      if (s.length + c.length > 128) break;
      s += c;
    }
    return s;
  });

describe("Property 5: Length guard counts bytes", () => {
  /**
   * **Validates: Requirements 4.4, 4.5**
   */
  it("strings over 128 bytes but at most 128 characters are never sent as one frame, and no frame exceeds 140 bytes", () => {
    fc.assert(
      fc.property(overByteLimitString, fc.boolean(), (s, encrypted) => {
        const bytes = encoder.encode(s);
        // Generator guarantees character count and byte count differ across the limit.
        expect(s.length).toBeLessThanOrEqual(
          wireBodyCapacity({ multi: false }),
        );
        expect(utf8ByteLength(s)).toBe(bytes.length);
        expect(bytes.length).toBeGreaterThan(
          wireBodyCapacity({ multi: false }),
        );

        // Single-frame send path: the encoder rejects the body.
        const single = encodeFrame(
          singleFrame(wireBody(bytes, encrypted), encrypted),
        );
        expect(single).toEqual({
          ok: false,
          error: { code: "FRAME_TOO_LONG" },
        });

        // Segmentation path: more than one chunk, every encoded frame within the cap.
        const split = splitPayload(bytes, { encrypted, utf8Boundaries: true });
        expect(split.ok).toBe(true);
        if (!split.ok) return;
        expect(split.value.length).toBeGreaterThan(1);

        const frames = makeFrames(
          { type: TEXT_TYPE, encrypted, hop: 0, ttl: 7, messageId: MESSAGE_ID },
          split.value.map((c) => wireBody(c, encrypted)),
        );
        expect(frames.ok).toBe(true);
        if (!frames.ok) return;
        for (const f of frames.value) {
          const wire = encodeFrame(f);
          expect(wire.ok).toBe(true);
          if (wire.ok)
            expect(wire.value.length).toBeLessThanOrEqual(GGWAVE_MAX_PAYLOAD);
        }
      }),
      PARAMS,
    );
  });

  /**
   * **Validates: Requirements 4.4, 4.5**
   */
  it("the single-frame decision follows the UTF-8 byte length, not the character count", () => {
    fc.assert(
      fc.property(
        fc.oneof(anyString, overByteLimitString),
        fc.boolean(),
        (s, encrypted) => {
          const bytes = encoder.encode(s);
          const byteLen = utf8ByteLength(s);
          expect(byteLen).toBe(bytes.length);

          const cap = plaintextCapacity({ encrypted, multi: false });
          const split = splitPayload(bytes, {
            encrypted,
            utf8Boundaries: true,
          });

          if (split.ok) {
            expect(split.value.length === 1).toBe(byteLen <= cap);
          } else {
            // Only reachable for payloads that need more than one frame.
            expect(split.error.code).toBe("TOO_MANY_FRAMES");
            expect(byteLen).toBeGreaterThan(cap);
          }

          // One-frame sends: accepted at or under the wire capacity, rejected over it.
          const body = wireBody(bytes, encrypted);
          const wire = encodeFrame(singleFrame(body, encrypted));
          if (body.length <= wireBodyCapacity({ multi: false })) {
            expect(wire.ok).toBe(true);
            if (wire.ok)
              expect(wire.value.length).toBeLessThanOrEqual(GGWAVE_MAX_PAYLOAD);
          } else {
            expect(wire).toEqual({
              ok: false,
              error: { code: "FRAME_TOO_LONG" },
            });
          }
        },
      ),
      PARAMS,
    );
  });

  /**
   * **Validates: Requirements 4.4**
   */
  it("character count and byte count differ for multi-byte text, and lone surrogates count as 3 bytes", () => {
    expect("é".length).toBe(1);
    expect(utf8ByteLength("é")).toBe(2);
    expect(utf8ByteLength("€")).toBe(3);
    expect("😀".length).toBe(2);
    expect(utf8ByteLength("😀")).toBe(4);
    expect(utf8ByteLength("\ud800")).toBe(3);
    // 44 euro signs: 44 characters, 132 bytes, over the single-frame limit.
    const s = "€".repeat(44);
    expect(s.length).toBe(44);
    expect(utf8ByteLength(s)).toBe(132);
  });
});
