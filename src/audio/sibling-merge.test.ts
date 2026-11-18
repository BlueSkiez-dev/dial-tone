import { describe, expect, it } from "vitest";
import { createSiblingMerge, SIBLING_MERGE_FRAMES } from "./sibling-merge";

const b = (...n: number[]) => new Uint8Array(n);

describe("sibling merge", () => {
  it("window is 2048 frames", () => {
    expect(SIBLING_MERGE_FRAMES).toBe(2048);
  });

  it("emits first sighting and drops the sibling duplicate", () => {
    const m = createSiblingMerge(2048);
    expect(m.offer(0, b(1, 2, 3), 1000)).toBe(true);
    expect(m.offer(1, b(1, 2, 3), 1500)).toBe(false);
    expect(m.offer(2, b(1, 2, 3), 2000)).toBe(false);
  });

  it("same decoder twice emits twice", () => {
    const m = createSiblingMerge(2048);
    expect(m.offer(0, b(1), 0)).toBe(true);
    expect(m.offer(0, b(1), 10)).toBe(true);
  });

  it("emits again after the window", () => {
    const m = createSiblingMerge(2048);
    expect(m.offer(0, b(1), 0)).toBe(true);
    expect(m.offer(1, b(1), 5000)).toBe(true);
  });

  it("does not merge a sibling whose payload has a corrupted byte", () => {
    const m = createSiblingMerge(2048);
    expect(m.offer(0, b(1, 2, 3), 0)).toBe(true);
    expect(m.offer(1, b(1, 9, 3), 100)).toBe(true);
    // the clean copy from a third decoder still merges with the first
    expect(m.offer(2, b(1, 2, 3), 200)).toBe(false);
  });

  it("stores a copy of the payload", () => {
    const m = createSiblingMerge(2048);
    const p = b(1, 2);
    m.offer(0, p, 0);
    p[0] = 99;
    expect(m.offer(1, b(1, 2), 10)).toBe(false);
  });
});
