/**
 * Property 12 against the real transport. Same checks as fake-transport.prop.test.ts, run on
 * createAudioTransport with the hand-written fakes from src/audio/testing/transport-fakes.ts.
 * Lives in src/ui because src/audio must not import src/ui.
 */

import { describe, it } from "vitest";
import {
  type Fakes,
  makeFakes,
  type Opts,
} from "../audio/testing/transport-fakes";
import { createAudioTransport } from "../audio/transport";
import {
  type ConformanceHarness,
  checkAirtime,
  checkBusy,
  checkLength,
  checkSetListening,
  checkStart,
} from "./transport-conformance";
import type { UiTransport } from "./transport-seam";

const fakesOf = new WeakMap<UiTransport, Fakes>();

const harness: ConformanceHarness = {
  make(setup = {}) {
    const partial: Partial<Opts> = {};
    if (setup.mic === "denied") partial.mic = "denied";
    if (setup.failStart === "MODEM_LOAD_FAILED") partial.init = "load-fails";
    if (setup.failStart === "NO_AUDIO_CONTEXT") partial.graph = "throws";
    if (setup.failStart === "SEND_UNAVAILABLE") partial.init = "codec-fails";
    const f = makeFakes(partial);
    const t = createAudioTransport(f.deps);
    fakesOf.set(t, f);
    return t;
  },
  holdSend(t, ms) {
    const f = fakesOf.get(t);
    if (!f) throw new Error("unknown transport");
    f.playback.hold = true;
    setTimeout(() => f.playback.release(), ms);
  },
  injectCarrier(t, active) {
    fakesOf.get(t)?.worker.push({
      kind: "carrier",
      profile: t.profile,
      active,
      atFrame: 0,
    });
  },
};

describe("Property 12: real transport conformance", () => {
  it.each([0, 1, 70, 140, 141, 300])("length %i", (n) =>
    checkLength(harness, n),
  );
  it("airtimeMs is null or positive", () => checkAirtime(harness));
  it("a second send in flight is BUSY", () => checkBusy(harness));
  it("setListening(false) suppresses frame and carrier", () =>
    checkSetListening(harness));
  it("start reports mic and start failures", () => checkStart(harness));
});
