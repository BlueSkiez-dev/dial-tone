import { CHUNK_SAMPLES } from "./constants";

export { CHUNK_SAMPLES };
export const DECODER_OFFSET_STEP = 256;
export const DECODER_OFFSETS = [0, 256, 512, 768] as const;

export interface PhaseChunker {
  /** Returns zero or more full blocks. Input may be any length. */
  push(startFrame: number, samples: Float32Array): Float32Array[];
  /** Forget buffered samples. The next block starts at the next frame congruent to offset. */
  reset(): void;
}

function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}

export function createPhaseChunker(offset: number): PhaseChunker {
  let buffer: Float32Array = new Float32Array(0);
  let bufStart = 0;

  return {
    push(startFrame: number, samples: Float32Array): Float32Array[] {
      // A start frame that does not continue the buffer means a gap or overlap.
      if (buffer.length > 0 && startFrame !== bufStart + buffer.length) {
        buffer = new Float32Array(0);
      }
      let input = samples;
      let from = startFrame;
      if (buffer.length === 0) {
        // Discard samples before the first frame congruent to offset.
        const skip = mod(offset - from, CHUNK_SAMPLES);
        if (skip >= input.length) return [];
        input = input.subarray(skip);
        from += skip;
        bufStart = from;
      }
      const joined = new Float32Array(buffer.length + input.length);
      joined.set(buffer, 0);
      joined.set(input, buffer.length);
      buffer = joined;

      const out: Float32Array[] = [];
      while (buffer.length >= CHUNK_SAMPLES) {
        out.push(buffer.slice(0, CHUNK_SAMPLES));
        buffer = buffer.subarray(CHUNK_SAMPLES);
        bufStart += CHUNK_SAMPLES;
      }
      if (buffer.length === 0) buffer = new Float32Array(0);
      return out;
    },
    reset(): void {
      buffer = new Float32Array(0);
    },
  };
}
