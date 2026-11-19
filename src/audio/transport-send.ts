/** One transmission: modulate in the worker, gate and note our own sound, then play. Pure. */

import type { ProtocolId } from "./profiles";
import { err, ok, type Result } from "./result";
import type { GraphLike } from "./transport-deps";
import { sendSchedule } from "./transport-math";
import type {
  SendErrorCode,
  SendReport,
  TransportEvent,
} from "./transport-types";
import type { WorkerClient } from "./worker-client";

export async function runSend(
  graph: GraphLike,
  client: WorkerClient,
  wire: Uint8Array,
  protocol: ProtocolId,
  volume: number,
  emit: (event: TransportEvent) => void,
): Promise<Result<SendReport, { code: SendErrorCode }>> {
  let started = false;
  let ms = 0;
  try {
    const samples = await client.modulate(wire, protocol, volume);
    const s = sendSchedule(graph.currentTime, graph.sampleRate, samples.length);
    client.gate(s.startFrame, s.endFrame + s.tailFrames);
    client.noteSent(wire, s.startFrame);
    ms = (samples.length / graph.sampleRate) * 1000;
    emit({ kind: "tx", phase: "start", protocol, airtimeMs: ms });
    started = true;
    await graph.playAt(samples, s.when);
    started = false;
    emit({ kind: "tx", phase: "end", protocol, airtimeMs: ms });
    return ok({
      protocol,
      airtimeMs: ms,
      startFrame: s.startFrame,
      endFrame: s.endFrame,
    });
  } catch {
    if (started) emit({ kind: "tx", phase: "end", protocol, airtimeMs: ms });
    return err("MODEM_FAILED");
  }
}

/** Frames in order with a gap between them. Stops at the first error and reports how many went out. */
export async function runSequence(
  send: (
    wire: Uint8Array,
  ) => Promise<Result<SendReport, { code: SendErrorCode }>>,
  wires: readonly Uint8Array[],
  gapMs: number,
): Promise<
  Result<readonly SendReport[], { code: SendErrorCode; sent: number }>
> {
  const reports: SendReport[] = [];
  for (const bytes of wires) {
    if (reports.length > 0) {
      await new Promise((resolve) => setTimeout(resolve, gapMs));
    }
    const r = await send(bytes);
    if (!r.ok) {
      return { ok: false, error: { code: r.error.code, sent: reports.length } };
    }
    reports.push(r.value);
  }
  return ok(reports);
}
