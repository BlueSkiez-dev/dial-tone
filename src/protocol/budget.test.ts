import { describe, expect, test } from "vitest";
import {
  CRC_LEN,
  frameOverhead,
  GGWAVE_MAX_PAYLOAD,
  HEADER_LEN_MULTI,
  HEADER_LEN_SINGLE,
  headerLength,
  IV_LEN,
  MAX_FRAMES,
  MAX_HOP,
  MAX_TTL,
  MESSAGE_ID_LEN,
  plaintextCapacity,
  TAG_LEN,
  utf8ByteLength,
  VERSION,
  wireBodyCapacity,
} from "./budget";

describe("constants", () => {
  test("have the specified values", () => {
    expect(GGWAVE_MAX_PAYLOAD).toBe(140);
    expect(VERSION).toBe(1);
    expect(MESSAGE_ID_LEN).toBe(8);
    expect(TAG_LEN).toBe(16);
    expect(IV_LEN).toBe(12);
    expect(HEADER_LEN_SINGLE).toBe(10);
    expect(HEADER_LEN_MULTI).toBe(11);
    expect(CRC_LEN).toBe(2);
    expect(MAX_FRAMES).toBe(16);
    expect(MAX_HOP).toBe(15);
    expect(MAX_TTL).toBe(15);
  });
});

describe("headerLength", () => {
  test("is 10 for a single frame", () => {
    expect(headerLength(1)).toBe(10);
  });

  test("is 11 for 2..16 frames", () => {
    for (let total = 2; total <= 16; total++) {
      expect(headerLength(total)).toBe(11);
    }
  });
});

describe("frameOverhead", () => {
  test("is 12 for a single frame", () => {
    expect(frameOverhead(1)).toBe(12);
  });

  test("is 13 for 2..16 frames", () => {
    for (let total = 2; total <= 16; total++) {
      expect(frameOverhead(total)).toBe(13);
    }
  });

  test("equals headerLength plus CRC_LEN", () => {
    for (let total = 1; total <= 16; total++) {
      expect(frameOverhead(total)).toBe(headerLength(total) + CRC_LEN);
    }
  });
});

describe("wireBodyCapacity", () => {
  test("is 128 single and 127 multi", () => {
    expect(wireBodyCapacity({ multi: false })).toBe(128);
    expect(wireBodyCapacity({ multi: true })).toBe(127);
  });

  test("equals GGWAVE_MAX_PAYLOAD minus frameOverhead", () => {
    expect(GGWAVE_MAX_PAYLOAD - frameOverhead(1)).toBe(
      wireBodyCapacity({ multi: false }),
    );
    expect(GGWAVE_MAX_PAYLOAD - frameOverhead(2)).toBe(
      wireBodyCapacity({ multi: true }),
    );
  });

  test("ignores the encrypted flag", () => {
    const loose = wireBodyCapacity as (o: Record<string, boolean>) => number;
    for (const multi of [false, true]) {
      expect(loose({ multi, encrypted: true })).toBe(
        loose({ multi, encrypted: false }),
      );
    }
  });
});

describe("plaintextCapacity", () => {
  test("unencrypted equals wire capacity", () => {
    expect(plaintextCapacity({ encrypted: false, multi: false })).toBe(128);
    expect(plaintextCapacity({ encrypted: false, multi: true })).toBe(127);
  });

  test("encrypted subtracts the 16-byte tag", () => {
    expect(plaintextCapacity({ encrypted: true, multi: false })).toBe(112);
    expect(plaintextCapacity({ encrypted: true, multi: true })).toBe(111);
  });
});

describe("utf8ByteLength", () => {
  const cases: Array<[string, string, number]> = [
    ["empty", "", 0],
    ["ASCII", "hello", 5],
    ["2-byte", "é", 2],
    ["3-byte", "€", 3],
    ["4-byte", "😀", 4],
    ["lone surrogate", "\ud800", 3],
    ["mixed", "a é€😀", 1 + 1 + 2 + 3 + 4],
  ];

  for (const [name, text, bytes] of cases) {
    test(`${name} counts ${bytes} bytes and matches TextEncoder`, () => {
      expect(utf8ByteLength(text)).toBe(bytes);
      expect(utf8ByteLength(text)).toBe(new TextEncoder().encode(text).length);
    });
  }
});
