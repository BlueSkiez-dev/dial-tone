import { createRequire } from "node:module";
import fc from "fast-check";
import { beforeAll, describe, expect, it } from "vitest";
import {
  GGWAVE_MAX_PAYLOAD,
  MESSAGE_ID_LEN,
  TAG_LEN,
  wireBodyCapacity,
} from "./budget";
import { decodeFrame, encodeFrame } from "./frame";
import type { Frame, MessageType } from "./types";

// Slow tests: they run the vendored ggwave 0.4.0 WASM modem in Node.
// Only `npm.cmd run test:slow` (vitest.slow.config.ts) picks up this file.
// The API calls below match the spike glue that produced the evidence in
// design.md "Wire representation" (getDefaultParameters, init, encode,
// decode, free, rxToggleProtocol, ProtocolId.GGWAVE_PROTOCOL_*).

/** Opaque embind enum value from `ggwave.ProtocolId`. */
type GgwaveProtocol = { readonly value: number };

interface GgwaveParameters {
  sampleRateInp: number;
  sampleRateOut: number;
}

interface Ggwave {
  getDefaultParameters(): GgwaveParameters;
  init(parameters: GgwaveParameters): number;
  free(instance: number): void;
  /** Returns a view into WASM memory holding float32 samples as raw bytes. */
  encode(
    instance: number,
    payload: Uint8Array,
    protocol: GgwaveProtocol,
    volume: number,
  ): Int8Array;
  /** Returns a view into WASM memory, empty or null until a frame decodes. */
  decode(instance: number, samples: Int8Array): Uint8Array | null | undefined;
  rxToggleProtocol(protocol: GgwaveProtocol, enabled: number): void;
  disableLog(): void;
  ProtocolId: Record<string, GgwaveProtocol>;
}

type GgwaveFactory = () => Promise<Ggwave>;

/** Rate of the recorded evidence. */
const SAMPLE_RATE = 48000;
const VOLUME = 25;
const CHUNK = 1024;
/** Silence before and after the waveform, as in the spike (0.6 s). */
const PAD_SAMPLES = Math.round(0.6 * SAMPLE_RATE);

/** Channel_Profiles named in field-findings.md (Call, Room, Quiet). */
const PROFILES = [
  { name: "DT fastest", id: "DT_FASTEST" },
  { name: "audible fastest", id: "AUDIBLE_FASTEST" },
  { name: "ultrasound fastest", id: "ULTRASOUND_FASTEST" },
] as const;

/** Every FASTEST, FAST and NORMAL protocol of the vendored build (clause 13.5). */
const ALL_PROFILE_IDS = [
  "AUDIBLE_FASTEST",
  "AUDIBLE_FAST",
  "AUDIBLE_NORMAL",
  "DT_FASTEST",
  "DT_FAST",
  "DT_NORMAL",
  "ULTRASOUND_FASTEST",
  "ULTRASOUND_FAST",
  "ULTRASOUND_NORMAL",
] as const;

// verbose prints the seed and path on failure so CI failures can be replayed.
const PARAMS = { verbose: true, numRuns: 5 } as const;
const SLOW_TIMEOUT = 900_000;

let gg: Ggwave;

function protocol(id: string): GgwaveProtocol {
  const p = gg.ProtocolId[`GGWAVE_PROTOCOL_${id}`];
  if (p === undefined) throw new Error(`ggwave has no protocol ${id}`);
  return p;
}

function newInstance(): number {
  const p = gg.getDefaultParameters();
  p.sampleRateInp = SAMPLE_RATE;
  p.sampleRateOut = SAMPLE_RATE;
  return gg.init(p);
}

/** Runs `fn` with console.log muted, because ggwave's encode printf()s. */
function quiet<T>(fn: () => T): T {
  const log = console.log;
  console.log = () => {};
  try {
    return fn();
  } finally {
    console.log = log;
  }
}

/** Encodes bytes to padded float32 samples at SAMPLE_RATE. */
function modulate(payload: Uint8Array, protocolId: string): Float32Array {
  const tx = newInstance();
  try {
    const p = protocol(protocolId);
    const view = quiet(() => gg.encode(tx, payload, p, VOLUME));
    // Copy out of WASM memory before anything else allocates.
    const bytes = new Int8Array(view);
    const wave = new Float32Array(bytes.buffer, 0, bytes.byteLength / 4);
    const padded = new Float32Array(wave.length + 2 * PAD_SAMPLES);
    padded.set(wave, PAD_SAMPLES);
    return padded;
  } finally {
    gg.free(tx);
  }
}

/** Streams samples to a fresh decoder in CHUNK-sample pieces, like a mic. */
function demodulate(samples: Float32Array): Uint8Array | null {
  const rx = newInstance();
  try {
    for (let i = 0; i < samples.length; i += CHUNK) {
      const part = samples.slice(i, i + CHUNK);
      const res = quiet(() => gg.decode(rx, new Int8Array(part.buffer)));
      if (res && res.length > 0) return Uint8Array.from(res);
    }
    return null;
  } finally {
    gg.free(rx);
  }
}

function roundTrip(payload: Uint8Array, protocolId: string) {
  return demodulate(modulate(payload, protocolId));
}

beforeAll(async () => {
  const factory = createRequire(import.meta.url)(
    "../../vendor/ggwave.js",
  ) as GgwaveFactory;
  gg = await factory();
  gg.disableLog();
  for (const id of ALL_PROFILE_IDS) gg.rxToggleProtocol(protocol(id), 1);
});

/** 0x00, 0xFF and invalid UTF-8 (overlong NUL, lone continuation, bare lead). */
const SPECIAL = Uint8Array.of(0x00, 0xff, 0xc0, 0x80, 0x80, 0xe2, 0x28);

/** Mixes SPECIAL into random bytes at a random rotation, within the bounds. */
function withSpecials(
  minLength: number,
  maxLength: number,
): fc.Arbitrary<Uint8Array> {
  return fc
    .record({
      rest: fc.uint8Array({
        minLength: Math.max(0, minLength - SPECIAL.length),
        maxLength: maxLength - SPECIAL.length,
      }),
      shift: fc.nat(),
    })
    .map(({ rest, shift }) => {
      const all = new Uint8Array(SPECIAL.length + rest.length);
      all.set(SPECIAL, 0);
      all.set(rest, SPECIAL.length);
      const k = shift % all.length;
      return Uint8Array.from([...all.subarray(k), ...all.subarray(0, k)]);
    });
}

/** Frames that encodeFrame accepts, single or multi-frame headers. */
const frameArb: fc.Arbitrary<Frame> = fc
  .record({
    type: fc.constantFrom<MessageType>(0, 1, 2, 3, 5),
    encrypted: fc.boolean(),
    hop: fc.integer({ min: 0, max: 15 }),
    ttl: fc.integer({ min: 0, max: 15 }),
    messageId: fc.uint8Array({
      minLength: MESSAGE_ID_LEN,
      maxLength: MESSAGE_ID_LEN,
    }),
    total: fc.integer({ min: 1, max: 16 }),
  })
  .chain((h) =>
    fc
      .record({
        index: fc.integer({ min: 0, max: h.total - 1 }),
        body: withSpecials(
          h.encrypted ? TAG_LEN : 0,
          wireBodyCapacity({ multi: h.total > 1 }),
        ),
      })
      .map(
        ({ index, body }): Frame => ({
          header: { version: 1, ...h, index },
          body,
        }),
      ),
  );

describe("Property 14: A frame survives the modem or is rejected (slow)", () => {
  for (const profile of PROFILES) {
    /**
     * ggwave may return nothing or wrong bytes. That is allowed. Only a
     * decodeFrame result that is a different Frame fails the property.
     *
     * **Validates: Requirements 13.1, 13.5**
     */
    it(
      `${profile.name}: received bytes give the same frame, an error, or nothing`,
      () => {
        fc.assert(
          fc.property(frameArb, (frame) => {
            const wire = encodeFrame(frame);
            if (!wire.ok) {
              throw new Error(`encodeFrame failed: ${wire.error.code}`);
            }
            const received = roundTrip(wire.value, profile.id);
            if (received === null) return; // ggwave returned nothing
            const decoded = decodeFrame(received);
            if (!decoded.ok) return; // rejected, e.g. BAD_CRC or TOO_SHORT
            expect(decoded.value).toEqual(frame);
          }),
          PARAMS,
        );
      },
      SLOW_TIMEOUT,
    );
  }
});

// Evidence (clause 13.5), not a pass or fail claim of identity. Raw bytes are
// NOT asserted equal to the input, because ggwave is known to return wrong
// bytes. Recorded sweep (150 random payloads of 1 to 60 bytes per profile):
//   wrong:        3 (AUDIBLE_FASTEST), 1 (DT_FASTEST), 2 (ULTRASOUND_FASTEST),
//                 0 in the FAST modes
//   not decoded:  0 in every FASTEST and FAST mode, 3 in AUDIBLE_NORMAL
// Recorded failing payloads, replayed below as fixed regression cases. The
// 28-byte one was recorded as decoded to [226,200,0] in 20 of 20 replays.
const RECORDED_FAILURES: ReadonlyArray<{
  profile: string;
  payload: Uint8Array;
}> = [
  {
    profile: "ULTRASOUND_FASTEST",
    payload: Uint8Array.of(192, 128, 128, 226, 40, 36, 0, 255),
  },
  {
    profile: "AUDIBLE_FASTEST",
    payload: Uint8Array.of(255, 192, 128, 128, 226, 40, 253, 0),
  },
  {
    profile: "ULTRASOUND_FASTEST",
    payload: Uint8Array.of(
      ...[122, 88, 2, 3, 253, 54, 200, 250, 7, 3, 3, 128, 226, 40, 0, 25, 201],
      ...[0, 0, 17, 17, 16, 181, 8, 0, 255, 192, 128],
    ),
  },
];

const SWEEP_SIZE = 150;
const SWEEP_SEED = 0x13_5a_c0_de;

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

describe("ggwave raw-byte evidence (clause 13.5)", () => {
  it(
    "logs recorded failing payloads under every profile",
    () => {
      for (const id of ALL_PROFILE_IDS) {
        for (const { profile, payload } of RECORDED_FAILURES) {
          const got = roundTrip(payload, id);
          const outcome =
            got === null
              ? "not decoded"
              : sameBytes(got, payload)
                ? "equal"
                : "wrong";
          console.info(
            `[recorded] ${id} (recorded under ${profile}) sent [${payload.join(",")}] -> ${outcome}` +
              (got === null ? "" : ` [${got.join(",")}]`),
          );
        }
      }
    },
    SLOW_TIMEOUT,
  );

  it(
    `logs equal, wrong and not-decoded counts for ${SWEEP_SIZE} seeded payloads per profile`,
    () => {
      const rand = seeded(SWEEP_SEED);
      const payloads = Array.from({ length: SWEEP_SIZE }, () =>
        Uint8Array.from({ length: 1 + Math.floor(rand() * 60) }, () =>
          Math.floor(rand() * 256),
        ),
      );
      for (const id of ALL_PROFILE_IDS) {
        let equal = 0;
        let wrong = 0;
        let notDecoded = 0;
        for (const payload of payloads) {
          const got = roundTrip(payload, id);
          if (got === null) notDecoded++;
          else if (sameBytes(got, payload)) equal++;
          else wrong++;
        }
        console.info(
          `[sweep] ${id}: equal=${equal} wrong=${wrong} notDecoded=${notDecoded} (seed ${SWEEP_SEED}, n=${payloads.length})`,
        );
        expect(equal + wrong + notDecoded).toBe(payloads.length);
      }
    },
    SLOW_TIMEOUT,
  );
});

describe("ggwave truncation (clause 13.2)", () => {
  it(
    "silently truncates a 141-byte payload to its first 140 bytes",
    () => {
      const payload = Uint8Array.from(
        { length: GGWAVE_MAX_PAYLOAD + 1 },
        (_, i) => (i * 37 + 11) & 0xff,
      );
      const got = roundTrip(payload, "DT_FASTEST");
      expect(got).toEqual(payload.slice(0, GGWAVE_MAX_PAYLOAD));
    },
    SLOW_TIMEOUT,
  );
});

describe("ggwave frame alignment (clause 13.3)", () => {
  // In the recorded evidence offset 768 does NOT decode, so it is not asserted.
  // Decoding depends on alignment, which is why the audio layer runs several
  // decoders offset by 256 samples.
  it(
    "decodes a 140-byte DT frame at sample offsets 0, 256 and 512",
    () => {
      const frame: Frame = {
        header: {
          version: 1,
          type: 0,
          encrypted: false,
          hop: 0,
          ttl: 7,
          messageId: Uint8Array.of(1, 2, 3, 4, 5, 6, 7, 8),
          index: 0,
          total: 1,
        },
        body: Uint8Array.from(
          { length: wireBodyCapacity({ multi: false }) },
          (_, i) => (i * 53 + 7) & 0xff,
        ),
      };
      const wire = encodeFrame(frame);
      expect(wire.ok).toBe(true);
      if (!wire.ok) return;
      expect(wire.value.length).toBe(GGWAVE_MAX_PAYLOAD);

      const samples = modulate(wire.value, "DT_FASTEST");
      for (const offset of [0, 256, 512]) {
        const got = demodulate(samples.slice(offset));
        expect(got, `offset ${offset}`).toEqual(wire.value);
      }
    },
    SLOW_TIMEOUT,
  );
});
