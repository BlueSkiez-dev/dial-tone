/**
 * Carrier detection: "there is energy in the band of profile P", without decoding.
 * One Hann-windowed FFT per chunk is shared by one detector per profile band.
 * Time is the stream frame only. Pure module: no browser global.
 */
import type { ChannelProfile, ProfileId } from "./profiles";

/** Power ratio against the floor to switch on (9 dB). Design parameter. */
export const CARRIER_ON_RATIO = 8;
/** Power ratio below which a chunk counts as quiet while active (6 dB). Design parameter. */
export const CARRIER_OFF_RATIO = 4;
/** Consecutive loud chunks to switch on. Design parameter. */
export const CARRIER_ON_CHUNKS = 2;
/** Consecutive quiet chunks to switch off. Design parameter. */
export const CARRIER_OFF_CHUNKS = 6;
/** Chunks in the floor window (minimum over this many). Design parameter. */
export const FLOOR_WINDOW_CHUNKS = 96;
/** Longest the light stays on before the floor is re-baselined. Design parameter. */
export const MAX_CARRIER_MS = 20_000;
/** Guard against a zero floor, far below any microphone noise. */
const EPSILON = 1e-12;

export interface CarrierDetector {
  /** Feed one chunk's power spectrum. Returns a new state only when it changes, else null. */
  update(spectrum: Float32Array, atFrame: number): boolean | null;
  reset(): void;
}

export interface CarrierBank {
  update(
    samples: Float32Array,
    atFrame: number,
  ): { profile: ProfileId; active: boolean }[];
  reset(): void;
}

interface FftPlan {
  n: number;
  hann: Float64Array;
  cos: Float64Array;
  sin: Float64Array;
  rev: Uint32Array;
}

const plans = new Map<number, FftPlan>();

function getPlan(n: number): FftPlan {
  const cached = plans.get(n);
  if (cached) return cached;
  const hann = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
  }
  const cos = new Float64Array(n / 2);
  const sin = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) {
    cos[i] = Math.cos((2 * Math.PI * i) / n);
    sin[i] = -Math.sin((2 * Math.PI * i) / n);
  }
  const bits = Math.log2(n);
  const rev = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    let r = 0;
    for (let b = 0; b < bits; b++) if (i & (1 << b)) r |= 1 << (bits - 1 - b);
    rev[i] = r;
  }
  const plan = { n, hann, cos, sin, rev };
  plans.set(n, plan);
  return plan;
}

/**
 * Hann window plus radix-2 FFT. Input shorter than the next power of two is zero-padded.
 * Returns |X[k]|^2 for k = 0..n/2 (length n/2 + 1).
 */
export function powerSpectrum(samples: Float32Array): Float32Array {
  let n = 2;
  while (n < samples.length) n *= 2;
  const plan = getPlan(n);
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  const len = samples.length;
  for (let i = 0; i < len; i++) {
    // Hann over the real samples, evaluated on the padded grid so a full chunk is exact.
    re[plan.rev[i] as number] =
      (samples[i] as number) * (plan.hann[i] as number);
  }
  for (let size = 2; size <= n; size *= 2) {
    const half = size / 2;
    const step = n / size;
    for (let start = 0; start < n; start += size) {
      for (let j = 0; j < half; j++) {
        const c = plan.cos[j * step] as number;
        const s = plan.sin[j * step] as number;
        const a = start + j;
        const b = a + half;
        const tr = (re[b] as number) * c - (im[b] as number) * s;
        const ti = (re[b] as number) * s + (im[b] as number) * c;
        re[b] = (re[a] as number) - tr;
        im[b] = (im[a] as number) - ti;
        re[a] = (re[a] as number) + tr;
        im[a] = (im[a] as number) + ti;
      }
    }
  }
  const out = new Float32Array(n / 2 + 1);
  for (let k = 0; k <= n / 2; k++) {
    out[k] = (re[k] as number) ** 2 + (im[k] as number) ** 2;
  }
  return out;
}

/** Sum of the spectrum bins whose centre frequency lies in the inclusive band. */
export function bandPower(
  spectrum: Float32Array,
  sampleRate: number,
  band: readonly [number, number],
): number {
  if (spectrum.length < 2) return 0;
  const n = (spectrum.length - 1) * 2;
  const binHz = sampleRate / n;
  const lo = Math.max(0, Math.ceil(band[0] / binHz));
  const hi = Math.min(spectrum.length - 1, Math.floor(band[1] / binHz));
  let sum = 0;
  for (let k = lo; k <= hi; k++) sum += spectrum[k] as number;
  return sum;
}

export function createCarrierDetector(opts: {
  sampleRate: number;
  band: readonly [number, number];
}): CarrierDetector {
  const { sampleRate, band } = opts;
  const maxFrames = (MAX_CARRIER_MS * sampleRate) / 1000;
  const floorWindow = new Float64Array(FLOOR_WINDOW_CHUNKS);
  let floorCount = 0;
  let floorPos = 0;
  let active = false;
  let onCount = 0;
  let offCount = 0;
  let onSince = 0;

  const clearFloor = (): void => {
    floorCount = 0;
    floorPos = 0;
  };
  const pushFloor = (p: number): void => {
    floorWindow[floorPos] = p;
    floorPos = (floorPos + 1) % FLOOR_WINDOW_CHUNKS;
    if (floorCount < FLOOR_WINDOW_CHUNKS) floorCount++;
  };
  const minFloor = (): number => {
    let m = Number.POSITIVE_INFINITY;
    for (let i = 0; i < floorCount; i++) {
      const v = floorWindow[i] as number;
      if (v < m) m = v;
    }
    return m;
  };

  return {
    update(spectrum, atFrame) {
      const p = bandPower(spectrum, sampleRate, band);
      if (!active) pushFloor(p);
      const floor = Math.max(floorCount > 0 ? minFloor() : 0, EPSILON);
      const ratio = p / floor;
      if (!active) {
        onCount = ratio >= CARRIER_ON_RATIO ? onCount + 1 : 0;
        if (onCount >= CARRIER_ON_CHUNKS) {
          active = true;
          onSince = atFrame;
          offCount = 0;
          return true;
        }
      } else {
        offCount = ratio < CARRIER_OFF_RATIO ? offCount + 1 : 0;
        if (offCount >= CARRIER_OFF_CHUNKS || atFrame - onSince > maxFrames) {
          active = false;
          onCount = 0;
          clearFloor();
          return false;
        }
      }
      return null;
    },
    reset() {
      active = false;
      onCount = 0;
      offCount = 0;
      onSince = 0;
      clearFloor();
    },
  };
}

/** One detector per profile with a non-null band. One FFT per chunk, shared. */
export function createCarrierBank(
  sampleRate: number,
  profiles: Readonly<Record<ProfileId, ChannelProfile>>,
): CarrierBank {
  const detectors: { profile: ProfileId; detector: CarrierDetector }[] = [];
  for (const p of Object.values(profiles)) {
    if (p.carrierBandHz === null) continue;
    detectors.push({
      profile: p.id,
      detector: createCarrierDetector({ sampleRate, band: p.carrierBandHz }),
    });
  }
  return {
    update(samples, atFrame) {
      const changes: { profile: ProfileId; active: boolean }[] = [];
      if (detectors.length === 0) return changes;
      const spectrum = powerSpectrum(samples);
      for (const d of detectors) {
        const r = d.detector.update(spectrum, atFrame);
        if (r !== null) changes.push({ profile: d.profile, active: r });
      }
      return changes;
    },
    reset() {
      for (const d of detectors) d.detector.reset();
    },
  };
}
