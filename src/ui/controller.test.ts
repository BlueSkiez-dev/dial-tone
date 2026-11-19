import { describe, expect, it } from "vitest";
import { decodeFrame } from "../protocol";
import { type Clock, createController } from "./controller";
import { createFakeTransport } from "./fake-transport";
import { buildWire } from "./model/send";
import { statusView } from "./model/status";
import type { UiTransport } from "./transport-seam";

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

function memoryStorage(seed: Record<string, string> = {}) {
  const data = new Map(Object.entries(seed));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    data,
  };
}

const settle = () => new Promise<void>((r) => setTimeout(r, 25));

const FLAGS_KEY = "dialtone.v1.flags";
const flags = (o: object) => JSON.stringify(o);
const ONBOARDED = {
  [FLAGS_KEY]: flags({
    onboarded: true,
    micWasGranted: false,
    firstPowerShown: false,
  }),
};
const SEEN_ALL = {
  [FLAGS_KEY]: flags({
    onboarded: true,
    micWasGranted: false,
    firstPowerShown: true,
  }),
};

function setup(
  seed: Record<string, string>,
  transport: UiTransport = createFakeTransport({ startDelayMs: 0 }),
) {
  const clock = manualClock();
  const storage = memoryStorage(seed);
  const c = createController({
    transport,
    storage,
    clock,
    vibrate: null,
  });
  return { c, clock, storage, transport };
}

async function powerOn(h: ReturnType<typeof setup>) {
  h.c.powerTap();
  await settle();
  h.clock.advance(600);
  await settle();
}

describe("controller", () => {
  it("prints the first power-on notice once", async () => {
    const h = setup(ONBOARDED);
    await powerOn(h);
    expect(h.c.getState().power).toBe("on");
    const notices = () =>
      h.c.getState().tape.filter((s) => s.kind === "system");
    expect(notices()).toHaveLength(1);
    h.c.powerTap();
    await powerOn(h);
    expect(notices()).toHaveLength(1);
  });

  it("opens the denied sheet for a first denial", async () => {
    const h = setup(
      ONBOARDED,
      createFakeTransport({ startDelayMs: 0, mic: "denied" }),
    );
    await powerOn(h);
    expect(h.c.getState().sheet).toBe("mic-denied");
  });

  it("opens the reset sheet when the microphone was granted before", async () => {
    const h = setup(
      {
        [FLAGS_KEY]: flags({
          onboarded: true,
          micWasGranted: true,
          firstPowerShown: true,
        }),
      },
      createFakeTransport({ startDelayMs: 0, mic: "denied" }),
    );
    await powerOn(h);
    expect(h.c.getState().sheet).toBe("mic-reset");
  });

  it("does not reopen the sheet on a second failure and prints one notice", async () => {
    const fake = createFakeTransport({ startDelayMs: 0 });
    const h = setup(SEEN_ALL, fake);
    await powerOn(h);
    fake.setMic("busy");
    expect(h.c.getState().sheet).toBe("mic-error");
    h.c.sheetClose();
    fake.setMic("live");
    fake.setMic("busy");
    fake.setMic("live");
    fake.setMic("denied");
    const s = h.c.getState();
    expect(s.sheet).toBeNull();
    const again = s.tape.filter(
      (x) => x.kind === "system" && x.noticeKey === "mic-again",
    );
    expect(again).toHaveLength(1);
  });

  it("sends, clears the draft and prints no slip for its own echo", async () => {
    const h = setup(SEEN_ALL);
    await powerOn(h);
    h.c.setDraft("hello");
    h.c.transmit();
    await settle();
    const s = h.c.getState();
    expect(s.draft).toBe("");
    expect(s.tx.phase).toBe("idle");
    expect(s.tape.map((x) => x.kind)).toEqual(["sent"]);
  });

  it("prints a heard slip for a frame from another phone", async () => {
    const fake = createFakeTransport({ startDelayMs: 0 });
    const h = setup(SEEN_ALL, fake);
    await powerOn(h);
    const built = buildWire("from afar");
    if (!built.ok) throw new Error("build");
    const decoded = decodeFrame(built.value.wire);
    if (!decoded.ok) throw new Error("decode");
    fake.injectFrame(decoded.value, true);
    expect(h.c.getState().tape).toHaveLength(0);
    fake.injectFrame(decoded.value, false);
    expect(h.c.getState().tape.map((x) => x.kind)).toEqual(["heard"]);
  });

  it("keeps the draft and shows ERROR when a send fails", async () => {
    const fake = createFakeTransport({ startDelayMs: 0 });
    const failing: UiTransport = {
      ...fake,
      send: async () => ({ ok: false, error: { code: "MODEM_FAILED" } }),
    };
    const h = setup(SEEN_ALL, failing);
    await powerOn(h);
    h.c.setDraft("keep me");
    h.c.transmit();
    await settle();
    const s = h.c.getState();
    expect(s.draft).toBe("keep me");
    expect(statusView(s, h.clock.now()).code).toBe("ERROR");
  });

  it("flashes Transmit and keeps the draft on BUSY, with no ERROR", async () => {
    const fake = createFakeTransport({ startDelayMs: 0 });
    const busy: UiTransport = {
      ...fake,
      send: async () => ({ ok: false, error: { code: "BUSY" } }),
    };
    const h = setup(SEEN_ALL, busy);
    await powerOn(h);
    h.c.setDraft("wait");
    h.c.transmit();
    await settle();
    const s = h.c.getState();
    expect(s.draft).toBe("wait");
    expect(s.busyUntil).toBeGreaterThan(h.clock.now());
    expect(s.errorUntil).toBe(0);
    expect(statusView(s, h.clock.now()).code).not.toBe("ERROR");
  });

  it("restores draft, channel and tape after a reload", async () => {
    const h = setup(SEEN_ALL);
    await powerOn(h);
    h.c.setChannel("call");
    h.c.setDraft("kept");
    h.c.transmit();
    await settle();
    h.c.setDraft("next");
    h.c.flush();
    const again = createController({
      transport: createFakeTransport({ startDelayMs: 0 }),
      storage: h.storage,
      clock: manualClock(),
      vibrate: null,
    });
    const s = again.getState();
    expect(s.draft).toBe("next");
    expect(s.channel).toBe("call");
    expect(s.tape.map((x) => x.kind)).toEqual(["sent"]);
    expect(s.flags.onboarded).toBe(true);
  });

  it("asks for airtime once per distinct wire length", async () => {
    const fake = createFakeTransport({ startDelayMs: 0 });
    let calls = 0;
    const counting: UiTransport = {
      ...fake,
      airtimeMs: (n, a) => {
        calls++;
        return fake.airtimeMs(n, a);
      },
    };
    const h = setup(SEEN_ALL, counting);
    await powerOn(h);
    h.c.setDraft("hi");
    await settle();
    expect(calls).toBe(1);
    h.c.setDraft("ab");
    h.c.setDraft("xy");
    await settle();
    expect(calls).toBe(1);
    h.c.setDraft("abc");
    expect(calls).toBe(2);
  });
});
