import { describe, expect, it } from "vitest";
import {
  CARRIER_HOLD_MS,
  CONNECT_HOLD_MS,
  ERROR_HOLD_MS,
  initialState,
  QUIET_REARM_MS,
  reduce,
  type UiEvent,
  type UiState,
} from "./reducer";
import {
  listenState,
  signalDirection,
  statusView,
  transmitState,
} from "./status";
import type { Slip } from "./tape";

function run(s: UiState, events: readonly UiEvent[]): UiState {
  return events.reduce(reduce, s);
}

const onboarded = () =>
  initialState({
    tape: [],
    draft: "",
    channel: "room",
    flags: { onboarded: true, micWasGranted: false, firstPowerShown: false },
  });

const ready = (): UiState =>
  run(
    { ...onboarded(), flags: { ...onboarded().flags, firstPowerShown: true } },
    [
      { type: "power-tap", now: 0 },
      { type: "started", now: 0, mic: "live" },
      { type: "self-test-done", now: 600 },
    ],
  );

const heard: Slip = {
  kind: "heard",
  id: "a",
  at: 1,
  text: "hi",
  bytes: 2,
  hop: 1,
};

describe("reducer fixed paths", () => {
  it("opens onboarding for a first run", () => {
    expect(initialState(null).sheet).toBe("onboarding-1");
    expect(onboarded().sheet).toBeNull();
  });

  it("goes from off through self-test to ready (State 03)", () => {
    const st = run(onboarded(), [{ type: "power-tap", now: 0 }]);
    expect(st.power).toBe("selftest");
    expect(statusView(st, 0).code).toBe("ATZ");
    const on = ready();
    expect(on.power).toBe("on");
    const v = statusView(on, 700);
    expect(v.code).toBe("OK");
    expect(v.leds).toMatchObject({ MR: true, AA: true, OH: false });
    expect(on.flags.micWasGranted).toBe(true);
  });

  it("sends: key reads sending, SD lights, then the slip prints and the draft clears", () => {
    const sent: Slip = {
      kind: "sent",
      id: "s",
      at: 5,
      text: "hello",
      bytes: 5,
      mode: "room",
      airtimeMs: 2000,
    };
    let s = run(ready(), [
      { type: "draft", text: "hello" },
      { type: "transmit", now: 1000 },
    ]);
    expect(transmitState(s)).toBe("default");
    s = run(s, [{ type: "tx-start", now: 1000, airtimeMs: 2000 }]);
    expect(transmitState(s)).toBe("sending");
    expect(statusView(s, 1500)).toMatchObject({
      code: "ATDT",
      airtimeMs: 2000,
    });
    expect(statusView(s, 1500).leds).toMatchObject({
      MR: true,
      AA: true,
      SD: true,
    });
    expect(signalDirection(s, 1500)).toBe("up");
    s = run(s, [{ type: "tx-end", now: 3000, ok: true, slip: sent }]);
    expect(s.draft).toBe("");
    expect(s.tape).toEqual([sent]);
    expect(s.tx.phase).toBe("idle");
  });

  it("keeps the draft and shows ERROR for 3 s after a failed send", () => {
    const s = run(ready(), [
      { type: "draft", text: "x" },
      { type: "tx-start", now: 10, airtimeMs: 100 },
      { type: "tx-end", now: 20, ok: false, slip: null },
    ]);
    expect(s.draft).toBe("x");
    expect(statusView(s, 20 + ERROR_HOLD_MS - 1).code).toBe("ERROR");
    expect(statusView(s, 20 + ERROR_HOLD_MS).code).toBe("OK");
  });

  it("flashes on BUSY without ERROR and keeps the draft", () => {
    const s = run(ready(), [
      { type: "draft", text: "x" },
      { type: "send-busy", now: 100 },
    ]);
    expect(s.draft).toBe("x");
    expect(statusView(s, 150).code).toBe("OK");
    expect(s.busyUntil).toBe(700);
  });

  it("receives: CONNECT holds for 3 s, then back to OK", () => {
    const s = run(ready(), [{ type: "slip", slip: heard, now: 1000 }]);
    expect(statusView(s, 1001)).toMatchObject({ code: "CONNECT" });
    expect(statusView(s, 1001).leds.RD).toBe(true);
    expect(statusView(s, 1001).leds.AA).toBe(true);
    expect(signalDirection(s, 1001)).toBe("down");
    expect(statusView(s, 1000 + CONNECT_HOLD_MS).code).toBe("OK");
  });

  it("shows CARRIER only after 2.5 s of quiet", () => {
    let s = run(ready(), [{ type: "carrier", active: true, now: 1000 }]);
    expect(statusView(s, 1000).code).toBe("CARRIER");
    expect(statusView(s, 1000 + CARRIER_HOLD_MS).code).toBe("OK");
    s = run(s, [
      { type: "carrier", active: false, now: 2000 },
      { type: "carrier", active: true, now: 2000 + QUIET_REARM_MS - 1 },
    ]);
    expect(statusView(s, 4400).code).not.toBe("CARRIER");
    s = run(s, [
      { type: "carrier", active: false, now: 5000 },
      { type: "carrier", active: true, now: 5000 + QUIET_REARM_MS },
    ]);
    expect(statusView(s, 7500).code).toBe("CARRIER");
  });

  it("State 12: a denied mic reads No mic, OK with the Figma hint, AA dark, sending still works", () => {
    const s = run(ready(), [
      { type: "mic", mic: "denied" },
      { type: "draft", text: "ok" },
    ]);
    expect(listenState(s)).toBe("no-mic");
    expect(statusView(s, 0).leds.AA).toBe(false);
    expect(statusView(s, 0)).toMatchObject({ code: "OK", hintKey: "no-mic" });
    expect(transmitState(s)).toBe("default");
    expect(run(s, [{ type: "latch-tap" }])).toBe(s);
  });

  it("State 11: a draft over the limit reads the too-long hint on OK", () => {
    const s = run(ready(), [{ type: "draft", text: "a".repeat(200) }]);
    expect(statusView(s, 700)).toMatchObject({
      code: "OK",
      hintKey: "too-long",
    });
  });

  it("State 13: releasing the latch reads NO CARRIER and AA dark", () => {
    const s = run(ready(), [{ type: "latch-tap" }]);
    expect(listenState(s)).toBe("off");
    expect(statusView(s, 0)).toMatchObject({ code: "NO CARRIER" });
    expect(statusView(s, 0).leds.AA).toBe(false);
  });

  it("a start failure sets a fault, ERROR and a disabled Transmit key", () => {
    const s = run(onboarded(), [
      { type: "power-tap", now: 0 },
      { type: "start-failed", code: "SEND_UNAVAILABLE" },
      { type: "self-test-done", now: 600 },
      { type: "draft", text: "x" },
    ]);
    expect(s.fault).toBe("send-unavailable");
    expect(statusView(s, 700).code).toBe("ERROR");
    expect(transmitState(s)).toBe("disabled");
  });

  it("power off resets the power-on state", () => {
    const s = run(ready(), [{ type: "power-tap", now: 5000 }]);
    expect(s.power).toBe("off");
    expect(s.mic).toBe("idle");
    expect(statusView(s, 5000).code).toBe("— — —");
  });

  it("clears airtime cache on a channel change and ignores airtime for another channel", () => {
    let s = run(ready(), [
      { type: "airtime", wireLength: 20, ms: 2000, channel: "room" },
    ]);
    expect(s.airtimeByWire[20]).toBe(2000);
    s = run(s, [
      { type: "airtime", wireLength: 21, ms: 3000, channel: "call" },
    ]);
    expect(s.airtimeByWire[21]).toBeUndefined();
    s = run(s, [{ type: "channel", channel: "call" }]);
    expect(s.airtimeByWire).toEqual({});
    expect(statusView(s, 0).leds.OH).toBe(true);
  });

  it("onboarding walks 1, 2, 3 and then sets the flags", () => {
    const s = run(initialState(null), [
      { type: "onboarding-next" },
      { type: "onboarding-next" },
    ]);
    expect(s.sheet).toBe("onboarding-3");
    const done = run(s, [{ type: "onboarding-next" }]);
    expect(done.sheet).toBeNull();
    expect(done.flags).toMatchObject({ onboarded: true, rockerHint: true });
  });
});

describe("microphone processing hint and mic sheet rules", () => {
  const on = (): UiState =>
    run(onboarded(), [
      { type: "power-tap", now: 0 },
      { type: "started", now: 0, mic: "live" },
      { type: "self-test-done", now: 600 },
    ]);

  it("shows the processing hint while listening continues", () => {
    const s = reduce(on(), {
      type: "mic",
      mic: "live",
      processingDisabled: false,
    });
    const v = statusView(s, 700);
    expect(v.code).toBe("OK");
    expect(v.leds.AA).toBe(true);
    expect(v.hintKey).toBe("processing");
  });

  it("opens one sheet and one notice per power-on", () => {
    let s = reduce(on(), { type: "mic", mic: "busy", now: 1 });
    expect(s.sheet).toBe("mic-error");
    s = reduce(s, { type: "sheet-close" });
    s = run(s, [
      { type: "mic", mic: "live", now: 2 },
      { type: "mic", mic: "lost", now: 3 },
      { type: "mic", mic: "live", now: 4 },
      { type: "mic", mic: "lost", now: 5 },
    ]);
    expect(s.sheet).toBeNull();
    expect(
      s.tape.filter((x) => x.kind === "system" && x.noticeKey === "mic-again"),
    ).toHaveLength(1);
  });

  it("prints the first power-on notice once", () => {
    const s = on();
    expect(s.flags.firstPowerShown).toBe(true);
    expect(s.tape.map((x) => x.kind)).toEqual(["system"]);
  });
});

describe("passed-on event", () => {
  const unreadable: Slip = {
    kind: "system",
    id: "u",
    at: 2,
    noticeKey: "unreadable",
  };

  it("marks the matching heard slip and leaves the others alone", () => {
    const s = run(ready(), [
      { type: "slip", slip: heard, now: 1 },
      { type: "slip", slip: unreadable, now: 2 },
    ]);
    const next = reduce(s, { type: "passed-on", id: "a" });
    expect(next.tape.find((x) => x.id === "a")).toMatchObject({
      passedOn: true,
    });
    expect(next.tape.find((x) => x.id === "u")).toEqual(unreadable);
    expect(s.tape.find((x) => x.id === "a")).toEqual(heard);
  });

  it("marks a system slip too", () => {
    const s = run(ready(), [{ type: "slip", slip: unreadable, now: 2 }]);
    const next = reduce(s, { type: "passed-on", id: "u" });
    expect(next.tape.find((x) => x.id === "u")).toMatchObject({
      passedOn: true,
    });
  });

  it("returns the same state object for an unknown id", () => {
    const s = run(ready(), [{ type: "slip", slip: heard, now: 1 }]);
    expect(reduce(s, { type: "passed-on", id: "nope" })).toBe(s);
  });
});
