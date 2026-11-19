import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { GGWAVE_MAX_PAYLOAD } from "../protocol";
import { RX_LISTEN_SCOPE } from "./profiles";
import { TX_TAIL_GUARD_MS } from "./rx-pipeline";
import { makeFakes, type Opts, RATE, SAMPLES } from "./testing/transport-fakes";
import { createAudioTransport } from "./transport";
import type { WorkerEvent } from "./transport-deps";
import type { TransportEvent } from "./transport-types";

// Hand-written fakes for the context, the worker and the microphone. Node only, no DOM.
async function started(partial: Partial<Opts> = {}) {
  const f = makeFakes(partial);
  const t = createAudioTransport(f.deps);
  const r = await t.start();
  return { f, t, r };
}

const bytes = (n: number) => new Uint8Array(n).fill(7);
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("transport send guards", () => {
  it("returns NOT_STARTED before start", async () => {
    const t = createAudioTransport(makeFakes().deps);
    const r = await t.send(bytes(5));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("NOT_STARTED");
    expect(t.setProfile("call").ok).toBe(false);
  });

  it("returns NOT_RUNNING when the context is suspended", async () => {
    const { f, t } = await started();
    f.graph.state = "suspended";
    const r = await t.send(bytes(5));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("NOT_RUNNING");
  });

  it("Property 8: EMPTY, a report or TOO_LONG, and no modulate for the two errors", async () => {
    const { f, t } = await started();
    const multi = (n: number) => new TextEncoder().encode("é".repeat(n));
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.constantFrom(0, 1, 140, 141, 200),
          fc.integer({ min: 0, max: 300 }),
        ),
        fc.boolean(),
        async (len, utf8) => {
          const payload =
            utf8 && len > 0 ? multi(len).slice(0, len) : bytes(len);
          expect(payload.length).toBe(len);
          const before = f.worker.count("modulate");
          const r = await t.send(payload);
          const after = f.worker.count("modulate");
          if (len === 0) {
            expect(!r.ok && r.error.code).toBe("EMPTY");
            expect(after).toBe(before);
          } else if (len > GGWAVE_MAX_PAYLOAD) {
            expect(!r.ok && r.error.code).toBe("TOO_LONG");
            expect(after).toBe(before);
          } else {
            expect(r.ok).toBe(true);
            expect(after).toBe(before + 1);
          }
        },
      ),
      { numRuns: 60 },
    );
  });

  it("counts bytes, not characters", async () => {
    const { t } = await started();
    // 71 two-byte characters are 142 bytes.
    const r = await t.send(new TextEncoder().encode("é".repeat(71)));
    expect(!r.ok && r.error.code).toBe("TOO_LONG");
  });

  it("rejects a second send and setProfile while a send is in flight", async () => {
    const { f, t } = await started();
    f.playback.hold = true;
    const first = t.send(bytes(10));
    await tick();
    const second = await t.send(bytes(10));
    expect(!second.ok && second.error.code).toBe("BUSY");
    const p = t.setProfile("call");
    expect(!p.ok && p.error.code).toBe("BUSY");
    f.playback.release();
    expect((await first).ok).toBe(true);
    expect(t.setProfile("call").ok).toBe(true);
  });

  it("sends the gate before playback, with endFrame plus the tail", async () => {
    const { f, t } = await started();
    f.graph.currentTime = 2;
    const r = await t.send(bytes(10));
    expect(r.ok).toBe(true);
    expect(f.log.indexOf("gate")).toBeGreaterThanOrEqual(0);
    expect(f.log.indexOf("gate")).toBeLessThan(f.log.indexOf("play"));
    const gate = f.worker.sent.find((m) => m.type === "gate");
    if (!r.ok || gate?.type !== "gate") throw new Error("no gate");
    const tail = Math.round((TX_TAIL_GUARD_MS / 1000) * RATE);
    expect(gate.fromFrame).toBe(r.value.startFrame);
    expect(gate.untilFrame).toBe(r.value.endFrame + tail);
    expect(r.value.endFrame - r.value.startFrame).toBe(SAMPLES);
  });

  it("does not detach the caller's array", async () => {
    const { f, t } = await started();
    const wire = bytes(20);
    await t.send(wire);
    expect(wire.length).toBe(20);
    expect(f.worker.modulateWires[0]).not.toBe(wire);
    expect([...(f.worker.modulateWires[0] ?? [])]).toEqual([...wire]);
  });

  it("attempt 1 picks the retry protocol", async () => {
    const { t } = await started();
    const first = await t.send(bytes(10), { attempt: 0 });
    const retry = await t.send(bytes(10), { attempt: 1 });
    expect(first.ok && first.value.protocol).toBe("AUDIBLE_FASTEST");
    expect(retry.ok && retry.value.protocol).toBe("AUDIBLE_FAST");
  });

  it("setProfile changes later sends and sends no receive change while the scope is all", async () => {
    expect(RX_LISTEN_SCOPE).toBe("all");
    const { f, t } = await started();
    expect(t.setProfile("call").ok).toBe(true);
    expect(t.profile).toBe("call");
    const r = await t.send(bytes(10));
    expect(r.ok && r.value.protocol).toBe("DT_FASTEST");
    expect(f.worker.count("setProfile")).toBe(0);
  });
});

describe("transport microphone", () => {
  it("a denied mic leaves start ok and send working", async () => {
    const { t, r } = await started({ mic: "denied" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.mic).toBe("denied");
      expect(r.value.mic).not.toBe("live");
      expect(r.value.sampleRate).toBe(RATE);
    }
    expect((await t.send(bytes(10))).ok).toBe(true);
  });

  it("restartMic is the only path out of denied", async () => {
    const { f, t } = await started({ mic: "denied" });
    const calls = f.gumCalls();
    await t.send(bytes(10));
    t.setProfile("quiet");
    expect(f.gumCalls()).toBe(calls);
    f.opts.mic = "ok";
    const r = await t.restartMic();
    expect(r.ok).toBe(true);
    expect(f.gumCalls()).toBe(calls + 1);
  });

  it("restartMic during a pending start waits for it and re-asks", async () => {
    const f = makeFakes({ mic: "denied" });
    const t = createAudioTransport(f.deps);
    const pending = t.start();
    const r = await t.restartMic();
    await pending;
    expect(!r.ok && r.error.code).not.toBe("NOT_STARTED");
    expect(f.gumCalls()).toBe(2);
  });

  it("send during a pending start waits for it instead of NOT_STARTED", async () => {
    const f = makeFakes({ mic: "denied" });
    const t = createAudioTransport(f.deps);
    const pending = t.start();
    const r = await t.send(bytes(5));
    await pending;
    expect(!r.ok && r.error.code).not.toBe("NOT_STARTED");
    expect(f.worker.count("modulate")).toBe(1);
  });

  it("restartMic before start returns NOT_STARTED", async () => {
    const r = await createAudioTransport(makeFakes().deps).restartMic();
    expect(!r.ok && r.error.code).toBe("NOT_STARTED");
  });
});

describe("transport start result", () => {
  it("returns ok with the sample rate when everything works", async () => {
    const { r } = await started();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ sampleRate: RATE, mic: "live" });
  });

  it.each([
    ["modem load failure", { init: "load-fails" }, "MODEM_LOAD_FAILED"],
    ["no audio context", { graph: "throws" }, "NO_AUDIO_CONTEXT"],
    ["unsupported worklet", { graph: "attach-fails" }, "NO_AUDIO_CONTEXT"],
    ["worker crash", { init: "crashes" }, "SEND_UNAVAILABLE"],
    [
      "codec initialisation failure",
      { init: "codec-fails" },
      "SEND_UNAVAILABLE",
    ],
  ] as const)("returns an error for %s", async (_name, partial, code) => {
    const { f, t, r } = await started(partial);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe(code);
    expect(t.analyser).toBeNull();
    expect((await t.send(bytes(5))).ok).toBe(false);
    if ("init" in partial) expect(f.worker.terminated).toBe(true);
  });
});

describe("transport analyser", () => {
  it("is null before start and after stop, and set while started", async () => {
    const f = makeFakes();
    const t = createAudioTransport(f.deps);
    expect(t.analyser).toBeNull();
    await t.start();
    expect(t.analyser).toBe(f.graph.analyser);
    await t.stop();
    expect(t.analyser).toBeNull();
    expect(f.graph.closed).toBe(true);
  });
});

describe("transport airtimeMs", () => {
  it("misses with null, then the worker's answer arrives as an event, then the cache hits", async () => {
    const { f, t } = await started();
    const events: TransportEvent[] = [];
    t.subscribe((e) => events.push(e));
    expect(t.airtimeMs(40)).toBeNull();
    expect(t.airtimeMs(40)).toBeNull();
    expect(f.worker.count("airtime")).toBe(1);
    await tick();
    expect(events).toContainEqual({
      kind: "airtime",
      profile: "room",
      attempt: 0,
      byteLength: 40,
      ms: 1234,
    });
    expect(t.airtimeMs(40)).toBe(1234);
    expect(f.worker.count("airtime")).toBe(1);
  });

  it("returns null for invalid lengths and asks nothing", async () => {
    const { f, t } = await started();
    expect(t.airtimeMs(0)).toBeNull();
    expect(t.airtimeMs(141)).toBeNull();
    expect(t.airtimeMs(1.5)).toBeNull();
    expect(f.worker.count("airtime")).toBe(0);
  });
});

describe("transport setListening", () => {
  const carrier: WorkerEvent = {
    kind: "carrier",
    profile: "call",
    active: true,
    atFrame: 0,
  };
  const frame = {
    kind: "frame",
    wire: new Uint8Array(3),
  } as unknown as WorkerEvent;

  it("returns NOT_STARTED before start", () => {
    const r = createAudioTransport(makeFakes().deps).setListening(false);
    expect(!r.ok && r.error.code).toBe("NOT_STARTED");
  });

  it("returns NO_MIC when the microphone is not open", async () => {
    const { t } = await started({ mic: "denied" });
    const r = t.setListening(false);
    expect(!r.ok && r.error.code).toBe("NO_MIC");
  });

  it("drops frame and carrier events while deaf, keeps sending, and resumes", async () => {
    const { f, t } = await started();
    const kinds: string[] = [];
    t.subscribe((e) => kinds.push(e.kind));
    f.worker.push(carrier);
    f.worker.push(frame);
    expect(kinds).toEqual(["carrier", "frame"]);

    kinds.length = 0;
    expect(t.setListening(false).ok).toBe(true);
    expect(f.worker.sent.at(-1)).toEqual({ type: "listening", on: false });
    f.worker.push(carrier);
    f.worker.push(frame);
    f.worker.push({ kind: "overrun", droppedChunks: 1 });
    expect(kinds).toEqual(["listening", "overrun"]);
    expect((await t.send(bytes(10))).ok).toBe(true);

    kinds.length = 0;
    t.setListening(true);
    f.worker.push(carrier);
    expect(kinds).toEqual(["listening", "carrier"]);
  });
});
