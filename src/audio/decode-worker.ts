/**
 * Classic decode worker. Owns the ggwave WASM instances. Message switch only: all logic is in the
 * pure modules (rate adapter, chunk queue, rx pipeline, airtime).
 */

import { airtimeMs } from "./airtime";
import { createChunkQueue } from "./chunk-queue";
import { MAX_QUEUE_CHUNKS } from "./constants";
import { type CpuDebug, createCpuDebug } from "./cpu-debug";
import { createGgwaveModem, ggwaveFactoryFromGlobal } from "./ggwave-modem";
import { type Modem, ModemError } from "./modem";
import { PROFILES } from "./profiles";
import {
  createRateAdapter,
  type RateAdapter,
  type StreamChunk,
} from "./rate-adapter";
import { createRxPipeline, type RxPipeline } from "./rx-pipeline";
import type { FromWorker, ToWorker, WorkerFailCode } from "./transport-deps";

interface Scope {
  onmessage: ((event: { data: ToWorker }) => void) | null;
  postMessage(message: FromWorker, transfer?: unknown[]): void;
  importScripts(url: string): void;
  close(): void;
}
const scope = self as unknown as Scope;

let modem: Modem | null = null;
let pipeline: RxPipeline | null = null;
let adapter: RateAdapter | null = null;
let rxScope: "all" | "active" = "all";
let cpu: CpuDebug | null = null; // only with ?cpu=1
let listening = true;
let scheduled = false;
const queue = createChunkQueue<StreamChunk>(MAX_QUEUE_CHUNKS);

const post = (m: FromWorker, transfer?: unknown[]) =>
  scope.postMessage(m, transfer);

function fail(code: WorkerFailCode, e: unknown, id?: number): void {
  const detail =
    e instanceof ModemError ? `${e.code}: ${e.message}` : String(e);
  post({
    type: "failed",
    code,
    message: detail,
    ...(id === undefined ? {} : { id }),
  });
}

function handleChunk(chunk: StreamChunk): void {
  if (!pipeline || !adapter) return;
  const t0 = cpu?.now() ?? 0;
  const resampled = adapter.push(chunk);
  const t1 = cpu?.now() ?? 0;
  for (const c of resampled) {
    for (const event of pipeline.push(c)) {
      const rx =
        event.kind === "frame" ||
        event.kind === "rejected" ||
        event.kind === "carrier";
      if (rx && !listening) continue;
      post({ type: "event", event });
    }
  }
  const p = pipeline;
  cpu?.chunkDone(t0, t1, () => p.stats().decoderHits);
}

/** One chunk per timer tick, so a backlog of messages is visible in the queue and can be dropped. */
function drain(): void {
  scheduled = false;
  const chunk = queue.shift();
  if (chunk && listening) handleChunk(chunk);
  if (queue.length > 0) schedule();
}

function schedule(): void {
  if (scheduled) return;
  scheduled = true;
  setTimeout(drain, 0);
}

function onAudio(chunk: StreamChunk): void {
  if (!listening) return;
  const dropped = queue.push(chunk);
  if (dropped > 0) cpu?.overrun(dropped);
  if (dropped > 0)
    post({ type: "event", event: { kind: "overrun", droppedChunks: dropped } });
  schedule();
}

async function init(m: Extract<ToWorker, { type: "init" }>): Promise<void> {
  rxScope = m.rxScope;
  cpu = m.cpu ? createCpuDebug(m.contextRate, m.rxScope) : null;
  try {
    scope.importScripts(m.ggwaveUrl);
    const factory = ggwaveFactoryFromGlobal();
    modem = await createGgwaveModem(cpu ? cpu.wrapFactory(factory) : factory, {
      txSampleRate: m.contextRate,
    });
  } catch (e) {
    fail("MODEM_LOAD_FAILED", e);
    return;
  }
  try {
    adapter = createRateAdapter(m.contextRate);
    pipeline = await createRxPipeline({
      modem,
      profile: PROFILES[m.profile],
      rxScope,
    });
  } catch (e) {
    fail(
      e instanceof ModemError && e.code === "NO_INSTANCE"
        ? "MODEM_LOAD_FAILED"
        : "SEND_UNAVAILABLE",
      e,
    );
    return;
  }
  const port = m.audioPort as {
    onmessage: ((e: { data: StreamChunk }) => void) | null;
  };
  port.onmessage = (e) => onAudio(e.data);
  cpu?.ready();
  post({ type: "ready" });
}

scope.onmessage = (event) => {
  const m = event.data;
  switch (m.type) {
    case "init":
      void init(m);
      break;
    case "setProfile":
      if (rxScope === "active") void pipeline?.setProfile(PROFILES[m.profile]);
      break;
    case "modulate":
      try {
        if (!modem) throw new Error("not initialised");
        const samples = modem.modulate(m.wire, m.protocol, m.volume);
        post({ type: "modulated", id: m.id, samples }, [samples.buffer]);
      } catch (e) {
        fail("MODEM_FAILED", e, m.id);
      }
      break;
    case "gate":
      if (pipeline && adapter) {
        pipeline.gate(
          adapter.frameToStream(m.fromFrame, "down"),
          adapter.frameToStream(m.untilFrame, "up"),
        );
      }
      break;
    case "noteSent":
      if (pipeline && adapter)
        pipeline.noteSent(m.wire, adapter.frameToStream(m.atFrame, "round"));
      break;
    case "airtime":
      try {
        if (!modem) break;
        const ms = airtimeMs(
          modem,
          PROFILES[m.profile],
          m.attempt,
          m.byteLength,
        );
        post({
          type: "event",
          event: {
            kind: "airtime",
            profile: m.profile,
            byteLength: m.byteLength,
            attempt: m.attempt,
            ms,
          },
        });
      } catch {
        // No answer: the caller keeps asking only when the UI asks again.
      }
      break;
    case "listening":
      listening = m.on;
      if (!m.on) queue.clear();
      break;
    case "dispose":
      pipeline?.dispose();
      modem?.dispose();
      scope.close();
      break;
  }
};
