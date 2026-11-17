import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { MAX_FRAMES, plaintextCapacity } from "./budget";
import { splitPayload } from "./segment";

// Print the seed and path on failure so CI failures can be replayed.
const PARAMS = { verbose: true, numRuns: 200 } as const;

const encoder = new TextEncoder();
// Reference validator, independent of the hand-written one in segment.ts.
const strictDecoder = new TextDecoder("utf-8", {
  fatal: true,
  ignoreBOM: true,
});

function isValidUtf8(bytes: Uint8Array): boolean {
  try {
    strictDecoder.decode(bytes);
    return true;
  } catch {
    return false;
  }
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

/**
 * Reference minimum chunk count by dynamic programming over the allowed cut
 * points (not a greedy loop, so it checks the implementation independently).
 * A cut at p is allowed when p is 0 or n, or, with utf8 boundaries, when
 * payload[p] is not a UTF-8 continuation byte.
 */
function minChunks(
  payload: Uint8Array,
  cap: number,
  utf8Boundaries: boolean,
): number {
  const n = payload.length;
  const allowed = (p: number): boolean =>
    p === 0 ||
    p === n ||
    !utf8Boundaries ||
    ((payload[p] as number) & 0xc0) !== 0x80;
  const dp: number[] = new Array<number>(n + 1).fill(Number.POSITIVE_INFINITY);
  dp[0] = 0;
  for (let p = 1; p <= n; p++) {
    if (!allowed(p)) continue;
    for (let q = Math.max(0, p - cap); q < p; q++) {
      if (!allowed(q)) continue;
      const cand = (dp[q] as number) + 1;
      if (cand < (dp[p] as number)) dp[p] = cand;
    }
  }
  return dp[n] as number;
}

function checkSplit(
  payload: Uint8Array,
  encrypted: boolean,
  utf8Boundaries: boolean,
): void {
  const r = splitPayload(payload, { encrypted, utf8Boundaries });

  if (utf8Boundaries && !isValidUtf8(payload)) {
    expect(r).toEqual({ ok: false, error: { code: "INVALID_UTF8" } });
    return;
  }

  const single = plaintextCapacity({ encrypted, multi: false });
  const cap = plaintextCapacity({ encrypted, multi: true });

  if (payload.length <= single) {
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.length).toBe(1);
    expect(Array.from(r.value[0] as Uint8Array)).toEqual(Array.from(payload));
    return;
  }

  const min = minChunks(payload, cap, utf8Boundaries);
  if (min > MAX_FRAMES) {
    expect(r).toEqual({ ok: false, error: { code: "TOO_MANY_FRAMES" } });
    return;
  }

  expect(r.ok).toBe(true);
  if (!r.ok) return;
  const chunks = r.value;
  expect(chunks.length).toBeLessThanOrEqual(MAX_FRAMES);
  expect(chunks.length).toBe(min); // no split uses fewer chunks
  for (const c of chunks) {
    expect(c.length).toBeGreaterThan(0);
    expect(c.length).toBeLessThanOrEqual(cap);
    if (utf8Boundaries) expect(isValidUtf8(c)).toBe(true);
  }
  expect(Array.from(concat(chunks))).toEqual(Array.from(payload));
}

// Arbitrary bytes, lengths straddle 16 * capacity (1776 encrypted, 2032 plain).
const bytesArb = fc.oneof(
  fc.uint8Array({ minLength: 0, maxLength: 2200 }),
  fc.integer({ min: 0, max: 2200 }).map((n) => new Uint8Array(n).fill(0x61)),
  fc
    .constantFrom(
      plaintextCapacity({ encrypted: true, multi: true }) * MAX_FRAMES,
      plaintextCapacity({ encrypted: false, multi: true }) * MAX_FRAMES,
      plaintextCapacity({ encrypted: true, multi: false }),
      plaintextCapacity({ encrypted: false, multi: false }),
    )
    .chain((base) =>
      fc.integer({ min: -2, max: 2 }).map((d) => new Uint8Array(base + d)),
    ),
);

function textBytes(cps: readonly number[]): Uint8Array {
  return encoder.encode(cps.map((cp) => String.fromCodePoint(cp)).join(""));
}

const asciiCp = fc.integer({ min: 0x20, max: 0x7e });
const twoByteCp = fc.integer({ min: 0x80, max: 0x7ff });
const threeByteCp = fc.integer({ min: 0x800, max: 0xd7ff });
const fourByteCp = fc.integer({ min: 0x10000, max: 0x10ffff });

// Valid UTF-8, with multi-byte runs so cuts regularly land inside a sequence.
const validUtf8Arb = fc
  .oneof(
    fc.array(fc.oneof(asciiCp, twoByteCp, threeByteCp, fourByteCp), {
      maxLength: 700,
    }),
    fc.array(threeByteCp, { maxLength: 700 }),
    fc.array(fourByteCp, { maxLength: 600 }),
    fc.array(twoByteCp, { maxLength: 1100 }),
  )
  .map(textBytes);

describe("Property 8: Split bound", () => {
  /**
   * **Validates: Requirements 8.1, 8.2, 8.3, 8.5, 8.6, 8.7**
   */
  it("arbitrary bytes: at most 16 chunks, within capacity, joined equals payload, TOO_MANY_FRAMES only when no split fits", () => {
    fc.assert(
      fc.property(bytesArb, fc.boolean(), (payload, encrypted) => {
        checkSplit(payload, encrypted, false);
      }),
      PARAMS,
    );
  });

  /**
   * **Validates: Requirements 8.3, 8.4, 8.5, 8.6, 8.7**
   */
  it("valid UTF-8 with utf8Boundaries: every chunk is valid UTF-8 and the chunk count is minimal", () => {
    fc.assert(
      fc.property(validUtf8Arb, fc.boolean(), (payload, encrypted) => {
        checkSplit(payload, encrypted, true);
      }),
      PARAMS,
    );
  });

  /**
   * **Validates: Requirements 8.11**
   */
  it("arbitrary bytes with utf8Boundaries: INVALID_UTF8 exactly when the payload is not valid UTF-8", () => {
    fc.assert(
      fc.property(bytesArb, fc.boolean(), (payload, encrypted) => {
        checkSplit(payload, encrypted, true);
      }),
      PARAMS,
    );
  });

  /**
   * **Validates: Requirements 8.11**
   */
  it("valid text followed by a stray byte is rejected with INVALID_UTF8", () => {
    fc.assert(
      fc.property(
        validUtf8Arb,
        fc.constantFrom(0x80, 0xc0, 0xc1, 0xf5, 0xff),
        fc.boolean(),
        (text, bad, encrypted) => {
          const payload = new Uint8Array(text.length + 1);
          payload.set(text);
          payload[text.length] = bad;
          checkSplit(payload, encrypted, true);
          expect(
            splitPayload(payload, { encrypted, utf8Boundaries: true }).ok,
          ).toBe(false);
        },
      ),
      PARAMS,
    );
  });

  /**
   * **Validates: Requirements 8.1, 8.2, 8.7**
   */
  it("boundary: 16 full chunks are accepted and one more byte is TOO_MANY_FRAMES", () => {
    for (const encrypted of [false, true]) {
      const cap = plaintextCapacity({ encrypted, multi: true });
      const ok16 = splitPayload(new Uint8Array(cap * MAX_FRAMES), {
        encrypted,
        utf8Boundaries: false,
      });
      expect(ok16.ok).toBe(true);
      if (ok16.ok) expect(ok16.value.length).toBe(MAX_FRAMES);

      const over = splitPayload(new Uint8Array(cap * MAX_FRAMES + 1), {
        encrypted,
        utf8Boundaries: false,
      });
      expect(over).toEqual({ ok: false, error: { code: "TOO_MANY_FRAMES" } });
    }
  });

  /**
   * **Validates: Requirements 8.1**
   */
  it("empty payload yields exactly one empty chunk", () => {
    for (const encrypted of [false, true]) {
      for (const utf8Boundaries of [false, true]) {
        const r = splitPayload(new Uint8Array(0), {
          encrypted,
          utf8Boundaries,
        });
        expect(r.ok).toBe(true);
        if (r.ok) {
          expect(r.value.length).toBe(1);
          expect((r.value[0] as Uint8Array).length).toBe(0);
        }
      }
    }
  });
});
