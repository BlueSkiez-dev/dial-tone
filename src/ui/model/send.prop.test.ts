import fc from "fast-check";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  decodeFrame,
  encodeFrame,
  GGWAVE_MAX_PAYLOAD,
  makeFrames,
  newMessageId,
  splitPayload,
} from "../../protocol/index";
import { buildWire, SEND_TTL } from "./send";

vi.mock("../../protocol/index", async (importOriginal) => {
  const m = await importOriginal<typeof import("../../protocol/index")>();
  return {
    ...m,
    splitPayload: vi.fn(m.splitPayload),
    newMessageId: vi.fn(m.newMessageId),
    makeFrames: vi.fn(m.makeFrames),
    encodeFrame: vi.fn(m.encodeFrame),
  };
});

const enc = new TextEncoder();
const unit = fc.constantFrom("a", "Z", "7", " ", "é", "日", "😀");

const fitting = fc
  .array(unit, { minLength: 1, maxLength: 128 })
  .map((a) => a.join(""))
  .filter((s) => enc.encode(s).length <= 128);

const tooLong = fc
  .array(unit, { minLength: 129, maxLength: 200 })
  .map((a) => a.join(""));

describe("Property 3: Send path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /** **Validates: Requirements 5.2, 5.3** */
  it("texts of 1 to 128 bytes build a decodable TEXT frame", () => {
    fc.assert(
      fc.property(fitting, (text) => {
        const r = buildWire(text);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.value.wire.length).toBeLessThanOrEqual(GGWAVE_MAX_PAYLOAD);
        const d = decodeFrame(r.value.wire);
        expect(d.ok).toBe(true);
        if (!d.ok) return;
        expect(d.value.header.type).toBe(0);
        expect(d.value.header.encrypted).toBe(false);
        expect(d.value.header.hop).toBe(0);
        expect(d.value.header.ttl).toBe(SEND_TTL);
        expect(Array.from(d.value.body)).toEqual(Array.from(enc.encode(text)));
      }),
    );
  });

  /** **Validates: Requirements 5.2, 5.3** */
  it("texts over 128 bytes return TOO_LONG before any protocol call", () => {
    fc.assert(
      fc.property(tooLong, (text) => {
        vi.clearAllMocks();
        const r = buildWire(text);
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.error.code).toBe("TOO_LONG");
        expect(splitPayload).not.toHaveBeenCalled();
        expect(newMessageId).not.toHaveBeenCalled();
        expect(makeFrames).not.toHaveBeenCalled();
        expect(encodeFrame).not.toHaveBeenCalled();
      }),
    );
  });

  /** **Validates: Requirements 5.2** */
  it("the empty string returns EMPTY", () => {
    const r = buildWire("");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("EMPTY");
  });
});
