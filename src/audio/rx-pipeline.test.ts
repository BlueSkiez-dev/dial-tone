import { describe, expect, it } from "vitest";
import type { Frame } from "../protocol";
import { encodeFrame } from "../protocol";
import { CHUNK_SAMPLES } from "./constants";
import type { Modem, ModemDecoder } from "./modem";
import { PROFILES, type ProtocolId, protocolFor, rxSet } from "./profiles";
import type { RxEvent } from "./rx-pipeline";
import { createRxPipeline } from "./rx-pipeline";
import { createFakeModem } from "./testing/fake-modem";

const SAMPLE_RATE = 48_000;
const CALL = PROFILES.call;

function makeWire(): Uint8Array {
  const frame: Frame = {
    header: {
      version: 1,
      type: 0,
      encrypted: false,
      hop: 0,
      ttl: 3,
      messageId: Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]),
      index: 0,
      total: 1,
    },
    body: new TextEncoder().encode("hi"),
  };
  const encoded = encodeFrame(frame);
  if (!encoded.ok) throw new Error(`encodeFrame failed: ${encoded.error.code}`);
  return encoded.value;
}

/** One chunk of silence with the fake modem's packet written at its start. */
function packetChunk(modem: Modem, wire: Uint8Array): Float32Array {
  const wave = modem.modulate(wire, protocolFor(CALL, 0), CALL.volume);
  const chunk = new Float32Array(CHUNK_SAMPLES);
  chunk.set(wave, 0);
  return chunk;
}

function silence(): Float32Array {
  return new Float32Array(CHUNK_SAMPLES);
}

interface Spy {
  modem: Modem;
  createCalls: { protocols: readonly ProtocolId[]; count: number }[];
  disposed: { count: number };
}

/** Wraps a fake modem so tests can see createDecoders calls and decoder disposals. */
function spyModem(onCall?: (name: "modulate" | "feed" | "reset") => void): Spy {
  const inner = createFakeModem({ txSampleRate: SAMPLE_RATE, onCall });
  const createCalls: Spy["createCalls"] = [];
  const disposed = { count: 0 };
  const modem: Modem = {
    txSampleRate: inner.txSampleRate,
    rxSampleRate: inner.rxSampleRate,
    modulate: (payload, protocol, volume) =>
      inner.modulate(payload, protocol, volume),
    async createDecoders(protocols, count) {
      createCalls.push({ protocols: [...protocols], count });
      const made = await inner.createDecoders(protocols, count);
      return made.map((d): ModemDecoder => {
        return {
          protocols: d.protocols,
          feed: (block) => d.feed(block),
          reset: () => d.reset(),
          dispose: () => {
            disposed.count++;
            d.dispose();
          },
        };
      });
    },
    dispose: () => inner.dispose(),
  };
  return { modem, createCalls, disposed };
}

describe("rx pipeline", () => {
  it("counts and drops a chunk of the wrong length (3.6)", async () => {
    const { modem } = spyModem();
    const pipeline = await createRxPipeline({ modem, profile: CALL });
    const events = pipeline.push({
      startFrame: 0,
      samples: new Float32Array(CHUNK_SAMPLES - 1),
    });
    expect(events).toEqual([]);
    expect(pipeline.stats().invalidChunks).toBe(1);
    expect(pipeline.stats().chunks).toBe(0);

    // A dropped chunk does not set the expected position.
    const next = pipeline.push({ startFrame: 4096, samples: silence() });
    expect(next).toEqual([]);
    expect(pipeline.stats().chunks).toBe(1);
    expect(pipeline.stats().discontinuities).toBe(0);
    pipeline.dispose();
  });

  it("emits discontinuity on a startFrame jump and resets every decoder (3.9)", async () => {
    const calls: string[] = [];
    const { modem } = spyModem((name) => calls.push(name));
    const offsets = [0, 256, 512];
    const pipeline = await createRxPipeline({
      modem,
      profile: CALL,
      decoderOffsets: offsets,
    });
    const resets = (): number => calls.filter((c) => c === "reset").length;

    expect(pipeline.push({ startFrame: 0, samples: silence() })).toEqual([]);
    expect(
      pipeline.push({ startFrame: CHUNK_SAMPLES, samples: silence() }),
    ).toEqual([]);
    expect(resets()).toBe(0);

    const jump = 5 * CHUNK_SAMPLES;
    const events = pipeline.push({ startFrame: jump, samples: silence() });
    expect(events).toEqual([
      {
        kind: "discontinuity",
        atFrame: jump,
        missingFrames: jump - 2 * CHUNK_SAMPLES,
      },
    ]);
    expect(resets()).toBe(offsets.length);
    expect(pipeline.stats().discontinuities).toBe(1);
    pipeline.dispose();
  });

  it("disposes every decoder on dispose, once (4.8)", async () => {
    const { modem, disposed } = spyModem();
    const pipeline = await createRxPipeline({
      modem,
      profile: CALL,
      decoderOffsets: [0, 256, 512, 768],
    });
    expect(disposed.count).toBe(0);
    pipeline.dispose();
    expect(disposed.count).toBe(4);
    pipeline.dispose();
    expect(disposed.count).toBe(4);
    expect(pipeline.push({ startFrame: 0, samples: silence() })).toEqual([]);
  });

  it("gives two frame events for the same frame sent far apart (5.2)", async () => {
    const { modem } = spyModem();
    const pipeline = await createRxPipeline({ modem, profile: CALL });
    const wire = makeWire();
    const events: RxEvent[] = [];
    const gapChunks = 7;
    let frame = 0;
    const push = (samples: Float32Array): void => {
      events.push(...pipeline.push({ startFrame: frame, samples }));
      frame += CHUNK_SAMPLES;
    };

    push(packetChunk(modem, wire));
    for (let i = 0; i < gapChunks; i++) push(silence());
    push(packetChunk(modem, wire));
    push(silence());

    const frames = events.filter((e) => e.kind === "frame");
    expect(frames).toHaveLength(2);
    expect(pipeline.stats().frames).toBe(2);
    for (const e of frames) {
      if (e.kind === "frame")
        expect(Array.from(e.wire)).toEqual(Array.from(wire));
    }
    pipeline.dispose();
  });

  it("calls createDecoders once at creation with rxSet and the offset count (5.2)", async () => {
    for (const rxScope of ["all", "active"] as const) {
      const { modem, createCalls } = spyModem();
      const offsets = [0, 256, 512];
      const pipeline = await createRxPipeline({
        modem,
        profile: CALL,
        rxScope,
        decoderOffsets: offsets,
      });
      expect(createCalls).toHaveLength(1);
      expect(createCalls[0]?.protocols).toEqual([...rxSet(rxScope, CALL)]);
      expect(createCalls[0]?.count).toBe(offsets.length);

      pipeline.push({ startFrame: 0, samples: silence() });
      pipeline.gate(0, 10);
      pipeline.dispose();
      expect(createCalls).toHaveLength(1);
    }
  });

  it("setProfile with rxScope active disposes the old decoders before creating, within a 4-decoder budget", async () => {
    const modem = createFakeModem({
      txSampleRate: SAMPLE_RATE,
      maxDecoders: 4,
    });
    const pipeline = await createRxPipeline({
      modem,
      profile: CALL,
      rxScope: "active",
      decoderOffsets: [0, 256, 512, 768],
    });
    await expect(pipeline.setProfile(PROFILES.quiet)).resolves.toBeUndefined();
    pipeline.dispose();
  });

  it("names the band's profile in carrier events and never emits one for a null band (8.10, 8.11)", async () => {
    const { modem } = spyModem();
    const pipeline = await createRxPipeline({ modem, profile: CALL });
    const events: RxEvent[] = [];
    let frame = 0;
    const push = (samples: Float32Array): void => {
      events.push(...pipeline.push({ startFrame: frame, samples }));
      frame += CHUNK_SAMPLES;
    };

    // Seeded low noise sets the floor, then a loud 1500 Hz tone inside the Call band.
    let seed = 12345;
    const noise = (): Float32Array => {
      const out = new Float32Array(CHUNK_SAMPLES);
      for (let i = 0; i < out.length; i++) {
        seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
        out[i] = (seed / 0xffffffff - 0.5) * 0.002;
      }
      return out;
    };
    const tone = (): Float32Array => {
      const out = noise();
      for (let i = 0; i < out.length; i++) {
        const n = frame + i;
        out[i] =
          (out[i] as number) +
          0.5 * Math.sin((2 * Math.PI * 1500 * n) / SAMPLE_RATE);
      }
      return out;
    };

    for (let i = 0; i < 4; i++) push(noise());
    for (let i = 0; i < 3; i++) push(tone());

    const carrier = events.filter((e) => e.kind === "carrier");
    expect(
      carrier.some(
        (e) => e.kind === "carrier" && e.profile === "call" && e.active,
      ),
    ).toBe(true);
    for (const e of carrier) {
      if (e.kind !== "carrier") continue;
      // Only profiles that have a measured band can appear.
      expect(PROFILES[e.profile].carrierBandHz).not.toBeNull();
    }
    // The 1500 Hz tone is far below the Quiet band (15-19.4 kHz), so Quiet stays off.
    expect(PROFILES.quiet.carrierBandHz).not.toBeNull();
    expect(
      carrier.some((e) => e.kind === "carrier" && e.profile === "quiet"),
    ).toBe(false);
    pipeline.dispose();
  });
});
