import { createRequire } from "node:module";
import fc from "fast-check";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { encodeFrame } from "../protocol";
import { airtimeMs } from "./airtime";
import { CHUNK_SAMPLES, RX_SAMPLE_RATE } from "./constants";
import { createGgwaveModem, type GgwaveFactoryResult } from "./ggwave-modem";
import type { Modem } from "./modem";
import { DECODER_OFFSETS } from "./phase-chunker";
import {
  allRxProtocols,
  type ChannelProfile,
  PROFILES,
  type ProtocolId,
  protocolFor,
} from "./profiles";
import { createResampler } from "./resampler";
import { createRxPipeline, type RxEvent } from "./rx-pipeline";

// Slow tests: real vendored ggwave 0.4.0 through the real modem wrapper and the real pipeline.
// Only `npm.cmd run test:slow` (vitest.slow.config.ts) picks up this file.
// Task 10.3: Property 13 (pipeline output on the real modem) and Property 16 (airtime).

const SLOW_TIMEOUT = 1_800_000;
const SAMPLE_RATES = [44_100, 48_000] as const;
const SILENCE_SECONDS = 0.6;

/** Fixed seed for every payload and lead of Property 13. Printed in the log so a run can be replayed. */
const P13_SEED = 0x13d1a1;

type Factory = () => Promise<GgwaveFactoryResult>;

let factory: Factory;

beforeAll(() => {
  factory = createRequire(import.meta.url)("../../vendor/ggwave.js") as Factory;
});

/** Every (profile, attempt) pair with a distinct protocol, so each profile is tried at each used speed. */
const SEND_CASES: { profile: ChannelProfile; attempt: number }[] = (() => {
  const seen = new Set<ProtocolId>();
  const out: { profile: ChannelProfile; attempt: number }[] = [];
  for (const profile of Object.values(PROFILES)) {
    for (const attempt of [0, 1]) {
      const protocol = protocolFor(profile, attempt);
      if (seen.has(protocol)) continue;
      seen.add(protocol);
      out.push({ profile, attempt });
    }
  }
  return out;
})();

/** mulberry32: a small seeded PRNG, so every run sends the same bytes. */
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

function seededBytes(next: () => number, length: number): Uint8Array {
  const out = new Uint8Array(length);
  for (let i = 0; i < length; i++) out[i] = Math.floor(next() * 256);
  return out;
}

interface FixedCase {
  kind: "valid" | "raw";
  payload: Uint8Array;
  /** Leading silence in samples, 0 to CHUNK_SAMPLES - 1. */
  lead: number;
}

/** 3 valid frames (bodies of 1, 60 and 128 bytes) and 2 raw payloads (20 and 140 bytes), all seeded. */
function fixedCases(seed: number): FixedCase[] {
  const next = mulberry32(seed);
  const out: FixedCase[] = [];
  for (const bodyLength of [1, 60, 128]) {
    const encoded = encodeFrame({
      header: {
        version: 1,
        type: 0,
        encrypted: false,
        hop: 0,
        ttl: 7,
        messageId: seededBytes(next, 8),
        index: 0,
        total: 1,
      },
      body: seededBytes(next, bodyLength),
    });
    if (!encoded.ok) throw new Error(`encodeFrame failed for ${bodyLength}`);
    out.push({
      kind: "valid",
      payload: encoded.value,
      lead: Math.floor(next() * CHUNK_SAMPLES),
    });
  }
  for (const length of [20, 140]) {
    out.push({
      kind: "raw",
      payload: seededBytes(next, length),
      lead: Math.floor(next() * CHUNK_SAMPLES),
    });
  }
  return out;
}

/** Leading silence (0.6 s plus `lead`), the wave, trailing silence, padded to whole chunks. */
function buildStream(
  wave: Float32Array,
  sampleRate: number,
  lead: number,
): Float32Array {
  const silence = Math.round(SILENCE_SECONDS * sampleRate);
  const needed = lead + silence + wave.length + silence;
  const total = Math.ceil(needed / CHUNK_SAMPLES) * CHUNK_SAMPLES;
  const out = new Float32Array(total);
  out.set(wave, lead + silence);
  return out;
}

/**
 * The stream as the decoders see it: at 48 kHz as is. At any other rate the whole stream is
 * resampled to 48 kHz. Trailing silence covers the resampler's latency, and the output is padded
 * to whole chunks.
 */
function toRxStream(
  wave: Float32Array,
  txRate: number,
  lead: number,
): Float32Array {
  const stream = buildStream(wave, txRate, lead);
  if (txRate === RX_SAMPLE_RATE) return stream;
  const resampler = createResampler(txRate, RX_SAMPLE_RATE);
  const tail = Math.ceil((resampler.latencyFrames * txRate) / RX_SAMPLE_RATE);
  const padded = new Float32Array(stream.length + tail + CHUNK_SAMPLES);
  padded.set(stream, 0);
  const resampled = resampler.process(padded);
  const total = Math.ceil(resampled.length / CHUNK_SAMPLES) * CHUNK_SAMPLES;
  const out = new Float32Array(total);
  out.set(resampled, 0);
  return out;
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

// About the earlier "frame delivered 7 of 15" at 48 kHz: that run used a coin-flip mix of valid
// and raw payloads. Raw payloads are always rejected on the CRC, so a mixed set can never deliver
// every case. Decoder hits also count decodes that decodeFrame rejects later, so hits and
// delivered frames are different numbers.
describe.each(SAMPLE_RATES)("Property 13 at %i Hz", (sampleRate) => {
  let modem: Modem;
  /** Count of decodes per offset index, over all cases at this rate. */
  const hitsPerOffset: number[] = DECODER_OFFSETS.map(() => 0);
  let validCases = 0;
  let validDelivered = 0;
  let rawCases = 0;
  let rawRejected = 0;

  beforeAll(async () => {
    // The modem sends at sampleRate. The decoders always run at 48 kHz.
    modem = await createGgwaveModem(factory, { txSampleRate: sampleRate });
    return () => modem.dispose();
  });

  afterAll(() => {
    const rows = DECODER_OFFSETS.map(
      (offset, i) => `offset ${offset}: ${hitsPerOffset[i]}`,
    ).join(", ");
    console.log(
      `[rx-pipeline ${sampleRate} Hz] seed ${P13_SEED}, valid-frame cases ${validCases}, valid frames delivered ${validDelivered}, raw cases ${rawCases}, raw rejected ${rawRejected}, decoder hits: ${rows}`,
    );
  });

  /** Runs a pipeline over the stream and returns all events plus its stats. */
  async function run(
    stream: Float32Array,
    sendProfile: ChannelProfile,
    offsets: readonly number[] | undefined,
  ): Promise<{ events: RxEvent[]; hits: readonly number[] }> {
    // The sending profile is not told to the pipeline: pass a different one.
    const told = sendProfile.id === "quiet" ? PROFILES.call : PROFILES.quiet;
    const pipeline = await createRxPipeline({
      modem,
      profile: told,
      ...(offsets === undefined ? {} : { decoderOffsets: offsets }),
    });
    try {
      const events: RxEvent[] = [];
      for (let i = 0; i < stream.length; i += CHUNK_SAMPLES) {
        events.push(
          ...pipeline.push({
            startFrame: i,
            samples: stream.slice(i, i + CHUNK_SAMPLES),
          }),
        );
      }
      return { events, hits: pipeline.stats().decoderHits };
    } finally {
      pipeline.dispose();
    }
  }

  for (const { profile, attempt } of SEND_CASES) {
    const protocol = protocolFor(profile, attempt);
    const fastest = protocol.endsWith("_FASTEST");
    it(
      `${profile.id} at ${protocol}: no wrong frame, minimum delivery, and the four decoders lose nothing a single decoder delivers`,
      async () => {
        let validSent = 0;
        let validGot = 0;
        for (const c of fixedCases(P13_SEED)) {
          const wave = modem.modulate(c.payload, protocol, profile.volume);
          const stream = toRxStream(wave, sampleRate, c.lead);

          const full = await run(stream, profile, undefined);
          const frames = full.events.filter(
            (e): e is Extract<RxEvent, { kind: "frame" }> => e.kind === "frame",
          );
          full.hits.forEach((n, i) => {
            hitsPerOffset[i] = (hitsPerOffset[i] ?? 0) + n;
          });

          // No frame event with a wire different from what was sent.
          for (const f of frames) {
            expect(sameBytes(f.wire, c.payload)).toBe(true);
          }

          const got = frames.length > 0;
          if (c.kind === "raw") {
            rawCases++;
            // A raw payload never gives a frame event.
            expect(frames.length).toBe(0);
            rawRejected++;
          } else {
            validCases++;
            validSent++;
            if (got) {
              validDelivered++;
              validGot++;
            } else if (fastest) {
              console.log(
                `[rx-pipeline] FASTEST miss: protocol ${protocol}, rate ${sampleRate}, payload length ${c.payload.length}, lead ${c.lead}`,
              );
            }
          }

          // Whatever any single-offset pipeline delivers, the four-decoder pipeline delivers.
          let singleDelivered = false;
          for (const offset of DECODER_OFFSETS) {
            const single = await run(stream, profile, [offset]);
            for (const e of single.events) {
              if (e.kind !== "frame") continue;
              expect(sameBytes(e.wire, c.payload)).toBe(true);
              singleDelivered = true;
            }
          }
          if (singleDelivered) expect(got).toBe(true);
        }

        // Minimum delivery: 3 of 3 for FAST, at least 2 of 3 for FASTEST.
        expect(validSent).toBe(3);
        expect(validGot).toBeGreaterThanOrEqual(fastest ? 2 : 3);
      },
      SLOW_TIMEOUT,
    );
  }
});

describe("Property 16: airtime depends on length only", () => {
  const sampleRate = 48_000;
  let modem: Modem;

  beforeAll(async () => {
    modem = await createGgwaveModem(factory, { txSampleRate: sampleRate });
    return () => modem.dispose();
  });

  /** A (profile, attempt) pair that sends the given protocol. */
  function senderOf(protocol: ProtocolId): {
    profile: ChannelProfile;
    attempt: number;
  } {
    const found = SEND_CASES.find(
      (c) => protocolFor(c.profile, c.attempt) === protocol,
    );
    if (found === undefined) throw new Error(`no profile sends ${protocol}`);
    return found;
  }

  for (const protocol of allRxProtocols()) {
    it(
      `${protocol}: equal for equal lengths, non-decreasing in length`,
      () => {
        const { profile, attempt } = senderOf(protocol);
        fc.assert(
          fc.property(
            fc.uint8Array({ minLength: 140, maxLength: 140 }),
            fc.uint8Array({ minLength: 140, maxLength: 140 }),
            (a, b) => {
              let previous = 0;
              for (let length = 1; length <= 140; length++) {
                const wa = modem.modulate(
                  a.slice(0, length),
                  protocol,
                  profile.volume,
                );
                const wb = modem.modulate(
                  b.slice(0, length),
                  protocol,
                  profile.volume,
                );
                // Different contents, same length: same airtime.
                expect(wa.length).toBe(wb.length);
                const ms = (wa.length / sampleRate) * 1000;
                // The public airtimeMs agrees with the encoder output.
                expect(airtimeMs(modem, profile, attempt, length)).toBe(ms);
                expect(ms).toBeGreaterThanOrEqual(previous);
                previous = ms;
              }
            },
          ),
          { verbose: true, numRuns: 2 },
        );
      },
      SLOW_TIMEOUT,
    );
  }
});
