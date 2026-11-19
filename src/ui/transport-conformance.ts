/**
 * Shared conformance body for UiTransport (Property 12). Run against the FakeTransport here,
 * and against the real transport with the fake modem from src/audio/transport.test.ts.
 */

import { expect } from "vitest";
import type { StartError, TransportEvent } from "../audio";
import { buildWire } from "./model/send";
import type { UiTransport } from "./transport-seam";

export interface ConformanceHarness {
  /** A fresh transport. `failStart` makes start() fail with that cause. `mic` sets the microphone result. */
  make(setup?: {
    failStart?: StartError["code"];
    mic?: "denied" | "live";
  }): UiTransport;
  /** Makes sends on this transport stay in flight for ms. */
  holdSend(t: UiTransport, ms: number): void;
  injectCarrier(t: UiTransport, active: boolean): void;
}

export const START_FAIL_CAUSES: readonly StartError["code"][] = [
  "MODEM_LOAD_FAILED",
  "NO_AUDIO_CONTEXT",
  "SEND_UNAVAILABLE",
];

async function started(h: ConformanceHarness): Promise<UiTransport> {
  const t = h.make();
  const r = await t.start();
  expect(r.ok).toBe(true);
  return t;
}

/** EMPTY for 0, TOO_LONG for over 140, a report in between. */
export async function checkLength(
  h: ConformanceHarness,
  length: number,
): Promise<void> {
  const t = await started(h);
  const r = await t.send(new Uint8Array(length).fill(1));
  if (length === 0) {
    expect(r.ok === false && r.error.code).toBe("EMPTY");
  } else if (length > 140) {
    expect(r.ok === false && r.error.code).toBe("TOO_LONG");
  } else if (r.ok) {
    expect(r.value.airtimeMs).toBeGreaterThan(0);
  } else {
    // Non-decodable filler may be refused by a real modem only as MODEM_FAILED, never a length code.
    expect(["EMPTY", "TOO_LONG"]).not.toContain(r.error.code);
  }
  await t.stop();
}

export async function checkAirtime(h: ConformanceHarness): Promise<void> {
  const t = await started(h);
  const first = t.airtimeMs(10);
  expect(first === null || first > 0).toBe(true);
  const next = t.airtimeMs(0);
  expect(next === null || next > 0).toBe(true);
  await t.stop();
}

export async function checkBusy(h: ConformanceHarness): Promise<void> {
  const t = await started(h);
  h.holdSend(t, 60);
  const built = buildWire("hello");
  if (!built.ok) throw new Error("buildWire failed");
  const first = t.send(built.value.wire);
  const second = await t.send(built.value.wire);
  expect(second.ok === false && second.error.code).toBe("BUSY");
  await first;
  await t.stop();
}

export async function checkSetListening(h: ConformanceHarness): Promise<void> {
  const t = h.make();
  const early = t.setListening(false);
  expect(early.ok === false && early.error.code).toBe("NOT_STARTED");
  await t.start();
  const events: TransportEvent[] = [];
  t.subscribe((e) => events.push(e));
  expect(t.setListening(false).ok).toBe(true);
  h.injectCarrier(t, true);
  h.injectCarrier(t, false);
  const built = buildWire("hi");
  if (!built.ok) throw new Error("buildWire failed");
  const sent = await t.send(built.value.wire);
  expect(sent.ok).toBe(true);
  expect(
    events.filter((e) => e.kind === "frame" || e.kind === "carrier"),
  ).toEqual([]);
  await t.stop();
}

export async function checkStart(h: ConformanceHarness): Promise<void> {
  const micless = h.make({ mic: "denied" });
  const r = await micless.start();
  expect(r.ok).toBe(true);
  if (r.ok) expect(r.value.mic).not.toBe("live");
  const built = buildWire("still sends");
  if (!built.ok) throw new Error("buildWire failed");
  expect((await micless.send(built.value.wire)).ok).toBe(true);
  await micless.stop();

  for (const code of START_FAIL_CAUSES) {
    const failing = h.make({ failStart: code });
    const res = await failing.start();
    expect(res.ok).toBe(false);
  }
}
