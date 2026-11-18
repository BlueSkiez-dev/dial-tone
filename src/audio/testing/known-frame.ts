/**
 * The known frame carried by tests/fixtures/call-known-frame.wav, built with the real encodeFrame.
 * Shared by fixture-build.slow.test.ts (writes the WAV) and fixture.slow.test.ts (reads it).
 */

import { encodeFrame } from "../../protocol";

export const FIXTURE_FILE = "tests/fixtures/call-known-frame.wav";
export const FIXTURE_SIDECAR = "tests/fixtures/call-known-frame.json";
export const FIXTURE_SAMPLE_RATE = 48_000;
export const FIXTURE_REGEN_COMMAND =
  "$env:WRITE_FIXTURE=1; npm.cmd run test:slow -- src/audio/fixture-build.slow.test.ts";

export function knownFrame(): Uint8Array {
  const res = encodeFrame({
    header: {
      version: 1,
      type: 0,
      encrypted: false,
      hop: 0,
      ttl: 3,
      messageId: Uint8Array.of(1, 2, 3, 4, 5, 6, 7, 8),
      index: 0,
      total: 1,
    },
    body: new TextEncoder().encode("Dial Tone fixture"),
  });
  if (!res.ok) throw new Error(`encodeFrame failed: ${res.error.code}`);
  return res.value;
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
