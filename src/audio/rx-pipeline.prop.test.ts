import fc from "fast-check";
import { describe, expect, test } from "vitest";
import type { Result } from "../protocol";
import {
  decodeFrame,
  encodeFrame,
  makeFrames,
  patchRouting,
} from "../protocol";
import { CHUNK_SAMPLES } from "./constants";
import type { Modem } from "./modem";
import type { ProtocolId } from "./profiles";
import { allRxProtocols, PROFILES } from "./profiles";
import type { RxEvent, RxPipeline } from "./rx-pipeline";
import { createRxPipeline } from "./rx-pipeline";
import { createFakeModem } from "./testing/fake-modem";

// Few runs: every run builds a pipeline with a carrier FFT per chunk.
// verbose: true makes fast-check print the seed and path on failure.
const RUNS = { numRuns: 12, verbose: true };

const RATE = 48_000;
const CHUNK = CHUNK_SAMPLES;
/** Samples before the first packet so all four decoder offsets (0..768) can see it. */
const LEAD = 1024;

// ---------------------------------------------------------------- helpers

function mustOk<T, E>(r: Result<T, E>): T {
  if (!r.ok) throw new Error(`unexpected error ${JSON.stringify(r.error)}`);
  return r.value;
}

function wireOf(
  id: Uint8Array,
  body: Uint8Array,
  hop = 0,
  ttl = 3,
  tag?: number,
): Uint8Array {
  const messageId = id.slice();
  if (tag !== undefined) messageId[0] = tag;
  const frames = mustOk(
    makeFrames({ type: 0, encrypted: false, hop, ttl, messageId }, [body]),
  );
  const frame = frames[0];
  if (frame === undefined) throw new Error("no frame built");
  return mustOk(encodeFrame(frame));
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

interface Placed {
  at: number;
  wire: Uint8Array;
  protocol?: ProtocolId;
}

function makeStream(modem: Modem, placed: Placed[], chunks: number) {
  const out = new Float32Array(chunks * CHUNK);
  for (const p of placed) {
    out.set(modem.modulate(p.wire, p.protocol ?? "DT_FASTEST", 25), p.at);
  }
  return out;
}

interface Tagged {
  chunk: number;
  event: RxEvent;
}

/** Pushes the stream chunk by chunk from stream frame 0 and tags each event with its chunk index. */
function run(pipeline: RxPipeline, stream: Float32Array): Tagged[] {
  const out: Tagged[] = [];
  const chunks = stream.length / CHUNK;
  for (let i = 0; i < chunks; i++) {
    const samples = stream.slice(i * CHUNK, (i + 1) * CHUNK);
    for (const event of pipeline.push({ startFrame: i * CHUNK, samples })) {
      out.push({ chunk: i, event });
    }
  }
  return out;
}

function frameEvents(tagged: Tagged[]) {
  return tagged.flatMap((t) => (t.event.kind === "frame" ? [t.event] : []));
}

function rejectedEvents(tagged: Tagged[]) {
  return tagged.flatMap((t) => (t.event.kind === "rejected" ? [t.event] : []));
}

function chunksFor(lastSample: number): number {
  return Math.ceil(lastSample / CHUNK) + 4;
}

const idArb = fc.uint8Array({ minLength: 8, maxLength: 8 });
const bodyArb = fc.uint8Array({ minLength: 1, maxLength: 20 });
const hopArb = fc.integer({ min: 0, max: 15 });

// ------------------------------------------------------------- Property 3

describe("Property 3: Alignment coverage", () => {
  /** **Validates: Requirements 4.1, 4.4, 5.2** */
  test("four decoders emit the frame once at every start frame, one decoder misses the blocked quarter", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 3 }),
        fc.integer({ min: LEAD, max: LEAD + 8191 }),
        idArb,
        bodyArb,
        async (quarter, start, id, body) => {
          const wire = wireOf(id, body);
          const make = () =>
            createFakeModem({
              txSampleRate: RATE,
              blockedPhases: (phase) => Math.floor(phase / 256) === quarter,
            });
          const chunks = chunksFor(start + wire.length + 8);

          const modem4 = make();
          const four = await createRxPipeline({
            modem: modem4,
            profile: PROFILES.call,
          });
          const stream4 = makeStream(modem4, [{ at: start, wire }], chunks);
          const hits4 = frameEvents(run(four, stream4)).filter((e) =>
            sameBytes(e.wire, wire),
          );
          four.dispose();
          modem4.dispose();
          expect(hits4.length).toBe(1);

          const modem1 = make();
          const one = await createRxPipeline({
            modem: modem1,
            profile: PROFILES.call,
            decoderOffsets: [0],
          });
          const stream1 = makeStream(modem1, [{ at: start, wire }], chunks);
          const hits1 = frameEvents(run(one, stream1)).filter((e) =>
            sameBytes(e.wire, wire),
          );
          one.dispose();
          modem1.dispose();
          const blocked = Math.floor((start % CHUNK) / 256) === quarter;
          expect(hits1.length).toBe(blocked ? 0 : 1);
        },
      ),
      RUNS,
    );
  });

  /** **Validates: Requirements 5.2, 5.8** */
  test("stats.decoderHits counts per offset and siblings are merged", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 3 }),
        fc.integer({ min: 0, max: 255 }),
        idArb,
        bodyArb,
        async (m, r, id, body) => {
          // Quarter 0 is blocked. Decoder k sees phase (start - 256k) mod 1024, so only k === m is blocked.
          const start = 2048 + r + 256 * m;
          const wire = wireOf(id, body);
          const modem = createFakeModem({
            txSampleRate: RATE,
            blockedPhases: (phase) => phase < 256,
          });
          const pipeline = await createRxPipeline({
            modem,
            profile: PROFILES.call,
          });
          const stream = makeStream(
            modem,
            [{ at: start, wire }],
            chunksFor(start + wire.length + 8),
          );
          const events = run(pipeline, stream);
          const stats = pipeline.stats();
          pipeline.dispose();
          modem.dispose();
          expect(frameEvents(events).length).toBe(1);
          expect(stats.decoderHits).toEqual(
            [0, 1, 2, 3].map((k) => (k === m ? 0 : 1)),
          );
          expect(stats.siblingDuplicates).toBe(2);
          expect(stats.frames).toBe(1);
        },
      ),
      RUNS,
    );
  });
});

describe("sibling merge inside the pipeline", () => {
  /** **Validates: Requirements 5.2, 5.8** */
  test("four decoders decode one packet: one frame event, three duplicates", async () => {
    const modem = createFakeModem({ txSampleRate: RATE });
    const pipeline = await createRxPipeline({ modem, profile: PROFILES.call });
    const wire = wireOf(new Uint8Array(8).fill(9), new Uint8Array([1, 2, 3]));
    const events = run(
      pipeline,
      makeStream(
        modem,
        [{ at: 2048, wire }],
        chunksFor(2048 + wire.length + 8),
      ),
    );
    const stats = pipeline.stats();
    pipeline.dispose();
    modem.dispose();
    const frames = frameEvents(events);
    expect(frames.length).toBe(1);
    expect(sameBytes(frames[0]?.wire ?? new Uint8Array(0), wire)).toBe(true);
    expect(stats.siblingDuplicates).toBe(3);
    expect(stats.decoderHits).toEqual([1, 1, 1, 1]);
  });
});

// ------------------------------------------------------------- Property 5

describe("Property 5: Frames are the frames decodeFrame accepts", () => {
  const validArb = fc
    .tuple(idArb, bodyArb, hopArb, hopArb)
    .map(([id, body, hop, ttl]) => wireOf(id, body, hop, ttl));
  const payloadArb = fc.oneof(
    validArb,
    validArb,
    fc.constant(new Uint8Array(0)),
    fc.uint8Array({ minLength: 141, maxLength: 200 }),
    fc.uint8Array({ minLength: 1, maxLength: 140 }),
  );
  const flipArb = fc.option(
    fc.record({
      idx: fc.nat(),
      mask: fc.integer({ min: 1, max: 255 }),
    }),
    { nil: undefined },
  );

  /** **Validates: Requirements 5.1, 5.4, 5.5** */
  test("frame event iff decodeFrame accepts, else rejected with the same code", async () => {
    await fc.assert(
      fc.asyncProperty(payloadArb, flipArb, async (payload, flip) => {
        const corrupt = (p: Uint8Array): Uint8Array => {
          const copy = p.slice();
          if (flip === undefined || copy.length === 0) return copy;
          const i = flip.idx % copy.length;
          copy[i] = (copy[i] ?? 0) ^ flip.mask;
          return copy;
        };
        const received = corrupt(payload);
        const expected = decodeFrame(received);

        const modem = createFakeModem({ txSampleRate: RATE, corrupt });
        const pipeline = await createRxPipeline({
          modem,
          profile: PROFILES.call,
        });
        const stream = makeStream(
          modem,
          [{ at: LEAD, wire: payload }],
          chunksFor(LEAD + payload.length + 8),
        );
        const events = run(pipeline, stream);
        pipeline.dispose();
        modem.dispose();

        const frames = frameEvents(events);
        const rejected = rejectedEvents(events);
        if (expected.ok) {
          expect(frames.length).toBe(1);
          expect(rejected.length).toBe(0);
          expect(
            sameBytes(frames[0]?.wire ?? new Uint8Array(0), received),
          ).toBe(true);
        } else {
          expect(frames.length).toBe(0);
          expect(rejected.length).toBe(1);
          expect(rejected[0]?.code).toBe(expected.error.code);
          expect(rejected[0]?.byteLength).toBe(received.length);
        }
      }),
      RUNS,
    );
  });
});

// ------------------------------------------------------------- Property 6

describe("Property 6: Gate silences self-hearing", () => {
  /** **Validates: Requirements 7.2, 7.3** */
  test("nothing comes from gated chunks or packets touching the range, and a packet at any frame after it is received once", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 4096, max: 7000 }),
        fc.integer({ min: 400, max: 4000 }),
        fc.nat({ max: 3840 }),
        fc.integer({ min: 1, max: 20 }),
        fc.integer({ min: 1, max: 20 }),
        fc.integer({ min: 0, max: 2000 }),
        idArb,
        bodyArb,
        async (from, len, inside, dB, dD, extra, id, body) => {
          const until = from + len;
          const wireB = wireOf(id, body, 0, 3, 1); // across the start edge
          const wireA = wireOf(id, body, 0, 3, 2); // inside
          const wireD = wireOf(id, body, 0, 3, 3); // across the end edge
          const wireC = wireOf(id, body, 0, 3, 4); // after
          // Any frame after the range, including inside the last chunk that overlaps it. The 40
          // samples clear the tail of packet D (at most 40 samples long), which may end after `until`.
          const startC = until + 40 + extra;
          const startA = from + 60 + (inside % (len - 160 + 1));

          const modem = createFakeModem({ txSampleRate: RATE });
          const pipeline = await createRxPipeline({
            modem,
            profile: PROFILES.call,
          });
          pipeline.gate(from, until);
          const stream = makeStream(
            modem,
            [
              { at: from - dB, wire: wireB },
              { at: startA, wire: wireA },
              { at: until - dD, wire: wireD },
              { at: startC, wire: wireC },
            ],
            chunksFor(startC + wireC.length + 8),
          );
          const events = run(pipeline, stream);
          pipeline.dispose();
          modem.dispose();

          // Chunks wholly inside the range are skipped. Partly overlapping chunks are processed
          // with the range zeroed, so only packets that start in the range or are cut by it must
          // stay silent (checked below). Packets B and D lose their last or first samples, which
          // always includes a marker or END sample, so the fake modem cannot decode them.
          for (const { chunk, event } of events) {
            const wholly =
              from <= chunk * CHUNK && (chunk + 1) * CHUNK <= until;
            if (!wholly) continue;
            expect(["frame", "rejected", "carrier"]).not.toContain(event.kind);
          }
          const frames = frameEvents(events);
          for (const w of [wireB, wireA, wireD]) {
            expect(frames.some((e) => sameBytes(e.wire, w))).toBe(false);
          }
          expect(rejectedEvents(events).length).toBe(0);
          expect(frames.filter((e) => sameBytes(e.wire, wireC)).length).toBe(1);
        },
      ),
      RUNS,
    );
  });
});

// -------------------------------------------------------------- own echo

describe("ownEcho flag in the pipeline", () => {
  const wire = wireOf(new Uint8Array(8).fill(5), new Uint8Array([7, 8, 9]));

  /** **Validates: Requirements 7.4, 7.5** */
  test("a noted wire is an echo whichever protocol it arrives in", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...allRxProtocols()),
        async (protocol) => {
          const modem = createFakeModem({ txSampleRate: RATE });
          const pipeline = await createRxPipeline({
            modem,
            profile: PROFILES.call,
          });
          pipeline.noteSent(wire, 0);
          const events = run(
            pipeline,
            makeStream(
              modem,
              [{ at: 2048, wire, protocol }],
              chunksFor(2048 + wire.length + 8),
            ),
          );
          pipeline.dispose();
          modem.dispose();
          const frames = frameEvents(events);
          expect(frames.length).toBe(1);
          expect(frames[0]?.ownEcho).toBe(true);
        },
      ),
      RUNS,
    );
  });

  /** **Validates: Requirements 7.4, 7.5** */
  test("a patchRouting copy is not an echo, and an unnoted wire is not an echo", async () => {
    const patched = mustOk(patchRouting(wire, 1, 2));
    expect(sameBytes(patched, wire)).toBe(false);

    const modem = createFakeModem({ txSampleRate: RATE });
    const pipeline = await createRxPipeline({ modem, profile: PROFILES.call });
    pipeline.noteSent(wire, 0);
    const events = run(
      pipeline,
      makeStream(
        modem,
        [{ at: 2048, wire: patched }],
        chunksFor(2048 + patched.length + 8),
      ),
    );
    pipeline.dispose();
    modem.dispose();
    const frames = frameEvents(events);
    expect(frames.length).toBe(1);
    expect(frames[0]?.ownEcho).toBe(false);

    const modem2 = createFakeModem({ txSampleRate: RATE });
    const quiet = await createRxPipeline({
      modem: modem2,
      profile: PROFILES.call,
    });
    const events2 = run(
      quiet,
      makeStream(
        modem2,
        [{ at: 2048, wire }],
        chunksFor(2048 + wire.length + 8),
      ),
    );
    quiet.dispose();
    modem2.dispose();
    expect(frameEvents(events2)[0]?.ownEcho).toBe(false);
  });
});
