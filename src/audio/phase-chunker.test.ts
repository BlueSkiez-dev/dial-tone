import { describe, expect, it } from "vitest";
import { CHUNK_SAMPLES, createPhaseChunker } from "./phase-chunker";

function ramp(n: number, from = 0): Float32Array {
  return Float32Array.from({ length: n }, (_, i) => from + i);
}

describe("phase chunker", () => {
  it("gives no block when the stream is shorter than the offset", () => {
    const c = createPhaseChunker(256);
    expect(c.push(0, ramp(200))).toEqual([]);
  });

  it("gives exactly one block for offset + 1024 samples", () => {
    const c = createPhaseChunker(256);
    const out = c.push(0, ramp(256 + CHUNK_SAMPLES));
    expect(out).toHaveLength(1);
    expect(out[0]?.[0]).toBe(256);
  });

  it("resets on a gap and realigns to the absolute phase", () => {
    const c = createPhaseChunker(0);
    expect(c.push(0, ramp(500))).toEqual([]);
    // gap: next input starts at frame 3000, first aligned frame is 3072
    const out = c.push(3000, ramp(72 + CHUNK_SAMPLES, 3000));
    expect(out).toHaveLength(1);
    expect(out[0]?.[0]).toBe(3072);
  });

  it("reset keeps the absolute phase", () => {
    const c = createPhaseChunker(512);
    c.push(0, ramp(900));
    c.reset();
    const out = c.push(900, ramp(2000, 900));
    expect(out[0]?.[0]).toBe(1536);
  });
});
