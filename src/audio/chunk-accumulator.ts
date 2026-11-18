export interface ChunkAccumulator {
  /**
   * quantum: channel 0 of one render quantum (at most chunkSamples long).
   * frame: AudioWorkletGlobalScope currentFrame of the quantum's first sample.
   * Returns a chunk with its own buffer once chunkSamples samples are collected.
   */
  push(
    quantum: Float32Array,
    frame: number,
  ): { startFrame: number; samples: Float32Array } | null;
}

export function createChunkAccumulator(chunkSamples: number): ChunkAccumulator {
  let buffer = new Float32Array(chunkSamples);
  let filled = 0;
  let startFrame = 0;

  return {
    push(quantum, frame) {
      // A frame that does not continue the partial chunk is a gap: restart.
      if (filled > 0 && frame !== startFrame + filled) filled = 0;
      if (filled === 0) startFrame = frame;

      let result: { startFrame: number; samples: Float32Array } | null = null;
      let pos = 0;
      while (pos < quantum.length) {
        const n = Math.min(chunkSamples - filled, quantum.length - pos);
        buffer.set(quantum.subarray(pos, pos + n), filled);
        filled += n;
        pos += n;
        if (filled === chunkSamples) {
          // Hand over the buffer and start a fresh one so the chunk is owned.
          if (result === null) result = { startFrame, samples: buffer };
          buffer = new Float32Array(chunkSamples);
          startFrame += chunkSamples;
          filled = 0;
        }
      }
      return result;
    },
  };
}
