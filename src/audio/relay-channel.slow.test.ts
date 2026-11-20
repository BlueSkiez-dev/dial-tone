import { createRequire } from "node:module";
import fc from "fast-check";
import { beforeAll, describe, expect, it } from "vitest";
import {
  decodeFrame,
  encodeFrame,
  type Frame,
  MESSAGE_ID_LEN,
  relayWire,
  TAG_LEN,
} from "../protocol";
import { CHUNK_SAMPLES, RX_SAMPLE_RATE } from "./constants";
import { createGgwaveModem, type GgwaveFactoryResult } from "./ggwave-modem";
import type { Modem } from "./modem";
import { type ChannelProfile, PROFILES, protocolFor } from "./profiles";
import { createRxPipeline, type RxEvent, type RxPipeline } from "./rx-pipeline";

// Slow tests: a relayed (patched) wire through the real vendored ggwave 0.4.0 modem and the real
// receive pipeline. Only `npm.cmd run test:slow` (vitest.slow.config.ts) picks up this file.
// Relay spec tasks 6.17 and 6.20, Requirements 7.2 and 9.19. Wires are built from src/protocol
// only. The A -> B -> C case lives in src/ui/relay-chain.slow.test.ts (src/audio never imports
// src/ui).

const SLOW_TIMEOUT = 1_800_000;
/** Everything runs at the decode rate, so no resampling is involved. */
const RATE = RX_SAMPLE_RATE;
const SILENCE_SECONDS = 0.6;
// verbose prints the seed and path on failure so CI failures can be replayed.
const PARAMS = { verbose: true, numRuns: 3 } as const;
/** Bodies stay short to keep airtime (about 0.1 s per byte) and runtime low. */
const MAX_BODY = 48;

type Factory = () => Promise<GgwaveFactoryResult>;

let modem: Modem;

beforeAll(async () => {
  const factory = createRequire(import.meta.url)(
    "../../vendor/ggwave.js",
  ) as Factory;
  modem = await createGgwaveModem(factory, { txSampleRate: RATE });
  return () => modem.dispose();
});

type FrameEvent = Extract<RxEvent, { kind: "frame" }>;

/** Concatenates silence and waves, padded to whole chunks. */
function buildStream(waves: readonly Float32Array[]): {
  stream: Float32Array;
} {
  const silence = Math.round(SILENCE_SECONDS * RATE);
  const starts: number[] = [];
  let length = silence;
  for (const w of waves) {
    starts.push(length);
    length += w.length + silence;
  }
  const stream = new Float32Array(
    Math.ceil(length / CHUNK_SAMPLES) * CHUNK_SAMPLES,
  );
  waves.forEach((w, i) => {
    stream.set(w, starts[i]);
  });
  return { stream };
}

/** Pushes the whole stream in chunks from frame 0 and returns every event. */
function listen(pipeline: RxPipeline, stream: Float32Array): RxEvent[] {
  const events: RxEvent[] = [];
  for (let i = 0; i < stream.length; i += CHUNK_SAMPLES) {
    events.push(
      ...pipeline.push({
        startFrame: i,
        samples: stream.slice(i, i + CHUNK_SAMPLES),
      }),
    );
  }
  return events;
}

function frames(events: readonly RxEvent[]): FrameEvent[] {
  return events.filter((e): e is FrameEvent => e.kind === "frame");
}

function play(wire: Uint8Array, profile: ChannelProfile): Float32Array {
  // A relay re-broadcast is a first send of the patched bytes: attempt 0.
  return modem.modulate(wire, protocolFor(profile, 0), profile.volume);
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** Single-frame Relayable_Frames of every type but KEY_OFFER, either encrypted flag. */
const relayableArb: fc.Arbitrary<Frame> = fc
  .record({
    type: fc.constantFrom<Frame["header"]["type"]>(0, 1, 2, 3, 5),
    encrypted: fc.boolean(),
    hop: fc.integer({ min: 0, max: 14 }),
    ttl: fc.integer({ min: 1, max: 15 }),
    messageId: fc.uint8Array({
      minLength: MESSAGE_ID_LEN,
      maxLength: MESSAGE_ID_LEN,
    }),
  })
  .chain((h) =>
    fc
      .uint8Array({ minLength: h.encrypted ? TAG_LEN : 0, maxLength: MAX_BODY })
      .map(
        (body): Frame => ({
          header: { version: 1, ...h, index: 0, total: 1 },
          body,
        }),
      ),
  );

describe("A Patched_Wire survives the modem or is rejected (slow)", () => {
  for (const profile of Object.values(PROFILES)) {
    /**
     * ggwave may return nothing or wrong bytes. That is allowed. A frame event whose frame
     * differs from the decoded Patched_Wire fails the property.
     *
     * **Validates: Requirements 7.2, 9.19**
     */
    it(
      `${profile.id}: a relayed wire gives the same frame, a decode error, or nothing`,
      async () => {
        let delivered = 0;
        let runs = 0;
        await fc.assert(
          fc.asyncProperty(relayableArb, async (frame) => {
            runs++;
            const held = encodeFrame(frame);
            if (!held.ok) throw new Error(`encodeFrame: ${held.error.code}`);
            const patched = relayWire(held.value);
            if (!patched.ok)
              throw new Error(`relayWire: ${patched.error.code}`);
            const expected = decodeFrame(patched.value);
            if (!expected.ok) throw new Error("patched wire does not decode");
            expect(expected.value.header.hop).toBe(frame.header.hop + 1);
            expect(expected.value.header.ttl).toBe(frame.header.ttl - 1);

            const pipeline = await createRxPipeline({ modem, profile });
            try {
              const { stream } = buildStream([play(patched.value, profile)]);
              const got = frames(listen(pipeline, stream));
              for (const e of got) {
                // Never a different frame. Decode errors arrive as "rejected" events.
                expect(sameBytes(e.wire, patched.value)).toBe(true);
                expect(e.frame).toEqual(expected.value);
              }
              if (got.length > 0) delivered++;
            } finally {
              pipeline.dispose();
            }
          }),
          PARAMS,
        );
        console.info(
          `[relay-channel] ${profile.id} (${protocolFor(profile, 0)}): delivered ${delivered} of ${runs}`,
        );
      },
      SLOW_TIMEOUT,
    );
  }
});
