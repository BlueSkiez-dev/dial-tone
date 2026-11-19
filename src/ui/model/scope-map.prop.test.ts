import fc from "fast-check";
import { describe, it } from "vitest";
import { PROFILES, type ProfileId } from "../../audio/index";
import { binRange, scopeWindow } from "./scope-map";

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
