import { describe, expect, it } from "vitest";
import { crc16 } from "./crc16";

const bytes = (...b: number[]): Uint8Array => Uint8Array.from(b);
const ascii = (s: string): Uint8Array => new TextEncoder().encode(s);

describe("crc16", () => {
  it('matches the standard check value for "123456789"', () => {
    expect(crc16(ascii("123456789"))).toBe(0x29b1);
  });

  it("returns 0xFFFF for empty input", () => {
    expect(crc16(new Uint8Array(0))).toBe(0xffff);
  });

  it("matches the design wire example for a single-frame message", () => {
    const pre = bytes(0x40, 0x07, 1, 2, 3, 4, 5, 6, 7, 8, 0x68, 0x69);
    expect(crc16(pre)).toBe(0xd991);
    const wire = bytes(...pre, 0xd9, 0x91);
    expect(Array.from(wire.slice(-2))).toEqual([0xd9, 0x91]);
    expect(crc16(wire)).toBe(0);
  });

  it("matches the design wire example for a multi-frame message", () => {
    const pre = bytes(0x56, 0x16, 1, 2, 3, 4, 5, 6, 7, 8, 0x12, 0x41);
    expect(crc16(pre)).toBe(0x2a73);
    const wire = bytes(...pre, 0x2a, 0x73);
    expect(Array.from(wire.slice(-2))).toEqual([0x2a, 0x73]);
    expect(crc16(wire)).toBe(0);
  });

  it("gives residue 0 when the big-endian CRC is appended", () => {
    const messages = [
      new Uint8Array(0),
      bytes(0),
      bytes(0xff),
      ascii("123456789"),
      ascii("hello world"),
      Uint8Array.from({ length: 100 }, (_, i) => (i * 37) & 0xff),
    ];
    for (const m of messages) {
      const c = crc16(m);
      const full = new Uint8Array(m.length + 2);
      full.set(m);
      full[m.length] = c >> 8;
      full[m.length + 1] = c & 0xff;
      expect(crc16(full)).toBe(0);
    }
  });

  it("does not mutate its input", () => {
    const input = bytes(1, 2, 3, 4, 5);
    const copy = input.slice();
    crc16(input);
    expect(input).toEqual(copy);
  });

  it("handles a 140-byte array of 0xFF", () => {
    const input = new Uint8Array(140).fill(0xff);
    const c = crc16(input);
    expect(c).toBeGreaterThanOrEqual(0);
    expect(c).toBeLessThanOrEqual(0xffff);
    expect(crc16(input)).toBe(c);
  });
});
