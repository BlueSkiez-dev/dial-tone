import { describe, expect, it } from "vitest";
import { CHUNK_SAMPLES } from "./constants";
import { createRateAdapter } from "./rate-adapter";

const chunk = (startFrame: number) => ({
  startFrame,
  samples: new Float32Array(CHUNK_SAMPLES).fill(0.1),
});

describe("rate adapter", () => {
  it("passes chunks through at 48 kHz", () => {
    const a = createRateAdapter(48000);
    const c = chunk(2048);
    expect(a.push(c)).toEqual([c]);
    expect(a.frameToStream(1234, "down")).toBe(1234);
  });

  it("re-forms 1024-sample chunks on the 48 kHz clock at 44.1 kHz", () => {
    const a = createRateAdapter(44100);
    const out = [];
    for (let i = 0; i < 20; i++) out.push(...a.push(chunk(i * CHUNK_SAMPLES)));
    expect(out.length).toBeGreaterThanOrEqual(20);
    for (const c of out) expect(c.samples.length).toBe(CHUNK_SAMPLES);
    for (let i = 1; i < out.length; i++) {
      expect(out[i]?.startFrame).toBe(
        (out[i - 1]?.startFrame ?? 0) + CHUNK_SAMPLES,
      );
    }
  });

  it("rounds gate edges outward when converting frames", () => {
    const a = createRateAdapter(44100);
    expect(a.frameToStream(441, "down")).toBe(480);
    expect(a.frameToStream(442, "down")).toBe(481);
    expect(a.frameToStream(442, "up")).toBe(482);
    expect(a.frameToStream(442, "round")).toBe(481);
  });

  it("re-anchors the output clock after a gap", () => {
    const a = createRateAdapter(44100);
    a.push(chunk(0));
    const out = a.push(chunk(441000));
    const first = out[0];
    if (first) expect(first.startFrame).toBeGreaterThanOrEqual(480000);
  });
});
