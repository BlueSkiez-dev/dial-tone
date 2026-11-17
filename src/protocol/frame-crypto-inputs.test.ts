import { describe, expect, it } from "vitest";
import { aadFor, ivFor } from "./frame-crypto-inputs";
import type { MessageType } from "./types";

const ID = Uint8Array.of(1, 2, 3, 4, 5, 6, 7, 8);
const SHORT_ID = Uint8Array.of(1, 2, 3);

function code(r: {
  ok: boolean;
  error?: { code: string };
}): string | undefined {
  return r.ok ? undefined : r.error?.code;
}

describe("aadFor", () => {
  it("builds messageId || type || total-1 byte-exactly", () => {
    const r = aadFor({ messageId: ID, type: 1 as MessageType, total: 3 });
    expect(r).toEqual({
      ok: true,
      value: Uint8Array.of(1, 2, 3, 4, 5, 6, 7, 8, 1, 2),
    });
  });

  it("handles the boundaries: type 0 total 1, type 5 total 16", () => {
    const lo = aadFor({ messageId: ID, type: 0 as MessageType, total: 1 });
    const hi = aadFor({ messageId: ID, type: 5 as MessageType, total: 16 });
    expect(lo.ok && Array.from(lo.value.slice(8))).toEqual([0, 0]);
    expect(hi.ok && Array.from(hi.value.slice(8))).toEqual([5, 15]);
  });

  it("returns BAD_ID_LENGTH for a wrong-length Message_ID", () => {
    const r = aadFor({ messageId: SHORT_ID, type: 1 as MessageType, total: 1 });
    expect(code(r)).toBe("BAD_ID_LENGTH");
  });

  it("returns BAD_TYPE for types outside 0..5 and non-integers", () => {
    for (const type of [6, -1, 1.5, Number.NaN]) {
      const r = aadFor({ messageId: ID, type: type as MessageType, total: 1 });
      expect(code(r)).toBe("BAD_TYPE");
    }
  });

  it("returns BAD_FRAME_INDEX for total outside 1..16 and non-integers", () => {
    for (const total of [0, 17, -1, 2.5, Number.NaN]) {
      const r = aadFor({ messageId: ID, type: 1 as MessageType, total });
      expect(code(r)).toBe("BAD_FRAME_INDEX");
    }
  });

  it("checks BAD_ID_LENGTH before BAD_TYPE before BAD_FRAME_INDEX", () => {
    const allBad = {
      messageId: SHORT_ID,
      type: 9 as MessageType,
      total: 99,
    };
    expect(code(aadFor(allBad))).toBe("BAD_ID_LENGTH");
    expect(code(aadFor({ ...allBad, messageId: ID }))).toBe("BAD_TYPE");
    expect(
      code(aadFor({ ...allBad, messageId: ID, type: 2 as MessageType })),
    ).toBe("BAD_FRAME_INDEX");
  });

  it("returns a fresh array that does not alias the input", () => {
    const id = Uint8Array.from(ID);
    const a = aadFor({ messageId: id, type: 1 as MessageType, total: 1 });
    const b = aadFor({ messageId: id, type: 1 as MessageType, total: 1 });
    if (!a.ok || !b.ok) throw new Error("expected ok");
    expect(a.value).not.toBe(b.value);
    a.value[0] = 0xff;
    expect(b.value[0]).toBe(1);
    expect(id[0]).toBe(1);
    id[1] = 0xee;
    expect(b.value[1]).toBe(2);
  });
});

describe("ivFor", () => {
  it("builds messageId || uint32 big-endian index byte-exactly", () => {
    expect(ivFor(ID, 5)).toEqual({
      ok: true,
      value: Uint8Array.of(1, 2, 3, 4, 5, 6, 7, 8, 0, 0, 0, 5),
    });
  });

  it("accepts index 0 and 15", () => {
    const lo = ivFor(ID, 0);
    const hi = ivFor(ID, 15);
    expect(lo.ok && lo.value.length).toBe(12);
    expect(lo.ok && Array.from(lo.value.slice(8))).toEqual([0, 0, 0, 0]);
    expect(hi.ok && Array.from(hi.value.slice(8))).toEqual([0, 0, 0, 15]);
  });

  it("returns BAD_ID_LENGTH for a wrong-length Message_ID", () => {
    expect(code(ivFor(SHORT_ID, 0))).toBe("BAD_ID_LENGTH");
    expect(code(ivFor(new Uint8Array(9), 0))).toBe("BAD_ID_LENGTH");
  });

  it("returns BAD_FRAME_INDEX for index 16, negatives and non-integers", () => {
    for (const index of [16, -1, 0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(code(ivFor(ID, index))).toBe("BAD_FRAME_INDEX");
    }
  });

  it("checks BAD_ID_LENGTH before BAD_FRAME_INDEX", () => {
    expect(code(ivFor(SHORT_ID, 16))).toBe("BAD_ID_LENGTH");
    expect(code(ivFor(SHORT_ID, 0.5))).toBe("BAD_ID_LENGTH");
  });

  it("returns a fresh array that does not alias the input", () => {
    const id = Uint8Array.from(ID);
    const a = ivFor(id, 1);
    const b = ivFor(id, 1);
    if (!a.ok || !b.ok) throw new Error("expected ok");
    expect(a.value).not.toBe(b.value);
    a.value[0] = 0xff;
    expect(b.value[0]).toBe(1);
    expect(id[0]).toBe(1);
  });
});
