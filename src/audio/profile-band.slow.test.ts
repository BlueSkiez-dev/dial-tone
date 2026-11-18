import { createRequire } from "node:module";
import { beforeAll, describe, expect, it } from "vitest";
import { GGWAVE_MAX_PAYLOAD } from "../protocol";
import { powerSpectrum } from "./carrier";
import { createGgwaveModem, type GgwaveFactoryResult } from "./ggwave-modem";
import type { Modem } from "./modem";
import {
  type ChannelProfile,
  PROFILES,
  type ProfileId,
  protocolFor,
} from "./profiles";

// Slow test: runs the vendored ggwave 0.4.0 WASM modem in Node.
// Measures where each profile's transmitted energy really sits, so carrierBandHz is a measurement.
// Requirements 8.8, 1.6.

const SAMPLE_RATE = 48_000;
const NYQUIST_44K1_HZ = 22_050;
const PAYLOADS_PER_PROFILE = 20;
const MIN_SHARE_IN_BAND = 0.9;
const CENTRAL_SHARE = 0.95;
/** Analysis frame. Fixed so every frame has the same bin width (SAMPLE_RATE / FRAME bins). */
const FRAME = 4096;
/** Samples below this fraction of the peak count as silence padding at the ends. */
const SILENCE_FRACTION = 0.01;
const SEED = 0x5eed_0831;

/** mulberry32: small seeded PRNG, so a failing run can be replayed. */
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomPayload(rng: () => number, length: number): Uint8Array {
  const out = new Uint8Array(length);
  for (let i = 0; i < length; i++) out[i] = Math.floor(rng() * 256);
  return out;
}

/** Payload lengths: both ends of the range first, then random lengths 1..140. */
function payloadLengths(rng: () => number): number[] {
  const lengths = [1, GGWAVE_MAX_PAYLOAD];
  while (lengths.length < PAYLOADS_PER_PROFILE) {
    lengths.push(1 + Math.floor(rng() * GGWAVE_MAX_PAYLOAD));
  }
  return lengths;
}

/** Drops the leading and trailing silence padding. */
function trimSilence(samples: Float32Array): Float32Array {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    peak = Math.max(peak, Math.abs(samples[i] as number));
  }
  const floor = peak * SILENCE_FRACTION;
  let start = 0;
  while (start < samples.length && Math.abs(samples[start] as number) < floor) {
    start++;
  }
  let end = samples.length;
  while (end > start && Math.abs(samples[end - 1] as number) < floor) end--;
  return samples.subarray(start, end);
}

/** Sum of Hann-windowed power spectra of full FRAME-sample frames. Length FRAME / 2 + 1. */
function energySpectrum(samples: Float32Array): Float64Array {
  const total = new Float64Array(FRAME / 2 + 1);
  for (let start = 0; start + FRAME <= samples.length; start += FRAME) {
    const spectrum = powerSpectrum(samples.subarray(start, start + FRAME));
    for (let k = 0; k < total.length; k++) {
      total[k] = (total[k] as number) + (spectrum[k] as number);
    }
  }
  return total;
}

const BIN_HZ = SAMPLE_RATE / FRAME;

function sum(spectrum: Float64Array): number {
  let s = 0;
  for (let k = 0; k < spectrum.length; k++) s += spectrum[k] as number;
  return s;
}

/** Share of the energy in bins whose centre lies inside the inclusive band. */
function shareInBand(
  spectrum: Float64Array,
  band: readonly [number, number],
): number {
  const total = sum(spectrum);
  if (total === 0) return 0;
  const lo = Math.max(0, Math.ceil(band[0] / BIN_HZ));
  const hi = Math.min(spectrum.length - 1, Math.floor(band[1] / BIN_HZ));
  let inside = 0;
  for (let k = lo; k <= hi; k++) inside += spectrum[k] as number;
  return inside / total;
}

/** Frequency range holding the central `share` of the energy, rounded outward to 100 Hz. */
function centralRange(
  spectrum: Float64Array,
  share: number,
): readonly [number, number] {
  const total = sum(spectrum);
  const tail = ((1 - share) / 2) * total;
  let acc = 0;
  let lowBin = 0;
  for (let k = 0; k < spectrum.length; k++) {
    acc += spectrum[k] as number;
    if (acc > tail) {
      lowBin = k;
      break;
    }
  }
  acc = 0;
  let highBin = spectrum.length - 1;
  for (let k = spectrum.length - 1; k >= 0; k--) {
    acc += spectrum[k] as number;
    if (acc > tail) {
      highBin = k;
      break;
    }
  }
  return [
    Math.floor((lowBin * BIN_HZ) / 100) * 100,
    Math.ceil((highBin * BIN_HZ) / 100) * 100,
  ];
}

let modem: Modem;

beforeAll(async () => {
  const factory = createRequire(import.meta.url)(
    "../../vendor/ggwave.js",
  ) as () => Promise<GgwaveFactoryResult>;
  modem = await createGgwaveModem(factory, {
    txSampleRate: SAMPLE_RATE,
  });
});

interface Measurement {
  /** Energy spectrum summed over all payloads. */
  aggregate: Float64Array;
  /** Share inside the band per payload, or empty when the band is null. */
  shares: number[];
}

function measure(profile: ChannelProfile): Measurement {
  // One seeded stream per profile keeps each profile's payloads independent of run order.
  const rng = makeRng(
    SEED ^ profile.id.length ^ (profile.id.charCodeAt(0) << 8),
  );
  const protocol = protocolFor(profile, 0);
  const aggregate = new Float64Array(FRAME / 2 + 1);
  const shares: number[] = [];
  for (const length of payloadLengths(rng)) {
    const payload = randomPayload(rng, length);
    const tx = trimSilence(modem.modulate(payload, protocol, profile.volume));
    const spectrum = energySpectrum(tx);
    for (let k = 0; k < aggregate.length; k++) {
      aggregate[k] = (aggregate[k] as number) + (spectrum[k] as number);
    }
    if (profile.carrierBandHz !== null) {
      shares.push(shareInBand(spectrum, profile.carrierBandHz));
    }
  }
  return { aggregate, shares };
}

const PROFILE_IDS: readonly ProfileId[] = ["room", "call", "quiet"];

describe("carrier band measurement (slow, real ggwave)", () => {
  for (const id of PROFILE_IDS) {
    it(`${id}: at least 90% of the energy lies inside carrierBandHz`, () => {
      const profile = PROFILES[id];
      const { aggregate, shares } = measure(profile);
      const range = centralRange(aggregate, CENTRAL_SHARE);
      const band = profile.carrierBandHz;

      expect(band).not.toBeNull();
      if (band === null) return;

      const min = Math.min(...shares);
      const mean = shares.reduce((a, b) => a + b, 0) / shares.length;
      const ok = min >= MIN_SHARE_IN_BAND;
      const message =
        `[profile-band] ${id}: band [${band[0]}, ${band[1]}] Hz, ` +
        `share in band min ${(min * 100).toFixed(2)}%, mean ${(mean * 100).toFixed(2)}%. ` +
        `Central ${CENTRAL_SHARE * 100}% range: [${range[0]}, ${range[1]}] Hz (seed ${SEED}).`;
      if (ok) console.log(message);
      else console.error(`FAILED ${message}`);
      expect(min).toBeGreaterThanOrEqual(MIN_SHARE_IN_BAND);
    }, 120_000);
  }

  it("every non-null band lies below 22,050 Hz and is well formed", () => {
    for (const id of PROFILE_IDS) {
      const band = PROFILES[id].carrierBandHz;
      if (band === null) continue;
      expect(band[0]).toBeGreaterThanOrEqual(0);
      expect(band[0]).toBeLessThan(band[1]);
      expect(band[1]).toBeLessThan(NYQUIST_44K1_HZ);
    }
  });
});
