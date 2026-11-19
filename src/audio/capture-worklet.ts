/**
 * AudioWorkletProcessor "capture". Collects render quanta into 1024-sample chunks and posts them,
 * transferring the buffer, over the port it receives (the audio port that leads to the decode worker).
 * Built as a classic script (Vite `?worker&url`, iife).
 */

import { createChunkAccumulator } from "./chunk-accumulator";
import { CHUNK_SAMPLES } from "./constants";

interface PortLike {
  postMessage(message: unknown, transfer: unknown[]): void;
}

declare const currentFrame: number;
declare class AudioWorkletProcessor {
  readonly port: {
    onmessage: ((event: { data: { port?: PortLike } }) => void) | null;
  };
}
declare function registerProcessor(
  name: string,
  ctor: new () => AudioWorkletProcessor & {
    process(inputs: Float32Array[][]): boolean;
  },
): void;

class CaptureProcessor extends AudioWorkletProcessor {
  private audioPort: PortLike | null = null;
  private readonly accumulator = createChunkAccumulator(CHUNK_SAMPLES);

  constructor() {
    super();
    this.port.onmessage = (event) => {
      if (event.data.port) this.audioPort = event.data.port;
    };
  }

  process(inputs: Float32Array[][]): boolean {
    const channel = inputs[0]?.[0];
    if (!channel) return true;
    const chunk = this.accumulator.push(channel, currentFrame);
    if (chunk && this.audioPort) {
      this.audioPort.postMessage(chunk, [chunk.samples.buffer]);
    }
    return true;
  }
}

registerProcessor("capture", CaptureProcessor);
