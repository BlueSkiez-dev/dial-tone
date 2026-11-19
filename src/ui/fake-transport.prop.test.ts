import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createFakeTransport } from "./fake-transport";
import {
  type ConformanceHarness,
  checkAirtime,
  checkBusy,
  checkLength,
  checkSetListening,
  checkStart,
} from "./transport-conformance";

/** Wire frames the fake can decode are built with buildWire; filler bytes only exercise length checks. */
type Fake = ReturnType<typeof createFakeTransport>;

const harness: ConformanceHarness = {
  make(setup) {
    const t = createFakeTransport({ startDelayMs: 0, mic: setup?.mic });
    if (setup?.failStart) t.failStart(setup.failStart);
    return t;
  },
  holdSend(t, ms) {
    (t as Fake).holdSend(ms);
  },
  injectCarrier(t, active) {
    (t as Fake).injectCarrier(active);
  },
};

const seed = Number(process.env.FC_SEED ?? Date.now());

describe("FakeTransport conformance (Property 12)", () => {
  /** **Validates: Requirements 13.1, 13.4, 17.1** */
  it("length checks hold for every wire length", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 300 }), async (n) => {
        await checkLength(harness, n);
      }),
      { seed, numRuns: 60 },
    );
    for (const n of [0, 1, 140, 141]) await checkLength(harness, n);
  });

  /** **Validates: Requirements 13.4, 17.2** */
  it("airtimeMs returns null or a positive number", async () => {
    await checkAirtime(harness);
  });

  /** **Validates: Requirements 13.5** */
  it("a second send in flight returns BUSY", async () => {
    await checkBusy(harness);
  });

  /** **Validates: Requirements 17.3** */
  it("setListening(false) silences frame and carrier events", async () => {
    await checkSetListening(harness);
  });

  /** **Validates: Requirements 17.1, 17.4** */
  it("start() is ok without a mic and errs for every cause that stops sending", async () => {
    await checkStart(harness);
  });

  it("analyser is null before start and after stop", async () => {
    const t = createFakeTransport({ startDelayMs: 0 });
    expect(t.analyser).toBeNull();
    await t.start();
    expect(t.analyser).not.toBeNull();
    await t.stop();
    expect(t.analyser).toBeNull();
  });

  it("answers airtimeMs with an airtime event, then the cached value", async () => {
    const t = createFakeTransport({ startDelayMs: 0 });
    await t.start();
    const events: unknown[] = [];
    t.subscribe((e) => events.push(e));
    expect(t.airtimeMs(20)).toBeNull();
    await Promise.resolve();
    expect(events).toHaveLength(1);
    expect(t.airtimeMs(20)).toBe(2000);
  });
});
