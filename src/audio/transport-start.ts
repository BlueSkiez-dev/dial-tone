/**
 * Start sequence of the transport: attach the capture worklet, start the decode worker, connect the
 * mic. Pure: every browser object arrives through `TransportDeps`.
 */

import type { ProfileId } from "./profiles";
import { RX_LISTEN_SCOPE } from "./profiles";
import type { GraphLike, MicStreamLike, TransportDeps } from "./transport-deps";
import type { StartError } from "./transport-types";
import {
  createWorkerClient,
  type WorkerClient,
  WorkerFailure,
} from "./worker-client";

export type BringUp =
  | {
      ok: true;
      graph: GraphLike;
      client: WorkerClient;
      unplug: (() => void) | null;
      /** True when the stream could not be connected and the mic must be marked failed. */
      micFailed: boolean;
    }
  | { ok: false; error: StartError };

export function tryGraph(
  deps: TransportDeps,
  rate: number | undefined,
): GraphLike | null {
  try {
    return deps.createGraph(rate);
  } catch {
    return null;
  }
}

export async function bringUp(
  deps: TransportDeps,
  graph: GraphLike,
  stream: MicStreamLike | null,
  profile: ProfileId,
  canRetry: boolean,
): Promise<BringUp> {
  const channel = deps.createChannel();
  const client = createWorkerClient(deps.createWorker());
  const abandon = async () => {
    client.dispose();
    await graph.close().catch(() => {});
  };

  try {
    await graph.attachCapture(channel.port1);
  } catch (e) {
    await abandon();
    return {
      ok: false,
      error: { code: "NO_AUDIO_CONTEXT", message: String(e) },
    };
  }
  try {
    await client.init(
      {
        ggwaveUrl: deps.ggwaveUrl,
        contextRate: graph.sampleRate,
        profile,
        rxScope: RX_LISTEN_SCOPE,
        ...(deps.debugCpu ? { cpu: true } : {}),
      },
      channel.port2,
    );
  } catch (e) {
    await abandon();
    const load = e instanceof WorkerFailure && e.code === "MODEM_LOAD_FAILED";
    return {
      ok: false,
      error: {
        code: load ? "MODEM_LOAD_FAILED" : "SEND_UNAVAILABLE",
        message: e instanceof Error ? e.message : String(e),
      },
    };
  }

  let unplug: (() => void) | null = null;
  let micFailed = false;
  if (stream) {
    try {
      unplug = graph.connectMic(stream);
    } catch {
      if (canRetry) {
        // Some browsers refuse a mic stream on a context whose rate differs from the device's.
        await abandon();
        const fallback = tryGraph(deps, undefined);
        return fallback
          ? bringUp(deps, fallback, stream, profile, false)
          : { ok: false, error: { code: "NO_AUDIO_CONTEXT" } };
      }
      micFailed = true;
    }
  }
  return { ok: true, graph, client, unplug, micFailed };
}
