import fc from "fast-check";
import { describe, it } from "vitest";
import { METER_OK_SEGMENTS, METER_SEGMENTS, meterView } from "./meter";

const params = fc
  .integer({ min: 1, max: 256 })
  .chain((limit) =>
    fc.tuple(fc.constant(limit), fc.integer({ min: 0, max: 4 * limit })),
  );

describe("Property 1: Byte meter", () => {
  /** **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6** */
  it("lit follows the ceil formula and is bounded", () => {
    fc.assert(
      fc.property(params, ([limit, bytes]) => {
        const v = meterView(bytes, limit);
        const expected =
          bytes === 0 ? 0 : Math.min(24, Math.ceil((bytes * 24) / limit));
        return (
          v.lit === expected && v.lit <= 24 && (bytes !== 0 || v.lit === 0)
        );
      }),
    );
  });

  it("lit is non-decreasing in bytes", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 256 }),
        fc.integer({ min: 0, max: 1000 }),
        fc.integer({ min: 0, max: 1000 }),
        (limit, a, b) => {
          const [lo, hi] = a <= b ? [a, b] : [b, a];
          return meterView(lo, limit).lit <= meterView(hi, limit).lit;
        },
      ),
    );
  });

  it("colours are positional when within the limit", () => {
    fc.assert(
      fc.property(params, ([limit, bytes]) => {
        fc.pre(bytes <= limit);
        const v = meterView(bytes, limit);
        if (v.over || v.segments.length !== METER_SEGMENTS) return false;
        const nonOff = v.segments.filter((c) => c !== "off").length;
        return (
          nonOff === v.lit &&
          v.segments.every((c, i) => {
            const n = i + 1;
            if (n > v.lit) return c === "off";
            return c === (n <= METER_OK_SEGMENTS ? "ok" : "warn");
          })
        );
      }),
    );
  });

  it("over the limit all segments are over; only four colour values exist", () => {
    fc.assert(
      fc.property(params, ([limit, bytes]) => {
        const v = meterView(bytes, limit);
        const allowed = new Set(["off", "ok", "warn", "over"]);
        if (!v.segments.every((c) => allowed.has(c))) return false;
        if (bytes > limit)
          return v.over && v.segments.every((c) => c === "over");
        return !v.over;
      }),
    );
  });
});
