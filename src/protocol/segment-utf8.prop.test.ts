import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { MESSAGE_ID_LEN, plaintextCapacity, TAG_LEN } from "./budget";
import { decodeFrame, encodeFrame } from "./frame";
import { makeFrames, reassemble, splitPayload } from "./segment";
import type { Frame, MessageType } from "./types";

// verbose prints the seed and path on failure so CI failures can be replayed.
const PARAMS = { verbose: true, numRuns: 200 } as const;

const TYPE_TEXT = 0 as MessageType;
const MAX_UTF8_SEQUENCE = 3; // a cut may back up by up to 3 bytes

// A lone surrogate encodes as U+FFFD, so the expected string replaces them.
function replaceLoneSurrogates(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = s.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        out += s.slice(i, i + 2);
        i++;
      } else {
        out += "\uFFFD";
      }
    } else if (c >= 0xdc00 && c <= 0xdfff) {
      out += "\uFFFD";
    } else {
      out += s.charAt(i);
    }
  }
  return out;
}

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

// Pieces: ASCII, any UTF-16 code unit (includes lone surrogates), astral.
const pieceArb = fc.oneof(
  { arbitrary: fc.integer({ min: 0x20, max: 0x7e }), weight: 2 },
  { arbitrary: fc.integer({ min: 0, max: 0xffff }), weight: 2 },
  { arbitrary: fc.integer({ min: 0x10000, max: 0x10ffff }), weight: 2 },
);

const stringArb = fc
  .array(pieceArb, { maxLength: 500 })
  .map((cps) =>
    cps
      .map((cp) =>
        cp > 0xffff ? String.fromCodePoint(cp) : String.fromCharCode(cp),
      )
      .join(""),
  );

const scenarioArb = fc.record({
  encrypted: fc.boolean(),
  text: stringArb,
  messageId: fc.uint8Array({
    minLength: MESSAGE_ID_LEN,
    maxLength: MESSAGE_ID_LEN,
  }),
  hop: fc.integer({ min: 0, max: 15 }),
  ttl: fc.integer({ min: 0, max: 15 }),
});

const encoder = new TextEncoder();
const strictDecoder = new TextDecoder("utf-8", { fatal: true });

function roundTrip(
  text: string,
  encrypted: boolean,
  messageId: Uint8Array,
  hop: number,
  ttl: number,
): void {
  const bytes = encoder.encode(text);
  const split = splitPayload(bytes, { encrypted, utf8Boundaries: true });
  expect(split.ok).toBe(true);
  if (!split.ok) return;
  const chunks = split.value;

  // Each chunk is valid UTF-8 on its own.
  for (const chunk of chunks) {
    expect(() => strictDecoder.decode(chunk)).not.toThrow();
  }

  // reassemble never decrypts: a tag-sized pad stands in for the GCM tag.
  const pad = new Uint8Array(TAG_LEN).fill(0xa5);
  const bodies = chunks.map((c) => (encrypted ? concat([c, pad]) : c));
  const made = makeFrames(
    { type: TYPE_TEXT, encrypted, hop, ttl, messageId },
    bodies,
  );
  expect(made.ok).toBe(true);
  if (!made.ok) return;

  const received: Frame[] = [];
  for (const frame of made.value.slice().reverse()) {
    const wire = encodeFrame(frame);
    expect(wire.ok).toBe(true);
    if (!wire.ok) return;
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

  // Strip the pad from each body, then decode the joined bytes as UTF-8.
  const joined: Uint8Array[] = [];
  let pos = 0;
  for (const chunk of chunks) {
    joined.push(out.value.payload.slice(pos, pos + chunk.length));
    pos += chunk.length + (encrypted ? TAG_LEN : 0);
  }
  expect(strictDecoder.decode(concat(joined))).toBe(
    replaceLoneSurrogates(text),
  );
}

describe("Property 7: UTF-8 round trip", () => {
  /**
   * **Validates: Requirements 8.4, 8.10**
   */
  it("split, make, encode, decode, reassemble and UTF-8 decode returns the original string", () => {
    fc.assert(
      fc.property(
        scenarioArb.filter((s) => {
          const cap = plaintextCapacity({
            encrypted: s.encrypted,
            multi: true,
          });
          // Cuts may back up a few bytes, so keep clear of the 16-frame limit.
          return (
            encoder.encode(s.text).length <= 16 * (cap - MAX_UTF8_SEQUENCE)
          );
        }),
        (s) => roundTrip(s.text, s.encrypted, s.messageId, s.hop, s.ttl),
      ),
      PARAMS,
    );
  });
});

describe("Property 7: fixed boundary examples", () => {
  /**
   * **Validates: Requirements 8.4, 8.10**
   */
  it("a 4-byte code point straddling the first cut survives intact", () => {
    const cap = plaintextCapacity({ encrypted: false, multi: true });
    // Fill up to one byte before the cut, so the emoji would straddle it.
    const text = `${"a".repeat(cap - 1)}\u{1F600}${"b".repeat(10)}`;
    roundTrip(text, false, new Uint8Array(MESSAGE_ID_LEN).fill(3), 0, 15);
  });

  /**
   * **Validates: Requirements 8.4, 8.10**
   */
  it("lone surrogates come back as U+FFFD", () => {
    const text = `a\uD800b\uDC00c${"x".repeat(200)}\uD83D`;
    roundTrip(text, true, new Uint8Array(MESSAGE_ID_LEN).fill(9), 1, 2);
    expect(replaceLoneSurrogates(text).includes("\uFFFD")).toBe(true);
  });
});
