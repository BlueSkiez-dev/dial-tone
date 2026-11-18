import fc from "fast-check";
import { describe, it } from "vitest";
import { createSiblingMerge, SIBLING_MERGE_FRAMES } from "./sibling-merge";

const payload = fc.uint8Array({ minLength: 1, maxLength: 140 });
const cfg = { verbose: true, numRuns: 200 };

describe("sibling merge properties", () => {
  // Feature: audio-transport, Property 4: sibling merge
  it("n distinct decoders in the window give exactly one true", () => {
    fc.assert(
      fc.property(
        payload,
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 1, max: 8 }),
        fc.array(fc.integer({ min: 0, max: SIBLING_MERGE_FRAMES }), {
          minLength: 8,
          maxLength: 8,
        }),
        (p, start, n, offsets) => {
          const m = createSiblingMerge(SIBLING_MERGE_FRAMES);
          const sorted = offsets.slice(0, n).sort((a, b) => a - b);
          let trues = 0;
          for (let d = 0; d < n; d++) {
            if (m.offer(d, p, start + (sorted[d] ?? 0))) trues++;
          }
          return trues === 1;
        },
      ),
      cfg,
    );
  });

  it("same payload after the window is emitted again", () => {
    fc.assert(
      fc.property(
        payload,
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 1, max: 100_000 }),
        (p, start, extra) => {
          const m = createSiblingMerge(SIBLING_MERGE_FRAMES);
          m.offer(0, p, start);
          return m.offer(1, p, start + SIBLING_MERGE_FRAMES + extra) === true;
        },
      ),
      cfg,
    );
  });

  it("different payloads are always emitted", () => {
    fc.assert(
      fc.property(payload, payload, fc.nat(1000), (a, b, d) => {
        fc.pre(a.length !== b.length || a.some((v, i) => v !== b[i]));
        const m = createSiblingMerge(SIBLING_MERGE_FRAMES);
        return m.offer(0, a, 0) === true && m.offer(1, b, d) === true;
      }),
      cfg,
    );
  });

  it("the same decoder twice is emitted twice", () => {
    fc.assert(
      fc.property(payload, fc.nat(8), fc.nat(1000), (p, dec, d) => {
        const m = createSiblingMerge(SIBLING_MERGE_FRAMES);
        return m.offer(dec, p, 0) === true && m.offer(dec, p, d) === true;
      }),
      cfg,
    );
  });
});
