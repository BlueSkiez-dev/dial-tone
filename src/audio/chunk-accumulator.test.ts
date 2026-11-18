import { describe, expect, it } from "vitest";
import { createChunkAccumulator } from "./chunk-accumulator";

const Q = 128;
const quantum = (v: number) => new Float32Array(Q).fill(v);

describe("chunk accumulator", () => {
  it("8 quanta give exactly one chunk, starting at the first frame", () => {
    const acc = createChunkAccumulator(1024);
    const results = [];
    for (let i = 0; i < 8; i++)
      results.push(acc.push(quantum(i), 5000 + i * Q));
    expect(results.slice(0, 7).every((r) => r === null)).toBe(true);
    const chunk = results[7];
    expect(chunk?.startFrame).toBe(5000);
    expect(chunk?.samples.length).toBe(1024);
    expect(chunk?.samples[0]).toBe(0);
    expect(chunk?.samples[1023]).toBe(7);
  });

  it("accepts a start frame that is not a multiple of 128", () => {
    const acc = createChunkAccumulator(1024);
    let chunk = null;
    for (let i = 0; i < 8; i++) chunk = acc.push(quantum(1), 77 + i * Q);
    expect(chunk?.startFrame).toBe(77);
  });

  it("drops the partial chunk on a gap", () => {
    const acc = createChunkAccumulator(1024);
    for (let i = 0; i < 4; i++) acc.push(quantum(1), i * Q);
    let chunk = null;
    for (let i = 0; i < 8; i++) chunk = acc.push(quantum(2), 10_000 + i * Q);
    expect(chunk?.startFrame).toBe(10_000);
    expect(chunk?.samples.every((s) => s === 2)).toBe(true);
  });
});
