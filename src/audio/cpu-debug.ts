/**
 * Worker-side wiring of the `?cpu=1` measurement. Created only when the init message carries
 * `cpu: true`, so without the flag none of this runs. It only reads clocks and posts reports on a
 * BroadcastChannel to the page overlay. It never changes what the decoders see or return.
 */

import { CHUNK_SAMPLES } from "./constants";
import { type CpuReport, createCpuProbe, heapBytesOf } from "./cpu-probe";
import { DECODER_OFFSETS } from "./phase-chunker";

export const CPU_CHANNEL = "dial-tone-cpu";
const REPORT_EVERY_MS = 1000;

export interface CpuDebug {
  now(): number;
  /** Returns the same factory result, remembering each ggwave module for its heap size. */
  wrapFactory<T>(factory: () => Promise<T>): () => Promise<T>;
  /** Call once, when the worker is ready to post `ready`. */
  ready(): void;
  overrun(droppedChunks: number): void;
  /** t0: before the rate adapter. t1: after it, before the decoders. */
  chunkDone(t0: number, t1: number, decoderHits: () => readonly number[]): void;
}

export function createCpuDebug(
  contextRate: number,
  rxScope: "all" | "active",
): CpuDebug {
  const now = () => performance.now();
  const started = now();
  const probe = createCpuProbe({
    periodMs: (CHUNK_SAMPLES / contextRate) * 1000,
  });
  const channel = new BroadcastChannel(CPU_CHANNEL);
  const modules: unknown[] = [];
  let startupMs = 0;
  let lastReport = 0;

  return {
    now,
    wrapFactory(factory) {
      return async () => {
        const module = await factory();
        modules.push(module);
        return module;
      };
    },
    ready() {
      startupMs = now() - started;
    },
    overrun: (n) => probe.noteOverrun(n),
    chunkDone(t0, t1, decoderHits) {
      const end = now();
      probe.record({ totalMs: end - t0, resampleMs: t1 - t0 });
      if (end - lastReport < REPORT_EVERY_MS) return;
      lastReport = end;
      const report: CpuReport = {
        ...probe.stats(),
        contextRate,
        rxScope,
        decoders: DECODER_OFFSETS.length,
        decoderHits: decoderHits(),
        startupMs,
        heapBytes: modules.map(heapBytesOf),
      };
      channel.postMessage(report);
    },
  };
}
