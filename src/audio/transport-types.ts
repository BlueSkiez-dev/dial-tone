/**
 * Public types of the audio transport. Pure: no browser global.
 * Includes the four ui-shell amendments (analyser, airtime event, setListening, start result).
 */

import type { MicErrorCode, MicState } from "./mic-state";
import type { ProfileId, ProtocolId } from "./profiles";
import type { Result } from "./result";
import type { RxEvent } from "./rx-pipeline";

/** Lets src/ui read a spectrum without the DOM AnalyserNode type. */
export interface SpectrumSource {
  readonly fftSize: number;
  readonly frequencyBinCount: number;
  readonly sampleRate: number;
  getByteFrequencyData(out: Uint8Array): void;
}

export type TransportEvent =
  | RxEvent
  | { kind: "mic"; state: MicState; processingDisabled?: boolean }
  | {
      kind: "context";
      state: "running" | "suspended" | "interrupted" | "closed";
    }
  | { kind: "foreground"; visible: boolean }
  | {
      kind: "tx";
      phase: "start" | "end";
      protocol: ProtocolId;
      airtimeMs: number;
    }
  | {
      kind: "airtime";
      profile: ProfileId;
      byteLength: number;
      attempt: number;
      ms: number;
    }
  | { kind: "listening"; on: boolean }
  | { kind: "overrun"; droppedChunks: number };

export type SendErrorCode =
  | "EMPTY"
  | "TOO_LONG"
  | "NOT_STARTED"
  | "NOT_RUNNING"
  | "BUSY"
  | "MODEM_FAILED";

export interface SendReport {
  readonly protocol: ProtocolId;
  readonly airtimeMs: number;
  readonly startFrame: number;
  readonly endFrame: number;
}

export interface SendOptions {
  /** 0 for a first send, 1 or more for a resend. Default 0. */
  readonly attempt?: number;
}

export type StartErrorCode =
  | "MODEM_LOAD_FAILED"
  | "NO_AUDIO_CONTEXT"
  | "SEND_UNAVAILABLE";

export interface StartError {
  readonly code: StartErrorCode;
  readonly message?: string;
}

export interface MicError {
  readonly code: "NOT_STARTED" | MicErrorCode;
}

export interface AudioTransport {
  /** Must be called from a user tap. Ok whenever sending works, including when only the mic failed. */
  start(): Promise<Result<{ sampleRate: number; mic: MicState }, StartError>>;
  /** Re-ask for the mic after denied, lost or busy. Must be called from a user tap. */
  restartMic(): Promise<Result<void, MicError>>;
  stop(): Promise<void>;
  /** Chooses how this phone sends. Receiving covers every family regardless. */
  setProfile(id: ProfileId): Result<void, { code: "BUSY" | "NOT_STARTED" }>;
  send(
    wire: Uint8Array,
    opts?: SendOptions,
  ): Promise<Result<SendReport, { code: SendErrorCode }>>;
  sendSequence(
    wires: readonly Uint8Array[],
    opts?: SendOptions & { gapMs?: number },
  ): Promise<
    Result<readonly SendReport[], { code: SendErrorCode; sent: number }>
  >;
  /** Cached value, or null on a miss (the answer then arrives as an "airtime" event). */
  airtimeMs(byteLength: number, attempt?: number): number | null;
  /** false: stop feeding the pipeline and forwarding frame, rejected and carrier. The mic stays open. */
  setListening(on: boolean): Result<void, { code: "NOT_STARTED" | "NO_MIC" }>;
  subscribe(listener: (event: TransportEvent) => void): () => void;
  readonly profile: ProfileId;
  readonly sampleRate: number | null;
  /** null before start() and after stop(). */
  readonly analyser: SpectrumSource | null;
}
