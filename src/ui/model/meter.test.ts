import { describe, expect, it } from "vitest";
import { plaintextCapacity } from "../../protocol/index";
import { meterView, wellLimit } from "./meter";

describe("meterView", () => {
  it("State 03: 41 of 128 lights 8 ok segments", () => {
    const v = meterView(41, 128);
    expect(v.lit).toBe(8);
    expect(v.segments.slice(0, 8).every((c) => c === "ok")).toBe(true);
    expect(v.segments.slice(8).every((c) => c === "off")).toBe(true);
  });

  it("0 bytes lights nothing, 1 byte lights one", () => {
    expect(meterView(0, 128).lit).toBe(0);
    expect(meterView(1, 128).lit).toBe(1);
  });

  it("full limit lights 24 with positional colours and is not over", () => {
    const v = meterView(128, 128);
    expect(v.lit).toBe(24);
    expect(v.over).toBe(false);
    expect(v.segments.slice(0, 19).every((c) => c === "ok")).toBe(true);
    expect(v.segments.slice(19).every((c) => c === "warn")).toBe(true);
  });

  it("over the limit makes all 24 segments over", () => {
    const v = meterView(129, 128);
    expect(v.over).toBe(true);
    expect(v.segments).toHaveLength(24);
    expect(v.segments.every((c) => c === "over")).toBe(true);
  });

  it("a state of 20 lit has segment 20 warn", () => {
    const v = meterView(107, 128); // ceil(107*24/128) = 21; use 104 -> 20
    expect(meterView(104, 128).lit).toBe(20);
    expect(meterView(104, 128).segments[19]).toBe("warn");
    expect(v.segments[19]).toBe("warn");
  });

  it("wellLimit equals plaintextCapacity for an open single frame", () => {
    expect(wellLimit()).toBe(
      plaintextCapacity({ encrypted: false, multi: false }),
    );
  });
});
