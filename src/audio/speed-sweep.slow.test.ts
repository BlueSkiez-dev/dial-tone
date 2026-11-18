import { createRequire } from "node:module";
import { beforeAll, describe, expect, it } from "vitest";
import { CHUNK_SAMPLES } from "./constants";
import { createGgwaveModem, type GgwaveFactoryResult } from "./ggwave-modem";
import type { Modem } from "./modem";
import type { ProtocolId } from "./profiles";

// Slow test (task 2.3, requirements 12.1 to 12.4): speed sweep with the real modem.
// It logs evidence. It does NOT assert that raw bytes are equal, because ggwave is known
// to return wrong bytes in the FASTEST modes. Only `npm.cmd run test:slow` runs it.

const SAMPLE_RATE = 48000;
const VOLUME = 25;
/** Silence before and after the waveform (0.6 s), as in the recorded spike. */
const PAD_SAMPLES = Math.round(0.6 * SAMPLE_RATE);
/** Payloads per protocol (requirement 12.1 asks for at least 1,000). */
const SWEEP_SIZE = 1000;
const SWEEP_SEED = 0x2_30_5e_ed;
const NOISE_SEED = 0x0_a1_5e_01;
/** Wrong-rate threshold of a profile's first speed (requirement 12.3). */
const WRONG_RATE_LIMIT = 0.02;
const SLOW_TIMEOUT = 7_200_000;

const SWEEP_PROTOCOLS: readonly ProtocolId[] = [
  "AUDIBLE_FASTEST",
  "AUDIBLE_FAST",
  "DT_FASTEST",
  "DT_FAST",
  "ULTRASOUND_FASTEST",
  "ULTRASOUND_FAST",
];
/** The first speed of each family's profile (Room, Call, Quiet). */
const FIRST_SPEED: ReadonlySet<ProtocolId> = new Set<ProtocolId>([
  "AUDIBLE_FASTEST",
  "DT_FASTEST",
  "ULTRASOUND_FASTEST",
]);

/** The three failing payloads recorded in src/protocol/ggwave.slow.test.ts. */
const RECORDED_FAILURES: ReadonlyArray<{
  recordedUnder: ProtocolId;
  replayUnder: ProtocolId;
  payload: Uint8Array;
}> = [
  {
    recordedUnder: "ULTRASOUND_FASTEST",
    replayUnder: "ULTRASOUND_FAST",
    payload: Uint8Array.of(192, 128, 128, 226, 40, 36, 0, 255),
  },
  {
    recordedUnder: "AUDIBLE_FASTEST",
    replayUnder: "AUDIBLE_FAST",
    payload: Uint8Array.of(255, 192, 128, 128, 226, 40, 253, 0),
  },
  {
    recordedUnder: "ULTRASOUND_FASTEST",
    replayUnder: "ULTRASOUND_FAST",
    payload: Uint8Array.of(
      ...[122, 88, 2, 3, 253, 54, 200, 250, 7, 3, 3, 128, 226, 40, 0, 25, 201],
      ...[0, 0, 17, 17, 16, 181, 8, 0, 255, 192, 128],
    ),
  },
];

/** mulberry32: small seeded PRNG so the sweep is reproducible. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

let modem: Modem;

/** Waveform with 0.6 s of silence each side, rounded up to whole chunks. */
function modulatePadded(payload: Uint8Array, protocol: ProtocolId) {
  const wave = modem.modulate(payload, protocol, VOLUME);
  const total =
    Math.ceil((wave.length + 2 * PAD_SAMPLES) / CHUNK_SAMPLES) * CHUNK_SAMPLES;
  const padded = new Float32Array(total);
  padded.set(wave, PAD_SAMPLES);
  return padded;
}

type Outcome = "equal" | "wrong" | "none";

function classify(got: Uint8Array | null, sent: Uint8Array): Outcome {
  if (got === null) return "none";
  return sameBytes(got, sent) ? "equal" : "wrong";
}

interface Tally {
  equal: number;
  wrong: number;
  none: number;
}

const newTally = (): Tally => ({ equal: 0, wrong: 0, none: 0 });

function pct(n: number, d: number): string {
  return d === 0 ? "n/a" : `${((100 * n) / d).toFixed(2)}%`;
}

function row(cells: readonly string[], widths: readonly number[]): string {
  return cells.map((c, i) => c.padEnd(widths[i] ?? 0)).join(" | ");
}

beforeAll(async () => {
  const factory = createRequire(import.meta.url)(
    "../../vendor/ggwave.js",
  ) as () => Promise<GgwaveFactoryResult>;
  modem = await createGgwaveModem(factory, {
    txSampleRate: SAMPLE_RATE,
  });
});

describe("speed sweep (requirements 12.1 to 12.4)", () => {
  it(
    `sweeps ${SWEEP_SIZE} seeded payloads of 1 to 140 bytes per protocol, no noise`,
    async () => {
      const rand = seeded(SWEEP_SEED);
      const payloads = Array.from({ length: SWEEP_SIZE }, () =>
        Uint8Array.from({ length: 1 + Math.floor(rand() * 140) }, () =>
          Math.floor(rand() * 256),
        ),
      );
      const lines: string[] = [];
      const widths = [20, 7, 7, 11, 10, 17, 17];
      lines.push(
        row(
          [
            "protocol",
            "equal",
            "wrong",
            "not decoded",
            "wrong %",
            "wrong 1-60 B",
            "wrong 61-140 B",
          ],
          widths,
        ),
      );
      const warnings: string[] = [];

      for (const protocol of SWEEP_PROTOCOLS) {
        // Only the protocol under test is enabled in this decoder set.
        const [decoder] = await modem.createDecoders([protocol], 1);
        if (decoder === undefined) throw new Error("no decoder created");
        const total = newTally();
        const low = newTally(); // 1 to 60 bytes
        const high = newTally(); // 61 to 140 bytes
        try {
          for (const payload of payloads) {
            const samples = modulatePadded(payload, protocol);
            let got: Uint8Array | null = null;
            for (
              let i = 0;
              i < samples.length && got === null;
              i += CHUNK_SAMPLES
            ) {
              got = decoder.feed(samples.slice(i, i + CHUNK_SAMPLES));
            }
            decoder.reset();
            const outcome = classify(got, payload);
            total[outcome]++;
            (payload.length <= 60 ? low : high)[outcome]++;
          }
        } finally {
          decoder.dispose();
        }
        const lowN = low.equal + low.wrong + low.none;
        const highN = high.equal + high.wrong + high.none;
        lines.push(
          row(
            [
              protocol,
              String(total.equal),
              String(total.wrong),
              String(total.none),
              pct(total.wrong, payloads.length),
              `${low.wrong}/${lowN} ${pct(low.wrong, lowN)}`,
              `${high.wrong}/${highN} ${pct(high.wrong, highN)}`,
            ],
            widths,
          ),
        );
        if (
          FIRST_SPEED.has(protocol) &&
          total.wrong / payloads.length > WRONG_RATE_LIMIT
        ) {
          warnings.push(
            `!!! WRONG RATE ABOVE 2% for first speed ${protocol}: ${total.wrong}/${payloads.length} (${pct(total.wrong, payloads.length)}). The profile table may need to change (requirement 12.3).`,
          );
        }
        expect(total.equal + total.wrong + total.none).toBe(payloads.length);
      }

      console.info(
        `[speed-sweep] ${SAMPLE_RATE} Hz, volume ${VOLUME}, no noise, 0.6 s silence each side, ${SWEEP_SIZE} payloads per protocol, seed ${SWEEP_SEED}\n${lines.join("\n")}`,
      );
      if (warnings.length === 0) {
        console.info(
          "[speed-sweep] No first-speed protocol has a wrong rate above 2%.",
        );
      }
      for (const w of warnings) console.warn(`[speed-sweep] ${w}`);
    },
    SLOW_TIMEOUT,
  );

  it(
    "replays the three recorded failing payloads under the FAST protocol of the same family",
    async () => {
      const lines: string[] = [];
      for (const { recordedUnder, replayUnder, payload } of RECORDED_FAILURES) {
        const [decoder] = await modem.createDecoders([replayUnder], 1);
        if (decoder === undefined) throw new Error("no decoder created");
        let got: Uint8Array | null = null;
        try {
          const samples = modulatePadded(payload, replayUnder);
          for (
            let i = 0;
            i < samples.length && got === null;
            i += CHUNK_SAMPLES
          ) {
            got = decoder.feed(samples.slice(i, i + CHUNK_SAMPLES));
          }
        } finally {
          decoder.dispose();
        }
        const outcome = classify(got, payload);
        lines.push(
          `recorded under ${recordedUnder}, replay under ${replayUnder}: ${payload.length} bytes [${payload.join(",")}] -> ${outcome}${got === null ? "" : ` [${got.join(",")}]`}`,
        );
      }
      console.info(`[speed-sweep replay]\n${lines.join("\n")}`);
      expect(lines.length).toBe(RECORDED_FAILURES.length);
    },
    SLOW_TIMEOUT,
  );

  it(
    "logs whether ULTRASOUND_FASTEST decodes anything from silence and low-level noise (design open question 6)",
    async () => {
      const rand = seeded(NOISE_SEED);
      const seconds = 30;
      const n =
        Math.ceil((seconds * SAMPLE_RATE) / CHUNK_SAMPLES) * CHUNK_SAMPLES;
      // Peak amplitudes of uniform noise are test parameters, not measured field levels.
      const inputs: ReadonlyArray<{ label: string; amplitude: number }> = [
        { label: "silence", amplitude: 0 },
        { label: "noise peak 0.001", amplitude: 0.001 },
        { label: "noise peak 0.01", amplitude: 0.01 },
        { label: "noise peak 0.05", amplitude: 0.05 },
      ];
      const [decoder] = await modem.createDecoders(["ULTRASOUND_FASTEST"], 1);
      if (decoder === undefined) throw new Error("no decoder created");
      const lines: string[] = [];
      try {
        for (const { label, amplitude } of inputs) {
          const samples = new Float32Array(n);
          if (amplitude > 0) {
            for (let i = 0; i < n; i++) {
              samples[i] = (rand() * 2 - 1) * amplitude;
            }
          }
          let decodes = 0;
          const lengths: number[] = [];
          for (let i = 0; i < n; i += CHUNK_SAMPLES) {
            const got = decoder.feed(samples.slice(i, i + CHUNK_SAMPLES));
            if (got !== null) {
              decodes++;
              lengths.push(got.length);
              decoder.reset();
            }
          }
          lines.push(
            `${label}, ${seconds} s: ${decodes} decode(s)${decodes > 0 ? ` of lengths [${lengths.join(",")}]` : ""}`,
          );
        }
      } finally {
        decoder.dispose();
      }
      console.info(
        `[speed-sweep noise] ULTRASOUND_FASTEST at ${SAMPLE_RATE} Hz, seed ${NOISE_SEED}\n${lines.join("\n")}`,
      );
      expect(lines.length).toBe(inputs.length);
    },
    SLOW_TIMEOUT,
  );
});
