/**
 * The AudioTransport facade. Owns the state and validates calls. The length guard runs before the
 * worker is asked to modulate. Start and send mechanics live in transport-start.ts and
 * transport-send.ts.
 */

import { GGWAVE_MAX_PAYLOAD } from "../protocol";
import { createAirtimeCache } from "./airtime-cache";
import { createMic } from "./mic";
import type { MicErrorCode, MicState } from "./mic-state";
import { browserDeps } from "./player";
import {
  PROFILES,
  type ProfileId,
  protocolFor,
  RX_LISTEN_SCOPE,
} from "./profiles";
import { err, ok, type Result } from "./result";
import type { GraphLike, TransportDeps } from "./transport-deps";
import {
  createEmitter,
  dropWhileDeaf,
  INTER_FRAME_GAP_MS,
  isPayloadLength,
  sanitizeAttempt,
} from "./transport-math";
import { runSend, runSequence } from "./transport-send";
import { bringUp, tryGraph } from "./transport-start";
import type {
  AudioTransport,
  StartError,
  TransportEvent,
} from "./transport-types";
import type { WorkerClient } from "./worker-client";

type StartResult = Result<{ sampleRate: number; mic: MicState }, StartError>;

export function createAudioTransport(
  deps: TransportDeps = browserDeps(),
): AudioTransport {
  const bus = createEmitter<TransportEvent>();
  const { emit } = bus;
  const mic = createMic(deps, (state, pd) =>
    emit(
      pd === undefined
        ? { kind: "mic", state }
        : { kind: "mic", state, processingDisabled: pd },
    ),
  );
  let graph: GraphLike | null = null;
  let client: WorkerClient | null = null;
  let unplug: (() => void) | null = null;
  let offVisibility: (() => void) | null = null;
  let starting: Promise<StartResult> | null = null;
  let profile: ProfileId = "room";
  let inFlight = false;
  let broken = false;
  let listening = true;
  const airtimeCache = createAirtimeCache();
  const info = () => ({ sampleRate: graph?.sampleRate ?? 0, mic: mic.state });
  const awaitPendingStart = () => (graph && client ? undefined : starting);

  function wire(g: GraphLike, c: WorkerClient): void {
    graph = g;
    client = c;
    broken = false;
    c.onCrash(() => {
      broken = true;
    });
    c.onEvent((ev) => {
      if (ev.kind === "airtime") {
        airtimeCache.store(ev.profile, ev.attempt, ev.byteLength, ev.ms);
      } else if (dropWhileDeaf(ev.kind, listening)) {
        return;
      }
      emit(ev);
    });
    g.onStateChange((state) => emit({ kind: "context", state }));
    offVisibility = deps.onVisibility((visible) => {
      emit({ kind: "foreground", visible });
      if (visible && g.state !== "running") void g.resume().catch(() => {});
    });
  }

  async function doStart(): Promise<StartResult> {
    // The context is created and resumed inside the tap, before any await.
    const g = tryGraph(deps, 48000) ?? tryGraph(deps, undefined);
    if (!g) return { ok: false, error: { code: "NO_AUDIO_CONTEXT" } };
    void g.resume().catch(() => {});
    const stream = await mic.acquire();
    const up = await bringUp(deps, g, stream, profile, true);
    if (!up.ok) {
      mic.release();
      return up;
    }
    unplug = up.unplug;
    wire(up.graph, up.client);
    if (up.micFailed) mic.fail("UNKNOWN");
    return ok(info());
  }

  const self: AudioTransport = {
    start() {
      if (client && graph) return Promise.resolve(ok(info()));
      starting ??= doStart().finally(() => {
        starting = null;
      });
      return starting;
    },
    async restartMic() {
      await awaitPendingStart();
      if (!graph) return err("NOT_STARTED");
      void graph.resume().catch(() => {});
      if (mic.state === "live" || mic.state === "muted") return ok(undefined);
      unplug?.();
      unplug = null;
      const stream = await mic.acquire();
      if (!stream) return err((mic.lastError ?? "UNKNOWN") as MicErrorCode);
      try {
        unplug = graph.connectMic(stream);
      } catch {
        mic.fail("UNKNOWN");
        return err("UNKNOWN");
      }
      return ok(undefined);
    },
    async stop() {
      const g = graph;
      unplug?.();
      offVisibility?.();
      client?.dispose();
      mic.release();
      graph = client = unplug = offVisibility = null;
      listening = true;
      airtimeCache.clear();
      if (g) await g.close().catch(() => {});
    },
    setProfile(id) {
      if (!graph || !client) return err("NOT_STARTED");
      if (inFlight) return err("BUSY");
      profile = id;
      if (RX_LISTEN_SCOPE === "active") client.setProfile(id);
      return ok(undefined);
    },
    async send(bytes, opts) {
      await awaitPendingStart();
      if (!graph || !client) return err("NOT_STARTED");
      if (graph.state !== "running") return err("NOT_RUNNING");
      if (bytes.length === 0) return err("EMPTY");
      if (bytes.length > GGWAVE_MAX_PAYLOAD) return err("TOO_LONG");
      if (inFlight) return err("BUSY");
      if (broken) return err("MODEM_FAILED");
      inFlight = true;
      const p = PROFILES[profile];
      const protocol = protocolFor(p, sanitizeAttempt(opts?.attempt));
      try {
        return await runSend(graph, client, bytes, protocol, p.volume, emit);
      } finally {
        inFlight = false;
      }
    },
    sendSequence: (wires, opts) =>
      runSequence(
        (bytes) => self.send(bytes, opts),
        wires,
        opts?.gapMs ?? INTER_FRAME_GAP_MS,
      ),
    airtimeMs(byteLength, attempt = 0) {
      if (!client || !isPayloadLength(byteLength)) return null;
      const hit = airtimeCache.get(profile, attempt, byteLength);
      if (hit !== undefined) return hit;
      if (airtimeCache.firstAsk(profile, attempt, byteLength)) {
        client.requestAirtime(profile, sanitizeAttempt(attempt), byteLength);
      }
      return null;
    },
    setListening(on) {
      if (!client) return err("NOT_STARTED");
      if (!mic.stream) return err("NO_MIC");
      listening = on;
      client.setListening(on);
      emit({ kind: "listening", on });
      return ok(undefined);
    },
    subscribe: bus.subscribe,
    get profile() {
      return profile;
    },
    get sampleRate() {
      return graph?.sampleRate ?? null;
    },
    get analyser() {
      return graph?.analyser ?? null;
    },
  };
  return self;
}
