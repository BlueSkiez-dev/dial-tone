/**
 * Streaming sample-rate converter (polyphase windowed-sinc). Pure module: no
 * browser globals, no imports. Used by the decode worker to bring capture at the
 * AudioContext rate to RX_SAMPLE_RATE (48,000 Hz). Linear interpolation is not
 * used because the Quiet band (15 to 19.4 kHz) sits close to a 22.05 kHz Nyquist.
 *
 * ## Contract (Property 17, Requirement 3.10)
 *
 * Let up/down be toRate/fromRate reduced by their gcd (44,100 to 48,000 gives
 * up = 160, down = 147). Input samples have absolute indices 0, 1, 2, ... counted
 * from construction or the last `reset()`. Samples before index 0 are zero.
 *
 * - Time alignment: output sample k is the signal evaluated at input time
 *   k × down / up (in input samples). Output 0 is input 0. The converter adds no
 *   signal delay, so Stream_Frame k lines up with Context_Frame k × fromRate / toRate.
 * - Availability lag: the filter is non-causal with half-width H = taps / 2 input
 *   samples, so output k can be produced only once input sample
 *   floor(k × down / up) + H has arrived.
 * - Exact output count: after n input frames in total (summed over all `process`
 *   calls, however they are split), the total number of output frames returned is
 *     outputCount(n) = 0                          if n <= H
 *                    = ceil((n - H) × up / down)  if n > H
 *   Equal rates: outputCount(n) = n and H = 0.
 *   The output samples are also identical for every partition of the input
 *   (same floating-point operations in the same order per output sample).
 * - `latencyFrames` is the availability lag in output frames, H × up / down (it may
 *   be fractional). The output stream trails the input by that much, so
 *   outputCount(n) is about n × up / down - latencyFrames. It is not a signal delay.
 * - Phase arithmetic is integer only (no accumulated floating-point time), so
 *   there is no drift however long the stream runs.
 * - Gain: each phase's coefficients sum to 1, so DC and in-band sines keep their
 *   amplitude (apart from the filter's pass-band ripple and roll-off near the cutoff).
 * - `process` never throws on data and always returns a fresh buffer that the caller
 *   owns (it may be transferred). An empty input gives an empty output.
 * - Construction throws RangeError for a rate that is not a positive integer, or when
 *   the reduced ratio needs more than MAX_PHASES phases.
 */

/** Taps per phase for a rate ratio of 1 or more (upsampling or near 1:1). Even. */
export const TAPS_PER_PHASE = 32;

/** Kaiser window beta (about 50 dB side-lobe attenuation). */
export const KAISER_BETA = 5;

/**
 * Cutoff as a fraction of the lower of the two Nyquist frequencies. At 0.98 the
 * -6 dB point is 21.6 kHz for 44.1 to 48 kHz, so 19.4 kHz stays in the pass band.
 */
export const CUTOFF_OF_LOWER_NYQUIST = 0.98;

/** Largest reduced `up` accepted (bounds the coefficient table to a few MB). */
export const MAX_PHASES = 4096;

export interface Resampler {
  /**
   * Streaming. Returns the output samples that the input so far completes
   * (see the contract above for the exact count). Returns a new array.
   */
  process(samples: Float32Array): Float32Array;
  /** Forget filter history and the phase. The next input is index 0 again. */
  reset(): void;
  /** Availability lag in output frames (H × up / down). 0 when the rates are equal. */
  readonly latencyFrames: number;
}

function gcd(a: number, b: number): number {
  let x = a;
  let y = b;
  while (y !== 0) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

/** Modified Bessel function of the first kind, order 0 (power series). */
function besselI0(x: number): number {
  const q = (x * x) / 4;
  let term = 1;
  let sum = 1;
  for (let k = 1; k < 64; k++) {
    term *= q / (k * k);
    sum += term;
    if (term < sum * 1e-17) break;
  }
  return sum;
}

function sinc(x: number): number {
  if (x === 0) return 1;
  const px = Math.PI * x;
  return Math.sin(px) / px;
}

function checkRate(name: string, rate: number): void {
  if (!Number.isInteger(rate) || rate <= 0) {
    throw new RangeError(`${name} must be a positive integer, got ${rate}`);
  }
}

export function createResampler(fromRate: number, toRate: number): Resampler {
  checkRate("fromRate", fromRate);
  checkRate("toRate", toRate);

  if (fromRate === toRate) {
    return {
      process: (samples) => samples.slice(),
      reset: () => {},
      latencyFrames: 0,
    };
  }

  const g = gcd(fromRate, toRate);
  const up = toRate / g;
  const down = fromRate / g;
  if (up > MAX_PHASES) {
    throw new RangeError(
      `rate ratio ${fromRate}:${toRate} needs ${up} phases (max ${MAX_PHASES})`,
    );
  }

  // Downsampling lowers the cutoff, so the kernel is widened to keep selectivity.
  const taps = TAPS_PER_PHASE * Math.max(1, Math.ceil(fromRate / toRate));
  const half = taps / 2;
  // Cutoff in cycles per input sample (0.5 is the input Nyquist).
  const cutoff = 0.5 * CUTOFF_OF_LOWER_NYQUIST * Math.min(1, toRate / fromRate);
  const i0Beta = besselI0(KAISER_BETA);

  // Table: phase p, tap i multiplies input index n0 - half + 1 + i, where the
  // output time is n0 + p / up. Kernel argument tau = p / up + half - 1 - i.
  const table = new Float64Array(up * taps);
  for (let p = 0; p < up; p++) {
    const row = p * taps;
    let sum = 0;
    for (let i = 0; i < taps; i++) {
      const tau = p / up + half - 1 - i;
      const x = tau / half;
      const w =
        Math.abs(x) >= 1
          ? 0
          : besselI0(KAISER_BETA * Math.sqrt(1 - x * x)) / i0Beta;
      const c = 2 * cutoff * sinc(2 * cutoff * tau) * w;
      table[row + i] = c;
      sum += c;
    }
    if (sum !== 0) {
      for (let i = 0; i < taps; i++)
        table[row + i] = (table[row + i] ?? 0) / sum;
    }
  }

  // State. `total` counts input samples seen; (n0, phase) is the next output's
  // position: input time n0 + phase / up. History holds the last taps - 1 inputs.
  let history = new Float32Array(taps - 1);
  let total = 0;
  let n0 = 0;
  let phase = 0;

  function process(samples: Float32Array): Float32Array {
    const len = samples.length;
    if (len === 0) return new Float32Array(0);

    const histLen = taps - 1;
    const combined = new Float32Array(histLen + len);
    combined.set(history, 0);
    combined.set(samples, histLen);
    const base = total - histLen; // absolute index of combined[0]
    total += len;

    const maxOut = Math.ceil((len * up) / down) + 1;
    const out = new Float32Array(maxOut);
    let count = 0;

    while (n0 + half <= total - 1 && count < maxOut) {
      const start = n0 - half + 1 - base;
      const row = phase * taps;
      let acc = 0;
      for (let i = 0; i < taps; i++) {
        acc += (combined[start + i] ?? 0) * (table[row + i] ?? 0);
      }
      out[count++] = acc;
      phase += down;
      n0 += Math.floor(phase / up);
      phase %= up;
    }

    history = combined.slice(len);
    return out.slice(0, count);
  }

  function reset(): void {
    history = new Float32Array(taps - 1);
    total = 0;
    n0 = 0;
    phase = 0;
  }

  return { process, reset, latencyFrames: (half * up) / down };
}
