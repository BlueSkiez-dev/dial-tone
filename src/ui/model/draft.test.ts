import { describe, expect, it } from "vitest";
import { frameOverhead } from "../../protocol/index";
import { draftView } from "./draft";

describe("draftView", () => {
  it("treats 70 é characters (140 bytes) as too long", () => {
    const v = draftView("é".repeat(70));
    expect(v.bytes).toBe(140);
    expect(v.status).toBe("too-long");
    expect(v.wireLength).toBeNull();
    expect(v.meter.segments.every((s) => s === "over")).toBe(true);
  });

  it("accepts exactly 128 ASCII bytes", () => {
    const v = draftView("a".repeat(128));
    expect(v.limit).toBe(128);
    expect(v.status).toBe("ok");
    expect(v.wireLength).toBe(128 + frameOverhead(1));
    expect(v.meter.lit).toBe(24);
  });

  it("is empty for an empty string", () => {
    const v = draftView("");
    expect(v.status).toBe("empty");
    expect(v.wireLength).toBeNull();
  });
});
