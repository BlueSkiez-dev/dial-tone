import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  type CpuReport,
  cpuFlagFromSearch,
  createCpuProbe,
  formatCpuReport,
  heapBytesOf,
  percentile,
} from "./cpu-probe";

describe("percentile", () => {
  it("uses nearest rank", () => {
    const v = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(percentile(v, 50)).toBe(5);
    expect(percentile(v, 95)).toBe(10);
    expect(percentile([], 50)).toBe(0);
  });
});

describe("createCpuProbe", () => {
  it("reports median, p95, max, over-budget and dropped chunks", () => {
    const probe = createCpuProbe({ periodMs: 10 });
    for (let i = 1; i <= 20; i++) {
      probe.record({ totalMs: i, resampleMs: i / 10 });
    }
    probe.noteOverrun(3);
    const s = probe.stats();
    expect(s.chunks).toBe(20);
    expect(s.medianMs).toBe(10);
    expect(s.p95Ms).toBe(19);
    expect(s.maxMs).toBe(20);
    expect(s.overBudget).toBe(10);
    expect(s.droppedChunks).toBe(3);
    expect(s.resampleMedianMs).toBeCloseTo(1);
  });

  it("keeps only the newest samples in the window but counts all chunks", () => {
    const probe = createCpuProbe({ periodMs: 100, capacity: 4 });
    for (const t of [90, 90, 90, 90, 1, 1, 1, 1]) {
      probe.record({ totalMs: t, resampleMs: 0 });
    }
    const s = probe.stats();
    expect(s.chunks).toBe(8);
    expect(s.maxMs).toBe(1);
  });

  it("orders median <= p95 <= max for any samples", () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: 0, max: 1000, noNaN: true }), {
          minLength: 1,
          maxLength: 200,
        }),
        (times) => {
          const probe = createCpuProbe({ periodMs: 21.3, capacity: 64 });
          for (const t of times) probe.record({ totalMs: t, resampleMs: 0 });
          const s = probe.stats();
          expect(s.medianMs).toBeLessThanOrEqual(s.p95Ms);
          expect(s.p95Ms).toBeLessThanOrEqual(s.maxMs);
          expect(s.chunks).toBe(times.length);
        },
      ),
    );
  });
});

describe("flag and helpers", () => {
  it("is on only for cpu=1", () => {
    expect(cpuFlagFromSearch("?cpu=1")).toBe(true);
    expect(cpuFlagFromSearch("cpu=1&x=2")).toBe(true);
    expect(cpuFlagFromSearch("")).toBe(false);
    expect(cpuFlagFromSearch("?cpu=0")).toBe(false);
    expect(cpuFlagFromSearch("?cpu=true")).toBe(false);
  });

  it("reads a heap size by duck typing and gives null otherwise", () => {
    expect(heapBytesOf({ HEAP8: new Int8Array(16) })).toBe(16);
    expect(heapBytesOf({})).toBeNull();
    expect(heapBytesOf(null)).toBeNull();
  });

  it("formats a report with every measured field", () => {
    const report: CpuReport = {
      chunks: 100,
      medianMs: 2,
      p95Ms: 4,
      maxMs: 6,
      resampleMedianMs: 0.1,
      resampleP95Ms: 0.2,
      periodMs: 21.33,
      overBudget: 0,
      droppedChunks: 0,
      contextRate: 48000,
      rxScope: "all",
      decoders: 4,
      decoderHits: [1, 1, 0, 1],
      startupMs: 350,
      heapBytes: [88 * 1048576, null],
    };
    const text = formatCpuReport(report);
    expect(text).toContain("decoders 4");
    expect(text).toContain("busy p95 4.00 ms");
    expect(text).toContain("decoderHits [1, 1, 0, 1]");
    expect(text).toContain("heap decode 88.0 MB, encode n/a");
  });
});
