import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createGgwaveModem, type GgwaveFactoryResult } from "./ggwave-modem";
import { PROFILES } from "./profiles";
import { createRxPipeline, type RxEvent } from "./rx-pipeline";
import {
  FIXTURE_FILE,
  FIXTURE_REGEN_COMMAND,
  knownFrame,
} from "./testing/known-frame";
import { wavToChunks } from "./testing/wav";

// Slow test: real ggwave, a recorded-style fixture, a real pipeline that was NOT told about Call.
// The fixture is built by fixture-build.slow.test.ts with the same known frame.

const SLOW_TIMEOUT = 1_800_000;
const FIXTURE = resolve(import.meta.dirname, "../..", FIXTURE_FILE);

function readFixture(): Uint8Array {
  if (!existsSync(FIXTURE)) {
    throw new Error(
      `Missing fixture ${FIXTURE}. Generate it from the repo root with: ${FIXTURE_REGEN_COMMAND}`,
    );
  }
  return new Uint8Array(readFileSync(FIXTURE));
}

async function receive(
  wav: Uint8Array,
  rxScope: "all" | "active",
): Promise<RxEvent[]> {
  const parsed = wavToChunks(wav);
  if (!parsed.ok) throw new Error(`bad fixture WAV: ${parsed.error.code}`);
  const factory = createRequire(import.meta.url)(
    "../../vendor/ggwave.js",
  ) as () => Promise<GgwaveFactoryResult>;
  const modem = await createGgwaveModem(factory, {
    txSampleRate: parsed.value.sampleRate,
  });
  const pipeline = await createRxPipeline({
    modem,
    profile: PROFILES.room,
    rxScope,
  });
  try {
    const events: RxEvent[] = [];
    for (const chunk of parsed.value.chunks) {
      events.push(...pipeline.push(chunk));
    }
    return events;
  } finally {
    pipeline.dispose();
    modem.dispose();
  }
}

function frameWires(events: RxEvent[]): Uint8Array[] {
  return events.flatMap((e) => (e.kind === "frame" ? [e.wire] : []));
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

describe("call-known-frame.wav fixture", () => {
  it(
    "is received by a pipeline whose selected profile is Room, not Call",
    async () => {
      const wav = readFixture();
      const expected = knownFrame();
      // Default scope is "all": the selected profile plays no part in what is heard.
      const events = await receive(wav, "all");
      const hit = frameWires(events).find((w) => sameBytes(w, expected));
      expect(hit, "known frame did not arrive as a frame event").toBeDefined();
    },
    SLOW_TIMEOUT,
  );

  it(
    "is not received when only the Room family is enabled (active scope)",
    async () => {
      const wav = readFixture();
      const expected = knownFrame();
      const events = await receive(wav, "active");
      const hit = frameWires(events).find((w) => sameBytes(w, expected));
      expect(hit).toBeUndefined();
    },
    SLOW_TIMEOUT,
  );
});
