import fc from "fast-check";
import { describe, it } from "vitest";
import {
  CHUNK_SAMPLES,
  createPhaseChunker,
  DECODER_OFFSETS,
} from "./phase-chunker";

const cfg = { verbose: true, numRuns: 300 };
const offsetArb = fc.constantFrom(...DECODER_OFFSETS);
const sizesArb = fc.array(fc.integer({ min: 1, max: 3000 }), {
  minLength: 1,
  maxLength: 40,
});

/** Stream where sample i has value i, so a block's first value is its start frame. */
function ramp(n: number): Float32Array {
  return Float32Array.from({ length: n }, (_, i) => i);
}

/** Cut [from, to) into pieces using the sizes cyclically. */
function partition(
  from: number,
  to: number,
  sizes: number[],
): [number, number][] {
  const out: [number, number][] = [];
  let pos = from;
  let i = 0;
  while (pos < to) {
    const size = sizes[i % sizes.length] ?? 1;
    const end = Math.min(to, pos + size);
    out.push([pos, end]);
    pos = end;
    i++;
  }
  return out;
}

describe("phase chunker properties", () => {
  // Feature: audio-transport, Property 1: phase chunker
  it("output is stream.slice(offset) cut to whole blocks, each aligned to the offset", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 8192 }),
        sizesArb,
        offsetArb,
        (length, sizes, offset) => {
          const stream = ramp(length);
          const c = createPhaseChunker(offset);
          const blocks: Float32Array[] = [];
          for (const [a, b] of partition(0, length, sizes)) {
            blocks.push(...c.push(a, stream.slice(a, b)));
          }
          const usable = Math.max(0, length - offset);
          const expectedLen =
            Math.floor(usable / CHUNK_SAMPLES) * CHUNK_SAMPLES;
          const expected = stream.slice(offset, offset + expectedLen);
          const joined = new Float32Array(blocks.length * CHUNK_SAMPLES);
          blocks.forEach((blk, i) => {
            joined.set(blk, i * CHUNK_SAMPLES);
          });
          if (blocks.some((blk) => blk.length !== CHUNK_SAMPLES)) return false;
          if (joined.length !== expected.length) return false;
          for (let i = 0; i < expected.length; i++) {
            if (joined[i] !== expected[i]) return false;
          }
          // A block's first value equals its start frame.
          return blocks.every(
            (blk) => (blk[0] ?? -1) % CHUNK_SAMPLES === offset,
          );
        },
      ),
      cfg,
    );
  });

  it("after reset at a random frame the next block is aligned to the offset", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 8192 }),
        fc.nat({ max: 8192 }),
        sizesArb,
        offsetArb,
        (length, resetRaw, sizes, offset) => {
          const resetAt = Math.min(resetRaw, length);
          const stream = ramp(length);
          const c = createPhaseChunker(offset);
          for (const [a, b] of partition(0, resetAt, sizes)) {
            c.push(a, stream.slice(a, b));
          }
          c.reset();
          const after: Float32Array[] = [];
          for (const [a, b] of partition(resetAt, length, sizes)) {
            after.push(...c.push(a, stream.slice(a, b)));
          }
          const first = after[0];
          if (first === undefined) return true;
          return (
            (first[0] ?? -1) % CHUNK_SAMPLES === offset &&
            (first[0] ?? -1) >= resetAt
          );
        },
      ),
      cfg,
    );
  });
});
