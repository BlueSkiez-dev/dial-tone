/**
 * Puts capture chunks on the 48 kHz decode clock. At 48 kHz it passes chunks through. At another
 * rate it resamples, re-forms 1024-sample chunks, and converts context frames to stream frames.
 */

import { createChunkAccumulator } from "./chunk-accumulator";
import { CHUNK_SAMPLES, RX_SAMPLE_RATE } from "./constants";
import { createResampler } from "./resampler";

export interface StreamChunk {
  startFrame: number;
  samples: Float32Array;
}

export interface RateAdapter {
  /** A chunk on the context clock in, zero or more chunks on the 48 kHz clock out. */
  push(chunk: StreamChunk): StreamChunk[];
  /** frame48 = round(frame * 48000 / contextRate), with a rounding direction. */
  frameToStream(frame: number, mode: "down" | "up" | "round"): number;
}

export function createRateAdapter(contextRate: number): RateAdapter {
  const convert = (frame: number, mode: "down" | "up" | "round"): number => {
    const x = (frame * RX_SAMPLE_RATE) / contextRate;
    return mode === "down"
      ? Math.floor(x)
      : mode === "up"
        ? Math.ceil(x)
        : Math.round(x);
  };

  if (contextRate === RX_SAMPLE_RATE) {
    return { push: (chunk) => [chunk], frameToStream: (f) => Math.round(f) };
  }

  const resampler = createResampler(contextRate, RX_SAMPLE_RATE);
  const accumulator = createChunkAccumulator(CHUNK_SAMPLES);
  let expectedInput: number | null = null;
  let outPos = 0;

  return {
    frameToStream: convert,
    push(chunk) {
      if (expectedInput === null || chunk.startFrame !== expectedInput) {
        // First chunk or a gap: forget filter history and re-anchor the output clock.
        resampler.reset();
        outPos = convert(chunk.startFrame, "round");
      }
      expectedInput = chunk.startFrame + chunk.samples.length;
      const out = resampler.process(chunk.samples);
      const result: StreamChunk[] = [];
      // The accumulator takes at most CHUNK_SAMPLES per call, so split.
      for (let i = 0; i < out.length; i += CHUNK_SAMPLES) {
        const piece = out.subarray(i, i + CHUNK_SAMPLES);
        const done = accumulator.push(piece, outPos);
        outPos += piece.length;
        if (done) result.push(done);
      }
      return result;
    },
  };
}
