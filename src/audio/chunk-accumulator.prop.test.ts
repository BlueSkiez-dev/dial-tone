import fc from "fast-check";
import { describe, it } from "vitest";
import { createChunkAccumulator } from "./chunk-accumulator";

const cfg = { verbose: true, numRuns: 300 };
const Q = 128;
const CHUNK = 1024;

type Out = { startFrame: number; samples: Float32Array };

describe("chunk accumulator properties", () => {
  it("Property 2: lossless for contiguous quanta", () => {
    /**
     * **Validates: Requirements 3.2, 3.3**
     */
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        (count, first) => {
          const acc = createChunkAccumulator(CHUNK);
          const input = Float32Array.from({ length: count * Q }, (_, i) => i);
          const chunks: Out[] = [];
          for (let q = 0; q < count; q++) {
            const out = acc.push(
              input.slice(q * Q, (q + 1) * Q),
              first + q * Q,
            );
            if (out) chunks.push(out);
          }
          const whole = Math.floor((count * Q) / CHUNK);
          if (chunks.length !== whole) throw new Error("chunk count");
          chunks.forEach((c, i) => {
            if (c.startFrame !== first + i * CHUNK)
              throw new Error("startFrame");
            if (c.samples.length !== CHUNK) throw new Error("length");
            for (let j = 0; j < CHUNK; j++) {
              if (c.samples[j] !== i * CHUNK + j) throw new Error("content");
            }
            for (let k = i + 1; k < chunks.length; k++) {
              if (chunks[k]?.samples.buffer === c.samples.buffer) {
                throw new Error("shared buffer");
              }
            }
          });
        },
      ),
      cfg,
    );
  });

  it("Property 2: no chunk spans a gap", () => {
    /**
     * **Validates: Requirements 3.2, 3.3**
     */
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 5 }), {
          minLength: 1,
          maxLength: 80,
        }),
        (jumps) => {
          const acc = createChunkAccumulator(CHUNK);
          // Each sample value is its own frame number, so a spanning chunk
          // would contain non-consecutive values.
          let frame = 0;
          for (const jump of jumps) {
            frame += jump * Q * 3; // jump 0 is contiguous, others leave a gap
            const q = Float32Array.from({ length: Q }, (_, i) => frame + i);
            const out = acc.push(q, frame);
            if (out) {
              for (let j = 0; j < CHUNK; j++) {
                if (out.samples[j] !== out.startFrame + j) {
                  throw new Error("chunk spans a gap");
                }
              }
            }
            frame += Q;
          }
        },
      ),
      cfg,
    );
  });
});
