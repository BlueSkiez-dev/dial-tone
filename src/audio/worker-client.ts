/**
 * Main-thread side of the decode worker protocol. Pure: it sees only a `WorkerLike`.
 * It copies every `wire` it sends, so the caller's array is never detached.
 */

import type { ProfileId, ProtocolId } from "./profiles";
import type {
  FromWorker,
  ToWorker,
  WorkerEvent,
  WorkerFailCode,
  WorkerLike,
} from "./transport-deps";

export class WorkerFailure extends Error {
  readonly code: WorkerFailCode;
  constructor(code: WorkerFailCode, message?: string) {
    super(message ?? code);
    this.name = "WorkerFailure";
    this.code = code;
  }
}

export interface WorkerClient {
  init(
    opts: {
      ggwaveUrl: string;
      contextRate: number;
      profile: ProfileId;
      rxScope: "all" | "active";
      cpu?: boolean;
    },
    audioPort: unknown,
  ): Promise<void>;
  modulate(
    wire: Uint8Array,
    protocol: ProtocolId,
    volume: number,
  ): Promise<Float32Array>;
  gate(fromFrame: number, untilFrame: number): void;
  noteSent(wire: Uint8Array, atFrame: number): void;
  requestAirtime(profile: ProfileId, attempt: number, byteLength: number): void;
  setListening(on: boolean): void;
  setProfile(profile: ProfileId): void;
  onEvent(cb: (event: WorkerEvent) => void): void;
  /** Called when the worker dies or reports a failure after start. */
  onCrash(cb: () => void): void;
  dispose(): void;
}

export function createWorkerClient(worker: WorkerLike): WorkerClient {
  const pending = new Map<
    number,
    { resolve: (s: Float32Array) => void; reject: (e: Error) => void }
  >();
  let nextId = 1;
  let ready: { resolve: () => void; reject: (e: Error) => void } | null = null;
  let eventCb: (e: WorkerEvent) => void = () => {};
  let crashCb: () => void = () => {};
  let dead = false;

  const send = (msg: ToWorker, transfer?: readonly unknown[]) =>
    worker.postMessage(msg, transfer);

  const crash = (error: Error) => {
    dead = true;
    for (const p of pending.values()) p.reject(error);
    pending.clear();
    if (ready) {
      ready.reject(error);
      ready = null;
    } else {
      crashCb();
    }
  };

  worker.onmessage = (e) => {
    const m = e.data as FromWorker;
    switch (m.type) {
      case "ready":
        ready?.resolve();
        ready = null;
        break;
      case "event":
        eventCb(m.event);
        break;
      case "modulated":
        pending.get(m.id)?.resolve(m.samples);
        pending.delete(m.id);
        break;
      case "failed": {
        const failure = new WorkerFailure(m.code, m.message);
        const p = m.id === undefined ? undefined : pending.get(m.id);
        if (p && m.id !== undefined) {
          p.reject(failure);
          pending.delete(m.id);
        } else {
          crash(failure);
        }
        break;
      }
    }
  };
  worker.onerror = () =>
    crash(new WorkerFailure("SEND_UNAVAILABLE", "worker crashed"));

  return {
    init(opts, audioPort) {
      return new Promise<void>((resolve, reject) => {
        ready = { resolve, reject };
        send({ type: "init", ...opts, audioPort }, [audioPort]);
      });
    },
    modulate(wire, protocol, volume) {
      if (dead) return Promise.reject(new WorkerFailure("MODEM_FAILED"));
      return new Promise<Float32Array>((resolve, reject) => {
        const id = nextId++;
        pending.set(id, { resolve, reject });
        send({ type: "modulate", id, wire: wire.slice(), protocol, volume });
      });
    },
    gate: (fromFrame, untilFrame) =>
      send({ type: "gate", fromFrame, untilFrame }),
    noteSent: (wire, atFrame) =>
      send({ type: "noteSent", wire: wire.slice(), atFrame }),
    requestAirtime: (profile, attempt, byteLength) =>
      send({ type: "airtime", profile, attempt, byteLength }),
    setListening: (on) => send({ type: "listening", on }),
    setProfile: (profile) => send({ type: "setProfile", profile }),
    onEvent: (cb) => {
      eventCb = cb;
    },
    onCrash: (cb) => {
      crashCb = cb;
    },
    dispose() {
      dead = true;
      try {
        send({ type: "dispose" });
      } catch {
        // The worker may already be gone.
      }
      worker.terminate();
    },
  };
}
