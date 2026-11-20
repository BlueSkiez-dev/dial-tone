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

/** Records every send and start on a fake transport, in place (keeps getters). */
function recordCalls(fake: ReturnType<typeof createFakeTransport>) {
  const sends: { wire: Uint8Array; profile: string }[] = [];
  let starts = 0;
  const send = fake.send.bind(fake);
  const start = fake.start.bind(fake);
  fake.send = (wire) => {
    sends.push({ wire: wire.slice(), profile: fake.profile });
    return send(wire);
  };
  fake.start = () => {
    starts++;
    return start();
  };
  return { sends, starts: () => starts };
}

/** A TEXT frame as heard from another phone, with the given routing. */
function heardFrame(text: string, hop = 0, ttl = 3, type: 0 | 4 = 0) {
  const built = buildWire(text);
  if (!built.ok) throw new Error("build");
  const decoded = decodeFrame(built.value.wire);
  if (!decoded.ok) throw new Error("decode");
  const f = decoded.value;
  return { ...f, header: { ...f.header, hop, ttl, type } };
}

async function hearOne(frame: ReturnType<typeof heardFrame>) {
  const fake = createFakeTransport({ startDelayMs: 0 });
  const calls = recordCalls(fake);
  const h = setup(SEEN_ALL, fake);
  await powerOn(h);
  const startsBefore = calls.starts();
  fake.injectFrame(frame, false);
  return { h, fake, calls, startsBefore };
}

describe("controller pass-on", () => {
  it("sends the patched wire once, marks the slip, prints no new slip", async () => {
    const { h, calls } = await hearOne(heardFrame("relay me", 1, 3));
    const slip = h.c.getState().tape[0];
    if (!slip) throw new Error("no slip");
    expect(h.c.holdsWire(slip.id)).toBe(true);
    expect(calls.sends).toHaveLength(0);

    h.c.passOn(slip.id);
    await settle();

    expect(calls.sends).toHaveLength(1);
    const sent = decodeFrame(calls.sends[0]?.wire ?? new Uint8Array());
    if (!sent.ok) throw new Error("decode sent");
    expect(sent.value.header.hop).toBe(2);
    expect(sent.value.header.ttl).toBe(2);
    const s = h.c.getState();
    expect(s.tape).toHaveLength(1);
    expect(s.tape[0]).toMatchObject({ kind: "heard", passedOn: true });
    expect(s.tx.phase).toBe("idle");
    // The key is recorded: the same message heard again prints nothing.
    expect(h.c.getState().tape).toHaveLength(1);

    // A second tap on a passed-on slip sends nothing.
    h.c.passOn(slip.id);
    await settle();
    expect(calls.sends).toHaveLength(1);
  });

  it("shows the sending cues while the pass-on is on air", async () => {
    const fake = createFakeTransport({ startDelayMs: 0 });
    const calls = recordCalls(fake);
    const h = setup(SEEN_ALL, fake);
    await powerOn(h);
    fake.injectFrame(heardFrame("cue", 0, 3), false);
    const slip = h.c.getState().tape[0];
    if (!slip) throw new Error("no slip");
    fake.holdSendsUntilReleased(true);
    h.c.passOn(slip.id);
    await settle();
    expect(calls.sends).toHaveLength(1);
    expect(h.c.getState().tx.phase).toBe("sending");
    expect(h.c.getState().tape).toHaveLength(1);
    fake.holdSendsUntilReleased(false);
    await settle();
    expect(h.c.getState().tx.phase).toBe("idle");
  });

  it("does not call start() for a pass-on", async () => {
    const { h, calls, startsBefore } = await hearOne(heardFrame("quiet", 0, 3));
    const slip = h.c.getState().tape[0];
    if (!slip) throw new Error("no slip");
    h.c.passOn(slip.id);
    await settle();
    expect(calls.sends).toHaveLength(1);
    expect(calls.starts()).toBe(startsBefore);
  });

  it.each(["room", "call", "quiet"] as const)(
    "sends on the selected channel: %s",
    async (channel) => {
      const fake = createFakeTransport({ startDelayMs: 0 });
      const calls = recordCalls(fake);
      const h = setup(SEEN_ALL, fake);
      await powerOn(h);
      h.c.setChannel(channel);
      fake.injectFrame(heardFrame(`on ${channel}`, 0, 3), false);
      const slip = h.c.getState().tape[0];
      if (!slip) throw new Error("no slip");
      h.c.passOn(slip.id);
      await settle();
      expect(calls.sends).toHaveLength(1);
      expect(calls.sends[0]?.profile).toBe(channel);
      expect(h.c.getState().tape[0]).toMatchObject({ passedOn: true });
    },
  );

  it("on BUSY keeps the slip open and prints nothing", async () => {
    const fake = createFakeTransport({ startDelayMs: 0 });
    const h = setup(SEEN_ALL, fake);
    await powerOn(h);
    fake.injectFrame(heardFrame("busy", 0, 3), false);
    fake.send = async () => ({ ok: false, error: { code: "BUSY" } });
    const slip = h.c.getState().tape[0];
    if (!slip) throw new Error("no slip");
    h.c.passOn(slip.id);
    await settle();
    const s = h.c.getState();
    expect(s.tape).toHaveLength(1);
    expect(s.tape[0]).not.toHaveProperty("passedOn", true);
    expect(s.busyUntil).toBeGreaterThan(h.clock.now());
    expect(s.errorUntil).toBe(0);
    expect(h.c.holdsWire(slip.id)).toBe(true);
  });

  it("on another error prints relay-failed and keeps the action", async () => {
    const fake = createFakeTransport({ startDelayMs: 0 });
    const h = setup(SEEN_ALL, fake);
    await powerOn(h);
    fake.injectFrame(heardFrame("fail", 0, 3), false);
    fake.send = async () => ({ ok: false, error: { code: "MODEM_FAILED" } });
    const slip = h.c.getState().tape[0];
    if (!slip) throw new Error("no slip");
    h.c.passOn(slip.id);
    await settle();
    const s = h.c.getState();
    expect(s.tape.map((x) => x.kind)).toEqual(["heard", "system"]);
    expect(s.tape[1]).toMatchObject({ noticeKey: "relay-failed" });
    expect(s.tape[0]).not.toHaveProperty("passedOn", true);
    expect(h.c.holdsWire(slip.id)).toBe(true);
  });

  it("never sends for a KEY_OFFER, heard or tapped", async () => {
    const { h, calls } = await hearOne(
      heardFrame("sixteen-byte-key-body", 0, 3, 4),
    );
    const slip = h.c.getState().tape[0];
    if (!slip) throw new Error("no slip");
    expect(h.c.holdsWire(slip.id)).toBe(false);
    h.c.passOn(slip.id);
    await settle();
    expect(calls.sends).toHaveLength(0);
    expect(h.c.getState().tape).toHaveLength(1);
  });

  it("sends nothing when the hops are used up", async () => {
    const { h, calls } = await hearOne(heardFrame("end", 3, 0));
    const slip = h.c.getState().tape[0];
    if (!slip) throw new Error("no slip");
    h.c.passOn(slip.id);
    await settle();
    expect(calls.sends).toHaveLength(0);
  });
});

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
