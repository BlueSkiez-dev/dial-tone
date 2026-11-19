import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  airtimeKey,
  createEmitter,
  dropWhileDeaf,
  sanitizeAttempt,
  sendSchedule,
} from "./transport-math";

describe("transport math", () => {
  it("sanitizes attempts: negatives and non-integers count as 0", () => {
    expect(sanitizeAttempt(-1)).toBe(0);
    expect(sanitizeAttempt(1.5)).toBe(0);
    expect(sanitizeAttempt(Number.NaN)).toBe(0);
    expect(sanitizeAttempt(3)).toBe(3);
    fc.assert(
      fc.property(fc.anything(), (x) => sanitizeAttempt(x) >= 0),
      { numRuns: 100 },
    );
  });

  it("schedules start 100 ms ahead and a 600 ms tail", () => {
    const s = sendSchedule(2, 48000, 4800);
    expect(s.when).toBeCloseTo(2.1);
    expect(s.startFrame).toBe(100800);
    expect(s.endFrame).toBe(105600);
    expect(s.tailFrames).toBe(28800);
  });

  it("keys airtime by speed class, not by attempt number", () => {
    expect(airtimeKey("room", 1, 10)).toBe(airtimeKey("room", 5, 10));
    expect(airtimeKey("room", 0, 10)).not.toBe(airtimeKey("room", 1, 10));
  });

  it("drops only receive events while not listening", () => {
    expect(dropWhileDeaf("frame", false)).toBe(true);
    expect(dropWhileDeaf("tx", false)).toBe(false);
    expect(dropWhileDeaf("frame", true)).toBe(false);
  });

  it("keeps delivering when a listener throws", () => {
    const bus = createEmitter<number>();
    const seen: number[] = [];
    bus.subscribe(() => {
      throw new Error("bad");
    });
    bus.subscribe((n) => seen.push(n));
    bus.emit(1);
    expect(seen).toEqual([1]);
  });
});
