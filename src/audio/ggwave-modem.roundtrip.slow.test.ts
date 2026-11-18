import { createRequire } from "node:module";
import { beforeAll, describe, expect, it } from "vitest";
import { CHUNK_SAMPLES, RX_SAMPLE_RATE } from "./constants";
import { createGgwaveModem, type GgwaveFactoryResult } from "./ggwave-modem";
import { type Modem, ModemError } from "./modem";
import type { ProtocolId } from "./profiles";
import { createResampler } from "./resampler";

// Slow tests: they run the vendored ggwave 0.4.0 WASM modem in Node through the real wrapper.
// Only `npm.cmd run test:slow` (vitest.slow.config.ts) picks up this file.
// Task 2.2. The toggle-isolation tests of requirement 9.11 belong to ggwave-modem.slow.test.ts.

const VOLUME = 25;
const SLOW_TIMEOUT = 300_000;
const SAMPLE_RATES = [44_100, 48_000] as const;

const PROTOCOLS: readonly ProtocolId[] = [
  "AUDIBLE_FASTEST",
  "AUDIBLE_FAST",
  "DT_FASTEST",
  "DT_FAST",
  "ULTRASOUND_FASTEST",
  "ULTRASOUND_FAST",
];

/** Plain ASCII payloads of two lengths. None is a recorded FASTEST failure. */
const PAYLOADS: readonly Uint8Array[] = [
  new TextEncoder().encode("Shelter B needs water"),
  new TextEncoder().encode("Road 9 is closed, use the north bridge."),
];

type Factory = () => Promise<GgwaveFactoryResult>;

let factory: Factory;

beforeAll(() => {
  factory = createRequire(import.meta.url)("../../vendor/ggwave.js") as Factory;
});

/** Silence on each side (0.6 s), total length rounded up to whole decoder blocks. */
function pad(wave: Float32Array, sampleRate: number): Float32Array {
  const silence = Math.round(0.6 * sampleRate);
  const needed = wave.length + 2 * silence;
  const total = Math.ceil(needed / CHUNK_SAMPLES) * CHUNK_SAMPLES;
  const out = new Float32Array(total);
  out.set(wave, silence);
  return out;
}

/**
 * Brings a tx-rate wave to the 48 kHz decode rate. The wave is padded, then extra trailing
 * silence is added so the resampler's availability lag (`latencyFrames`) does not cut the tail.
 * The output is rounded up to whole decoder blocks.
 */
function toRxRate(wave: Float32Array, txRate: number): Float32Array {
  const padded = pad(wave, txRate);
  if (txRate === RX_SAMPLE_RATE) return padded;
  const resampler = createResampler(txRate, RX_SAMPLE_RATE);
  const tail = Math.ceil(resampler.latencyFrames) + CHUNK_SAMPLES;
  const input = new Float32Array(padded.length + tail);
  input.set(padded);
  const resampled = resampler.process(input);
  const total = Math.ceil(resampled.length / CHUNK_SAMPLES) * CHUNK_SAMPLES;
  const out = new Float32Array(total);
  out.set(resampled);
  return out;
}

describe.each(SAMPLE_RATES)(
  "ggwave-modem round trip at %i Hz",
  (sampleRate) => {
    let modem: Modem;

    beforeAll(async () => {
      // Decoders always run at 48,000 Hz. A 44,100 Hz wave is resampled first (toRxRate).
      modem = await createGgwaveModem(factory, { txSampleRate: sampleRate });
      return () => modem.dispose();
    });

    /** Feeds every block and returns the first decoded payload. Fails on an empty array. */
    async function roundTrip(
      payload: Uint8Array,
      protocol: ProtocolId,
    ): Promise<Uint8Array | null> {
      const samples = toRxRate(
        modem.modulate(payload, protocol, VOLUME),
        sampleRate,
      );
      const decoders = await modem.createDecoders([protocol], 1);
      const decoder = decoders[0];
      if (decoder === undefined)
        throw new Error("createDecoders returned none");
      try {
        for (let i = 0; i < samples.length; i += CHUNK_SAMPLES) {
          const res = decoder.feed(samples.slice(i, i + CHUNK_SAMPLES));
          if (res !== null) {
            // Requirement 9.4: never an empty array.
            expect(res.length).toBeGreaterThan(0);
            return res;
          }
        }
        return null;
      } finally {
        decoder.dispose();
      }
    }

    for (const protocol of PROTOCOLS) {
      it(
        `${protocol}: decodes a modulated payload`,
        async () => {
          for (const payload of PAYLOADS) {
            const got = await roundTrip(payload, protocol);
            expect(got, `${protocol} returned nothing`).not.toBeNull();
            // FASTEST modes are known to return wrong bytes for some payloads (frame-protocol
            // design, sweep of 150), so only FAST modes assert exact bytes.
            if (protocol.endsWith("_FAST")) expect(got).toEqual(payload);
          }
        },
        SLOW_TIMEOUT,
      );
    }

    it("rejects 0 and 141 byte payloads with BAD_LENGTH", () => {
      for (const length of [0, 141]) {
        let caught: unknown;
        try {
          modem.modulate(new Uint8Array(length), "DT_FASTEST", VOLUME);
        } catch (e) {
          caught = e;
        }
        expect(caught).toBeInstanceOf(ModemError);
        expect((caught as ModemError).code).toBe("BAD_LENGTH");
      }
    });

    it(
      "returns modulate output that does not share memory with ggwave",
      () => {
        const payload = PAYLOADS[0] as Uint8Array;
        const other = PAYLOADS[1] as Uint8Array;
        const first = modem.modulate(payload, "DT_FASTEST", VOLUME);
        const snapshot = first.slice();

        // Another call must not change an earlier result.
        modem.modulate(other, "DT_FASTEST", VOLUME);
        expect(first).toEqual(snapshot);

        // Changing a result must not change later results.
        first.fill(0.5);
        const again = modem.modulate(payload, "DT_FASTEST", VOLUME);
        expect(again).toEqual(snapshot);
        expect(first.buffer).not.toBe(again.buffer);
      },
      SLOW_TIMEOUT,
    );
  },
);

describe("ggwave 0.4.0 at 44,100 Hz", () => {
  // Finding: ggwave 0.4.0 cannot decode at 44,100 Hz, which is why decoders run at 48,000 Hz and
  // the capture is resampled. This test fails loudly if a future ggwave fixes 44.1 kHz decoding.
  // That would be a reason to revisit the resampler.
  it(
    "decodes nothing for an AUDIBLE_FAST wave encoded at 44,100 Hz",
    async () => {
      const gg = await factory();
      gg.disableLog();
      const params = () => {
        const p = gg.getDefaultParameters();
        p.sampleRateInp = 44_100;
        p.sampleRateOut = 44_100;
        return p;
      };
      const protocol = gg.ProtocolId.GGWAVE_PROTOCOL_AUDIBLE_FAST as {
        readonly value: number;
      };
      for (const [name, p] of Object.entries(gg.ProtocolId)) {
        gg.rxToggleProtocol(p, name === "GGWAVE_PROTOCOL_AUDIBLE_FAST" ? 1 : 0);
      }

      const tx = gg.init(params());
      const encoded = gg.encode(
        tx,
        PAYLOADS[0] as Uint8Array,
        protocol,
        VOLUME,
      );
      const bytes = new Int8Array(encoded);
      gg.free(tx);
      const wave = new Float32Array(
        bytes.buffer,
        0,
        Math.floor(bytes.byteLength / 4),
      );
      const samples = pad(wave, 44_100);

      const rx = gg.init(params());
      let decoded: Uint8Array | null = null;
      try {
        for (let i = 0; i < samples.length; i += CHUNK_SAMPLES) {
          const block = samples.slice(i, i + CHUNK_SAMPLES);
          const view = new Int8Array(
            block.buffer,
            block.byteOffset,
            block.byteLength,
          );
          const res = gg.decode(rx, view);
          if (res && res.length > 0) {
            decoded = Uint8Array.from(res);
            break;
          }
        }
      } finally {
        gg.free(rx);
      }
      expect(decoded).toBeNull();
    },
    SLOW_TIMEOUT,
  );
});
