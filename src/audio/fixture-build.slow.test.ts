import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createGgwaveModem, type GgwaveFactoryResult } from "./ggwave-modem";
import { PROFILES, protocolFor } from "./profiles";
import {
  FIXTURE_FILE,
  FIXTURE_REGEN_COMMAND,
  FIXTURE_SAMPLE_RATE,
  FIXTURE_SIDECAR,
  knownFrame,
  toHex,
} from "./testing/known-frame";
import { encodeWav } from "./testing/wav";

// Slow test: builds the Call-profile fixture with the real encodeFrame and the real modem.
// With WRITE_FIXTURE=1 it writes the files. Without it, it checks they exist and are current.

const SLOW_TIMEOUT = 1_800_000;
const ROOT = resolve(import.meta.dirname, "../..");
const WAV_PATH = resolve(ROOT, FIXTURE_FILE);
const JSON_PATH = resolve(ROOT, FIXTURE_SIDECAR);

async function buildWav(): Promise<Uint8Array> {
  const factory = createRequire(import.meta.url)(
    "../../vendor/ggwave.js",
  ) as () => Promise<GgwaveFactoryResult>;
  const modem = await createGgwaveModem(factory, {
    txSampleRate: FIXTURE_SAMPLE_RATE,
  });
  try {
    const profile = PROFILES.call;
    const protocol = protocolFor(profile, 0);
    expect(protocol).toBe("DT_FASTEST");
    expect(profile.volume).toBe(25);
    const wave = modem.modulate(knownFrame(), protocol, profile.volume);
    const silence = FIXTURE_SAMPLE_RATE; // 1 s each side
    const samples = new Float32Array(wave.length + 2 * silence);
    samples.set(wave, silence);
    return encodeWav(samples, FIXTURE_SAMPLE_RATE);
  } finally {
    modem.dispose();
  }
}

function missing(path: string): Error {
  return new Error(
    `Missing fixture ${path}. Generate it from the repo root with: ${FIXTURE_REGEN_COMMAND}`,
  );
}

describe("call-known-frame fixture build", () => {
  if (process.env.WRITE_FIXTURE === "1") {
    it(
      "writes the WAV and the sidecar",
      async () => {
        const wav = await buildWav();
        mkdirSync(dirname(WAV_PATH), { recursive: true });
        writeFileSync(WAV_PATH, wav);
        writeFileSync(
          JSON_PATH,
          `${JSON.stringify({ wireHex: toHex(knownFrame()) }, null, 2)}\n`,
        );
        expect(existsSync(WAV_PATH)).toBe(true);
      },
      SLOW_TIMEOUT,
    );
    return;
  }

  it(
    "has a WAV that matches a fresh build",
    async () => {
      if (!existsSync(WAV_PATH)) throw missing(WAV_PATH);
      const fresh = await buildWav();
      const onDisk = new Uint8Array(readFileSync(WAV_PATH));
      expect(
        Buffer.from(onDisk).equals(Buffer.from(fresh)),
        `${WAV_PATH} is stale. Regenerate with: ${FIXTURE_REGEN_COMMAND}`,
      ).toBe(true);
    },
    SLOW_TIMEOUT,
  );

  it("has a sidecar with the known frame bytes", () => {
    if (!existsSync(JSON_PATH)) throw missing(JSON_PATH);
    const side = JSON.parse(readFileSync(JSON_PATH, "utf8")) as {
      wireHex?: string;
    };
    expect(
      side.wireHex,
      `${JSON_PATH} is stale. Regenerate with: ${FIXTURE_REGEN_COMMAND}`,
    ).toBe(toHex(knownFrame()));
  });
});
