/**
 * Pure helpers for the `?cpu=1` debug measurement (audio-transport task 13.2). No browser globals:
 * the clock is injected. Nothing here touches decoding. It only records how long the decode
 * worker was busy per chunk and formats the numbers.
 */

/** Sliding window of busy times kept for the median and 95th percentile. */
export const CPU_WINDOW = 4096;

export interface CpuSample {
  /** Busy time for one incoming chunk: rate adapter (resampler) plus all decoders. */
  totalMs: number;
  /** Part of totalMs spent in the rate adapter (resampler and chunk accumulation). */
  resampleMs: number;
}

export interface CpuStats {
  /** Chunks recorded since the start, not only the window. */
  chunks: number;
  medianMs: number;
  p95Ms: number;
  maxMs: number;
  resampleMedianMs: number;
  resampleP95Ms: number;
  /** Time between incoming chunks: CHUNK_SAMPLES at the context rate. The busy-time budget. */
  periodMs: number;
  /** Chunks whose busy time exceeded periodMs. */
  overBudget: number;
  /** Chunks the worker's queue dropped (the `overrun` event). */
  droppedChunks: number;
}

export interface CpuProbe {
  record(sample: CpuSample): void;
  noteOverrun(droppedChunks: number): void;
  stats(): CpuStats;
}

/** Nearest-rank percentile of an ascending array. Empty gives 0. */
export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))] ?? 0;
}

const ascending = (values: readonly number[]): number[] =>
  [...values].sort((a, b) => a - b);

export function createCpuProbe(opts: {
  periodMs: number;
  capacity?: number;
}): CpuProbe {
  const capacity = Math.max(1, opts.capacity ?? CPU_WINDOW);
  const total: number[] = [];
  const resample: number[] = [];
  let next = 0;
  let chunks = 0;
  let overBudget = 0;
  let droppedChunks = 0;

  return {
    record(s) {
      chunks++;
      if (s.totalMs > opts.periodMs) overBudget++;
      if (total.length < capacity) {
        total.push(s.totalMs);
        resample.push(s.resampleMs);
      } else {
        total[next] = s.totalMs;
        resample[next] = s.resampleMs;
        next = (next + 1) % capacity;
      }
    },
    noteOverrun(n) {
      droppedChunks += n;
    },
    stats() {
      const t = ascending(total);
      const r = ascending(resample);
      return {
        chunks,
        medianMs: percentile(t, 50),
        p95Ms: percentile(t, 95),
        maxMs: t[t.length - 1] ?? 0,
        resampleMedianMs: percentile(r, 50),
        resampleP95Ms: percentile(r, 95),
        periodMs: opts.periodMs,
        overBudget,
        droppedChunks,
      };
    },
  };
}

/** What the worker sends to the overlay. */
export interface CpuReport extends CpuStats {
  contextRate: number;
  rxScope: "all" | "active";
  decoders: number;
  /** Frames delivered by each decoder offset (RxStats.decoderHits). */
  decoderHits: readonly number[];
  /** importScripts, both ggwave modules and the pipeline, until the worker was ready. */
  startupMs: number;
  /** Heap size of each ggwave module in bytes, in load order (decode, encode). null when not readable. */
  heapBytes: readonly (number | null)[];
}

/** True only for `?cpu=1`. Accepts a query string with or without the leading `?`. */
export function cpuFlagFromSearch(search: string): boolean {
  return new URLSearchParams(search).get("cpu") === "1";
}

/** Heap size of an emscripten module, read by duck typing. null when the module does not expose it. */
export function heapBytesOf(module: unknown): number | null {
  if (typeof module !== "object" || module === null) return null;
  const heap = (module as { HEAP8?: { byteLength?: unknown } }).HEAP8;
  return typeof heap?.byteLength === "number" ? heap.byteLength : null;
}

const ms = (v: number): string => v.toFixed(2);
const mb = (b: number | null): string =>
  b === null ? "n/a" : `${(b / 1048576).toFixed(1)} MB`;

/** Plain text for the overlay and the console. Stable layout, one fact per line. */
export function formatCpuReport(r: CpuReport): string {
  const share = r.periodMs > 0 ? (r.medianMs / r.periodMs) * 100 : 0;
  return [
    `rate ${r.contextRate} Hz, scope ${r.rxScope}, decoders ${r.decoders}`,
    `chunks ${r.chunks}, period ${ms(r.periodMs)} ms`,
    `busy median ${ms(r.medianMs)} ms (${share.toFixed(0)}% of period)`,
    `busy p95 ${ms(r.p95Ms)} ms, max ${ms(r.maxMs)} ms`,
    `resample median ${ms(r.resampleMedianMs)} ms, p95 ${ms(r.resampleP95Ms)} ms`,
    `over budget ${r.overBudget}, dropped ${r.droppedChunks}`,
    `decoderHits [${r.decoderHits.join(", ")}]`,
    `startup ${ms(r.startupMs)} ms`,
    `heap decode ${mb(r.heapBytes[0] ?? null)}, encode ${mb(r.heapBytes[1] ?? null)}`,
  ].join("\n");
}
