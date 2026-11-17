import { describe, expect, it } from "vitest";
import { crc16 } from "./crc16";
import { decodeFrame, encodeFrame, frameKey, patchRouting } from "./frame";
import type { Frame, FrameHeader, MessageType } from "./types";

const ID = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]);

function frame(
  h: Partial<FrameHeader> = {},
  body: Uint8Array = new Uint8Array(0),
): Frame {
  return {
    header: {
      version: 1,
      type: 0,
      encrypted: false,
      hop: 0,
      ttl: 0,
      messageId: ID.slice(),
      index: 0,
      total: 1,
      ...h,
    },
    body,
  };
}

function bytesOf(length: number, value = 0x61): Uint8Array {
  return new Uint8Array(length).fill(value);
}

/** Append the big-endian CRC-16 trailer. */
function withCrc(bytes: ArrayLike<number>): Uint8Array {
  const data = Uint8Array.from(bytes);
  const crc = crc16(data);
  const out = new Uint8Array(data.length + 2);
  out.set(data);
  out[data.length] = crc >> 8;
  out[data.length + 1] = crc & 0xff;
  return out;
}

/** Wire bytes with a correct CRC: byte 0 given, routing 0, Message_ID 1..8, then rest. */
function wire(b0: number, rest: number[] = []): Uint8Array {
  return withCrc([b0, 0x00, 1, 2, 3, 4, 5, 6, 7, 8, ...rest]);
}

/** Same bytes with the last CRC byte flipped. */
function badCrc(w: Uint8Array): Uint8Array {
  const out = w.slice();
  out[out.length - 1] = (out[out.length - 1] ?? 0) ^ 0xff;
  return out;
}

function fail(code: string) {
  return { ok: false, error: { code } };
}

const BAD_TYPE = 6 as unknown as MessageType;
const BAD_VERSION = 2 as unknown as 1;

describe("encodeFrame wire examples", () => {
  it("encodes a single plaintext TEXT frame byte-exactly", () => {
    const f = frame({ hop: 0, ttl: 7 }, Uint8Array.from([0x68, 0x69]));
    const r = encodeFrame(f);
    expect(r).toEqual({
      ok: true,
      value: Uint8Array.from([
        0x40, 0x07, 1, 2, 3, 4, 5, 6, 7, 8, 0x68, 0x69, 0xd9, 0x91,
      ]),
    });
    if (r.ok) expect(r.value.length).toBe(14);
  });

  it("encodes frame 2 of a three-frame SOS byte-exactly", () => {
    const f = frame(
      { type: 3, hop: 1, ttl: 6, index: 1, total: 3 },
      Uint8Array.from([0x41]),
    );
    const r = encodeFrame(f);
    expect(r).toEqual({
      ok: true,
      value: Uint8Array.from([
        0x56, 0x16, 1, 2, 3, 4, 5, 6, 7, 8, 0x12, 0x41, 0x2a, 0x73,
      ]),
    });
    if (r.ok) expect(r.value.length).toBe(14);
  });

  it("lays out an encrypted three-frame SOS frame with a trailing CRC", () => {
    const body = bytesOf(16, 0xaa);
    const f = frame(
      { type: 3, encrypted: true, hop: 2, ttl: 5, index: 1, total: 3 },
      body,
    );
    const r = encodeFrame(f);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.length).toBe(11 + 16 + 2);
    expect(r.value[0]).toBe(0x76);
    expect(r.value[1]).toBe(0x25);
    expect(r.value[10]).toBe(0x12);
    expect(r.value.slice(11, 27)).toEqual(body);
    const crc = crc16(r.value.subarray(0, r.value.length - 2));
    expect(r.value[r.value.length - 2]).toBe(crc >> 8);
    expect(r.value[r.value.length - 1]).toBe(crc & 0xff);
  });

  it("decodes the examples back to the original frames", () => {
    const a = frame({ ttl: 7 }, Uint8Array.from([0x68, 0x69]));
    const b = frame(
      { type: 3, hop: 1, ttl: 6, index: 1, total: 3 },
      Uint8Array.from([0x41]),
    );
    const c = frame(
      { type: 3, encrypted: true, hop: 2, ttl: 5, index: 1, total: 3 },
      bytesOf(16, 0xaa),
    );
    for (const f of [a, b, c]) {
      const enc = encodeFrame(f);
      expect(enc.ok).toBe(true);
      if (enc.ok)
        expect(decodeFrame(enc.value)).toEqual({ ok: true, value: f });
    }
  });

  it("decoded Body excludes the CRC", () => {
    const r = decodeFrame(
      Uint8Array.from([
        0x40, 0x07, 1, 2, 3, 4, 5, 6, 7, 8, 0x68, 0x69, 0xd9, 0x91,
      ]),
    );
    expect(r.ok && r.value.body).toEqual(Uint8Array.from([0x68, 0x69]));
  });
});

describe("encodeFrame errors", () => {
  const key = bytesOf(16, 1);

  it("returns each error code", () => {
    expect(encodeFrame(frame({ version: BAD_VERSION }))).toEqual(
      fail("BAD_VERSION"),
    );
    expect(encodeFrame(frame({ messageId: new Uint8Array(7) }))).toEqual(
      fail("BAD_ID_LENGTH"),
    );
    expect(encodeFrame(frame({ messageId: new Uint8Array(9) }))).toEqual(
      fail("BAD_ID_LENGTH"),
    );
    for (const h of [
      { hop: 16 },
      { hop: -1 },
      { ttl: 16 },
      { ttl: -1 },
      { hop: 1.5 },
      { ttl: Number.NaN },
    ]) {
      expect(encodeFrame(frame(h))).toEqual(fail("BAD_ROUTING"));
    }
    for (const h of [
      { total: 0 },
      { total: 17 },
      { total: 1.5 },
      { total: 2, index: 2 },
      { total: 2, index: -1 },
      { total: 2, index: 0.5 },
    ]) {
      expect(encodeFrame(frame(h))).toEqual(fail("BAD_FRAME_INDEX"));
    }
    expect(encodeFrame(frame({ type: BAD_TYPE }))).toEqual(fail("BAD_TYPE"));
    expect(encodeFrame(frame({ encrypted: true }, bytesOf(15)))).toEqual(
      fail("BODY_TOO_SHORT"),
    );
    expect(encodeFrame(frame({ type: 4 }, bytesOf(15)))).toEqual(
      fail("BODY_TOO_SHORT"),
    );
    expect(encodeFrame(frame({ type: 4, encrypted: true }, key))).toEqual(
      fail("KEY_OFFER_ENCRYPTED"),
    );
    expect(encodeFrame(frame({ type: 4, total: 2 }, key))).toEqual(
      fail("KEY_OFFER_MULTIFRAME"),
    );
    expect(encodeFrame(frame({}, bytesOf(129)))).toEqual(
      fail("FRAME_TOO_LONG"),
    );
  });

  it("follows the check precedence of clause 2.10", () => {
    const badId = new Uint8Array(3);
    // Everything wrong at once: version wins.
    expect(
      encodeFrame(
        frame(
          {
            version: BAD_VERSION,
            messageId: badId,
            hop: 16,
            total: 0,
            type: BAD_TYPE,
          },
          bytesOf(500),
        ),
      ),
    ).toEqual(fail("BAD_VERSION"));
    expect(encodeFrame(frame({ messageId: badId, hop: 16, total: 0 }))).toEqual(
      fail("BAD_ID_LENGTH"),
    );
    expect(encodeFrame(frame({ hop: 16, total: 0, type: BAD_TYPE }))).toEqual(
      fail("BAD_ROUTING"),
    );
    expect(encodeFrame(frame({ total: 0, type: BAD_TYPE }))).toEqual(
      fail("BAD_FRAME_INDEX"),
    );
    expect(
      encodeFrame(frame({ type: BAD_TYPE, encrypted: true }, bytesOf(3))),
    ).toEqual(fail("BAD_TYPE"));
    expect(
      encodeFrame(frame({ type: 4, encrypted: true }, bytesOf(15))),
    ).toEqual(fail("BODY_TOO_SHORT"));
    expect(
      encodeFrame(frame({ type: 4, encrypted: true, total: 2 }, key)),
    ).toEqual(fail("KEY_OFFER_ENCRYPTED"));
    expect(encodeFrame(frame({ type: 4, total: 2 }, bytesOf(3)))).toEqual(
      fail("KEY_OFFER_MULTIFRAME"),
    );
    expect(encodeFrame(frame({ type: 4 }, bytesOf(200)))).toEqual(
      fail("FRAME_TOO_LONG"),
    );
    expect(encodeFrame(frame({ type: 4 }, bytesOf(15)))).toEqual(
      fail("BODY_TOO_SHORT"),
    );
  });
});

describe("decodeFrame errors", () => {
  it("returns each error code for a hand-built input with a correct CRC", () => {
    expect(decodeFrame(new Uint8Array(0))).toEqual(fail("TOO_SHORT"));
    expect(decodeFrame(wire(0x40).slice(0, 11))).toEqual(fail("TOO_SHORT"));
    expect(decodeFrame(withCrc([0x40, 0, 1, 2, 3, 4, 5, 6, 7]))).toEqual(
      fail("TOO_SHORT"),
    );
    expect(decodeFrame(bytesOf(141, 0xff))).toEqual(fail("TOO_LONG"));
    expect(decodeFrame(wire(0x80))).toEqual(fail("BAD_VERSION"));
    expect(decodeFrame(wire(0x00))).toEqual(fail("BAD_VERSION"));
    expect(decodeFrame(wire(0x41))).toEqual(fail("RESERVED_BITS"));
    expect(decodeFrame(wire(0x4c))).toEqual(fail("UNKNOWN_TYPE"));
    expect(decodeFrame(wire(0x4e))).toEqual(fail("UNKNOWN_TYPE"));
    expect(decodeFrame(wire(0x68, [...bytesOf(16)]))).toEqual(
      fail("KEY_OFFER_ENCRYPTED"),
    );
    expect(decodeFrame(wire(0x58, [0x01, ...bytesOf(16)]))).toEqual(
      fail("KEY_OFFER_MULTIFRAME"),
    );
    expect(decodeFrame(wire(0x50))).toEqual(fail("TOO_SHORT"));
    expect(decodeFrame(wire(0x50, [0x00]))).toEqual(fail("NON_CANONICAL"));
    expect(decodeFrame(wire(0x50, [0x31]))).toEqual(fail("BAD_FRAME_INDEX"));
    expect(decodeFrame(wire(0x60, [...bytesOf(15)]))).toEqual(
      fail("BODY_TOO_SHORT"),
    );
    expect(decodeFrame(wire(0x70, [0x01, ...bytesOf(15)]))).toEqual(
      fail("BODY_TOO_SHORT"),
    );
    expect(decodeFrame(wire(0x48, [...bytesOf(15)]))).toEqual(
      fail("BODY_TOO_SHORT"),
    );
  });

  it("returns BAD_CRC for a wrong CRC, alone or with a field defect", () => {
    expect(decodeFrame(badCrc(wire(0x40, [1, 2])))).toEqual(fail("BAD_CRC"));
    expect(decodeFrame(badCrc(wire(0x80)))).toEqual(fail("BAD_CRC"));
    expect(decodeFrame(badCrc(wire(0x41)))).toEqual(fail("BAD_CRC"));
    expect(decodeFrame(badCrc(wire(0x4c)))).toEqual(fail("BAD_CRC"));
  });

  it("returns TOO_SHORT for a 12-byte multi-frame input with a correct CRC", () => {
    const w = wire(0x50);
    expect(w.length).toBe(12);
    expect(decodeFrame(w)).toEqual(fail("TOO_SHORT"));
  });

  it("follows the check precedence of clause 3.13", () => {
    // Length first: under 12 bytes, and over 140 bytes, beat the CRC.
    expect(decodeFrame(bytesOf(9, 0xff))).toEqual(fail("TOO_SHORT"));
    expect(decodeFrame(bytesOf(141, 0xff))).toEqual(fail("TOO_LONG"));
    // CRC second: a wrong CRC beats every field error.
    expect(decodeFrame(badCrc(wire(0x81)))).toEqual(fail("BAD_CRC"));
    expect(decodeFrame(badCrc(wire(0x4d)))).toEqual(fail("BAD_CRC"));
    expect(decodeFrame(badCrc(wire(0x78)))).toEqual(fail("BAD_CRC"));
    // Then the fields, with a correct CRC.
    expect(decodeFrame(wire(0x81))).toEqual(fail("BAD_VERSION"));
    expect(decodeFrame(wire(0x4d))).toEqual(fail("RESERVED_BITS"));
    expect(decodeFrame(wire(0x78))).toEqual(fail("KEY_OFFER_ENCRYPTED"));
    // Multi-frame KEY_OFFER with no FRAME byte: the KEY_OFFER code wins.
    expect(decodeFrame(wire(0x58))).toEqual(fail("KEY_OFFER_MULTIFRAME"));
    // Flag set, total 1 and index out of range: NON_CANONICAL wins.
    expect(decodeFrame(wire(0x50, [0x50]))).toEqual(fail("NON_CANONICAL"));
    // Bad index wins over a too-short encrypted body.
    expect(decodeFrame(wire(0x70, [0x31]))).toEqual(fail("BAD_FRAME_INDEX"));
  });
});

describe("boundaries", () => {
  it("round-trips an empty body", () => {
    const f = frame();
    const r = encodeFrame(f);
    expect(r.ok && r.value.length).toBe(12);
    if (r.ok) expect(decodeFrame(r.value)).toEqual({ ok: true, value: f });
  });

  it("handles hop and TTL at 0 and 15", () => {
    for (const [hop, ttl, byte] of [
      [0, 0, 0x00],
      [15, 15, 0xff],
      [0, 15, 0x0f],
      [15, 0, 0xf0],
    ] as const) {
      const f = frame({ hop, ttl });
      const r = encodeFrame(f);
      expect(r.ok && r.value[1]).toBe(byte);
      if (r.ok) expect(decodeFrame(r.value)).toEqual({ ok: true, value: f });
    }
  });

  it("handles total 16 with index 15", () => {
    const f = frame({ index: 15, total: 16 }, Uint8Array.from([9]));
    const r = encodeFrame(f);
    expect(r.ok && r.value[10]).toBe(0xff);
    expect(r.ok && r.value.length).toBe(14);
    if (r.ok) expect(decodeFrame(r.value)).toEqual({ ok: true, value: f });
  });

  it("accepts a body at wireBodyCapacity and rejects one more byte", () => {
    const single = encodeFrame(frame({}, bytesOf(128)));
    expect(single.ok && single.value.length).toBe(140);
    expect(encodeFrame(frame({}, bytesOf(129)))).toEqual(
      fail("FRAME_TOO_LONG"),
    );
    const multi = encodeFrame(frame({ total: 2 }, bytesOf(127)));
    expect(multi.ok && multi.value.length).toBe(140);
    expect(encodeFrame(frame({ total: 2 }, bytesOf(128)))).toEqual(
      fail("FRAME_TOO_LONG"),
    );
  });

  it("patchRouting accepts hop 15 and rejects hop 16", () => {
    const w = encodeFrame(frame({ ttl: 3 }, bytesOf(4)));
    expect(w.ok).toBe(true);
    if (!w.ok) return;
    const patched = patchRouting(w.value, 15, 3);
    expect(patched.ok && patched.value[1]).toBe(0xf3);
    expect(patchRouting(w.value, 16, 3)).toEqual(fail("BAD_ROUTING"));
    expect(patchRouting(w.value, 3, 16)).toEqual(fail("BAD_ROUTING"));
    expect(patchRouting(w.value, -1, 3)).toEqual(fail("BAD_ROUTING"));
  });

  it("patchRouting changes byte 1 and the CRC, and leaves the input alone", () => {
    const w = encodeFrame(frame({ hop: 1, ttl: 2 }, bytesOf(4)));
    expect(w.ok).toBe(true);
    if (!w.ok) return;
    const before = w.value.slice();
    const patched = patchRouting(w.value, 4, 5);
    expect(w.value).toEqual(before);
    if (!patched.ok) throw new Error("expected ok");
    const expected = before.slice();
    expected[1] = 0x45;
    expect(patched.value.slice(0, -2)).toEqual(expected.slice(0, -2));
    expect(patched.value).not.toBe(w.value);
  });

  it("patchRouting output decodes, with a recomputed CRC", () => {
    const w = encodeFrame(frame({ hop: 1, ttl: 2 }, bytesOf(4)));
    if (!w.ok) throw new Error("expected ok");
    const patched = patchRouting(w.value, 4, 5);
    if (!patched.ok) throw new Error("expected ok");
    const n = patched.value.length;
    const crc = crc16(patched.value.subarray(0, n - 2));
    expect(patched.value[n - 2]).toBe(crc >> 8);
    expect(patched.value[n - 1]).toBe(crc & 0xff);
    expect(decodeFrame(patched.value)).toEqual({
      ok: true,
      value: frame({ hop: 4, ttl: 5 }, bytesOf(4)),
    });
  });

  it("patchRouting returns BAD_CRC for a corrupted frame", () => {
    const w = encodeFrame(frame({ ttl: 3 }, bytesOf(4)));
    if (!w.ok) throw new Error("expected ok");
    expect(patchRouting(badCrc(w.value), 1, 1)).toEqual(fail("BAD_CRC"));
  });

  it("patchRouting returns TOO_SHORT for inputs under 12 bytes", () => {
    expect(patchRouting(wire(0x40).slice(0, 11), 1, 1)).toEqual(
      fail("TOO_SHORT"),
    );
  });

  it("patchRouting returns TOO_SHORT for inputs under 2 bytes", () => {
    expect(patchRouting(new Uint8Array(0), 1, 1)).toEqual(fail("TOO_SHORT"));
    expect(patchRouting(Uint8Array.from([0x40]), 1, 1)).toEqual(
      fail("TOO_SHORT"),
    );
    expect(patchRouting(Uint8Array.from([0x40]), 16, 16)).toEqual(
      fail("TOO_SHORT"),
    );
  });

  it("patchRouting returns the decode error even when hop is invalid", () => {
    expect(patchRouting(wire(0x41), 16, 0)).toEqual(fail("RESERVED_BITS"));
  });
});

describe("aliasing and body handling", () => {
  it("encodeFrame output does not alias the input", () => {
    const f = frame({}, Uint8Array.from([1, 2, 3]));
    const r = encodeFrame(f);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const snapshot = r.value.slice();
    f.body.fill(0xee);
    f.header.messageId.fill(0xee);
    expect(r.value).toEqual(snapshot);
  });

  it("encodeFrame does not mutate the input frame", () => {
    const f = frame({ total: 2, index: 1 }, Uint8Array.from([1, 2, 3]));
    encodeFrame(f);
    expect(f.body).toEqual(Uint8Array.from([1, 2, 3]));
    expect(f.header.messageId).toEqual(ID);
  });

  it("decodeFrame output does not alias the input bytes", () => {
    const input = wire(0x40, [1, 2, 3]);
    const snapshot = input.slice();
    const r = decodeFrame(input);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    r.value.body.fill(0xee);
    r.value.header.messageId.fill(0xee);
    expect(input).toEqual(snapshot);

    const again = decodeFrame(input);
    if (!again.ok) throw new Error("expected ok");
    const body = again.value.body.slice();
    input.fill(0);
    expect(again.value.body).toEqual(body);
  });

  it("frameKey is lowercase hex, a colon, and the decimal index", () => {
    const id = Uint8Array.from([
      0x0a, 0xff, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05,
    ]);
    expect(frameKey(frame({ messageId: id, index: 3, total: 4 }))).toBe(
      "0aff000102030405:3",
    );
    expect(frameKey(frame({ messageId: id, index: 12, total: 16 }))).toBe(
      "0aff000102030405:12",
    );
  });

  it("decodes a TEXT body with invalid UTF-8 without error", () => {
    const body = Uint8Array.from([0xff, 0xfe, 0xc0, 0x80]);
    const f = frame({}, body);
    const r = encodeFrame(f);
    expect(r.ok).toBe(true);
    if (r.ok) expect(decodeFrame(r.value)).toEqual({ ok: true, value: f });
  });

  it("round-trips a RESEND_REQUEST with an opaque body", () => {
    const f = frame({ type: 5, hop: 3, ttl: 9 }, Uint8Array.from([0, 255, 7]));
    const r = encodeFrame(f);
    expect(r.ok && r.value[0]).toBe(0x4a);
    if (r.ok) expect(decodeFrame(r.value)).toEqual({ ok: true, value: f });
  });
});
