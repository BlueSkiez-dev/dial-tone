import { describe, expect, it } from "vitest";
import { createResampler, TAPS_PER_PHASE } from "./resampler";

/** Half-width in input samples when up-sampling or near 1:1. */
const H = TAPS_PER_PHASE / 2;

/** Exact cumulative output count for 44,100 to 48,000 (up 160, down 147). */
function outputCount44to48(n: number): number {
  return n <= H ? 0 : Math.ceil(((n - H) * 160) / 147);
}

function ramp(n: number): Float32Array {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.fround(Math.sin(i * 0.37) * 0.5);
  return out;
}

describe("createResampler", () => {
  it("returns a copy, not the same buffer, at equal rates", () => {
    const r = createResampler(48000, 48000);
    const input = ramp(300);
    const out = r.process(input);
    expect(out).toEqual(input);
    expect(out).not.toBe(input);
    expect(out.buffer).not.toBe(input.buffer);
    expect(r.latencyFrames).toBe(0);
  });

  it("produces the exact cumulative output count at 44,100 to 48,000", () => {
    const r = createResampler(44100, 48000);
    const n = 44100;
    let total = 0;
    for (let off = 0; off < n; off += 1000) {
      total += r.process(ramp(Math.min(1000, n - off))).length;
    }
    expect(total).toBe(outputCount44to48(n));
    expect(total).toBe(47983);
  });

  it("produces no output until more than H inputs have arrived", () => {
    const r = createResampler(44100, 48000);
    expect(r.process(ramp(H)).length).toBe(0);
    expect(r.process(ramp(1)).length).toBe(outputCount44to48(H + 1));
  });

  it("reset() makes the next output equal a fresh resampler's", () => {
    const used = createResampler(44100, 48000);
    used.process(ramp(777));
    used.reset();
    const fresh = createResampler(44100, 48000);
    const input = ramp(2000);
    expect(used.process(input)).toEqual(fresh.process(input));
  });

  it("gives an empty output for an empty input", () => {
    expect(
      createResampler(44100, 48000).process(new Float32Array(0)).length,
    ).toBe(0);
    expect(
      createResampler(48000, 48000).process(new Float32Array(0)).length,
    ).toBe(0);
  });

  it("throws RangeError for bad rates", () => {
    expect(() => createResampler(0, 48000)).toThrow(RangeError);
    expect(() => createResampler(44100, -1)).toThrow(RangeError);
    expect(() => createResampler(44100.5, 48000)).toThrow(RangeError);
    expect(() => createResampler(Number.NaN, 48000)).toThrow(RangeError);
    // Reduced ratio needs more than MAX_PHASES phases.
    expect(() => createResampler(44101, 48000)).toThrow(RangeError);
  });

  it("keeps DC at 1 after the start-up region", () => {
    const r = createResampler(44100, 48000);
    const input = new Float32Array(2000).fill(1);
    const out = r.process(input);
    expect(out.length).toBe(outputCount44to48(2000));
    for (let k = 64; k < out.length; k++) {
      expect(out[k]).toBeCloseTo(1, 5);
    }
  });
});
