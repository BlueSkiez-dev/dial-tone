import fc from "fast-check";
import { describe, expect, test } from "vitest";
import { encodeFrame, makeFrames } from "../protocol";
import { CHUNK_SAMPLES } from "./constants";
import type { Modem } from "./modem";
import type { ChannelProfile, ProfileId, ProtocolId } from "./profiles";
import { allRxProtocols, PROFILES, protocolFor, rxProtocols } from "./profiles";
import type { RxPipeline } from "./rx-pipeline";
import { createRxPipeline } from "./rx-pipeline";
import { createFakeModem } from "./testing/fake-modem";

// Slow-ish: every run builds a pipeline with four decoders. On failure fast-check prints the seed.
const RUNS = { numRuns: 30, verbose: true };

const RATE = 48_000;
const TAIL_CHUNKS = 2;

const profileId = fc.constantFrom<ProfileId>("room", "call", "quiet");
const attempt = fc.integer({ min: 0, max: 3 });
const messageId = fc.uint8Array({ minLength: 8, maxLength: 8 });
const text = fc
  .string({ unit: "grapheme-ascii", minLength: 1, maxLength: 30 })
  .map((s) => new TextEncoder().encode(s));

/**
 * Every family at every speed, NORMAL included, plus one name that is not a ggwave protocol.
 * ProtocolId excludes NORMAL speeds on purpose, so these are cast. The fake modem takes any string.
 */
const anyProtocol = fc.constantFrom(
  ...(["AUDIBLE", "DT", "ULTRASOUND"] as const).flatMap((family) =>
    (["FASTEST", "FAST", "NORMAL"] as const).map(
      (speed) => `${family}_${speed}` as ProtocolId,
    ),
  ),
  "BOGUS_FAST" as ProtocolId,
);

function wireFor(id: Uint8Array, body: Uint8Array): Uint8Array {
  const frames = makeFrames(
    { type: 0, encrypted: false, hop: 0, ttl: 3, messageId: id },
    [body],
  );
  if (!frames.ok) throw new Error(`makeFrames failed: ${frames.error.code}`);
  const first = frames.value[0];
  if (first === undefined) throw new Error("no frame");
  const wire = encodeFrame(first);
  if (!wire.ok) throw new Error(`encodeFrame failed: ${wire.error.code}`);
  return wire.value;
}

/** Counts createDecoders calls. Everything else is the fake modem. */
function spyModem(): { modem: Modem; created: () => number } {
  const inner = createFakeModem({ txSampleRate: RATE });
  let calls = 0;
  const modem: Modem = {
    txSampleRate: inner.txSampleRate,
    rxSampleRate: inner.rxSampleRate,
    modulate: (payload, protocol, volume) =>
      inner.modulate(payload, protocol, volume),
    createDecoders: (protocols, count) => {
      calls++;
      return inner.createDecoders(protocols, count);
    },
    dispose: () => inner.dispose(),
  };
  return { modem, created: () => calls };
}

/** Pushes one packet followed by silence as contiguous chunks. Returns delivery and the next start frame. */
function send(
  pipeline: RxPipeline,
  modem: Modem,
  protocol: ProtocolId,
  wire: Uint8Array,
  startFrame: number,
): { delivered: boolean; next: number } {
  const packet = modem.modulate(wire, protocol, 25);
  const chunks = Math.ceil(packet.length / CHUNK_SAMPLES) + TAIL_CHUNKS;
  const signal = new Float32Array(chunks * CHUNK_SAMPLES);
  signal.set(packet, 0);
  let delivered = false;
  let at = startFrame;
  for (let c = 0; c < chunks; c++) {
    const samples = signal.slice(c * CHUNK_SAMPLES, (c + 1) * CHUNK_SAMPLES);
    for (const event of pipeline.push({ startFrame: at, samples })) {
      if (event.kind === "frame") delivered = true;
    }
    at += CHUNK_SAMPLES;
  }
  return { delivered, next: at };
}

describe("Property 14: Receive covers every family", () => {
  /** **Validates: Requirements 1.5, 1.9, 5.2** */
  test("default scope delivers protocolFor(p, a) whichever profile is passed", async () => {
    await fc.assert(
      fc.asyncProperty(
        profileId,
        profileId,
        attempt,
        messageId,
        text,
        async (p, passed, a, id, body) => {
          const { modem } = spyModem();
          const pipeline = await createRxPipeline({
            modem,
            profile: PROFILES[passed],
          });
          const r = send(
            pipeline,
            modem,
            protocolFor(PROFILES[p], a),
            wireFor(id, body),
            0,
          );
          pipeline.dispose();
          expect(r.delivered).toBe(true);
        },
      ),
      RUNS,
    );
  });

  /** **Validates: Requirements 1.5, 1.9, 5.2** */
  test("default scope delivers a packet iff its protocol is in allRxProtocols()", async () => {
    await fc.assert(
      fc.asyncProperty(
        profileId,
        anyProtocol,
        messageId,
        text,
        async (passed, protocol, id, body) => {
          const { modem } = spyModem();
          const pipeline = await createRxPipeline({
            modem,
            profile: PROFILES[passed],
          });
          const r = send(pipeline, modem, protocol, wireFor(id, body), 0);
          pipeline.dispose();
          expect(r.delivered).toBe(allRxProtocols().includes(protocol));
        },
      ),
      RUNS,
    );
  });

  /** **Validates: Requirements 1.5, 1.10, 2.12** */
  test('with rxScope "active" delivery follows rxProtocols(profile), then rxProtocols(q) after setProfile(q)', async () => {
    await fc.assert(
      fc.asyncProperty(
        profileId,
        profileId,
        anyProtocol,
        anyProtocol,
        messageId,
        messageId,
        text,
        async (p, q, first, second, id1, id2, body) => {
          const { modem } = spyModem();
          const pipeline = await createRxPipeline({
            modem,
            profile: PROFILES[p],
            rxScope: "active",
          });
          const r1 = send(pipeline, modem, first, wireFor(id1, body), 0);
          expect(r1.delivered).toBe(rxProtocols(PROFILES[p]).includes(first));

          await pipeline.setProfile(PROFILES[q]);
          const r2 = send(pipeline, modem, second, wireFor(id2, body), r1.next);
          expect(r2.delivered).toBe(rxProtocols(PROFILES[q]).includes(second));
          pipeline.dispose();
        },
      ),
      RUNS,
    );
  });

  /** **Validates: Requirements 1.9, 1.10, 2.12** */
  test("with the default scope setProfile(q) changes nothing and creates no decoders", async () => {
    await fc.assert(
      fc.asyncProperty(
        profileId,
        profileId,
        anyProtocol,
        anyProtocol,
        messageId,
        messageId,
        text,
        async (p, q, first, second, id1, id2, body) => {
          const { modem, created } = spyModem();
          const pipeline = await createRxPipeline({
            modem,
            profile: PROFILES[p],
          });
          expect(created()).toBe(1);
          const r1 = send(pipeline, modem, first, wireFor(id1, body), 0);

          const other: ChannelProfile = PROFILES[q];
          await pipeline.setProfile(other);
          expect(created()).toBe(1);

          const r2 = send(pipeline, modem, second, wireFor(id2, body), r1.next);
          pipeline.dispose();
          expect(r1.delivered).toBe(allRxProtocols().includes(first));
          expect(r2.delivered).toBe(allRxProtocols().includes(second));
        },
      ),
      RUNS,
    );
  });
});
