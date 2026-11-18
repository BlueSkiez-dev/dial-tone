import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  bandPower,
  CARRIER_OFF_CHUNKS,
  CARRIER_ON_CHUNKS,
  createCarrierBank,
  createCarrierDetector,
  powerSpectrum,
} from "./carrier";
import { CHUNK_SAMPLES } from "./constants";
import { PROFILES, type ProfileId } from "./profiles";

/** FFT cost per chunk is real, so few runs. */
const RUNS = 12;
const PRE_ROLL = 10;
const NOISE_AMP = 0.02;

const measured: { id: ProfileId; band: readonly [number, number] }[] =
  Object.values(PROFILES).flatMap((p) =>
    p.carrierBandHz === null ? [] : [{ id: p.id, band: p.carrierBandHz }],
  );
const highestBandHz = Math.max(...measured.map((m) => m.band[1]));
const lowestBandHz = Math.min(...measured.map((m) => m.band[0]));

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

function sine(
  hz: number,
  amp: number,
  sampleRate: number,
  start: number,
): Float32Array {
  const out = new Float32Array(CHUNK_SAMPLES);
  for (let i = 0; i < CHUNK_SAMPLES; i++) {
    out[i] = amp * Math.sin((2 * Math.PI * hz * (start + i)) / sampleRate);
  }
  return out;
}

function noise(rng: () => number, amp: number): Float32Array {
  const out = new Float32Array(CHUNK_SAMPLES);
  for (let i = 0; i < CHUNK_SAMPLES; i++) out[i] = (rng() * 2 - 1) * amp;
  return out;
}

function add(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++)
    out[i] = (a[i] as number) + (b[i] as number);
  return out;
}

interface Decision {
  chunk: number;
  profile: ProfileId;
  active: boolean;
}

function runBank(sampleRate: number, chunks: Float32Array[]): Decision[] {
  const bank = createCarrierBank(sampleRate, PROFILES);
  const out: Decision[] = [];
  chunks.forEach((c, i) => {
    for (const ch of bank.update(c, i * CHUNK_SAMPLES)) {
      out.push({ chunk: i, profile: ch.profile, active: ch.active });
    }
  });
  return out;
}

interface Scenario {
  chunks: Float32Array[];
  burstStart: number;
  burstLen: number;
}

/**
 * Seeded noise, then a burst whose in-band power is `excessDb` above the mean in-band noise power
 * of the pre-roll, then noise again. Tone amplitude is calibrated from measured band powers.
 */
function burstScenario(
  sampleRate: number,
  band: readonly [number, number],
  toneHz: number,
  excessDb: number,
  burstLen: number,
  seed: number,
): Scenario {
  const rng = mulberry32(seed);
  const chunks: Float32Array[] = [];
  let noiseSum = 0;
  for (let i = 0; i < PRE_ROLL; i++) {
    const n = noise(rng, NOISE_AMP);
    noiseSum += bandPower(powerSpectrum(n), sampleRate, band);
    chunks.push(n);
  }
  const noisePower = noiseSum / PRE_ROLL;
  const unit = bandPower(
    powerSpectrum(sine(toneHz, 1, sampleRate, 0)),
    sampleRate,
    band,
  );
  const amp = Math.sqrt((noisePower * 10 ** (excessDb / 10)) / unit);
  for (let i = 0; i < burstLen; i++) {
    chunks.push(
      add(
        sine(toneHz, amp, sampleRate, (PRE_ROLL + i) * CHUNK_SAMPLES),
        noise(rng, NOISE_AMP),
      ),
    );
  }
  for (let i = 0; i < CARRIER_OFF_CHUNKS + 6; i++) {
    chunks.push(noise(rng, NOISE_AMP));
  }
  return { chunks, burstStart: PRE_ROLL, burstLen };
}

const sampleRateArb = fc.constantFrom(44_100, 48_000);
const burstArb = fc.record({
  target: fc.constantFrom(...measured),
  sampleRate: sampleRateArb,
  frac: fc.double({ min: 0.1, max: 0.9, noNaN: true }),
  excessDb: fc.double({ min: 12, max: 30, noNaN: true }),
  burstLen: fc.integer({ min: CARRIER_ON_CHUNKS, max: 8 }),
  seed: fc.integer({ min: 0, max: 0x7fffffff }),
});

function scenarioOf(x: {
  target: { id: ProfileId; band: readonly [number, number] };
  sampleRate: number;
  frac: number;
  excessDb: number;
  burstLen: number;
  seed: number;
}) {
  const toneHz =
    x.target.band[0] + x.frac * (x.target.band[1] - x.target.band[0]);
  return {
    target: x.target,
    sampleRate: x.sampleRate,
    scenario: burstScenario(
      x.sampleRate,
      x.target.band,
      toneHz,
      x.excessDb,
      x.burstLen,
      x.seed,
    ),
  };
}

describe("Property 10: carrier detection", () => {
  it("a tone at least 12 dB above the noise turns its band on within 2 chunks and off within 7 chunks of its end", () => {
    // **Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5**
    fc.assert(
      fc.property(burstArb, (r) => {
        const { target, sampleRate, scenario } = scenarioOf(r);
        const decisions = runBank(sampleRate, scenario.chunks).filter(
          (d) => d.profile === target.id,
        );
        const on = decisions.find((d) => d.active);
        const off = decisions.find((d) => !d.active);
        expect(on).toBeDefined();
        expect(off).toBeDefined();
        if (!on || !off) return;
        const lastBurst = scenario.burstStart + scenario.burstLen - 1;
        expect(on.chunk).toBeGreaterThanOrEqual(scenario.burstStart);
        expect(on.chunk).toBeLessThanOrEqual(
          scenario.burstStart + CARRIER_ON_CHUNKS - 1,
        );
        expect(off.chunk).toBeGreaterThan(lastBurst);
        expect(off.chunk).toBeLessThanOrEqual(
          lastBurst + CARRIER_OFF_CHUNKS + 1,
        );
        expect(decisions).toHaveLength(2);
      }),
      { numRuns: RUNS, verbose: true },
    );
  });

  it("noise alone, and a tone outside every band, never turn a detector on", () => {
    // **Validates: Requirements 8.1, 8.2, 8.9**
    const outsideArb = fc.oneof(
      fc.constant(null),
      fc.double({ min: 100, max: lowestBandHz - 320, noNaN: true }),
      fc.double({ min: highestBandHz + 600, max: 20_000, noNaN: true }),
    );
    fc.assert(
      fc.property(
        sampleRateArb,
        fc.double({ min: 0.001, max: 1, noNaN: true }),
        fc.double({ min: 1, max: 8, noNaN: true }),
        outsideArb,
        fc.integer({ min: 0, max: 0x7fffffff }),
        (sampleRate, noiseAmp, toneFactor, toneHz, seed) => {
          const rng = mulberry32(seed);
          const chunks: Float32Array[] = [];
          for (let i = 0; i < 40; i++) {
            const n = noise(rng, noiseAmp);
            chunks.push(
              toneHz === null
                ? n
                : add(
                    n,
                    sine(
                      toneHz,
                      noiseAmp * toneFactor,
                      sampleRate,
                      i * CHUNK_SAMPLES,
                    ),
                  ),
            );
          }
          expect(runBank(sampleRate, chunks)).toEqual([]);
        },
      ),
      { numRuns: RUNS, verbose: true },
    );
  });

  it("scaling every sample by a gain in 0.01 to 1 gives the same decisions", () => {
    // **Validates: Requirements 8.1, 8.2, 8.10**
    fc.assert(
      fc.property(
        burstArb,
        fc.double({ min: 0.01, max: 1, noNaN: true }),
        (r, gain) => {
          const { sampleRate, scenario } = scenarioOf(r);
          const scaled = scenario.chunks.map((c) =>
            Float32Array.from(c, (v) => v * gain),
          );
          expect(runBank(sampleRate, scaled)).toEqual(
            runBank(sampleRate, scenario.chunks),
          );
        },
      ),
      { numRuns: RUNS, verbose: true },
    );
  });

  it("decisions are the same from a shared spectrum or from samples alone", () => {
    // **Validates: Requirements 8.1, 8.11**
    fc.assert(
      fc.property(burstArb, (r) => {
        const { sampleRate, scenario } = scenarioOf(r);
        const fromSamples = runBank(sampleRate, scenario.chunks);
        const detectors = measured.map((m) => ({
          profile: m.id,
          det: createCarrierDetector({ sampleRate, band: m.band }),
        }));
        const fromSpectrum: Decision[] = [];
        scenario.chunks.forEach((c, i) => {
          const spectrum = powerSpectrum(c);
          for (const d of detectors) {
            const res = d.det.update(spectrum, i * CHUNK_SAMPLES);
            if (res !== null) {
              fromSpectrum.push({ chunk: i, profile: d.profile, active: res });
            }
          }
        });
        expect(fromSpectrum).toEqual(fromSamples);
      }),
      { numRuns: RUNS, verbose: true },
    );
  });
});
