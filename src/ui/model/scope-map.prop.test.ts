import fc from "fast-check";
import { describe, it } from "vitest";
import { PROFILES, type ProfileId } from "../../audio/index";
import { binRange, canvasBuffer, scopeWindow, warmUpFrame } from "./scope-map";

const ids = Object.keys(PROFILES) as ProfileId[];

describe("Property 9: Scope mapping", () => {
  /** **Validates: Requirements 9.2, 9.3** */
  it("binRange stays inside 0..fftSize/2-1 with lo <= hi", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ids),
        fc.integer({ min: 8000, max: 96000 }),
        fc.constantFrom(256, 512, 1024, 2048, 4096),
        (id, sampleRate, fftSize) => {
          const w = scopeWindow(id);
          const { lo, hi } = binRange(sampleRate, fftSize, w.loHz, w.hiHz);
          return (
            Number.isInteger(lo) &&
            Number.isInteger(hi) &&
            lo >= 0 &&
            lo <= hi &&
            hi < fftSize / 2
          );
        },
      ),
    );
  });

  /** **Validates: Requirements 9.2, 9.3** */
  it("every band lies inside its own window", () => {
    for (const id of ids) {
      const w = scopeWindow(id);
      const band = w.bandHz;
      if (band === null) continue;
      if (!(w.loHz <= band[0] && band[0] <= band[1] && band[1] <= w.hiHz)) {
        throw new Error(`band outside window for ${id}`);
      }
    }
  });
});

describe("Property 14: Warm-up frame", () => {
  const rows = (f: { top: number; bottom: number }) => f.bottom - f.top + 1;

  /** **Validates: Requirements 21.13** */
  it("is one region inside 0..height-1, one row at 0, full at 1, never shrinking", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 400 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (height, a, b) => {
          const [p, q] = a <= b ? [a, b] : [b, a];
          const f = warmUpFrame(p, height);
          const g = warmUpFrame(q, height);
          for (const r of [f, g]) {
            if (!(0 <= r.top && r.top <= r.bottom && r.bottom <= height - 1))
              return false;
            if (!(r.top <= r.centerRow && r.centerRow <= r.bottom))
              return false;
            if (r.halfHeight !== rows(r) / 2) return false;
          }
          return (
            rows(g) >= rows(f) &&
            rows(warmUpFrame(0, height)) === 1 &&
            rows(warmUpFrame(1, height)) === height
          );
        },
      ),
    );
  });
});

describe("Property 20: Fluid layout (canvasBuffer)", () => {
  /** **Validates: Requirements 22.8** */
  it("returns whole numbers of at least 1 equal to the rounded products", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 2000 }),
        fc.integer({ min: 1, max: 2000 }),
        fc.double({ min: 1, max: 4, noNaN: true }),
        (cssWidth, cssHeight, dpr) => {
          const b = canvasBuffer(cssWidth, cssHeight, dpr);
          return (
            Number.isInteger(b.width) &&
            Number.isInteger(b.height) &&
            b.width >= 1 &&
            b.height >= 1 &&
            b.width === Math.round(cssWidth * dpr) &&
            b.height === Math.round(cssHeight * dpr)
          );
        },
      ),
    );
  });
});
