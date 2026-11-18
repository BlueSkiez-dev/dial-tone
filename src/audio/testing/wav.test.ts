import { describe, expect, it } from "vitest";
import { CHUNK_SAMPLES } from "../constants";
import { decodeWav, encodeWav, wavToChunks } from "./wav";

function ramp(length: number): Float32Array {
  const s = new Float32Array(length);
  for (let i = 0; i < length; i++) s[i] = Math.sin(i / 7) * 0.5;
  return s;
}

describe("wav helpers", () => {
  it("round-trips float32 samples exactly and cuts whole chunks", () => {
    const samples = ramp(CHUNK_SAMPLES * 3 + 100);
    const res = wavToChunks(encodeWav(samples, 48000));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.sampleRate).toBe(48000);
    expect(res.value.chunks).toHaveLength(3);
    res.value.chunks.forEach((chunk, i) => {
      expect(chunk.startFrame).toBe(i * CHUNK_SAMPLES);
      expect(chunk.samples).toEqual(
        samples.slice(i * CHUNK_SAMPLES, (i + 1) * CHUNK_SAMPLES),
      );
    });
  });

  it("round-trips 16-bit PCM within quantization error", () => {
    const samples = ramp(500);
    const res = decodeWav(encodeWav(samples, 44100, "pcm16"));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.sampleRate).toBe(44100);
    expect(res.value.samples).toHaveLength(500);
    for (let i = 0; i < 500; i++) {
      expect(
        Math.abs((res.value.samples[i] ?? 0) - (samples[i] ?? 0)),
      ).toBeLessThan(1 / 16000);
    }
  });

  it("returns error codes instead of throwing", () => {
    expect(wavToChunks(new Uint8Array(4))).toEqual({
      ok: false,
      error: { code: "NOT_WAV" },
    });
    const bad = encodeWav(ramp(10), 48000);
    new DataView(bad.buffer).setUint16(22, 2, true);
    expect(decodeWav(bad)).toEqual({
      ok: false,
      error: { code: "NOT_MONO" },
    });
  });
});
