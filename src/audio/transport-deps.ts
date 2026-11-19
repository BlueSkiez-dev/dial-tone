/**
 * The seams that `createAudioTransport` takes as injected dependencies, and the messages between
 * the main thread and the decode worker. Types only: no browser global, so tests can fake all of it.
 */

import type { MicErrorCode } from "./mic-state";
import type { ProfileId, ProtocolId } from "./profiles";
import type { RxEvent } from "./rx-pipeline";
import type { SpectrumSource } from "./transport-types";

export type ContextState = "running" | "suspended" | "interrupted" | "closed";

/** The audio graph on the main thread: context, capture node, analyser, playback. */
export interface GraphLike {
  readonly sampleRate: number;
  readonly currentTime: number;
  readonly state: ContextState;
  readonly analyser: SpectrumSource;
  /** Load the capture worklet and hand it the audio port (transferred). Rejects when unsupported. */
  attachCapture(port: unknown): Promise<void>;
  /** Connect a mic stream to the capture node and the analyser. May throw. Returns a disconnect. */
  connectMic(stream: MicStreamLike): () => void;
  /** Play at context time `when`. Resolves when playback ends. */
  playAt(samples: Float32Array, when: number): Promise<void>;
  resume(): Promise<void>;
  close(): Promise<void>;
  onStateChange(cb: (state: ContextState) => void): void;
}

export interface MicTrackLike {
  stop(): void;
  getSettings(): {
    echoCancellation?: boolean;
    noiseSuppression?: boolean;
    autoGainControl?: boolean;
  };
  addEventListener(
    type: "ended" | "mute" | "unmute",
    listener: () => void,
  ): void;
}

export interface MicStreamLike {
  getAudioTracks(): MicTrackLike[];
}

export interface WorkerLike {
  postMessage(message: unknown, transfer?: readonly unknown[]): void;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  terminate(): void;
}

export interface TransportDeps {
  /** `rate` undefined means the device default. Throws when audio is unsupported. */
  createGraph(rate: number | undefined): GraphLike;
  createWorker(): WorkerLike;
  createChannel(): { port1: unknown; port2: unknown };
  /** Rejects with an error whose `name` is the DOMException name. */
  getUserMedia(constraints: unknown): Promise<MicStreamLike>;
  /** Subscribe to device changes. Returns an unsubscribe. */
  onDeviceChange(cb: () => void): () => void;
  isVisible(): boolean;
  onVisibility(cb: (visible: boolean) => void): () => void;
  ggwaveUrl: string;
  /** Debug only (`?cpu=1`). Absent or false in normal use. */
  debugCpu?: boolean;
}

export type ToWorker =
  | {
      type: "init";
      ggwaveUrl: string;
      contextRate: number;
      profile: ProfileId;
      rxScope: "all" | "active";
      /** Debug only (`?cpu=1`): record busy time per chunk and report it. */
      cpu?: boolean;
      audioPort: unknown;
    }
  | { type: "setProfile"; profile: ProfileId }
  | {
      type: "modulate";
      id: number;
      wire: Uint8Array;
      protocol: ProtocolId;
      volume: number;
    }
  | { type: "gate"; fromFrame: number; untilFrame: number }
  | { type: "noteSent"; wire: Uint8Array; atFrame: number }
  | {
      type: "airtime";
      profile: ProfileId;
      attempt: number;
      byteLength: number;
    }
  | { type: "listening"; on: boolean }
  | { type: "dispose" };

export type WorkerFailCode =
  | "MODEM_LOAD_FAILED"
  | "MODEM_FAILED"
  | "SEND_UNAVAILABLE";

export type WorkerEvent =
  | RxEvent
  | { kind: "overrun"; droppedChunks: number }
  | {
      kind: "airtime";
      profile: ProfileId;
      byteLength: number;
      attempt: number;
      ms: number;
    };

export type FromWorker =
  | { type: "ready" }
  | { type: "event"; event: WorkerEvent }
  | { type: "modulated"; id: number; samples: Float32Array }
  | { type: "failed"; id?: number; code: WorkerFailCode; message?: string };

export type { MicErrorCode };
