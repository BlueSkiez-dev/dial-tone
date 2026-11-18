import fc from "fast-check";
import { describe, it } from "vitest";
import { createResampler, TAPS_PER_PHASE } from "./resampler";

// Feature: audio-transport, Property 17: Resampler

/**
 * DESIGN PARAMETER (not a derived value). RMS error of the resampled sine against
 * the ideal sine at the output times, relative to the signal RMS, in dB.
 * Starting point: -30 dB. If a run fails this, report the measured value and the
 * seed; do not loosen it silently.
 */
const TOLERANCE_DB = -30;

/** DESIGN PARAMETER. Allowed output/input RMS ratio deviation, in dB. */
const AMPLITUDE_TOLERANCE_DB = 0.5;

/** Output samples skipped at each end of the sine comparison. */
const EDGE_SKIP = 64;

const NUM_RUNS = 25;

/** Half-width H in input samples, as in the resampler contract. */
function halfWidth(from: number, to: number): number {
  if (from === to) return 0;
  return (TAPS_PER_PHASE * Math.max(1, Math.ceil(from / to))) / 2;
}

function outputCount(n: number, from: number, to: number): number {
  if (from === to) return n;
  const h = halfWidth(from, to);
  if (n <= h) return 0;
  // Reduced up/down.
  let a = from;
  let b = to;
  while (b !== 0) [a, b] = [b, a % b];
  const up = to / a;
  const down = from / a;
  return Math.ceil(((n - h) * up) / down);
}

const ratePairs = fc.constantFrom<[number, number]>(
  [44100, 48000],
  [48000, 44100],
  [48000, 48000],
  [44100, 44100],
);

const signal = fc
  .array(fc.integer({ min: -32768, max: 32767 }), { maxLength: 8192 })
  .map((a) => Float32Array.from(a, (v) => v / 32768));

/** Splits [0, n) into consecutive call sizes (zero-length calls included). */
function partition(n: number, cuts: number[]): number[] {
  const sizes: number[] = [];
  let left = n;
  for (const c of cuts) {
    const s = Math.min(c, left);
    sizes.push(s);
    left -= s;
  }
  if (left > 0) sizes.push(left);
  return sizes;
}

describe("Property 17: Resampler", () => {
  it("(a) any partition into calls gives identical output and the exact length", () => {
    // **Validates: Requirements 3.10**
    fc.assert(
      fc.property(
        ratePairs,
        signal,
        fc.array(fc.integer({ min: 0, max: 2500 }), { maxLength: 40 }),
        ([from, to], input, cuts) => {
          const whole = createResampler(from, to).process(input);
          const r = createResampler(from, to);
          const parts: Float32Array[] = [];
          let off = 0;
          for (const size of partition(input.length, cuts)) {
            parts.push(r.process(input.subarray(off, off + size)));
            off += size;
          }
          const total = parts.reduce((s, p) => s + p.length, 0);
          if (total !== outputCount(input.length, from, to)) return false;
          if (whole.length !== total) return false;
          const joined = new Float32Array(total);
          let at = 0;
          for (const p of parts) {
            joined.set(p, at);
            at += p.length;
          }
          for (let i = 0; i < total; i++) {
            if (!Object.is(joined[i], whole[i])) return false;
          }
          return true;
        },
      ),
      { numRuns: NUM_RUNS, verbose: true },
    );
  });

  it("(b) equal rates give output equal to the input", () => {
    // **Validates: Requirements 3.10**
    fc.assert(
      fc.property(fc.constantFrom(44100, 48000), signal, (rate, input) => {
        const out = createResampler(rate, rate).process(input);
        if (out.length !== input.length) return false;
        for (let i = 0; i < input.length; i++) {
          if (!Object.is(out[i], input[i])) return false;
        }
        return true;
      }),
      { numRuns: NUM_RUNS, verbose: true },
    );
  });

  it("(c) sines from 100 Hz to 19,400 Hz stay within tolerance and amplitude", () => {
    // **Validates: Requirements 3.10**
    const N = 4096;
    fc.assert(
      fc.property(
        fc.constantFrom(44100, 44800, 46000, 47000),
        fc.double({ min: 100, max: 19400, noNaN: true }),
        fc.double({ min: 0, max: 2 * Math.PI, noNaN: true }),
        (from, freq, phase) => {
          const to = 48000;
          const input = new Float32Array(N);
          for (let i = 0; i < N; i++) {
            input[i] = Math.fround(
              0.5 * Math.sin((2 * Math.PI * freq * i) / from + phase),
            );
          }
          const out = createResampler(from, to).process(input);

          // Output k is the signal at input time k * from_over_to; in seconds
          // that is k / to, so the ideal value is 0.5 sin(2 pi f k / to + phase).
          const lo = EDGE_SKIP;
          const hi = out.length - EDGE_SKIP;
          if (hi <= lo) return false;
          let errSq = 0;
          let idealSq = 0;
          let outSq = 0;
          for (let k = lo; k < hi; k++) {
            const v = 0.5 * Math.sin((2 * Math.PI * freq * k) / to + phase);
            const e = (out[k] ?? 0) - v;
            errSq += e * e;
            idealSq += v * v;
            outSq += (out[k] ?? 0) ** 2;
          }
          const count = hi - lo;
          const signalRms = Math.sqrt(idealSq / count);
          const errorDb = 20 * Math.log10(Math.sqrt(errSq / count) / signalRms);
          // Amplitude: output RMS over input RMS, both over the same time span
          // (the ideal sine on the trimmed window), so partial cycles at low
          // frequencies do not bias the ratio.
          const ratioDb = 20 * Math.log10(Math.sqrt(outSq / count) / signalRms);
          if (errorDb > TOLERANCE_DB) {
            console.log(
              `P17c tolerance miss: f=${freq} from=${from} errorDb=${errorDb.toFixed(2)} limit=${TOLERANCE_DB}`,
            );
            return false;
          }
          if (Math.abs(ratioDb) > AMPLITUDE_TOLERANCE_DB) {
            console.log(
              `P17c amplitude miss: f=${freq} from=${from} ratioDb=${ratioDb.toFixed(3)} limit=±${AMPLITUDE_TOLERANCE_DB}`,
            );
            return false;
          }
          return true;
        },
      ),
      { numRuns: NUM_RUNS, verbose: true },
    );
  });
});
