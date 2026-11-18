import { describe, expect, it } from "vitest";
import {
  bandPower,
  CARRIER_OFF_CHUNKS,
  CARRIER_ON_CHUNKS,
  createCarrierBank,
  createCarrierDetector,
  MAX_CARRIER_MS,
  powerSpectrum,
} from "./carrier";
import { CHUNK_SAMPLES } from "./constants";
import { PROFILES } from "./profiles";

const SAMPLE_RATE = 48_000;
const NOISE_AMP = 0.01;
const TONE_AMP = 0.3;
const PRE_ROLL = 10;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One chunk: optional sine at toneHz plus seeded uniform noise. `start` keeps the phase continuous. */
function chunk(
  rng: () => number,
  start: number,
  toneHz: number | null,
): Float32Array {
  const out = new Float32Array(CHUNK_SAMPLES);
  for (let i = 0; i < CHUNK_SAMPLES; i++) {
    let v = (rng() * 2 - 1) * NOISE_AMP;
    if (toneHz !== null) {
      v +=
        TONE_AMP * Math.sin((2 * Math.PI * toneHz * (start + i)) / SAMPLE_RATE);
    }
    out[i] = v;
  }
  return out;
}

describe("bandPower", () => {
  it("is much higher for a tone inside the band than for one outside", () => {
    const band = PROFILES.call.carrierBandHz;
    expect(band).not.toBeNull();
    if (band === null) return;
    const rng = mulberry32(1);
    const inBand = powerSpectrum(chunk(rng, 0, 2000));
    const outBand = powerSpectrum(chunk(rng, 0, 5000));
    const pIn = bandPower(inBand, SAMPLE_RATE, band);
    const pOut = bandPower(outBand, SAMPLE_RATE, band);
    expect(pIn).toBeGreaterThan(pOut * 1000);
  });
});

describe("createCarrierDetector", () => {
  const band = PROFILES.call.carrierBandHz;
  if (band === null) throw new Error("call band must be measured");

  it("turns on after 2 loud chunks and off after 6 quiet chunks", () => {
    const rng = mulberry32(2);
    const det = createCarrierDetector({ sampleRate: SAMPLE_RATE, band });
    let frame = 0;
    const feed = (toneHz: number | null) => {
      const r = det.update(powerSpectrum(chunk(rng, frame, toneHz)), frame);
      frame += CHUNK_SAMPLES;
      return r;
    };
    for (let i = 0; i < PRE_ROLL; i++) expect(feed(null)).toBeNull();
    for (let i = 1; i < CARRIER_ON_CHUNKS; i++) expect(feed(2000)).toBeNull();
    expect(feed(2000)).toBe(true);
    for (let i = 1; i < CARRIER_OFF_CHUNKS; i++) expect(feed(null)).toBeNull();
    expect(feed(null)).toBe(false);
  });

  it("re-baselines a constant 25 s tone and reports inactive at 20,000 ms", () => {
    const rng = mulberry32(3);
    const noise = powerSpectrum(chunk(rng, 0, null));
    const tone = powerSpectrum(chunk(rng, 0, 2000));
    const det = createCarrierDetector({ sampleRate: SAMPLE_RATE, band });
    let i = 0;
    for (; i < PRE_ROLL; i++) det.update(noise, i * CHUNK_SAMPLES);
    const chunks25s = Math.ceil((25_000 * SAMPLE_RATE) / 1000 / CHUNK_SAMPLES);
    let onAt = -1;
    let offAt = -1;
    let extraOn = 0;
    for (; i < PRE_ROLL + chunks25s; i++) {
      const r = det.update(tone, i * CHUNK_SAMPLES);
      if (r === true) {
        if (onAt < 0) onAt = i;
        else extraOn++;
      }
      if (r === false && offAt < 0) offAt = i;
    }
    expect(onAt).toBe(PRE_ROLL + CARRIER_ON_CHUNKS - 1);
    expect(offAt).toBeGreaterThan(onAt);
    const elapsedMs = ((offAt - onAt) * CHUNK_SAMPLES * 1000) / SAMPLE_RATE;
    // Inactive on the first chunk past 20,000 ms, within one chunk of it.
    expect(elapsedMs).toBeGreaterThan(MAX_CARRIER_MS);
    expect(elapsedMs).toBeLessThanOrEqual(
      MAX_CARRIER_MS + (CHUNK_SAMPLES * 1000) / SAMPLE_RATE,
    );
    // The constant tone becomes the new floor, so the light does not come back on.
    expect(extraOn).toBe(0);
  });
});

describe("createCarrierBank", () => {
  it("creates no Quiet detector when the Quiet band is null", () => {
    const profiles = {
      ...PROFILES,
      quiet: { ...PROFILES.quiet, carrierBandHz: null },
    };
    const bank = createCarrierBank(SAMPLE_RATE, profiles);
    const rng = mulberry32(4);
    const seen = new Set<string>();
    let frame = 0;
    const run = (toneHz: number | null, n: number) => {
      for (let i = 0; i < n; i++) {
        for (const c of bank.update(chunk(rng, frame, toneHz), frame)) {
          seen.add(c.profile);
        }
        frame += CHUNK_SAMPLES;
      }
    };
    run(null, PRE_ROLL);
    run(20_000, 4);
    run(null, 10);
    expect(seen.has("quiet")).toBe(false);
  });

  it("a burst in the Room and Call overlap can change both detectors, each change naming its band", () => {
    const bank = createCarrierBank(SAMPLE_RATE, PROFILES);
    const rng = mulberry32(5);
    const changes: { profile: string; active: boolean }[] = [];
    let frame = 0;
    const run = (toneHz: number | null, n: number) => {
      for (let i = 0; i < n; i++) {
        changes.push(...bank.update(chunk(rng, frame, toneHz), frame));
        frame += CHUNK_SAMPLES;
      }
    };
    run(null, PRE_ROLL);
    run(2200, 4);
    expect(changes).toHaveLength(2);
    expect(changes.map((c) => c.profile).sort()).toEqual(["call", "room"]);
    expect(changes.every((c) => c.active)).toBe(true);
    run(null, 10);
    expect(changes).toHaveLength(4);
    expect(
      changes
        .slice(2)
        .map((c) => c.profile)
        .sort(),
    ).toEqual(["call", "room"]);
    expect(changes.slice(2).every((c) => !c.active)).toBe(true);
  });
});
