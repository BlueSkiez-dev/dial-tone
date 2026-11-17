import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { GGWAVE_MAX_PAYLOAD } from "./budget";
import { crc16 } from "./crc16";
import { decodeFrame } from "./frame";
import type { DecodeErrorCode } from "./types";

// Print the seed and path on failure so CI failures can be replayed.
const PARAMS = { verbose: true, numRuns: 1000 } as const;

const DECODE_CODES: readonly DecodeErrorCode[] = [
  "TOO_SHORT",
  "TOO_LONG",
  "BAD_CRC",
  "BAD_VERSION",
  "RESERVED_BITS",
  "UNKNOWN_TYPE",
  "BAD_FRAME_INDEX",
  "NON_CANONICAL",
  "BODY_TOO_SHORT",
  "KEY_OFFER_ENCRYPTED",
  "KEY_OFFER_MULTIFRAME",
];

/** Append the correct big-endian CRC-16 trailer. */
function withCrc(body: Uint8Array): Uint8Array {
  const out = new Uint8Array(body.length + 2);
  out.set(body, 0);
  const crc = crc16(body);
  out[body.length] = crc >> 8;
  out[body.length + 1] = crc & 0xff;
  return out;
}

/** Any bytes, length 0 to 200. Almost always fails on length or CRC. */
const anyBytes = fc.uint8Array({ minLength: 0, maxLength: 200 });

/** Arbitrary 10 to 138 bytes plus a correct CRC, so field errors are exercised. */
const crcCorrected = fc
  .uint8Array({ minLength: 10, maxLength: 138 })
  .map(withCrc);

/** Valid version in B0 and a correct CRC, so the deeper checks are reached. */
const biasedBytes = fc
  .tuple(
    fc.integer({ min: 0, max: 0x3f }),
    fc.uint8Array({ minLength: 9, maxLength: 137 }),
  )
  .map(([low, rest]) => {
    const body = new Uint8Array(rest.length + 1);
    body[0] = 0x40 | low;
    body.set(rest, 1);
    return withCrc(body);
  });

function check(bytes: Uint8Array): void {
  const before = bytes.slice();
  const r = decodeFrame(bytes);
  expect(typeof r.ok).toBe("boolean");
  if (r.ok) {
    expect(r.value.header.version).toBe(1);
  } else {
    expect(DECODE_CODES).toContain(r.error.code);
  }
  // Decoding never mutates its input.
  expect(Array.from(bytes)).toEqual(Array.from(before));
}

/**
 * Build a wire buffer of exactly `len` bytes: B0, zero filler, optional FRAME
 * byte at offset 10 (needs len >= 13), and the correct CRC in the last two bytes.
 */
function build(b0: number, len: number, frameByte?: number): Uint8Array {
  const body = new Uint8Array(len - 2);
  body[0] = b0;
  if (frameByte !== undefined) body[10] = frameByte;
  return withCrc(body);
}

describe("Property 3: Decoder is total", () => {
  /**
   * **Validates: Requirements 12.1, 12.2**
   */
  it("never throws on any byte array of length 0 to 200 and fails only with a DecodeError code", () => {
    fc.assert(fc.property(anyBytes, check), PARAMS);
  });

  /**
   * **Validates: Requirements 12.1, 12.2, 17.1**
   */
  it("is total on inputs with a correct CRC, which reach the field checks", () => {
    fc.assert(fc.property(crcCorrected, check), PARAMS);
  });

  /**
   * **Validates: Requirements 12.1, 12.2, 17.3**
   */
  it("is total on inputs with a valid version and correct CRC, which reach the deeper checks", () => {
    fc.assert(fc.property(biasedBytes, check), PARAMS);
  });
});

describe("decodeFrame check precedence (clause 3.13)", () => {
  const code = (bytes: Uint8Array) => {
    const r = decodeFrame(bytes);
    return r.ok ? "OK" : r.error.code;
  };

  /**
   * **Validates: Requirements 3.13**
   */
  it("TOO_SHORT beats a bad version and a bad CRC", () => {
    expect(code(new Uint8Array(0))).toBe("TOO_SHORT");
    expect(code(new Uint8Array(5))).toBe("TOO_SHORT");
    // 11 bytes with a correct CRC is still under the 12-byte minimum.
    expect(code(build(0x00, 11))).toBe("TOO_SHORT");
  });

  it("TOO_LONG beats a bad version and a bad CRC", () => {
    expect(code(new Uint8Array(GGWAVE_MAX_PAYLOAD + 1))).toBe("TOO_LONG");
    expect(code(build(0x00, GGWAVE_MAX_PAYLOAD + 1))).toBe("TOO_LONG");
  });

  it("BAD_CRC beats every field error", () => {
    // ver 0, type 7, rsv 1, wrong (zero) CRC
    const bad = new Uint8Array(12);
    bad[0] = 0x0f;
    expect(code(bad)).toBe("BAD_CRC");
    // Otherwise valid frame with one flipped bit in the CRC.
    const good = build(0x40, 12);
    good[11] = (good[11] ?? 0) ^ 1;
    expect(code(good)).toBe("BAD_CRC");
  });

  it("a valid frame with a correct CRC is accepted", () => {
    expect(code(build(0x40, 12))).toBe("OK");
  });

  it("BAD_VERSION beats reserved bit and unknown type", () => {
    // ver 0, type 7, rsv 1
    expect(code(build(0x0f, 12))).toBe("BAD_VERSION");
  });

  it("RESERVED_BITS beats unknown type", () => {
    // ver 1, type 7, rsv 1
    expect(code(build(0x4f, 12))).toBe("RESERVED_BITS");
  });

  it("UNKNOWN_TYPE for types 6 and 7", () => {
    expect(code(build(0x4c, 12))).toBe("UNKNOWN_TYPE");
    expect(code(build(0x4e, 12))).toBe("UNKNOWN_TYPE");
  });

  it("KEY_OFFER_ENCRYPTED beats KEY_OFFER_MULTIFRAME", () => {
    // ver 1, E 1, M 1, type 4
    expect(code(build(0x78, 12))).toBe("KEY_OFFER_ENCRYPTED");
  });

  it("KEY_OFFER_MULTIFRAME beats the multi-frame length check", () => {
    // ver 1, E 0, M 1, type 4, only 12 bytes
    expect(code(build(0x58, 12))).toBe("KEY_OFFER_MULTIFRAME");
  });

  it("multi-frame flag under 13 bytes with a correct CRC is TOO_SHORT", () => {
    expect(code(build(0x50, 12))).toBe("TOO_SHORT");
  });

  it("NON_CANONICAL comes before BAD_FRAME_INDEX with a correct CRC", () => {
    // FRAME byte 0xf0: index 15, totalMinus1 0 (total 1)
    expect(code(build(0x50, 13, 0xf0))).toBe("NON_CANONICAL");
    // FRAME byte 0x10: index 1, total 1
    expect(code(build(0x50, 13, 0x10))).toBe("NON_CANONICAL");
  });

  it("BAD_FRAME_INDEX beats BODY_TOO_SHORT", () => {
    // ver 1, E 1, M 1, TEXT, index 3 of total 2, empty body
    expect(code(build(0x70, 13, 0x31))).toBe("BAD_FRAME_INDEX");
  });

  it("BODY_TOO_SHORT for an encrypted body under the tag length", () => {
    expect(code(build(0x60, 12))).toBe("BODY_TOO_SHORT");
  });

  it("BODY_TOO_SHORT for a KEY_OFFER body under 16 bytes", () => {
    // ver 1, E 0, M 0, type 4
    expect(code(build(0x48, 12))).toBe("BODY_TOO_SHORT");
    expect(code(build(0x48, 27))).toBe("BODY_TOO_SHORT");
    expect(code(build(0x48, 28))).toBe("OK");
  });
});
