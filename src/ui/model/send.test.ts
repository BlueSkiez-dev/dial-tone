import { describe, expect, it } from "vitest";
import { buildWire, SEND_TTL } from "./send";

describe("buildWire", () => {
  it("rejects the empty string", () => {
    const r = buildWire("");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("EMPTY");
  });

  it("rejects 129 bytes as TOO_LONG", () => {
    const r = buildWire("a".repeat(129));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("TOO_LONG");
  });

  it("counts bytes, not characters", () => {
    // 65 two-byte characters is 130 bytes.
    const r = buildWire("é".repeat(65));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("TOO_LONG");
  });

  it("builds a 128-byte message within 140 bytes", () => {
    const r = buildWire("a".repeat(128));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.wire.length).toBe(140);
      expect(r.value.bytes).toBe(128);
      expect(r.value.messageId.length).toBe(8);
      expect(SEND_TTL).toBe(3);
    }
  });
});
