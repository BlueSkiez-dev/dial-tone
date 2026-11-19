import { describe, expect, it } from "vitest";
import { createChunkQueue } from "./chunk-queue";

describe("chunk queue", () => {
  it("keeps order and drops the oldest items past the limit", () => {
    const q = createChunkQueue<number>(3);
    expect([1, 2, 3].map((n) => q.push(n))).toEqual([0, 0, 0]);
    expect(q.push(4)).toBe(1);
    expect(q.length).toBe(3);
    expect(q.shift()).toBe(2);
    q.clear();
    expect(q.shift()).toBeUndefined();
  });
});
