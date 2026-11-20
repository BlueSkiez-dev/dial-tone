import { createRequire } from "node:module";
import { beforeAll, describe, expect, it } from "vitest";
import { CHUNK_SAMPLES, RX_SAMPLE_RATE } from "../audio/constants";
import {
  createGgwaveModem,
  type GgwaveFactoryResult,
} from "../audio/ggwave-modem";
import type { Modem } from "../audio/modem";
import { type ChannelProfile, PROFILES, protocolFor } from "../audio/profiles";
import {
  createRxPipeline,
  type RxEvent,
  type RxPipeline,
} from "../audio/rx-pipeline";
import { decodeFrame, frameKey, markSeen, relayWire } from "../protocol";
import { type Clock, type Controller, createController } from "./controller";
import { copy } from "./copy";
import { createFakeTransport } from "./fake-transport";
import {
  EMPTY_RECEIVE,
  type ReceiveState,
  receiveFrame,
} from "./model/receive";
import { SEND_TTL } from "./model/send";
import type { Slip } from "./model/tape";
import type { UiTransport } from "./transport-seam";

// Slow test: relay A -> B -> C through the real vendored ggwave 0.4.0 modem and the real
// receive pipeline, with each phone run by the real Controller. Each phone's Controller sits on
// a FakeTransport whose `send` is recorded; the recorded wire is then played through the modem
// and the frames the pipeline decodes are fed back in as transport frame events.
// Only `npm.cmd run test:slow` (vitest.slow.config.ts) picks up this file.
// Relay spec tasks 6.17 and 6.20, Requirements 3.1, 3.2, 3.3, 3.12, 5.2 and 7.2.

const SLOW_TIMEOUT = 1_800_000;
/** Everything runs at the decode rate, so no resampling is involved. */
const RATE = RX_SAMPLE_RATE;
const SILENCE_SECONDS = 0.6;
/** Transport tail guard used for the sender's own gate (as the transport adds a tail). */
const TAIL_FRAMES = Math.round(0.25 * RATE);
const TEXT = "Shelter B needs water";
const FLAGS_KEY = "dialtone.v1.flags";

type Factory = () => Promise<GgwaveFactoryResult>;
type FrameEvent = Extract<RxEvent, { kind: "frame" }>;
type HeardSlip = Extract<Slip, { kind: "heard" }>;

let modem: Modem;

beforeAll(async () => {
  const factory = createRequire(import.meta.url)(
    "../../vendor/ggwave.js",
  ) as Factory;
  modem = await createGgwaveModem(factory, { txSampleRate: RATE });
  return () => modem.dispose();
});

/** Concatenates silence and waves, padded to whole chunks. Returns the stream and wave starts. */
function buildStream(waves: readonly Float32Array[]): {
  stream: Float32Array;
  starts: number[];
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
  return { stream, starts };
}

/** Pushes the whole stream in chunks from frame 0 and returns the frame events. */
function listen(pipeline: RxPipeline, stream: Float32Array): FrameEvent[] {
  const events: RxEvent[] = [];
  for (let i = 0; i < stream.length; i += CHUNK_SAMPLES) {
    events.push(
      ...pipeline.push({
        startFrame: i,
        samples: stream.slice(i, i + CHUNK_SAMPLES),
      }),
    );
  }
  return events.filter((e): e is FrameEvent => e.kind === "frame");
}

function play(wire: Uint8Array, profile: ChannelProfile): Float32Array {
  // A first send and a relay re-broadcast are both attempt 0.
  return modem.modulate(wire, protocolFor(profile, 0), profile.volume);
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function manualClock(): Clock & { advance(ms: number): void } {
  let t = 1000;
  let nextId = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  return {
    now: () => t,
    set(fn, ms) {
      const id = nextId++;
      timers.set(id, { at: t + ms, fn });
      return id;
    },
    clear(h) {
      timers.delete(h as number);
    },
    advance(ms) {
      const end = t + ms;
      for (;;) {
        const due = [...timers.entries()]
          .filter(([, v]) => v.at <= end)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        t = Math.max(t, due[1].at);
        due[1].fn();
      }
      t = end;
    },
  };
}

const settle = () => new Promise<void>((r) => setTimeout(r, 15));

interface Phone {
  readonly c: Controller;
  readonly fake: ReturnType<typeof createFakeTransport>;
  /** Every wire the Controller handed to `send`. */
  readonly sent: Uint8Array[];
  readonly clock: ReturnType<typeof manualClock>;
}

/** A powered-on Controller in the Room channel, past the self-test, with no storage writes kept. */
async function phone(): Promise<Phone> {
  const fake = createFakeTransport({ startDelayMs: 0 });
  const sent: Uint8Array[] = [];
  const recording: UiTransport = {
    ...fake,
    send: (wire) => {
      sent.push(wire);
      return fake.send(wire);
    },
  };
  const clock = manualClock();
  const data = new Map<string, string>([
    [
      FLAGS_KEY,
      JSON.stringify({
        onboarded: true,
        micWasGranted: false,
        firstPowerShown: true,
      }),
    ],
  ]);
  const c = createController({
    transport: recording,
    storage: {
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => {
        data.set(k, v);
      },
    },
    clock,
    vibrate: null,
  });
  c.powerTap();
  await settle();
  clock.advance(600);
  await settle();
  return { c, fake, sent, clock };
}

/** Feeds decoded modem frames into a phone as transport frame events. */
function hear(p: Phone, events: readonly FrameEvent[]): void {
  for (const e of events) {
    p.clock.advance(10);
    p.fake.injectFrame(e.frame, e.ownEcho);
  }
}

function heardSlips(p: Phone): HeardSlip[] {
  return p.c.getState().tape.filter((s): s is HeardSlip => s.kind === "heard");
}

describe("End-to-end relay A -> B -> C through the real modem (slow)", () => {
  /**
   * Each phone has its own rx pipeline (real ggwave decoders and own-echo check) and its own
   * Controller. Phone A sends through `transmit()` (task 3.4 records the sent Message_Key after
   * an ok send). Phone B passes the message on through `passOn()`, which sends `relayWire`.
   *
   * **Validates: Requirements 3.1, 3.2, 3.3, 3.12, 5.2, 7.2**
   */
  it(
    "B prints and passes on, C prints via 1 hop, A ignores the re-broadcast",
    async () => {
      const profile = PROFILES.room;

      // Phone A sends through the real Controller path.
      const a = await phone();
      try {
        a.c.setDraft(TEXT);
        await settle();
        a.c.transmit();
        await settle();
        expect(a.sent, "A sent one wire").toHaveLength(1);
        const sent = a.sent[0] as Uint8Array;
        const sentFrame = decodeFrame(sent);
        if (!sentFrame.ok) throw new Error("sent wire does not decode");
        const key = frameKey(sentFrame.value);
        const tapeAfterSend = a.c.getState().tape;
        expect(tapeAfterSend.filter((s) => s.kind === "sent")).toHaveLength(1);
        expect(heardSlips(a)).toHaveLength(0);
        const aWave = play(sent, profile);

        // Phone B hears A.
        const b = await phone();
        let bWave: Float32Array;
        let patchedWire: Uint8Array;
        try {
          const pipeB = await createRxPipeline({ modem, profile });
          let got: FrameEvent[];
          try {
            got = listen(pipeB, buildStream([aWave]).stream);
          } finally {
            pipeB.dispose();
          }
          expect(got.length, "B decoded A's frame").toBeGreaterThan(0);
          for (const e of got) {
            expect(sameBytes(e.wire, sent)).toBe(true);
            expect(e.ownEcho).toBe(false);
          }
          hear(b, got);
          // Sibling decoders of the same frame print nothing more: one Heard slip.
          const bHeard = heardSlips(b);
          expect(bHeard).toHaveLength(1);
          const slipB = bHeard[0] as HeardSlip;
          expect(slipB.id).toBe(key);
          expect(slipB.text).toBe(TEXT);
          expect(slipB.hop).toBe(0);
          expect(b.c.holdsWire(key)).toBe(true);

          // B passes it on: the Controller sends relayWire(held wire).
          const expected = relayWire(sent);
          if (!expected.ok)
            throw new Error(`relayWire: ${expected.error.code}`);
          b.c.passOn(key);
          await settle();
          expect(b.sent, "B sent one wire").toHaveLength(1);
          patchedWire = b.sent[0] as Uint8Array;
          expect(sameBytes(patchedWire, expected.value)).toBe(true);
          const passed = heardSlips(b).find((s) => s.id === key);
          expect(passed?.passedOn).toBe(true);
          bWave = play(patchedWire, profile);
        } finally {
          b.c.dispose();
        }

        // Phone C hears B's re-broadcast.
        const c = await phone();
        try {
          const pipeC = await createRxPipeline({ modem, profile });
          let got: FrameEvent[];
          try {
            got = listen(pipeC, buildStream([bWave]).stream);
          } finally {
            pipeC.dispose();
          }
          expect(got.length, "C decoded B's re-broadcast").toBeGreaterThan(0);
          for (const e of got) {
            expect(sameBytes(e.wire, patchedWire)).toBe(true);
            expect(e.ownEcho).toBe(false);
          }
          hear(c, got);
          const cHeard = heardSlips(c);
          expect(cHeard).toHaveLength(1);
          const slipC = cHeard[0] as HeardSlip;
          expect(slipC.text).toBe(TEXT);
          expect(slipC.id).toBe(key);
          expect(slipC.hop).toBe(1);
          expect(slipC.relay?.ttl).toBe(SEND_TTL - 1);
          expect(copy.relay.via(slipC.hop)).toBe("via 1 hop");
        } finally {
          c.c.dispose();
        }

        // Phone A: its own transmission (gated, noted for own-echo), then B's re-broadcast.
        const pipeA = await createRxPipeline({ modem, profile });
        let got: FrameEvent[];
        try {
          const { stream, starts } = buildStream([aWave, bWave]);
          const ownStart = starts[0] as number;
          pipeA.gate(ownStart, ownStart + aWave.length + TAIL_FRAMES);
          pipeA.noteSent(sent, ownStart);
          got = listen(pipeA, stream);
        } finally {
          pipeA.dispose();
        }
        expect(got.length, "A decoded B's re-broadcast").toBeGreaterThan(0);
        for (const e of got) {
          expect(sameBytes(e.wire, patchedWire)).toBe(true);
        }

        // The Controller prints no slip: A's tape is unchanged.
        hear(a, got);
        expect(
          a.c.getState().tape,
          `A printed its own message relayed back (key ${key})`,
        ).toEqual(tapeAfterSend);
        expect(a.c.holdsWire(key)).toBe(false);

        // The Controller keeps its seen list private, so the seen-list check replays A's receive
        // state with the same step task 3.4 adds after an ok send (decodeFrame plus markSeen).
        let rxA: ReceiveState = {
          ...EMPTY_RECEIVE,
          seen: markSeen(EMPTY_RECEIVE.seen, frameKey(sentFrame.value)),
        };
        const seenBefore = rxA.seen;
        for (const e of got) {
          const r = receiveFrame(rxA, {
            frame: e.frame,
            ownEcho: e.ownEcho,
            atMs: 3_000,
          });
          // A duplicate of A's own message: no slip, seen list unchanged.
          expect(
            r.slip,
            `A printed its own message relayed back (ownEcho ${e.ownEcho}, key ${key})`,
          ).toBeNull();
          expect(r.next.seen).toEqual(seenBefore);
          rxA = r.next;
        }
      } finally {
        a.c.dispose();
      }
    },
    SLOW_TIMEOUT,
  );
});
